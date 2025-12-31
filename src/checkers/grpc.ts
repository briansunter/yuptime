import { getDnsConfigFromEnv, resolveHostname } from "../lib/dns";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * gRPC health check status codes
 * Based on grpc.health.v1.HealthCheckResponse.ServingStatus
 */
export const GRPC_HEALTH_STATUS = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
} as const;

/**
 * gRPC health client interface for dependency injection
 */
export interface GrpcHealthClient {
  check(request: { service: string }): Promise<{ status: number }>;
  close(): void;
}

/**
 * gRPC client factory configuration
 */
export interface GrpcClientConfig {
  host: string;
  port: number;
  tls: boolean;
  verifyTls: boolean;
  timeout: number;
}

/**
 * gRPC client factory type for dependency injection
 */
export type GrpcClientFactory = (config: GrpcClientConfig) => Promise<GrpcHealthClient>;

/**
 * Default gRPC client factory using @grpc/grpc-js
 * Note: This requires @grpc/grpc-js and @grpc/proto-loader to be installed
 */
async function createDefaultGrpcClient(config: GrpcClientConfig): Promise<GrpcHealthClient> {
  // Use dynamic import to avoid bundling grpc if not used
  const grpc = await import("@grpc/grpc-js");
  const protoLoader = await import("@grpc/proto-loader");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  // Use the standard gRPC health check proto
  const HEALTH_PROTO = `
syntax = "proto3";

package grpc.health.v1;

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
    SERVICE_UNKNOWN = 3;
  }
  ServingStatus status = 1;
}

service Health {
  rpc Check(HealthCheckRequest) returns (HealthCheckResponse);
}
`;

  // Write proto to temp file since protoLoader.loadSync expects a file path
  const tmpDir = os.tmpdir();
  const protoPath = path.join(tmpDir, "grpc-health.proto");
  fs.writeFileSync(protoPath, HEALTH_PROTO);

  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: Number,
    defaults: true,
    oneofs: true,
  });

  // biome-ignore lint/suspicious/noExplicitAny: gRPC dynamic proto loading
  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

  // biome-ignore lint/suspicious/noExplicitAny: gRPC dynamic proto loading
  const HealthClient = protoDescriptor.grpc.health.v1.Health as any;

  const address = `${config.host}:${config.port}`;
  const credentials = config.tls
    ? grpc.credentials.createSsl(null, null, null, {
        checkServerIdentity: config.verifyTls ? undefined : () => undefined,
      })
    : grpc.credentials.createInsecure();

  const client = new HealthClient(address, credentials, {
    "grpc.initial_reconnect_backoff_ms": 100,
    "grpc.max_reconnect_backoff_ms": config.timeout,
  });

  // Set deadline for connection
  const deadline = new Date(Date.now() + config.timeout);

  return {
    check: (request: { service: string }) => {
      return new Promise((resolve, reject) => {
        client.Check(
          request,
          { deadline },
          (error: Error | null, response: { status: number } | undefined) => {
            if (error) {
              reject(error);
            } else if (response) {
              resolve(response);
            } else {
              reject(new Error("No response received"));
            }
          },
        );
      });
    },
    close: () => {
      client.close();
    },
  };
}

/**
 * Internal gRPC checker implementation with injectable client factory
 */
async function checkGrpcWithFactory(
  monitor: Monitor,
  timeout: number,
  clientFactory: (config: GrpcClientConfig) => Promise<GrpcHealthClient>,
): Promise<CheckResult> {
  const target = monitor.spec.target.grpc;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No gRPC target configured",
    };
  }

  const startTime = Date.now();
  let client: GrpcHealthClient | null = null;

  try {
    // Get DNS config from monitor target or environment (injected by job-builder)
    const dnsConfig = target.dns ?? getDnsConfigFromEnv();

    // Resolve hostname (gRPC uses system DNS by default, but allows override)
    const resolvedHost = await resolveHostname(target.host, {
      config: dnsConfig,
      defaultToExternal: false, // gRPC checker defaults to system DNS
      timeoutMs: timeout * 1000,
    });

    if (resolvedHost !== target.host) {
      logger.debug(
        { monitor: monitor.metadata.name, originalHost: target.host, resolvedHost },
        "Using resolved IP for gRPC connection",
      );
    }

    client = await clientFactory({
      host: resolvedHost,
      port: target.port ?? 50051,
      tls: target.tls?.enabled ?? false,
      verifyTls: target.tls?.verify ?? true,
      timeout: timeout * 1000,
    });

    const response = await client.check({
      service: target.service ?? "",
    });

    const latencyMs = Date.now() - startTime;

    switch (response.status) {
      case GRPC_HEALTH_STATUS.SERVING:
        return {
          state: "up",
          latencyMs,
          reason: "GRPC_SERVING",
          message: "gRPC service is serving",
        };

      case GRPC_HEALTH_STATUS.NOT_SERVING:
        return {
          state: "down",
          latencyMs,
          reason: "GRPC_NOT_SERVING",
          message: "gRPC service is not serving",
        };

      case GRPC_HEALTH_STATUS.SERVICE_UNKNOWN:
        return {
          state: "down",
          latencyMs,
          reason: "GRPC_SERVICE_UNKNOWN",
          message: `gRPC service '${target.service}' is unknown`,
        };

      default:
        return {
          state: "down",
          latencyMs,
          reason: "GRPC_UNKNOWN",
          message: `gRPC health check returned unknown status: ${response.status}`,
        };
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? (error as { code: number }).code
        : undefined;

    logger.warn(
      { monitor: monitor.metadata.name, error: errorMessage, code: errorCode },
      "gRPC check failed",
    );

    // Categorize common gRPC errors
    // gRPC status codes: https://grpc.io/docs/guides/status-codes/
    if (errorCode === 14) {
      // UNAVAILABLE
      return {
        state: "down",
        latencyMs,
        reason: "GRPC_UNAVAILABLE",
        message: "gRPC service unavailable",
      };
    }

    if (errorCode === 4) {
      // DEADLINE_EXCEEDED
      return {
        state: "down",
        latencyMs,
        reason: "TIMEOUT",
        message: `gRPC connection timeout after ${timeout}s`,
      };
    }

    if (errorMessage.includes("ECONNREFUSED")) {
      return {
        state: "down",
        latencyMs,
        reason: "CONNECTION_REFUSED",
        message: "gRPC connection refused",
      };
    }

    if (errorMessage.includes("ENOTFOUND")) {
      return {
        state: "down",
        latencyMs,
        reason: "DNS_NXDOMAIN",
        message: "gRPC host not found",
      };
    }

    return {
      state: "down",
      latencyMs,
      reason: "GRPC_ERROR",
      message: errorMessage,
    };
  } finally {
    if (client) {
      client.close();
    }
  }
}

/**
 * gRPC health checker
 */
export async function checkGrpc(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkGrpcWithFactory(monitor, timeout, createDefaultGrpcClient);
}

/**
 * Create a gRPC checker with a custom client factory (for testing)
 */
export function createCheckGrpc(
  clientFactory: (config: GrpcClientConfig) => Promise<GrpcHealthClient>,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) =>
    checkGrpcWithFactory(monitor, timeout, clientFactory);
}
