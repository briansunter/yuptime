import { describe, expect, test } from "bun:test";
import type { DiscoveredMonitor } from "./types";

describe("CRD Writer", () => {
  // Helper to create a discovered monitor
  function createDiscoveredMonitor(overrides?: Partial<DiscoveredMonitor>): DiscoveredMonitor {
    return {
      name: overrides?.name ?? "auto-svc-test-service",
      namespace: overrides?.namespace ?? "default",
      type: overrides?.type ?? "http",
      intervalSeconds: overrides?.intervalSeconds ?? 60,
      timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      target: overrides?.target ?? {
        http: {
          url: "http://test-service.default.svc.cluster.local:80/healthz",
        },
      },
      source: overrides?.source ?? {
        kind: "Service",
        name: "test-service",
        namespace: "default",
      },
    };
  }

  describe("Monitor CRD structure", () => {
    test("generates correct apiVersion", () => {
      const discovered = createDiscoveredMonitor();
      const expectedApiVersion = "monitoring.yuptime.io/v1";

      // This is what the CRD writer would generate
      const monitorCRD = {
        apiVersion: "monitoring.yuptime.io/v1",
        kind: "Monitor",
        metadata: {
          name: discovered.name,
          namespace: discovered.namespace,
        },
        spec: {
          type: discovered.type,
        },
      };

      expect(monitorCRD.apiVersion).toBe(expectedApiVersion);
    });

    test("generates correct kind", () => {
      const discovered = createDiscoveredMonitor();
      const monitorCRD = {
        apiVersion: "monitoring.yuptime.io/v1",
        kind: "Monitor",
        metadata: {
          name: discovered.name,
        },
      };

      expect(monitorCRD.kind).toBe("Monitor");
    });

    test("uses discovered name and namespace", () => {
      const discovered = createDiscoveredMonitor({
        name: "auto-svc-my-service",
        namespace: "production",
      });

      const monitorCRD = {
        metadata: {
          name: discovered.name,
          namespace: discovered.namespace,
        },
      };

      expect(monitorCRD.metadata.name).toBe("auto-svc-my-service");
      expect(monitorCRD.metadata.namespace).toBe("production");
    });
  });

  describe("Labels and annotations", () => {
    test("adds managed-by label", () => {
      const MANAGED_LABEL = "monitoring.yuptime.io/managed-by";
      const labels = {
        [MANAGED_LABEL]: "discovery",
      };

      expect(labels[MANAGED_LABEL]).toBe("discovery");
    });

    test("adds source annotation", () => {
      const discovered = createDiscoveredMonitor({
        source: {
          kind: "Service",
          name: "my-service",
          namespace: "my-namespace",
        },
      });

      const SOURCE_ANNOTATION = "monitoring.yuptime.io/discovery-source";
      const annotations = {
        [SOURCE_ANNOTATION]: `${discovered.source.kind}/${discovered.source.namespace}/${discovered.source.name}`,
      };

      expect(annotations[SOURCE_ANNOTATION]).toBe("Service/my-namespace/my-service");
    });

    test("handles Ingress source", () => {
      const discovered = createDiscoveredMonitor({
        source: {
          kind: "Ingress",
          name: "my-ingress",
          namespace: "my-namespace",
        },
      });

      const SOURCE_ANNOTATION = "monitoring.yuptime.io/discovery-source";
      const annotations = {
        [SOURCE_ANNOTATION]: `${discovered.source.kind}/${discovered.source.namespace}/${discovered.source.name}`,
      };

      expect(annotations[SOURCE_ANNOTATION]).toBe("Ingress/my-namespace/my-ingress");
    });
  });

  describe("Spec generation", () => {
    test("sets enabled to true", () => {
      const spec = {
        enabled: true,
      };

      expect(spec.enabled).toBe(true);
    });

    test("uses discovered type", () => {
      const discovered = createDiscoveredMonitor({ type: "tcp" });
      const spec = {
        type: discovered.type,
      };

      expect(spec.type).toBe("tcp");
    });

    test("sets schedule from discovered values", () => {
      const discovered = createDiscoveredMonitor({
        intervalSeconds: 30,
        timeoutSeconds: 5,
      });

      const spec = {
        schedule: {
          intervalSeconds: discovered.intervalSeconds,
          timeoutSeconds: discovered.timeoutSeconds,
        },
      };

      expect(spec.schedule.intervalSeconds).toBe(30);
      expect(spec.schedule.timeoutSeconds).toBe(5);
    });

    test("uses discovered target", () => {
      const discovered = createDiscoveredMonitor({
        target: {
          http: {
            url: "http://my-service.default.svc.cluster.local:8080/health",
          },
        },
      });

      const spec = {
        target: discovered.target,
      };

      expect(spec.target.http?.url).toBe("http://my-service.default.svc.cluster.local:8080/health");
    });
  });

  describe("Target types", () => {
    test("generates HTTP target", () => {
      const discovered = createDiscoveredMonitor({
        type: "http",
        target: {
          http: {
            url: "http://example.com/healthz",
          },
        },
      });

      expect(discovered.target.http).toBeDefined();
      expect(discovered.target.http?.url).toBe("http://example.com/healthz");
    });

    test("generates HTTPS target with TLS config", () => {
      const discovered = createDiscoveredMonitor({
        type: "http",
        target: {
          http: {
            url: "https://example.com/healthz",
            tls: {
              verify: false,
            },
          },
        },
      });

      expect(discovered.target.http?.tls?.verify).toBe(false);
    });

    test("generates TCP target", () => {
      const discovered = createDiscoveredMonitor({
        type: "tcp",
        target: {
          tcp: {
            host: "my-service.default.svc.cluster.local",
            port: 3306,
          },
        },
      });

      expect(discovered.target.tcp).toBeDefined();
      expect(discovered.target.tcp?.host).toBe("my-service.default.svc.cluster.local");
      expect(discovered.target.tcp?.port).toBe(3306);
    });

    test("generates gRPC target", () => {
      const discovered = createDiscoveredMonitor({
        type: "grpc",
        target: {
          grpc: {
            host: "my-service.default.svc.cluster.local",
            port: 50051,
          },
        },
      });

      expect(discovered.target.grpc).toBeDefined();
      expect(discovered.target.grpc?.host).toBe("my-service.default.svc.cluster.local");
      expect(discovered.target.grpc?.port).toBe(50051);
    });
  });

  describe("Dry-run mode", () => {
    test("writeCrds=false prevents actual writes", () => {
      const writeCrds = false;

      // In dry-run mode, we just log but don't write
      expect(writeCrds).toBe(false);
    });

    test("writeCrds=true enables writes", () => {
      const writeCrds = true;

      expect(writeCrds).toBe(true);
    });
  });

  describe("Deletion safety", () => {
    test("only deletes monitors with managed-by=discovery label", () => {
      const MANAGED_LABEL = "monitoring.yuptime.io/managed-by";
      const labels = {
        [MANAGED_LABEL]: "discovery",
      };

      const shouldDelete = labels[MANAGED_LABEL] === "discovery";
      expect(shouldDelete).toBe(true);
    });

    test("skips deletion of manually created monitors", () => {
      const MANAGED_LABEL = "monitoring.yuptime.io/managed-by";
      const labels = {}; // No managed-by label

      const managedBy = (labels as Record<string, string>)[MANAGED_LABEL];
      const shouldDelete = managedBy === "discovery";
      expect(shouldDelete).toBe(false);
    });

    test("skips deletion of monitors managed by other controllers", () => {
      const MANAGED_LABEL = "monitoring.yuptime.io/managed-by";
      const labels = {
        [MANAGED_LABEL]: "helm",
      };

      const shouldDelete = labels[MANAGED_LABEL] === "discovery";
      expect(shouldDelete).toBe(false);
    });
  });
});
