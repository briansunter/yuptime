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
      regex?: string[];
    };
    jsonQuery?: {
      path: string;
      exists?: boolean;
      equals?: unknown;
    };
  };
  labels?: Record<string, string>;
  alertmanagerUrl?: string;
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
      type: overrides.successCriteria?.keyword
        ? "keyword"
        : overrides.successCriteria?.jsonQuery
          ? "jsonQuery"
          : "http",
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
      alerting: overrides.alertmanagerUrl
        ? { alertmanagerUrl: overrides.alertmanagerUrl }
        : undefined,
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
 */
export function createMaintenanceWindowFixture(overrides: {
  name: string;
  startTime?: Date;
  endTime?: Date;
  matchNamespaces?: string[];
  matchLabels?: Record<string, string>;
}): MaintenanceWindow {
  const now = new Date();
  const defaultStart = overrides.startTime ?? new Date(now.getTime() - 60000); // 1 min ago
  const defaultEnd = overrides.endTime ?? new Date(now.getTime() + 3600000); // 1 hour from now

  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "MaintenanceWindow",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
    },
    spec: {
      startTime: defaultStart.toISOString(),
      endTime: defaultEnd.toISOString(),
      selector: {
        ...(overrides.matchNamespaces && {
          matchNamespaces: overrides.matchNamespaces,
        }),
        ...(overrides.matchLabels && {
          matchLabels: { matchLabels: overrides.matchLabels },
        }),
      },
    },
  };
}

/**
 * Create a Silence for E2E testing
 */
export function createSilenceFixture(overrides: {
  name: string;
  expiresAt?: Date;
  matchNamespaces?: string[];
  matchNames?: Array<{ namespace: string; name: string }>;
  matchLabels?: Record<string, string>;
}): Silence {
  const defaultExpires = overrides.expiresAt ?? new Date(Date.now() + 3600000); // 1 hour from now

  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Silence",
    metadata: {
      name: overrides.name,
      namespace: E2E_NAMESPACE,
    },
    spec: {
      expiresAt: defaultExpires.toISOString(),
      selector: {
        ...(overrides.matchNamespaces && {
          matchNamespaces: overrides.matchNamespaces,
        }),
        ...(overrides.matchNames && { matchNames: overrides.matchNames }),
        ...(overrides.matchLabels && {
          matchLabels: { matchLabels: overrides.matchLabels },
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

  jsonQueryMatch: () =>
    createHttpMonitor({
      name: "http-json-match",
      url: getHttpUrl("/json"),
      successCriteria: {
        jsonQuery: { path: "status", equals: "ok" },
      },
    }),

  jsonQueryFail: () =>
    createHttpMonitor({
      name: "http-json-fail",
      url: getHttpUrl("/json"),
      successCriteria: {
        jsonQuery: { path: "status", equals: "error" },
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

  withAlerting: () =>
    createHttpMonitor({
      name: "http-with-alerting",
      url: getHttpUrl("/status/500"),
      alertmanagerUrl: getAlertmanagerUrl(),
    }),
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
