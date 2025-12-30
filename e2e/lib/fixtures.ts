/**
 * E2E Test Fixtures
 *
 * Monitor and other CRD builders for E2E testing.
 */

import {
  E2E_NAMESPACE,
  getAlertmanagerUrl,
  getHttpUrl,
  getWsUrl,
  GRPC_PORT,
  MOCK_SERVER_HOST,
  MYSQL_PORT,
  POSTGRESQL_PORT,
  REDIS_AUTH_PORT,
  REDIS_PORT,
  TCP_BANNER_PORT,
  TCP_CONNECT_PORT,
  TCP_ECHO_PORT,
  TCP_SLOW_PORT,
} from "./config";
import type { MaintenanceWindow, Monitor, Silence } from "./k8s-client";

/**
 * Create an HTTP monitor for E2E testing
 */
export function createHttpMonitor(overrides: {
  name: string;
  url?: string;
  method?: string;
  timeoutSeconds?: number;
  successCriteria?: {
    http?: {
      acceptedStatusCodes?: number[];
      latencyMsUnder?: number;
    };
    keyword?: {
      contains?: string[];
      notContains?: string[];
    };
  };
  labels?: Record<string, string>;
}): Monitor {
  // Determine type based on successCriteria
  // - If keyword criteria specified → type "keyword"
  // - Otherwise → type "http"
  const monitorType = overrides.successCriteria?.keyword ? "keyword" : "http";

  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: monitorType,
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        http: {
          url: overrides.url ?? getHttpUrl("/health"),
          method: overrides.method ?? "GET",
        },
      },
      successCriteria: overrides.successCriteria,
    },
  };
}

/**
 * Create a TCP monitor for E2E testing
 */
export function createTcpMonitor(overrides: {
  name: string;
  host?: string;
  port?: number;
  send?: string;
  expect?: string;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "tcp",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        tcp: {
          host: overrides.host ?? MOCK_SERVER_HOST,
          port: overrides.port ?? TCP_CONNECT_PORT,
          ...(overrides.send && { send: overrides.send }),
          ...(overrides.expect && { expect: overrides.expect }),
        },
      },
    },
  };
}

/**
 * Create a WebSocket monitor for E2E testing
 */
export function createWebSocketMonitor(overrides: {
  name: string;
  url?: string;
  send?: string;
  expect?: string;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "websocket",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        websocket: {
          url: overrides.url ?? getWsUrl("/echo"),
          ...(overrides.send && { send: overrides.send }),
          ...(overrides.expect && { expect: overrides.expect }),
        },
      },
    },
  };
}

/**
 * Create a Ping monitor for E2E testing
 */
export function createPingMonitor(overrides: {
  name: string;
  host?: string;
  packetCount?: number;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "ping",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        ping: {
          host: overrides.host ?? "127.0.0.1",
          packetCount: overrides.packetCount ?? 1,
        },
      },
    },
  };
}

/**
 * Create a DNS monitor for E2E testing
 */
export function createDnsMonitor(overrides: {
  name: string;
  dnsName?: string;
  recordType?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV";
  expectedValues?: string[];
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "dns",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        dns: {
          name: overrides.dnsName ?? "google.com",
          recordType: overrides.recordType ?? "A",
          ...(overrides.expectedValues && {
            expected: { values: overrides.expectedValues },
          }),
        },
      },
    },
  };
}

/**
 * Create a MySQL monitor for E2E testing
 */
export function createMySqlMonitor(overrides: {
  name: string;
  host?: string;
  port?: number;
  database?: string;
  secretName?: string;
  healthQuery?: string;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "mysql",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        mysql: {
          host: overrides.host ?? MOCK_SERVER_HOST,
          port: overrides.port ?? MYSQL_PORT,
          ...(overrides.database && { database: overrides.database }),
          credentialsSecretRef: {
            name: overrides.secretName ?? "mysql-credentials",
            usernameKey: "username",
            passwordKey: "password",
          },
          ...(overrides.healthQuery && { healthQuery: overrides.healthQuery }),
        },
      },
    },
  };
}

/**
 * Create a PostgreSQL monitor for E2E testing
 */
export function createPostgreSqlMonitor(overrides: {
  name: string;
  host?: string;
  port?: number;
  database?: string;
  secretName?: string;
  healthQuery?: string;
  sslMode?: "disable" | "prefer" | "require" | "verify-ca" | "verify-full";
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "postgresql",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        postgresql: {
          host: overrides.host ?? MOCK_SERVER_HOST,
          port: overrides.port ?? POSTGRESQL_PORT,
          database: overrides.database ?? "testdb",
          credentialsSecretRef: {
            name: overrides.secretName ?? "postgresql-credentials",
            usernameKey: "username",
            passwordKey: "password",
          },
          ...(overrides.healthQuery && { healthQuery: overrides.healthQuery }),
          ...(overrides.sslMode && { sslMode: overrides.sslMode }),
        },
      },
    },
  };
}

/**
 * Create a Redis monitor for E2E testing
 */
