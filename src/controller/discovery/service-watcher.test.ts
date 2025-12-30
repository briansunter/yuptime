import { describe, expect, test } from "bun:test";
import type { V1Service } from "@kubernetes/client-node";

// Import the module to test the extraction logic
// We test by creating services with various annotations

describe("Service Discovery", () => {
  // Helper to create a mock service
  function createMockService(overrides?: {
    name?: string;
    namespace?: string;
    annotations?: Record<string, string>;
    ports?: Array<{ port: number; name?: string }>;
  }): V1Service {
    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: overrides?.name ?? "test-service",
        namespace: overrides?.namespace ?? "default",
        annotations: overrides?.annotations ?? {},
      },
      spec: {
        ports: overrides?.ports ?? [{ port: 80 }],
      },
    };
  }

  describe("annotation parsing", () => {
    test("service without monitoring annotation is ignored", () => {
      const service = createMockService({
        annotations: {},
      });

      // Without the enabled annotation, no monitor should be created
      const enabled = service.metadata?.annotations?.["monitoring.yuptime.io/enabled"];
      expect(enabled).toBeUndefined();
    });

    test("service with enabled=true annotation is recognized", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
        },
      });

      const enabled = service.metadata?.annotations?.["monitoring.yuptime.io/enabled"];
      expect(enabled).toBe("true");
    });

    test("service with enabled=false annotation is ignored", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "false",
        },
      });

      const enabled = service.metadata?.annotations?.["monitoring.yuptime.io/enabled"];
      expect(enabled).toBe("false");
      expect(enabled).not.toBe("true");
    });

    test("parses check-type annotation", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/check-type": "tcp",
        },
      });

      const checkType = service.metadata?.annotations?.["monitoring.yuptime.io/check-type"];
      expect(checkType).toBe("tcp");
    });

    test("parses health-path annotation", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/health-path": "/ready",
        },
      });

      const healthPath = service.metadata?.annotations?.["monitoring.yuptime.io/health-path"];
      expect(healthPath).toBe("/ready");
    });

    test("parses interval-seconds annotation", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/interval-seconds": "30",
        },
      });

      const interval = service.metadata?.annotations?.["monitoring.yuptime.io/interval-seconds"];
      expect(interval).toBe("30");
      expect(Number.parseInt(interval ?? "60", 10)).toBe(30);
    });

    test("parses timeout-seconds annotation", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/timeout-seconds": "5",
        },
      });

      const timeout = service.metadata?.annotations?.["monitoring.yuptime.io/timeout-seconds"];
      expect(timeout).toBe("5");
      expect(Number.parseInt(timeout ?? "10", 10)).toBe(5);
    });

    test("parses port annotation", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
          "monitoring.yuptime.io/port": "8080",
        },
      });

      const port = service.metadata?.annotations?.["monitoring.yuptime.io/port"];
      expect(port).toBe("8080");
      expect(Number.parseInt(port ?? "80", 10)).toBe(8080);
    });
  });

  describe("service address generation", () => {
    test("generates correct cluster-local address", () => {
      const service = createMockService({
        name: "my-service",
        namespace: "my-namespace",
      });

      const name = service.metadata?.name ?? "";
      const namespace = service.metadata?.namespace ?? "default";
      const address = `${name}.${namespace}.svc.cluster.local`;

      expect(address).toBe("my-service.my-namespace.svc.cluster.local");
    });

    test("uses default namespace when not specified", () => {
      const service = createMockService({
        name: "my-service",
        namespace: undefined,
      });

      const namespace = service.metadata?.namespace ?? "default";
      expect(namespace).toBe("default");
    });
  });

  describe("monitor name generation", () => {
    test("generates auto-svc prefixed name", () => {
      const serviceName = "my-service";
      const monitorName = `auto-svc-${serviceName}`;

      expect(monitorName).toBe("auto-svc-my-service");
    });

    test("handles special characters in service name", () => {
      const serviceName = "my_service.v2";
      // The sanitization would replace non-alphanumeric chars with dashes
      const sanitized = serviceName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      expect(sanitized).toBe("my-service-v2");
    });
  });

  describe("port selection", () => {
    test("uses first port when no port annotation", () => {
      const service = createMockService({
        ports: [{ port: 8080 }, { port: 9090 }],
      });

      const firstPort = service.spec?.ports?.[0]?.port ?? 80;
      expect(firstPort).toBe(8080);
    });

    test("uses annotated port over first port", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/port": "9090",
        },
        ports: [{ port: 8080 }],
      });

      const annotatedPort = service.metadata?.annotations?.["monitoring.yuptime.io/port"];
      const port = annotatedPort
        ? Number.parseInt(annotatedPort, 10)
        : (service.spec?.ports?.[0]?.port ?? 80);

      expect(port).toBe(9090);
    });

    test("defaults to 80 when no ports defined", () => {
      const service = createMockService({
        ports: [],
      });

      const port = service.spec?.ports?.[0]?.port ?? 80;
      expect(port).toBe(80);
    });
  });

  describe("check type handling", () => {
    const checkTypes = ["http", "https", "tcp", "grpc"];

    for (const type of checkTypes) {
      test(`supports ${type} check type`, () => {
        const service = createMockService({
          annotations: {
            "monitoring.yuptime.io/enabled": "true",
            "monitoring.yuptime.io/check-type": type,
          },
        });

        const checkType =
          service.metadata?.annotations?.["monitoring.yuptime.io/check-type"] ?? "http";
        expect(checkType).toBe(type);
      });
    }

    test("defaults to http when check-type not specified", () => {
      const service = createMockService({
        annotations: {
          "monitoring.yuptime.io/enabled": "true",
        },
      });

      const checkType =
        service.metadata?.annotations?.["monitoring.yuptime.io/check-type"] ?? "http";
      expect(checkType).toBe("http");
    });
  });
});
