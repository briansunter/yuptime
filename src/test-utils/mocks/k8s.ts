/**
 * Mock Kubernetes API clients for testing
 */

export interface MockKubernetesResponse<T> {
  body: T;
}

export interface MockInformer {
  start: () => void;
  stop: () => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  list: () => unknown[];
}

/**
 * Creates a mock Kubernetes informer
 */
export function createMockInformer(): MockInformer {
  return {
    start() {
      // Intentionally empty for mock
    },
    stop() {
      // Intentionally empty for mock
    },
    on() {
      // Intentionally empty for mock
    },
    off() {
      // Intentionally empty for mock
    },
    list() {
      return [];
    },
  };
}
