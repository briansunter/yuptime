import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema, } from "./common";

// Monitor schedule configuration
export const MonitorScheduleSchema = z.object({
  intervalSeconds: z.number().min(1),
  timeoutSeconds: z.number().min(1),
  retries: z
    .object({
      maxRetries: z.number().min(0),
      retryIntervalSeconds: z.number().min(1),
    })
    .optional(),
  initialDelaySeconds: z.number().min(0).optional(),
  graceDownSeconds: z.number().min(0).optional(),
  jitterPercent: z.number().min(0).max(100).optional(),
});

export type MonitorSchedule = z.infer<typeof MonitorScheduleSchema>;

// HTTP target configuration
export const HttpTargetSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]).optional().default("GET"),
  followRedirects: z.boolean().optional().default(true),
  maxRedirects: z.number().min(0).optional().default(10),
  headers: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().optional(),
        valueFromSecretRef: SecretRefSchema.optional(),
      })
    )
    .optional(),
  body: z
    .object({
      type: z.enum(["none", "json", "text"]).optional(),
      json: z.record(z.any()).optional(),
      text: z.string().optional(),
    })
    .optional(),
  expectedContentType: z.string().optional(),
  maxBodyBytes: z.number().min(0).optional().default(1048576),
  tls: z
    .object({
      verify: z.boolean().optional().default(true),
      sni: z.string().optional(),
      caBundleSecretRef: SecretRefSchema.optional(),
      warnBeforeDays: z.number().min(0).optional(),
    })
    .optional(),
  proxy: z
    .object({
      mode: z.enum(["none", "http", "socks"]).optional().default("none"),
      urlFromSecretRef: SecretRefSchema.optional(),
    })
    .optional(),
});

export type HttpTarget = z.infer<typeof HttpTargetSchema>;

// TCP target configuration
export const TcpTargetSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  send: z.string().optional(),
  expect: z.string().optional(),
  tls: z
    .object({
      enabled: z.boolean().optional().default(false),
      verify: z.boolean().optional().default(true),
      sni: z.string().optional(),
    })
    .optional(),
});

export type TcpTarget = z.infer<typeof TcpTargetSchema>;

// DNS target configuration
export const DnsTargetSchema = z.object({
  name: z.string(),
  recordType: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "SRV"]),
  expected: z
    .object({
      values: z.array(z.string()).optional(),
    })
    .optional(),
});

export type DnsTarget = z.infer<typeof DnsTargetSchema>;

// WebSocket target configuration
export const WebSocketTargetSchema = z.object({
  url: z.string().url(),
  headers: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    )
    .optional(),
  send: z.string().optional(),
  expect: z.string().optional(),
});

export type WebSocketTarget = z.infer<typeof WebSocketTargetSchema>;

// Ping target configuration
export const PingTargetSchema = z.object({
  host: z.string(),
  packetCount: z.number().min(1).optional().default(1),
});

export type PingTarget = z.infer<typeof PingTargetSchema>;

// Push target configuration
export const PushTargetSchema = z.object({
  tokenSecretRef: SecretRefSchema,
  expireSeconds: z.number().min(1),
  gracePeriodSeconds: z.number().min(0).optional(),
});

export type PushTarget = z.infer<typeof PushTargetSchema>;

// Steam target configuration
export const SteamTargetSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  minPlayers: z.number().min(0).optional(),
  maxPlayers: z.number().min(0).optional(),
  expectedMap: z.string().optional(),
});

export type SteamTarget = z.infer<typeof SteamTargetSchema>;

// Kubernetes target configuration
export const K8sTargetSchema = z.object({
  resource: z.object({
    apiVersion: z.string(),
    kind: z.string(),
    name: z.string(),
  }),
  check: z.object({
    type: z.enum(["AvailableReplicasAtLeast", "PodReadiness", "EndpointNonEmpty"]),
    min: z.number().min(0).optional(),
  }),
});

export type K8sTarget = z.infer<typeof K8sTargetSchema>;

// Success criteria
export const SuccessCriteriaSchema = z.object({
  http: z
    .object({
      acceptedStatusCodes: z.array(z.number()).optional(),
      latencyMsUnder: z.number().optional(),
    })
    .optional(),
  keyword: z
    .object({
      contains: z.array(z.string()).optional(),
      notContains: z.array(z.string()).optional(),
      regex: z.array(z.string()).optional(),
    })
    .optional(),
  jsonQuery: z
    .object({
      mode: z.literal("jsonpath"),
      path: z.string(),
      equals: z.any().optional(),
      exists: z.boolean().optional(),
    })
    .optional(),
  tcp: z
    .object({
      bannerContains: z.string().optional(),
    })
    .optional(),
  dns: z
    .object({
      mustResolve: z.boolean().optional(),
    })
    .optional(),
  websocket: z
    .object({
      mustReceiveWithinSeconds: z.number().optional(),
    })
    .optional(),
});

