/**
 * E2E Test Configuration
 *
 * Environment-based configuration for E2E tests.
 */

// Mock server configuration
export const MOCK_SERVER_HOST = process.env.MOCK_SERVER_HOST || "localhost";
export const HTTP_PORT = 8080;
export const WS_PORT = 8082;
export const TCP_CONNECT_PORT = 8081;
export const TCP_BANNER_PORT = 8083;
export const TCP_ECHO_PORT = 8084;
export const TCP_SLOW_PORT = 8085;

// Kubernetes configuration
export const E2E_NAMESPACE = process.env.E2E_NAMESPACE || "yuptime";

// Timeout configuration
export const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
export const JOB_WAIT_TIMEOUT_MS = 120000; // 2 minutes
export const STATUS_POLL_INTERVAL_MS = 1000; // 1 second

// Helper URLs
export function getHttpUrl(path: string): string {
  return `http://${MOCK_SERVER_HOST}:${HTTP_PORT}${path}`;
}

export function getWsUrl(path: string): string {
  return `ws://${MOCK_SERVER_HOST}:${WS_PORT}${path}`;
}

export function getAlertmanagerUrl(): string {
  return `http://${MOCK_SERVER_HOST}:${HTTP_PORT}/alertmanager`;
}
