/**
 * Mock network operations for testing
 */

import { afterEach, beforeEach } from "bun:test";

/**
 * Mock fetch responses
 */
export interface MockFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string> | Headers;
  body: string;
}

/**
 * Setup mock fetch for testing
 */
export function mockFetch(response: MockFetchResponse | MockFetchResponse[]): void {
  const responses = Array.isArray(response) ? response : [response];
  let callCount = 0;

  beforeEach(() => {
    const mockFetchFn = async () => {
      const mockResponse = responses[Math.min(callCount, responses.length - 1)];
      callCount++;

      if (!mockResponse) {
        throw new Error("No mock response configured");
      }

      return {
        ok: mockResponse.status >= 200 && mockResponse.status < 300,
        status: mockResponse.status,
        statusText: mockResponse.statusText,
        headers: new Headers(mockResponse.headers),
        text: async () => mockResponse.body,
        json: async () => JSON.parse(mockResponse.body),
      } as Response;
    };

    global.fetch = mockFetchFn as unknown as typeof fetch;
  });

  afterEach(() => {
    // Reset fetch after test
    callCount = 0;
  });
}

/**
 * Restore original fetch
 */
export function restoreFetch() {
  global.fetch = fetch;
}

/**
 * Mock DNS resolution
 */
export function mockDNS(_records: string[]) {
  // DNS mocking requires more sophisticated setup
  // This is a placeholder for future implementation
  beforeEach(() => {
    // TODO: Implement DNS mocking
  });
}

/**
 * Mock TCP connection
 */
export function mockTCP(_success: boolean, _delay: number = 0) {
  // TCP mocking requires more sophisticated setup
  // This is a placeholder for future implementation
  beforeEach(() => {
    // TODO: Implement TCP mocking
  });
}

/**
 * Create a successful HTTP response mock
 */
export function successResponse(body: string, status: number = 200): MockFetchResponse {
  return {
    status,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    body,
  };
}

/**
 * Create a failed HTTP response mock
 */
export function errorResponse(status: number, statusText: string = "Error"): MockFetchResponse {
  return {
    status,
    statusText,
    headers: {},
    body: JSON.stringify({ error: statusText }),
  };
}
