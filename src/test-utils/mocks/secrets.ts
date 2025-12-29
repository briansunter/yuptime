/**
 * Mock Secret API for testing
 */

export interface SecretData {
  [key: string]: string;
}

export interface MockSecret {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  data: SecretData;
}

export interface MockSecretsApi {
  readNamespacedSecret: (namespace: string, name: string) => Promise<{ body: MockSecret }>;
  createNamespacedSecret: (namespace: string, secret: MockSecret) => Promise<{ body: MockSecret }>;
  patchNamespacedSecret: (
    namespace: string,
    name: string,
    patch: Partial<MockSecret>,
  ) => Promise<{ body: MockSecret }>;
  deleteNamespacedSecret: (
    namespace: string,
    name: string,
  ) => Promise<{ body: Record<string, never> }>;
  listNamespacedSecret: (namespace: string) => Promise<{ body: { items: MockSecret[] } }>;
}

/**
 * Creates a mock Secret API with test secrets
 */
export function createMockSecretsApi(): MockSecretsApi {
  const secrets = new Map<string, MockSecret>();

  // Add some default test secrets
  secrets.set("default/api-key", {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "api-key",
      namespace: "default",
    },
    data: {
      key: Buffer.from("test-api-key-123").toString("base64"),
    },
  });

  secrets.set("default/bearer-token", {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "bearer-token",
      namespace: "default",
    },
    data: {
      token: Buffer.from("test-bearer-token-456").toString("base64"),
    },
  });

  return {
    readNamespacedSecret: async (namespace: string, name: string) => {
      const key = `${namespace}/${name}`;
      const secret = secrets.get(key);

      if (!secret) {
        throw new Error(`Secret ${key} not found`);
      }

      return { body: secret };
    },

    createNamespacedSecret: async (namespace: string, secret: MockSecret) => {
      const key = `${namespace}/${secret.metadata.name}`;
      secrets.set(key, secret);
      return { body: secret };
    },

    patchNamespacedSecret: async (namespace: string, name: string, patch: Partial<MockSecret>) => {
      const key = `${namespace}/${name}`;
      const existing = secrets.get(key);

      if (!existing) {
        throw new Error(`Secret ${key} not found`);
      }

      const updated = { ...existing, ...patch };
      secrets.set(key, updated);
      return { body: updated };
    },

    deleteNamespacedSecret: async (namespace: string, name: string) => {
      const key = `${namespace}/${name}`;
      secrets.delete(key);
      return { body: {} };
    },

    listNamespacedSecret: async (namespace: string) => {
      const items = Array.from(secrets.entries())
        .filter(([key]) => key.startsWith(`${namespace}/`))
        .map(([, secret]) => secret);

      return { body: { items } };
    },
  };
}

/**
 * Helper to get a test secret value
 */
export function getTestSecretValue(name: string): string {
  const secrets: Record<string, string> = {
    "api-key": "test-api-key-123",
    "bearer-token": "test-bearer-token-456",
    password: "password123",
  };

  return secrets[name] || "";
}
