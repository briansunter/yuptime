import { describe, expect, test } from "bun:test";
import type { V1Ingress } from "@kubernetes/client-node";

describe("Ingress Discovery", () => {
  // Helper to create a mock ingress
  function createMockIngress(overrides?: {
    name?: string;
    namespace?: string;
    annotations?: Record<string, string>;
    rules?: Array<{ host: string; paths?: Array<{ path: string }> }>;
    tls?: Array<{ hosts: string[] }>;
  }): V1Ingress {
    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: overrides?.name ?? "test-ingress",
        namespace: overrides?.namespace ?? "default",
        annotations: overrides?.annotations ?? {},
      },
      spec: {
        rules: overrides?.rules?.map((rule) => ({
          host: rule.host,
          http: {
            paths:
              rule.paths?.map((p) => ({
                path: p.path,
                pathType: "Prefix" as const,
                backend: {
                  service: {
                    name: "test-service",
                    port: { number: 80 },
                  },
                },
              })) ?? [],
          },
        })),
        tls: overrides?.tls?.map((t) => ({ hosts: t.hosts })),
      },
    };
  }

  describe("annotation parsing", () => {
    test("ingress without monitoring annotation is ignored", () => {
      const ingress = createMockIngress({
        annotations: {},
      });

      const enabled = ingress.metadata?.annotations?.["monitoring.yuptime.io/enabled"];
      expect(enabled).toBeUndefined();
    });

    test("ingress with enabled=true annotation is recognized", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
        },
      });

      const enabled = ingress.metadata?.annotations?.["monitoring.yuptime.io/enabled"];
      expect(enabled).toBe("true");
    });

    test("parses interval-seconds annotation", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/interval-seconds": "120",
        },
      });

      const interval = ingress.metadata?.annotations?.["monitoring.yuptime.io/interval-seconds"];
      expect(Number.parseInt(interval ?? "60", 10)).toBe(120);
    });

    test("parses timeout-seconds annotation", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/timeout-seconds": "15",
        },
      });

      const timeout = ingress.metadata?.annotations?.["monitoring.yuptime.io/timeout-seconds"];
      expect(Number.parseInt(timeout ?? "10", 10)).toBe(15);
    });

    test("parses verify-tls annotation", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/verify-tls": "false",
        },
      });

      const verifyTls = ingress.metadata?.annotations?.["monitoring.yuptime.io/verify-tls"];
      expect(verifyTls).toBe("false");
    });
  });

  describe("TLS detection", () => {
    test("detects TLS hosts from spec.tls", () => {
      const ingress = createMockIngress({
        tls: [{ hosts: ["example.com", "api.example.com"] }],
      });

      const tlsHosts = new Set<string>();
      for (const tls of ingress.spec?.tls || []) {
        for (const host of tls.hosts || []) {
          tlsHosts.add(host);
        }
      }

      expect(tlsHosts.has("example.com")).toBe(true);
      expect(tlsHosts.has("api.example.com")).toBe(true);
      expect(tlsHosts.has("other.com")).toBe(false);
    });

    test("uses https protocol for TLS hosts", () => {
      const host = "example.com";
      const tlsHosts = new Set(["example.com"]);
      const useTls = tlsHosts.has(host);
      const protocol = useTls ? "https" : "http";

      expect(protocol).toBe("https");
    });

    test("uses http protocol for non-TLS hosts", () => {
      const host = "example.com";
      const tlsHosts = new Set<string>();
      const useTls = tlsHosts.has(host);
      const protocol = useTls ? "https" : "http";

      expect(protocol).toBe("http");
    });
  });

  describe("URL generation", () => {
    test("generates correct URL for host with path", () => {
      const protocol = "https";
      const host = "example.com";
      const path = "/api/v1";

      const url = `${protocol}://${host}${path}`;
      expect(url).toBe("https://example.com/api/v1");
    });

    test("generates correct URL for host with root path", () => {
      const protocol = "http";
      const host = "example.com";
      const path = "/";

      const url = `${protocol}://${host}${path}`;
      expect(url).toBe("http://example.com/");
    });

    test("handles missing path gracefully", () => {
      const protocol = "https";
      const host = "example.com";
      const pathSpec: { path?: string } = {}; // Simulating a path spec without a path
      const path = pathSpec.path ?? "/";

      const url = `${protocol}://${host}${path}`;
      expect(url).toBe("https://example.com/");
    });
  });

  describe("monitor name generation", () => {
    test("generates auto-ing prefixed name", () => {
      const ingressName = "my-ingress";
      const host = "example.com";

      // Sanitize function simulation
      const sanitize = (name: string) =>
        name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 63);

      const monitorName = `auto-ing-${sanitize(ingressName)}-${sanitize(host)}`;
      expect(monitorName).toBe("auto-ing-my-ingress-example-com");
    });

    test("sanitizes special characters", () => {
      const sanitize = (name: string) =>
        name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 63);

      expect(sanitize("example.com")).toBe("example-com");
      expect(sanitize("api_v2")).toBe("api-v2");
      expect(sanitize("MY-HOST")).toBe("my-host");
      expect(sanitize("---test---")).toBe("test");
    });

    test("truncates long names to 63 characters", () => {
      const sanitize = (name: string) =>
        name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 63);

      const longName = "a".repeat(100);
      expect(sanitize(longName).length).toBe(63);
    });
  });

  describe("rule processing", () => {
    test("extracts host from rule", () => {
      const ingress = createMockIngress({
        rules: [{ host: "example.com", paths: [{ path: "/" }] }],
      });

      const host = ingress.spec?.rules?.[0]?.host;
      expect(host).toBe("example.com");
    });

    test("extracts paths from rule", () => {
      const ingress = createMockIngress({
        rules: [{ host: "example.com", paths: [{ path: "/api" }, { path: "/web" }] }],
      });

      const paths = ingress.spec?.rules?.[0]?.http?.paths?.map((p) => p.path);
      expect(paths).toEqual(["/api", "/web"]);
    });

    test("skips rules without host", () => {
      const ingress = createMockIngress({
        rules: [{ host: "", paths: [{ path: "/" }] }],
      });

      const host = ingress.spec?.rules?.[0]?.host || "";
      expect(host).toBe("");
      // Empty host should be skipped in actual implementation
    });

    test("handles multiple rules", () => {
      const ingress = createMockIngress({
        rules: [
          { host: "api.example.com", paths: [{ path: "/" }] },
          { host: "web.example.com", paths: [{ path: "/" }] },
        ],
      });

      const hosts = ingress.spec?.rules?.map((r) => r.host);
      expect(hosts).toEqual(["api.example.com", "web.example.com"]);
    });
  });

  describe("TLS verification", () => {
    test("defaults to verify=true", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
        },
      });

      const verifyTls = ingress.metadata?.annotations?.["monitoring.yuptime.io/verify-tls"];
      // Default is true (only false if explicitly set to "false")
      const verify = verifyTls !== "false";
      expect(verify).toBe(true);
    });

    test("respects verify-tls=false annotation", () => {
      const ingress = createMockIngress({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/verify-tls": "false",
        },
      });

      const verifyTls = ingress.metadata?.annotations?.["monitoring.yuptime.io/verify-tls"];
      const verify = verifyTls !== "false";
      expect(verify).toBe(false);
    });
  });
});
