export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface RequestDependencies {
  fetch: FetchFunction;
  sleep: (delayMs: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

export type FetchInit = RequestInit & {
  tls?: {
    ca: string;
    serverName: string | undefined;
  };
};

export type FetchFunction = (url: string, init: FetchInit) => Promise<Response>;

export const DEFAULT_K8S_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 8,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
};

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function retryDelay(policy: RetryPolicy, attempt: number): number {
  return Math.min(policy.initialDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
}

export async function fetchK8sWithRetry(
  url: string,
  init: FetchInit,
  policy: RetryPolicy = DEFAULT_K8S_RETRY_POLICY,
  dependencies: RequestDependencies = {
    fetch: globalThis.fetch,
    sleep: defaultSleep,
  },
): Promise<Response> {
  if (policy.maxAttempts < 1) {
    throw new Error("Kubernetes API retry policy requires at least one attempt");
  }

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const response = await dependencies.fetch(url, init);
      if (!TRANSIENT_STATUS_CODES.has(response.status) || attempt === policy.maxAttempts) {
        return response;
      }

      const delayMs = retryDelay(policy, attempt);
      dependencies.onRetry?.(attempt, delayMs, `HTTP ${response.status}`);
      await dependencies.sleep(delayMs);
    } catch (error) {
      if (attempt === policy.maxAttempts) {
        throw error;
      }

      const delayMs = retryDelay(policy, attempt);
      const reason = error instanceof Error ? error.message : "request failed";
      dependencies.onRetry?.(attempt, delayMs, reason);
      await dependencies.sleep(delayMs);
    }
  }

  throw new Error("Kubernetes API retry loop exited unexpectedly");
}
