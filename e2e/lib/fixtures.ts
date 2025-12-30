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
  MOCK_SERVER_HOST,
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
