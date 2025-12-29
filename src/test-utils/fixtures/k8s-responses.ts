/**
 * Mock Kubernetes API responses for testing
 */

export const mockNamespace = {
  apiVersion: "v1",
  kind: "Namespace",
  metadata: {
    name: "default",
    uid: "test-namespace-uid",
    creationTimestamp: new Date(),
  },
};

export const mockPod = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "test-pod",
    namespace: "default",
    uid: "test-pod-uid",
    creationTimestamp: new Date(),
  },
  spec: {
    containers: [
      {
        name: "checker",
        image: "yuptime/checker:latest",
      },
    ],
  },
  status: {
    phase: "Succeeded",
  },
};

export const mockConfigMap = {
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: {
    name: "test-config",
    namespace: "default",
  },
  data: {
    key: "value",
  },
};

export const mockSecret = {
  apiVersion: "v1",
  kind: "Secret",
  metadata: {
    name: "test-secret",
    namespace: "default",
  },
  data: {
    password: "cGFzc3dvcmQxMjM=", // base64 encoded "password123"
  },
};

export const mockLease = {
  apiVersion: "coordination.k8s.io/v1",
  kind: "Lease",
  metadata: {
    name: "yuptime-leader",
    namespace: "yuptime-system",
  },
  spec: {
    holderIdentity: "yuptime-controller-abc123",
    renewTime: new Date().toISOString(),
    leaseDurationSeconds: 15,
  },
};

export const monitorListResponse = {
  apiVersion: "yuptime.dev/v1",
  kind: "MonitorList",
  items: [
    {
      apiVersion: "yuptime.dev/v1",
      kind: "Monitor",
      metadata: {
        name: "test-monitor-1",
        namespace: "default",
        uid: "monitor-uid-1",
        resourceVersion: "1",
      },
      spec: {
        type: "http",
        interval: "1m",
        timeout: "10s",
        http: {
          url: "https://example.com",
          method: "GET",
        },
      },
    },
    {
      apiVersion: "yuptime.dev/v1",
      kind: "Monitor",
      metadata: {
        name: "test-monitor-2",
        namespace: "default",
        uid: "monitor-uid-2",
        resourceVersion: "2",
      },
      spec: {
        type: "tcp",
        interval: "30s",
        timeout: "5s",
        tcp: {
          host: "example.com",
          port: 443,
        },
      },
    },
  ],
};
