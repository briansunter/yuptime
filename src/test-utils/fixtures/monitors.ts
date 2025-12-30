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
