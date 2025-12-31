/**
 * Test fixture builders for Monitor CRDs
 * These create properly typed monitors matching the current schema
 */

/**
 * Creates a TCP monitor for testing
 */
export function createTcpMonitor(overrides?: {
  host?: string;
  port?: number;
  send?: string;
  expect?: string;
  timeoutSeconds?: number;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test", namespace: "default" },
    spec: {
      enabled: true,
      type: "tcp" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        tcp: {
          host: overrides?.host ?? "example.com",
          port: overrides?.port ?? 443,
          ...(overrides?.send && { send: overrides.send }),
          ...(overrides?.expect && { expect: overrides.expect }),
        },
      },
    },
  };
}

/**
 * Creates a TCP monitor with no target configured (for invalid config tests)
 */
export function createTcpMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test", namespace: "default" },
    spec: {
      enabled: true,
      type: "tcp" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}

/**
 * Creates a ping monitor for testing
 */
export function createPingMonitor(overrides?: {
  host?: string;
  packetCount?: number;
  timeoutSeconds?: number;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test", namespace: "default" },
    spec: {
      enabled: true,
      type: "ping" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        ping: {
          host: overrides?.host ?? "example.com",
          packetCount: overrides?.packetCount ?? 1,
        },
      },
    },
  };
}

/**
 * Creates a ping monitor with no target configured (for invalid config tests)
 */
export function createPingMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test", namespace: "default" },
    spec: {
      enabled: true,
      type: "ping" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}

/**
 * Creates a simple monitor reference for selector tests
 */
export function createSelectorMonitor(overrides?: {
  namespace?: string;
  name?: string;
  labels?: Record<string, string>;
  tags?: string[];
}) {
  return {
    namespace: overrides?.namespace ?? "default",
    name: overrides?.name ?? "test",
    ...(overrides?.labels && { labels: overrides.labels }),
    ...(overrides?.tags && { tags: overrides.tags }),
  };
}

/**
 * Creates a MySQL monitor for testing
 */
export function createMySqlMonitor(overrides?: {
  host?: string;
  port?: number;
  database?: string;
  secretName?: string;
  usernameKey?: string;
  passwordKey?: string;
  healthQuery?: string;
  timeoutSeconds?: number;
  namespace?: string;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-mysql", namespace: overrides?.namespace ?? "default" },
    spec: {
      enabled: true,
      type: "mysql" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        mysql: {
          host: overrides?.host ?? "mysql.example.com",
          port: overrides?.port ?? 3306,
          database: overrides?.database,
          credentialsSecretRef: {
            name: overrides?.secretName ?? "mysql-credentials",
            usernameKey: overrides?.usernameKey ?? "username",
            passwordKey: overrides?.passwordKey ?? "password",
          },
          healthQuery: overrides?.healthQuery ?? "SELECT 1",
        },
      },
    },
  };
}

/**
 * Creates a MySQL monitor with no target configured (for invalid config tests)
 */
export function createMySqlMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-mysql", namespace: "default" },
    spec: {
      enabled: true,
      type: "mysql" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}

/**
 * Creates a PostgreSQL monitor for testing
 */
export function createPostgreSqlMonitor(overrides?: {
  host?: string;
  port?: number;
  database?: string;
  secretName?: string;
  usernameKey?: string;
  passwordKey?: string;
  healthQuery?: string;
  sslMode?: "disable" | "require" | "verify-ca" | "verify-full" | "prefer";
  timeoutSeconds?: number;
  namespace?: string;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-postgresql", namespace: overrides?.namespace ?? "default" },
    spec: {
      enabled: true,
      type: "postgresql" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        postgresql: {
          host: overrides?.host ?? "postgres.example.com",
          port: overrides?.port ?? 5432,
          database: overrides?.database ?? "postgres",
          credentialsSecretRef: {
            name: overrides?.secretName ?? "postgres-credentials",
            usernameKey: overrides?.usernameKey ?? "username",
            passwordKey: overrides?.passwordKey ?? "password",
          },
          healthQuery: overrides?.healthQuery ?? "SELECT 1",
          sslMode: overrides?.sslMode ?? "prefer",
        },
      },
    },
  };
}

/**
 * Creates a PostgreSQL monitor with no target configured (for invalid config tests)
 */
export function createPostgreSqlMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-postgresql", namespace: "default" },
    spec: {
      enabled: true,
      type: "postgresql" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}

/**
 * Creates a Redis monitor for testing
 */
export function createRedisMonitor(overrides?: {
  host?: string;
  port?: number;
  database?: number;
  secretName?: string;
  passwordKey?: string;
  tlsEnabled?: boolean;
  timeoutSeconds?: number;
  namespace?: string;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-redis", namespace: overrides?.namespace ?? "default" },
    spec: {
      enabled: true,
      type: "redis" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        redis: {
          host: overrides?.host ?? "redis.example.com",
          port: overrides?.port ?? 6379,
          database: overrides?.database ?? 0,
          credentialsSecretRef: overrides?.secretName
            ? {
                name: overrides.secretName,
                passwordKey: overrides?.passwordKey ?? "password",
              }
            : undefined,
          tls: overrides?.tlsEnabled !== undefined ? { enabled: overrides.tlsEnabled } : undefined,
        },
      },
    },
  };
}

/**
 * Creates a Redis monitor with no target configured (for invalid config tests)
 */
export function createRedisMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-redis", namespace: "default" },
    spec: {
      enabled: true,
      type: "redis" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}

/**
 * Creates a gRPC monitor for testing
 */
export function createGrpcMonitor(overrides?: {
  host?: string;
  port?: number;
  service?: string;
  tlsEnabled?: boolean;
  tlsVerify?: boolean;
  timeoutSeconds?: number;
  namespace?: string;
}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-grpc", namespace: overrides?.namespace ?? "default" },
    spec: {
      enabled: true,
      type: "grpc" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {
        grpc: {
          host: overrides?.host ?? "grpc.example.com",
          port: overrides?.port ?? 50051,
          service: overrides?.service ?? "",
          tls:
            overrides?.tlsEnabled !== undefined
              ? {
                  enabled: overrides.tlsEnabled,
                  verify: overrides?.tlsVerify ?? true,
                }
              : undefined,
        },
      },
    },
  };
}

/**
 * Creates a gRPC monitor with no target configured (for invalid config tests)
 */
export function createGrpcMonitorNoTarget(overrides?: { timeoutSeconds?: number }) {
  return {
    apiVersion: "monitoring.yuptime.io/v1" as const,
    kind: "Monitor" as const,
    metadata: { name: "test-grpc", namespace: "default" },
    spec: {
      enabled: true,
      type: "grpc" as const,
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: overrides?.timeoutSeconds ?? 10,
      },
      target: {},
    },
  };
}
