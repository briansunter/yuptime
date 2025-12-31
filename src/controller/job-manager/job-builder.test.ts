import { describe, expect, test } from "bun:test";
import { buildJobForMonitor, extractSecretEnvVars } from "./job-builder";
import type { Monitor } from "./types";

/**
 * Create a minimal monitor for testing.
 * Uses type assertion since we only need partial specs for testing secret extraction.
 */
function createTestMonitor(target: Record<string, unknown>): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: "test-monitor",
      namespace: "default",
    },
    spec: {
      enabled: true,
      type: "http",
      schedule: {
        intervalSeconds: 60,
        timeoutSeconds: 10,
      },
      target,
    },
  } as Monitor;
}

describe("extractSecretEnvVars", () => {
  test("returns empty array for monitor without secrets", () => {
    const monitor = createTestMonitor({
      http: { url: "https://example.com" },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toEqual([]);
  });

  test("extracts MySQL credentials", () => {
    const monitor = createTestMonitor({
      mysql: {
        host: "localhost",
        port: 3306,
        credentialsSecretRef: {
          name: "mysql-secret",
          usernameKey: "user",
          passwordKey: "pass",
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(2);
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_USERNAME",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "user" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_PASSWORD",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "pass" } },
    });
  });

  test("uses default keys for MySQL credentials", () => {
    const monitor = createTestMonitor({
      mysql: {
        host: "localhost",
        credentialsSecretRef: {
          name: "mysql-secret",
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_USERNAME",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "username" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_PASSWORD",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "password" } },
    });
  });

  test("extracts PostgreSQL credentials", () => {
    const monitor = createTestMonitor({
      postgresql: {
        host: "localhost",
        database: "testdb",
        credentialsSecretRef: {
          name: "pg-secret",
          usernameKey: "pguser",
          passwordKey: "pgpass",
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(2);
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_POSTGRESQL_USERNAME",
      valueFrom: { secretKeyRef: { name: "pg-secret", key: "pguser" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_POSTGRESQL_PASSWORD",
      valueFrom: { secretKeyRef: { name: "pg-secret", key: "pgpass" } },
    });
  });

  test("extracts Redis password", () => {
    const monitor = createTestMonitor({
      redis: {
        host: "localhost",
        credentialsSecretRef: {
          name: "redis-secret",
          passwordKey: "redis-pass",
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(1);
    expect(envVars).toContainEqual({
      name: "YUPTIME_CRED_REDIS_PASSWORD",
      valueFrom: { secretKeyRef: { name: "redis-secret", key: "redis-pass" } },
    });
  });

  test("does not extract Redis password when no secret ref", () => {
    const monitor = createTestMonitor({
      redis: {
        host: "localhost",
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(0);
  });

  test("extracts HTTP basic auth credentials", () => {
    const monitor = createTestMonitor({
      http: {
        url: "https://example.com",
        auth: {
          basic: {
            secretRef: {
              name: "basic-auth-secret",
              usernameKey: "user",
              passwordKey: "pass",
            },
          },
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(2);
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_BASIC_USERNAME",
      valueFrom: { secretKeyRef: { name: "basic-auth-secret", key: "user" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_BASIC_PASSWORD",
      valueFrom: { secretKeyRef: { name: "basic-auth-secret", key: "pass" } },
    });
  });

  test("extracts HTTP bearer token", () => {
    const monitor = createTestMonitor({
      http: {
        url: "https://example.com",
        auth: {
          bearer: {
            tokenSecretRef: {
              name: "token-secret",
              key: "api-token",
            },
          },
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(1);
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_BEARER_TOKEN",
      valueFrom: { secretKeyRef: { name: "token-secret", key: "api-token" } },
    });
  });

  test("extracts HTTP OAuth2 client credentials", () => {
    const monitor = createTestMonitor({
      http: {
        url: "https://example.com",
        auth: {
          oauth2: {
            tokenUrl: "https://auth.example.com/token",
            clientSecretRef: {
              name: "oauth-secret",
              clientIdKey: "id",
              clientSecretKey: "secret",
            },
          },
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toHaveLength(2);
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_OAUTH_CLIENT_ID",
      valueFrom: { secretKeyRef: { name: "oauth-secret", key: "id" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_OAUTH_CLIENT_SECRET",
      valueFrom: { secretKeyRef: { name: "oauth-secret", key: "secret" } },
    });
  });

  test("uses default keys for OAuth2 credentials", () => {
    const monitor = createTestMonitor({
      http: {
        url: "https://example.com",
        auth: {
          oauth2: {
            tokenUrl: "https://auth.example.com/token",
            clientSecretRef: {
              name: "oauth-secret",
            },
          },
        },
      },
    });

    const envVars = extractSecretEnvVars(monitor);

    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_OAUTH_CLIENT_ID",
      valueFrom: { secretKeyRef: { name: "oauth-secret", key: "client_id" } },
    });
    expect(envVars).toContainEqual({
      name: "YUPTIME_AUTH_OAUTH_CLIENT_SECRET",
      valueFrom: { secretKeyRef: { name: "oauth-secret", key: "client_secret" } },
    });
  });
});

describe("buildJobForMonitor", () => {
  test("includes secret env vars in job container", () => {
    const monitor = createTestMonitor({
      mysql: {
        host: "localhost",
        credentialsSecretRef: {
          name: "mysql-secret",
        },
      },
    });

    const job = buildJobForMonitor(monitor, 1000);

    const container = job.spec?.template?.spec?.containers?.[0];
    expect(container?.env).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_USERNAME",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "username" } },
    });
    expect(container?.env).toContainEqual({
      name: "YUPTIME_CRED_MYSQL_PASSWORD",
      valueFrom: { secretKeyRef: { name: "mysql-secret", key: "password" } },
    });
  });

  test("uses sanitized namespace in job name", () => {
    const monitor = createTestMonitor({
      http: { url: "https://example.com" },
    });
    monitor.metadata.namespace = "my-namespace";
    monitor.metadata.name = "my-monitor";

    const job = buildJobForMonitor(monitor, 0);

    expect(job.metadata?.name).toMatch(/^monitor-my-namespace-my-monitor-\d+$/);
  });

  test("sets appropriate labels and annotations", () => {
    const monitor = createTestMonitor({
      http: { url: "https://example.com" },
    });
    monitor.metadata.namespace = "test-ns";
    monitor.metadata.name = "test-mon";

    const job = buildJobForMonitor(monitor, 500);

    expect(job.metadata?.labels).toMatchObject({
      "app.kubernetes.io/name": "yuptime",
      "app.kubernetes.io/component": "checker",
      "monitoring.yuptime.io/monitor": "test-ns-test-mon",
    });
    expect(job.metadata?.annotations).toMatchObject({
      "monitoring.yuptime.io/monitor": "test-ns/test-mon",
      "monitoring.yuptime.io/jitter-offset": "500",
    });
  });

  test("uses yuptime-checker service account", () => {
    const monitor = createTestMonitor({
      http: { url: "https://example.com" },
    });

    const job = buildJobForMonitor(monitor, 0);

    expect(job.spec?.template?.spec?.serviceAccountName).toBe("yuptime-checker");
  });

  test("sets security context for non-root execution", () => {
    const monitor = createTestMonitor({
      http: { url: "https://example.com" },
    });

    const job = buildJobForMonitor(monitor, 0);

    const podSecurityContext = job.spec?.template?.spec?.securityContext;
    expect(podSecurityContext?.runAsNonRoot).toBe(true);
    expect(podSecurityContext?.runAsUser).toBe(1000);
  });
});