export type SuccessCriteria = z.infer<typeof SuccessCriteriaSchema>;

// Alerting configuration
export const AlertingSchema = z.object({
  policyRef: z
    .object({
      name: z.string(),
    })
    .optional(),
  resendIntervalMinutes: z.number().min(0).optional().default(0),
  notifyOn: z
    .object({
      down: z.boolean().optional().default(true),
      up: z.boolean().optional().default(true),
      flapping: z.boolean().optional().default(true),
      certExpiring: z.boolean().optional().default(true),
    })
    .optional(),
});

export type Alerting = z.infer<typeof AlertingSchema>;

// Kubernetes target configuration (alternate schema for checker)
export const KubernetesTargetSchema = z.object({
  namespace: z.string(),
  name: z.string(),
  kind: z.enum(["Deployment", "StatefulSet", "DaemonSet", "Pod", "Service"]),
  minReadyReplicas: z.number().min(0).optional(),
});

export type KubernetesTarget = z.infer<typeof KubernetesTargetSchema>;

// Monitor target container
export const MonitorTargetSchema = z.object({
  http: HttpTargetSchema.optional(),
  tcp: TcpTargetSchema.optional(),
  dns: DnsTargetSchema.optional(),
  websocket: WebSocketTargetSchema.optional(),
  ping: PingTargetSchema.optional(),
  push: PushTargetSchema.optional(),
  steam: SteamTargetSchema.optional(),
  k8s: K8sTargetSchema.optional(),
  kubernetes: KubernetesTargetSchema.optional(),
  keyword: z
    .object({
      target: z.union([HttpTargetSchema, z.object({ url: z.string() })]),
      contains: z.array(z.string()).optional(),
      notContains: z.array(z.string()).optional(),
      regex: z.array(z.string()).optional(),
    })
    .optional(),
  jsonQuery: z
    .object({
      target: z.union([HttpTargetSchema, z.object({ url: z.string() })]),
      mode: z.literal("jsonpath"),
      path: z.string(),
      equals: z.any().optional(),
      exists: z.boolean().optional(),
    })
    .optional(),
});

export type MonitorTarget = z.infer<typeof MonitorTargetSchema>;

// Monitor spec
export const MonitorSpecSchema = z.object({
  enabled: z.boolean().optional().default(true),
  type: z.enum([
    "http",
    "tcp",
    "ping",
    "dns",
    "keyword",
    "jsonQuery",
    "websocket",
    "push",
    "steam",
    "k8s",
    "docker",
  ]),
  schedule: MonitorScheduleSchema,
  target: MonitorTargetSchema,
  successCriteria: SuccessCriteriaSchema.optional(),
  alerting: AlertingSchema.optional(),
  tags: z.array(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

export type MonitorSpec = z.infer<typeof MonitorSpecSchema>;

// Last check result
export const LastResultSchema = z.object({
  state: z.enum(["up", "down", "pending", "flapping", "paused"]),
  checkedAt: z.string(),
  latencyMs: z.number().optional(),
  attempts: z.number(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

export type LastResult = z.infer<typeof LastResultSchema>;

// Certificate info
export const CertificateInfoSchema = z.object({
  expiresAt: z.string().optional(),
  daysRemaining: z.number().optional(),
  valid: z.boolean().optional(),
});

export type CertificateInfo = z.infer<typeof CertificateInfoSchema>;

// Uptime stats
export const UptimeStatsSchema = z.object({
  last1h: z.number().optional(),
  last24h: z.number().optional(),
  last7d: z.number().optional(),
  last30d: z.number().optional(),
});

export type UptimeStats = z.infer<typeof UptimeStatsSchema>;

// Monitor status
export const MonitorStatusSchema = StatusBaseSchema.extend({
  lastResult: LastResultSchema.optional(),
  uptime: UptimeStatsSchema.optional(),
  cert: CertificateInfoSchema.optional(),
  nextRunAt: z.string().optional(),
});

export type MonitorStatus = z.infer<typeof MonitorStatusSchema>;

// Full Monitor CRD
export const MonitorSchema = z.object({
  apiVersion: z.literal("monitoring.kubekuma.io/v1"),
  kind: z.literal("Monitor"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: MonitorSpecSchema,
  status: MonitorStatusSchema.optional(),
});

export type Monitor = z.infer<typeof MonitorSchema>;
