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

/**
 * Wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Heartbeat state type
 */
export type HeartbeatState = "up" | "down";

/**
 * Heartbeat structure for uptime tests
 */
export interface Heartbeat {
  state: HeartbeatState;
  checkedAt: Date | string;
}

/**
 * Creates heartbeats for uptime testing
 * States are ordered from most recent to oldest
 */
export function createHeartbeats(states: HeartbeatState[], intervalMs = 1000): Heartbeat[] {
  const now = Date.now();
  return states.map((state, i) => ({
    state,
    checkedAt: new Date(now - (i + 1) * intervalMs),
  }));
}

/**
 * Creates heartbeats with a specific base time (for time-window tests)
 */
export function createHeartbeatsAt(
  states: HeartbeatState[],
  baseTimeMs: number,
  intervalMs = 1000,
): Heartbeat[] {
  return states.map((state, i) => ({
    state,
    checkedAt: new Date(baseTimeMs - (i + 1) * intervalMs),
  }));
}