export function createRedisMonitor(overrides: {
  name: string;
  host?: string;
  port?: number;
  database?: number;
  secretName?: string;
  requiresAuth?: boolean;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "redis",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        redis: {
          host: overrides.host ?? MOCK_SERVER_HOST,
          port: overrides.port ?? REDIS_PORT,
          ...(overrides.database !== undefined && { database: overrides.database }),
          ...(overrides.requiresAuth && {
            credentialsSecretRef: {
              name: overrides.secretName ?? "redis-credentials",
              passwordKey: "password",
            },
          }),
        },
      },
    },
  };
}

/**
 * Create a gRPC monitor for E2E testing
 */
export function createGrpcMonitor(overrides: {
  name: string;
  host?: string;
  port?: number;
  service?: string;
  tls?: { enabled: boolean; verify?: boolean };
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
      labels: {
        "e2e-test": "true",
        ...overrides.labels,
      },
    },
    spec: {
      enabled: true,
      type: "grpc",
      schedule: {
        intervalSeconds: 30,
        timeoutSeconds: overrides.timeoutSeconds ?? 10,
      },
      target: {
        grpc: {
          host: overrides.host ?? MOCK_SERVER_HOST,
          port: overrides.port ?? GRPC_PORT,
          ...(overrides.service && { service: overrides.service }),
          ...(overrides.tls && { tls: overrides.tls }),
        },
      },
    },
  };
}

/**
 * Create a MaintenanceWindow for E2E testing
 * Uses RRULE format for schedule with durationMinutes
 */
export function createMaintenanceWindowFixture(overrides: {
  name: string;
  schedule?: string; // RRULE format, defaults to "now" (one-time occurrence)
  durationMinutes?: number;
  matchNamespaces?: string[];
  matchLabels?: Record<string, string>;
  expired?: boolean; // If true, schedule is in the past
}): MaintenanceWindow {
  // Default schedule: one-time occurrence starting now
  // For expired, use a past date
  const now = new Date();
  let schedule = overrides.schedule;

  if (!schedule) {
    if (overrides.expired) {
      // One-time occurrence 2 hours ago
      const pastDate = new Date(now.getTime() - 7200000);
      schedule = `DTSTART:${pastDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:FREQ=YEARLY;COUNT=1`;
    } else {
      // One-time occurrence starting 1 minute ago (to ensure it's active now)
      const startDate = new Date(now.getTime() - 60000);
      schedule = `DTSTART:${startDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:FREQ=YEARLY;COUNT=1`;
    }
  }

  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "MaintenanceWindow",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
    },
    spec: {
      schedule,
      durationMinutes: overrides.expired ? 30 : (overrides.durationMinutes ?? 120), // 2 hours default
      selector: {
        ...(overrides.matchNamespaces && {
          matchNamespaces: overrides.matchNamespaces,
        }),
        ...(overrides.matchLabels && {
          matchLabels: overrides.matchLabels,
        }),
      },
    },
  };
}

/**
 * Create a Silence for E2E testing
 * Uses startsAt and endsAt timestamps
 */
export function createSilenceFixture(overrides: {
  name: string;
  startsAt?: Date;
  endsAt?: Date;
  matchNamespaces?: string[];
  matchLabels?: Record<string, string>;
  expired?: boolean; // If true, silence is already expired
}): Silence {
  const now = new Date();
  let startsAt: Date;
  let endsAt: Date;

  if (overrides.expired) {
    // Expired silence: ended 1 hour ago
    startsAt = overrides.startsAt ?? new Date(now.getTime() - 7200000); // 2 hours ago
    endsAt = overrides.endsAt ?? new Date(now.getTime() - 3600000); // 1 hour ago
  } else {
    // Active silence: started 1 minute ago, ends in 1 hour
    startsAt = overrides.startsAt ?? new Date(now.getTime() - 60000); // 1 min ago
    endsAt = overrides.endsAt ?? new Date(now.getTime() + 3600000); // 1 hour from now
  }

  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Silence",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
    },
    spec: {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      selector: {
        ...(overrides.matchNamespaces && {
          matchNamespaces: overrides.matchNamespaces,
        }),
        ...(overrides.matchLabels && {
          matchLabels: overrides.matchLabels,
        }),
      },
    },
  };
}

// Pre-built fixtures for common test scenarios
export const httpFixtures = {
  success: () =>
    createHttpMonitor({
      name: "http-success",
      url: getHttpUrl("/health"),
    }),

  status500: () =>
    createHttpMonitor({
      name: "http-500",
      url: getHttpUrl("/status/500"),
    }),

  timeout: () =>
    createHttpMonitor({
      name: "http-timeout",
      url: getHttpUrl("/hang"),
      timeoutSeconds: 2,
    }),

  keywordMatch: () =>
    createHttpMonitor({
      name: "http-keyword-match",
      url: getHttpUrl("/keyword"),
      successCriteria: {
        keyword: { contains: ["SUCCESS"] },
      },
    }),

  keywordMissing: () =>
    createHttpMonitor({
      name: "http-keyword-missing",
      url: getHttpUrl("/keyword/missing"),
      successCriteria: {
        keyword: { contains: ["SUCCESS"] },
      },
    }),


  latencyExceeded: () =>
    createHttpMonitor({
      name: "http-latency-exceeded",
      url: getHttpUrl("/slow/500"),
      successCriteria: {
        http: { latencyMsUnder: 100 },
      },
    }),

  // Note: Alerting is configured via NotificationPolicy CRD, not directly on Monitor
};

