/**
 * Sample Monitor CRD fixtures for testing
 */

export const httpMonitor = {
  apiVersion: "yuptime.dev/v1",
  kind: "Monitor",
  metadata: {
    name: "http-test",
    namespace: "default",
  },
  spec: {
    type: "http",
    interval: "1m",
    timeout: "10s",
    http: {
      url: "https://example.com",
      method: "GET",
      expectedStatus: [200],
    },
  },
};

export const tcpMonitor = {
  apiVersion: "yuptime.dev/v1",
  kind: "Monitor",
  metadata: {
    name: "tcp-test",
    namespace: "default",
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
};

export const dnsMonitor = {
  apiVersion: "yuptime.dev/v1",
  kind: "Monitor",
  metadata: {
    name: "dns-test",
    namespace: "default",
  },
  spec: {
    type: "dns",
    interval: "1m",
    timeout: "5s",
    dns: {
      domain: "example.com",
      recordType: "A",
      expectedValues: ["93.184.216.34"],
    },
  },
};

export const pingMonitor = {
  apiVersion: "yuptime.dev/v1",
  kind: "Monitor",
  metadata: {
    name: "ping-test",
    namespace: "default",
  },
  spec: {
    type: "ping",
    interval: "1m",
    timeout: "10s",
    ping: {
      host: "example.com",
      count: 3,
    },
  },
};

export const websocketMonitor = {
  apiVersion: "yuptime.dev/v1",
  kind: "Monitor",
  metadata: {
    name: "websocket-test",
    namespace: "default",
  },
  spec: {
    type: "websocket",
    interval: "1m",
    timeout: "10s",
    websocket: {
      url: "wss://example.com/socket",
    },
  },
};
