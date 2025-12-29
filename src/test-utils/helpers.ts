/**
 * Test helper utilities
 */

export interface MockLogger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Creates a mock Kubernetes logger
 */
export function createMockLogger(): MockLogger {
  return {
    info() {
      // Intentionally empty for mock
    },
    debug() {
      // Intentionally empty for mock
    },
    warn() {
      // Intentionally empty for mock
    },
    error() {
      // Intentionally empty for mock
    },
  };
}

export interface TestMonitorSpec {
  type: string;
  interval: string;
  timeout: string;
  http?: {
    url: string;
    method: string;
  };
  [key: string]: unknown;
}

export interface TestMonitor {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec: TestMonitorSpec;
}

/**
 * Creates a test monitor with default values
 */
export function createTestMonitor(overrides: Partial<TestMonitor> = {}): TestMonitor {
  return {
    apiVersion: "yuptime.dev/v1",
    kind: "Monitor",
    metadata: {
      name: "test-monitor",
      namespace: "default",
    },
    spec: {
      type: "http",
      interval: "1m",
      timeout: "10s",
      http: {
        url: "https://example.com",
        method: "GET",
      },
      ...overrides,
    },
  };
}

export interface HTTPCheckerConfig {
  url: string;
  method: string;
  expectedStatus: number[];
  timeout: number;
  [key: string]: unknown;
}

/**
 * Creates a test HTTP checker config
 */
export function createHTTPCheckerConfig(
  overrides: Partial<HTTPCheckerConfig> = {},
): HTTPCheckerConfig {
  return {
    url: "https://example.com",
    method: "GET",
    expectedStatus: [200],
    timeout: 10000,
    ...overrides,
  };
}

/**
 * Wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