export const tcpFixtures = {
  success: () =>
    createTcpMonitor({
      name: "tcp-success",
      port: TCP_CONNECT_PORT,
    }),

  connectionRefused: () =>
    createTcpMonitor({
      name: "tcp-refused",
      port: 19999, // Unused port
    }),

  sendExpectMatch: () =>
    createTcpMonitor({
      name: "tcp-send-expect",
      port: TCP_ECHO_PORT,
      send: "PING",
      expect: "PONG",
    }),

  bannerCheck: () =>
    createTcpMonitor({
      name: "tcp-banner",
      port: TCP_BANNER_PORT,
      expect: "READY",
    }),

  timeout: () =>
    createTcpMonitor({
      name: "tcp-timeout",
      port: TCP_SLOW_PORT,
      send: "PING",
      expect: "PONG", // Slow server delays response, causing timeout
      timeoutSeconds: 1,
    }),
};

export const wsFixtures = {
  success: () =>
    createWebSocketMonitor({
      name: "ws-success",
      url: getWsUrl("/echo"),
    }),

  sendExpectMatch: () =>
    createWebSocketMonitor({
      name: "ws-send-expect",
      url: getWsUrl("/echo"),
      send: "test",
      expect: "test",
    }),

  connectionFailed: () =>
    createWebSocketMonitor({
      name: "ws-failed",
      url: `ws://${MOCK_SERVER_HOST}:19999/`,
    }),

  timeout: () =>
    createWebSocketMonitor({
      name: "ws-timeout",
      url: getWsUrl("/slow"),
      send: "test", // Send message and expect response
      expect: "test", // Server delays 2s, so 1s timeout should trigger
      timeoutSeconds: 1,
    }),
};

export const pingFixtures = {
  localhost: () =>
    createPingMonitor({
      name: "ping-localhost",
      host: "127.0.0.1",
    }),

  unreachable: () =>
    createPingMonitor({
      name: "ping-unreachable",
      host: "192.0.2.1", // TEST-NET-1, not routable
      timeoutSeconds: 3, // Shorter timeout for faster tests
    }),
};

export const dnsFixtures = {
  success: () =>
    createDnsMonitor({
      name: "dns-success",
      dnsName: "google.com",
      recordType: "A",
    }),

  nxdomain: () =>
    createDnsMonitor({
      name: "dns-nxdomain",
      dnsName: "this-domain-definitely-does-not-exist-12345.com",
      recordType: "A",
    }),
};

export const mysqlFixtures = {
  success: () =>
    createMySqlMonitor({
      name: "mysql-success",
    }),

  connectionRefused: () =>
    createMySqlMonitor({
      name: "mysql-refused",
      port: 23306, // Unused port (not 13306 which is the actual MySQL port)
    }),

  customDatabase: () =>
    createMySqlMonitor({
      name: "mysql-custom-db",
      database: "testdb",
    }),

  customQuery: () =>
    createMySqlMonitor({
      name: "mysql-custom-query",
      healthQuery: "SELECT NOW()",
    }),
};

export const postgresqlFixtures = {
  success: () =>
    createPostgreSqlMonitor({
      name: "postgresql-success",
    }),

  connectionRefused: () =>
    createPostgreSqlMonitor({
      name: "postgresql-refused",
      port: 25432, // Unused port (not 15432 which is the actual PostgreSQL port)
    }),

  customDatabase: () =>
    createPostgreSqlMonitor({
      name: "postgresql-custom-db",
      database: "testdb",
    }),

  sslDisabled: () =>
    createPostgreSqlMonitor({
      name: "postgresql-ssl-disabled",
      sslMode: "disable",
    }),
};

export const redisFixtures = {
  // Redis without auth (port 16379)
  success: () =>
    createRedisMonitor({
      name: "redis-success",
    }),

  connectionRefused: () =>
    createRedisMonitor({
      name: "redis-refused",
      port: 26379, // Unused port
    }),

  // Redis with auth (port 16380)
  withAuth: () =>
    createRedisMonitor({
      name: "redis-with-auth",
      port: REDIS_AUTH_PORT,
      requiresAuth: true,
    }),

  customDatabase: () =>
    createRedisMonitor({
      name: "redis-custom-db",
      database: 1,
    }),
};

export const grpcFixtures = {
  success: () =>
    createGrpcMonitor({
      name: "grpc-success",
    }),

  connectionRefused: () =>
    createGrpcMonitor({
      name: "grpc-refused",
      port: 50052, // Unused port
    }),

  customService: () =>
    createGrpcMonitor({
      name: "grpc-custom-service",
      service: "my.custom.Service",
    }),

  withTls: () =>
    createGrpcMonitor({
      name: "grpc-with-tls",
      tls: { enabled: true, verify: true },
    }),
};
