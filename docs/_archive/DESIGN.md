# KubeKuma Design Specification

> **Version:** 1.0.0
> **Last Updated:** December 2024
> **Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Custom Resource Definitions](#custom-resource-definitions)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Security Model](#security-model)
8. [Deployment Guide](#deployment-guide)
9. [Configuration Reference](#configuration-reference)

---

## Executive Summary

KubeKuma is a Kubernetes-native uptime monitoring system that uses Custom Resource Definitions (CRDs) for all configuration. It provides:

- **11 Monitor Types**: HTTP, TCP, DNS, Ping, WebSocket, Push, Steam, Kubernetes, Keyword, JSON Query, Docker
- **8 Notification Providers**: Slack, Discord, Telegram, SMTP, Webhook, Gotify, Pushover, Apprise
- **Public Status Pages**: Customizable status pages with badges and uptime graphs
- **Distributed Scheduling**: Leader-elected scheduler with priority queue and jitter
- **Multi-tenancy**: Namespace-scoped resources with RBAC integration

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun 1.1+ |
| Language | TypeScript 5.4 |
| Web Framework | Fastify 4.x |
| Database | SQLite / PostgreSQL (Drizzle ORM) |
| Frontend | React 18, Vite, TanStack Router, Tailwind CSS |
| Kubernetes | client-node 1.4+ |
| Validation | Zod 3.x |
| Logging | Pino 8.x |

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Kubernetes Cluster                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │   Monitors   │    │   Policies   │    │     Status Pages         │   │
│  │    (CRD)     │    │    (CRD)     │    │        (CRD)             │   │
│  └──────┬───────┘    └──────┬───────┘    └───────────┬──────────────┘   │
│         │                   │                        │                   │
│         ▼                   ▼                        ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    KubeKuma Controller                            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  │ Informers  │  │ Reconcilers│  │  CRD Cache │  │  K8s Client│  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│         ┌──────────────────────────┼──────────────────────────┐         │
│         ▼                          ▼                          ▼         │
│  ┌─────────────┐          ┌─────────────┐            ┌─────────────┐    │
│  │  Scheduler  │          │   Alerting  │            │  API Server │    │
│  │             │          │   Pipeline  │            │  (Fastify)  │    │
│  │ ┌─────────┐ │          │             │            │             │    │
│  │ │Priority │ │          │ ┌─────────┐ │            │ ┌─────────┐ │    │
│  │ │ Queue   │ │─────────▶│ │ Engine  │ │            │ │ Routes  │ │    │
│  │ └─────────┘ │          │ └─────────┘ │            │ └─────────┘ │    │
│  │ ┌─────────┐ │          │ ┌─────────┐ │            │ ┌─────────┐ │    │
│  │ │  Lock   │ │          │ │Delivery │ │            │ │  Auth   │ │    │
│  │ │(Leader) │ │          │ │ Worker  │ │            │ │Middleware│    │
│  │ └─────────┘ │          │ └─────────┘ │            │ └─────────┘ │    │
│  └─────────────┘          └─────────────┘            └─────────────┘    │
│         │                        │                          │           │
│         ▼                        ▼                          ▼           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         Database Layer                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │  │Heartbeats│ │Incidents │ │ Sessions │ │Deliveries│ │ Audit  │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Application Lifecycle

```typescript
// Startup sequence (src/index.ts)
1. validateConfig()           // Validate environment
2. initializeDatabase()       // Connect SQLite/PostgreSQL
3. startController()          // Watch Kubernetes CRDs
4. startScheduler()           // Begin monitor execution
5. startDeliveryWorker()      // Background notification delivery
6. startServer()              // HTTP API server

// Shutdown sequence (SIGINT/SIGTERM)
1. stopServer()               // Stop accepting requests
2. stopScheduler()            // Stop monitor execution
3. stopDeliveryWorker()       // Drain notification queue
4. stopController()           // Stop CRD watches
```

---

## Core Components

### 1. Kubernetes Controller

The controller watches CRDs and maintains a materialized cache in the database.

**Watched Resources:**

| CRD | Group | Scope |
|-----|-------|-------|
| Monitor | monitoring.kubekuma.io/v1 | Namespaced |
| MonitorSet | monitoring.kubekuma.io/v1 | Namespaced |
| NotificationProvider | monitoring.kubekuma.io/v1 | Namespaced |
| NotificationPolicy | monitoring.kubekuma.io/v1 | Namespaced |
| StatusPage | monitoring.kubekuma.io/v1 | Namespaced |
| LocalUser | monitoring.kubekuma.io/v1 | Namespaced |
| ApiKey | monitoring.kubekuma.io/v1 | Namespaced |
| Silence | monitoring.kubekuma.io/v1 | Namespaced |
| MaintenanceWindow | monitoring.kubekuma.io/v1 | Namespaced |
| KubeKumaSettings | monitoring.kubekuma.io/v1 | Cluster |

**Reconciler Flow:**

```
CRD Event (ADDED/MODIFIED/DELETED)
         │
         ▼
┌─────────────────┐
│    Informer     │
│  (Event Queue)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Reconciler    │
│  (Type-specific)│
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────────┐
│ Cache │ │ Side Effects│
│Update │ │(Scheduler,  │
│       │ │ Validation) │
└───────┘ └───────────┘
```

### 2. Scheduler

The scheduler executes monitor checks using a priority queue sorted by `nextRunAt`.

**State Machine:**

```
                    ┌─────────────┐
                    │   STOPPED   │
                    └──────┬──────┘
                           │ start()
                           ▼
┌─────────────────────────────────────────────────────────┐
│                       RUNNING                            │
│  ┌─────────────────┐         ┌─────────────────┐        │
│  │    SECONDARY    │◀───────▶│     PRIMARY     │        │
│  │ (Waiting Lock)  │  lock   │ (Executing Jobs)│        │
│  └─────────────────┘ acquire └─────────────────┘        │
└─────────────────────────────────────────────────────────┘
                           │ stop()
                           ▼
                    ┌─────────────┐
                    │   STOPPED   │
                    └─────────────┘
```

**Priority Queue Implementation:**

```typescript
interface ScheduledJob {
  monitorId: string;           // namespace/name
  nextRunAt: number;           // Unix timestamp
  intervalMs: number;          // Check interval
  priority: number;            // Lower = higher priority
  consecutiveFailures: number; // For backoff
}

// Min-heap sorted by nextRunAt
class PriorityQueue {
  push(job: ScheduledJob): void;
  pop(): ScheduledJob | undefined;
  peek(): ScheduledJob | undefined;
  update(monitorId: string, updates: Partial<ScheduledJob>): void;
  remove(monitorId: string): void;
}
```

**Jitter Calculation:**

```typescript
function calculateJitter(intervalMs: number, jitterPercent: number): number {
  const maxJitter = intervalMs * (jitterPercent / 100);
  return Math.floor(Math.random() * maxJitter * 2) - maxJitter;
}
```

### 3. Check Dispatcher

Routes checks to type-specific implementations.

**Checker Interface:**

```typescript
interface CheckResult {
  state: "up" | "down";
  latencyMs: number;
  reason?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

type Checker = (monitor: MonitorSpec) => Promise<CheckResult>;
```

**Supported Monitor Types:**

| Type | Description | Target Config |
|------|-------------|---------------|
| `http` | HTTP/HTTPS endpoint | `url`, `method`, `headers`, `body` |
| `keyword` | HTTP + content matching | `url`, `keyword`, `regex` |
| `jsonQuery` | HTTP + JSONPath validation | `url`, `query`, `expected` |
| `tcp` | TCP port connectivity | `host`, `port`, `send`, `expect` |
| `dns` | DNS resolution | `domain`, `recordType`, `server` |
| `ping` | ICMP ping (TCP fallback) | `host`, `count`, `tcpFallback` |
| `websocket` | WebSocket handshake | `url`, `message`, `expectedResponse` |
| `push` | Push-based (reverse check) | `token`, `interval`, `grace` |
| `steam` | Steam game server | `host`, `port` |
| `kubernetes` | K8s resource health | `apiVersion`, `kind`, `name` |
| `docker` | Docker container health | `container`, `engine` |

### 4. Alerting Pipeline

Processes state changes and delivers notifications.

**Pipeline Stages:**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Alert     │───▶│   Policy    │───▶│  Delivery   │
│  Coordinator│    │   Matcher   │    │   Engine    │
└─────────────┘    └─────────────┘    └─────────────┘
       │                                     │
       ▼                                     ▼
┌─────────────┐                       ┌─────────────┐
│   Alert     │                       │  Delivery   │
│   Engine    │                       │   Worker    │
│ (Incidents) │                       │ (Background)│
└─────────────┘                       └─────────────┘
```

**Alert Event Structure:**

```typescript
interface AlertEvent {
  monitorId: string;
  monitorNamespace: string;
  monitorName: string;
  previousState: "up" | "down" | "pending";
  currentState: "up" | "down";
  reason?: string;
  message?: string;
  latencyMs?: number;
  timestamp: Date;
  isStateChange: boolean;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}
```

**Notification Providers:**

| Provider | Config Fields |
|----------|---------------|
| Slack | `webhookUrl`, `channel`, `username`, `iconEmoji` |
| Discord | `webhookUrl` |
| Telegram | `botToken`, `chatId`, `parseMode` |
| SMTP | `host`, `port`, `username`, `password`, `from`, `to[]` |
| Webhook | `url`, `method`, `headers`, `bodyTemplate` |
| Gotify | `url`, `token`, `priority` |
| Pushover | `userKey`, `apiToken`, `priority`, `sound` |
| Apprise | `urls[]` |

---

## Custom Resource Definitions

### Monitor

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: api-health
  namespace: production
  labels:
    team: platform
    tier: critical
spec:
  enabled: true
  type: http

  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
    retries: 3
    initialDelaySeconds: 0
    graceDownSeconds: 0
    jitterPercent: 10

  target:
    http:
      url: https://api.example.com/health
      method: GET
      headers:
        Authorization: Bearer ${SECRET:api-token:token}
      followRedirects: true
      skipTLSVerify: false

  successCriteria:
    http:
      statusCodes: [200, 201]
      maxLatencyMs: 5000
      contentType: application/json

  alerting:
    policyRef:
      name: critical-alerts
    resendIntervalMinutes: 60
    notifyOn:
      - down
      - up
      - certExpiring

  tags:
    - production
    - api

  annotations:
    runbook: https://wiki.example.com/api-runbook

status:
  observedGeneration: 1
  conditions:
    - type: Valid
      status: "True"
      lastTransitionTime: "2024-01-15T10:00:00Z"
  lastResult:
    state: up
    latencyMs: 45
    checkedAt: "2024-01-15T10:05:00Z"
  uptime:
    last24h: 99.95
    last7d: 99.99
    last30d: 99.98
  cert:
    expiresAt: "2024-06-15T00:00:00Z"
    daysUntilExpiry: 152
  nextRunAt: "2024-01-15T10:05:30Z"
```

### NotificationPolicy

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationPolicy
metadata:
  name: critical-alerts
  namespace: production
spec:
  priority: 100  # Lower = higher priority

  match:
    matchNamespaces:
      - production
      - staging
    matchLabels:
      tier: critical
    matchTags:
      - api
    matchNames:
      - pattern: "^api-.*"
        regex: true

  triggers:
    onDown: true
    onUp: true
    onFlapping: false
    onCertExpiring:
      enabled: true
      daysThreshold: 14

  routing:
    providers:
      - ref:
          name: slack-critical
      - ref:
          name: pagerduty-oncall

    dedupe:
      key: "{{ .monitorId }}"
      windowMinutes: 5

    rateLimit:
      minMinutesBetweenAlerts: 15

    resend:
      resendIntervalMinutes: 60

  formatting:
    titleTemplate: "[{{ .state | upper }}] {{ .monitorName }}"
    bodyTemplate: |
      Monitor: {{ .monitorNamespace }}/{{ .monitorName }}
      State: {{ .currentState }}
      Latency: {{ .latencyMs }}ms
      Reason: {{ .reason }}
```

### NotificationProvider

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationProvider
metadata:
  name: slack-critical
  namespace: production
spec:
  type: slack
  enabled: true

  config:
    slack:
      webhookUrlSecretRef:
        name: slack-webhook
        key: url
      channel: "#alerts-critical"
      username: KubeKuma
      iconEmoji: ":rotating_light:"
```

### StatusPage

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: StatusPage
metadata:
  name: public-status
  namespace: production
spec:
  slug: status
  title: "Acme Corp Status"
  published: true

  exposure:
    mode: ingress
    hosts:
      - status.example.com
    tls:
      secretName: status-tls

  content:
    description: "Real-time status of Acme Corp services"
    branding:
      logoUrl: https://example.com/logo.png
      faviconUrl: https://example.com/favicon.ico
      theme:
        primaryColor: "#3B82F6"
        darkMode: true

  groups:
    - name: API Services
      description: Core API endpoints
      monitors:
        - ref:
            namespace: production
            name: api-health
        - ref:
            namespace: production
            name: api-v2-health

    - name: Web Applications
      monitors:
        - ref:
            namespace: production
            name: web-frontend
        - ref:
            namespace: production
            name: admin-portal

  badges:
    enabled: true
    scope: all

status:
  publishedUrl: https://status.example.com
  monitorCount: 4
  overallStatus: operational
```

### LocalUser

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: LocalUser
metadata:
  name: admin
  namespace: kubekuma
spec:
  username: admin

  passwordHashSecretRef:
    name: admin-credentials
    key: passwordHash

  role: admin  # admin | editor | viewer

  mfa:
    mode: optional  # disabled | optional | required
    totpSecretRef:
      name: admin-mfa
      key: totpSecret

  disabled: false

status:
  lastLoginAt: "2024-01-15T09:00:00Z"
  mfaEnabled: true
```

### KubeKumaSettings (Cluster-Scoped)

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: KubeKumaSettings
metadata:
  name: kubekuma  # Only one per cluster
spec:
  mode:
    gitOpsReadOnly: false
    singleInstanceRequired: true

  auth:
    mode: local  # oidc | local | disabled
    local:
      enabled: true
      sessionMaxAgeSeconds: 604800  # 7 days
    apiKeys:
      enabled: true
      maxPerUser: 5

  scheduler:
    minIntervalSeconds: 10
    maxConcurrentNetChecks: 50
    maxConcurrentPrivChecks: 10
    defaultTimeoutSeconds: 30
    jitterPercent: 10
    flapping:
      enabled: true
      windowMinutes: 10
      threshold: 3

  retention:
    heartbeatsDays: 90
    incidentsDays: 365
    downsample:
      enabled: true
      afterDays: 7
      resolution: hourly

  networking:
    userAgent: "KubeKuma/1.0"
    dns:
      servers:
        - 8.8.8.8
        - 8.8.4.4
    ping:
      privileged: false  # Use TCP fallback

  publicEndpoints:
    statusPagesEnabled: true
    badgesEnabled: true
    metrics:
      enabled: true
      path: /metrics
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    crd_cache    │       │   heartbeats    │       │    incidents    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ kind           │       │ id              │       │ id              │
│ apiVersion     │       │ monitorId    ───┼───────│ monitorId       │
│ namespace      │       │ monitorNamespace│       │ monitorNamespace│
│ name           │       │ monitorName     │       │ monitorName     │
│ generation     │       │ state           │       │ state           │
│ resourceVersion│       │ latencyMs       │       │ startedAt       │
│ spec (JSON)    │       │ reason          │       │ endedAt         │
│ status (JSON)  │       │ message         │       │ duration        │
│ labels (JSON)  │       │ checkedAt       │       │ suppressed      │
│ annotations    │       │ attempts        │       │ suppressReason  │
│ createdAt      │       │ timestamp       │       │ acknowledged    │
│ updatedAt      │       └─────────────────┘       │ acknowledgedAt  │
│ deletedAt      │                                 │ acknowledgedBy  │
└─────────────────┘                                 │ createdAt       │
                                                   │ updatedAt       │
                                                   └─────────────────┘
                                                            │
                                                            ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    sessions     │       │    silences     │       │notification_    │
├─────────────────┤       ├─────────────────┤       │deliveries       │
│ id (UUID)       │       │ id              │       ├─────────────────┤
│ userId          │       │ silenceNamespace│       │ id              │
│ username        │       │ silenceName     │       │ incidentId   ───┤
│ role            │       │ startsAt        │       │ monitorId       │
│ tokenHash       │       │ endsAt          │       │ policyName      │
│ createdAt       │       │ createdAt       │       │ providerName    │
│ updatedAt       │       │ updatedAt       │       │ providerType    │
│ expiresAt       │       └─────────────────┘       │ status          │
│ ipAddress       │                                 │ attempts        │
│ userAgent       │       ┌─────────────────┐       │ lastAttemptAt   │
└─────────────────┘       │maintenance_     │       │ lastError       │
                          │windows          │       │ metadata (JSON) │
┌─────────────────┐       ├─────────────────┤       │ createdAt       │
│  audit_events   │       │ id              │       │ updatedAt       │
├─────────────────┤       │ windowNamespace │       └─────────────────┘
│ id              │       │ windowName      │
│ resourceType    │       │ description     │
│ resourceKey     │       │ schedule (RRULE)│
│ eventType       │       │ durationMinutes │
│ actor           │       │ nextOccurrenceAt│
│ details (JSON)  │       │ createdAt       │
│ changesSummary  │       │ updatedAt       │
│ timestamp       │       └─────────────────┘
└─────────────────┘
```

### Table Definitions

```sql
-- CRD Cache (materialized view of all Kubernetes CRDs)
CREATE TABLE crd_cache (
  kind TEXT NOT NULL,
  api_version TEXT NOT NULL,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  resource_version TEXT,
  spec TEXT,  -- JSON
  status TEXT,  -- JSON
  labels TEXT,  -- JSON
  annotations TEXT,  -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  PRIMARY KEY (kind, namespace, name)
);
CREATE INDEX idx_crd_cache_kind ON crd_cache(kind);

-- Heartbeats (check results)
CREATE TABLE heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  monitor_namespace TEXT NOT NULL,
  monitor_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('up', 'down', 'pending', 'flapping', 'paused')),
  latency_ms INTEGER,
  reason TEXT,
  message TEXT,
  checked_at TIMESTAMP NOT NULL,
  attempts INTEGER DEFAULT 1,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_heartbeats_monitor ON heartbeats(monitor_id);
CREATE INDEX idx_heartbeats_checked ON heartbeats(checked_at);

-- Incidents (outage events)
CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  monitor_namespace TEXT NOT NULL,
  monitor_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('up', 'down')),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration INTEGER,  -- seconds
  suppressed BOOLEAN DEFAULT FALSE,
  suppress_reason TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_incidents_monitor ON incidents(monitor_id);
CREATE INDEX idx_incidents_state ON incidents(state);

-- Sessions (user authentication)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  token_hash TEXT NOT NULL,  -- SHA256 of JWT
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

-- Notification Deliveries
CREATE TABLE notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id),
  monitor_id TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'deduped')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  last_error TEXT,
  metadata TEXT,  -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Silences (alert suppression)
CREATE TABLE silences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  silence_namespace TEXT NOT NULL,
  silence_name TEXT NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (silence_namespace, silence_name)
);

-- Maintenance Windows
CREATE TABLE maintenance_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_namespace TEXT NOT NULL,
  window_name TEXT NOT NULL,
  description TEXT,
  schedule TEXT NOT NULL,  -- RRULE format
  duration_minutes INTEGER NOT NULL,
  next_occurrence_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (window_namespace, window_name)
);

-- Audit Events
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  details TEXT,  -- JSON
  changes_summary TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Reference

### Authentication

#### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "secretpassword"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "kubekuma/admin",
    "username": "admin",
    "role": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Logout

```http
POST /api/v1/auth/logout
Cookie: token=eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**
```json
{
  "success": true
}
```

#### Get Current User

```http
GET /api/v1/auth/me
Cookie: token=eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**
```json
{
  "id": "kubekuma/admin",
  "username": "admin",
  "role": "admin",
  "namespace": "kubekuma",
  "lastLoginAt": "2024-01-15T09:00:00Z"
}
```

### Monitors

#### List Monitors

```http
GET /api/v1/monitors
Cookie: token=eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**
```json
{
  "items": [
    {
      "namespace": "production",
      "name": "api-health",
      "spec": {
        "type": "http",
        "enabled": true,
        "schedule": {
          "intervalSeconds": 30
        },
        "target": {
          "http": {
            "url": "https://api.example.com/health"
          }
        }
      }
    }
  ],
  "total": 1
}
```

### Incidents

#### List Incidents

```http
GET /api/v1/incidents?monitorId=production/api-health&limit=10
```

**Response (200):**
```json
[
  {
    "id": 1,
    "monitorId": "production/api-health",
    "startedAt": "2024-01-15T08:00:00Z",
    "endedAt": "2024-01-15T08:05:00Z",
    "state": "down",
    "duration": 300,
    "suppressed": false
  }
]
```

### Status Pages

#### Get Public Status

```http
GET /status/:slug
```

**Response (200):**
```json
{
  "slug": "status",
  "title": "Acme Corp Status",
  "description": "Real-time status of services",
  "overallStatus": "operational",
  "groups": [
    {
      "name": "API Services",
      "monitors": [
        {
          "namespace": "production",
          "name": "api-health",
          "status": "up",
          "latency": 45
        }
      ]
    }
  ],
  "branding": {
    "logoUrl": "https://example.com/logo.png",
    "theme": {
      "primaryColor": "#3B82F6"
    }
  }
}
```

#### Get Status Badge

```http
GET /badge/:slug/:monitor
Accept: image/svg+xml
```

Returns SVG badge image.

#### Get Uptime Percentage

```http
GET /uptime/:monitor?days=30
```

**Response (200):**
```json
{
  "monitor": "production/api-health",
  "days": 30,
  "uptime": 99.95
}
```

### Health Checks

#### Liveness

```http
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

#### Readiness

```http
GET /ready
```

**Response (200):**
```json
{
  "ready": true,
  "timestamp": "2024-01-15T10:00:00Z"
}
```

---

## Security Model

### Authentication Flows

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │  Login   │───▶│ Validate │───▶│  Create  │───▶│   Set    │   │
│  │ Request  │    │ Password │    │  Session │    │  Cookie  │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│                        │                               │         │
│                        ▼                               ▼         │
│                 ┌─────────────┐                ┌─────────────┐   │
│                 │LocalUser CRD│                │ sessions DB │   │
│                 │  + Secret   │                │   (hash)    │   │
│                 └─────────────┘                └─────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Password Security

- **Algorithm:** Argon2id
- **Memory Cost:** 65536 KB (64 MB)
- **Time Cost:** 3 iterations
- **Parallelism:** 4 threads
- **Salt Length:** 16 bytes
- **Hash Length:** 32 bytes

```typescript
// Password hashing configuration
const argon2Config = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};
```

### API Key Format

```
kk_live_[base64-encoded-32-bytes]

Example: kk_live_7x8K3mN9pQ2rS5tV0wXyZ1aB4cD6eF8g
```

- Prefix: `kk_live_` (production) or `kk_test_` (development)
- Random bytes: 32 bytes, base64 encoded
- Storage: Argon2 hash only (original not stored)

### Role-Based Access Control

| Role | Monitors | Incidents | Settings | Users |
|------|----------|-----------|----------|-------|
| admin | CRUD | CRUD | CRUD | CRUD |
| editor | CRUD | CRUD | Read | Read |
| viewer | Read | Read | Read | - |

### Session Management

- **Token Type:** JWT (HS256)
- **Storage:** httpOnly, Secure, SameSite=Strict cookie
- **Max Age:** 7 days (configurable)
- **Revocation:** Token hash stored in sessions table

```typescript
// JWT payload
{
  sub: "kubekuma/admin",     // User ID
  username: "admin",
  role: "admin",
  sessionId: "uuid",
  iat: 1705312800,
  exp: 1705917600
}
```

---

## Deployment Guide

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubekuma
  namespace: kubekuma
spec:
  replicas: 2  # HA mode (leader election)
  selector:
    matchLabels:
      app: kubekuma
  template:
    metadata:
      labels:
        app: kubekuma
    spec:
      serviceAccountName: kubekuma
      containers:
        - name: kubekuma
          image: kubekuma:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: DATABASE_URL
              value: "sqlite:/data/kubekuma.db"
            - name: KUBE_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: kubekuma-secrets
                  key: session-secret
          volumeMounts:
            - name: data
              mountPath: /data
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: kubekuma-data
---
apiVersion: v1
kind: Service
metadata:
  name: kubekuma
  namespace: kubekuma
spec:
  type: ClusterIP
  selector:
    app: kubekuma
  ports:
    - port: 80
      targetPort: 3000
      name: http
```

### RBAC Configuration

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kubekuma
  namespace: kubekuma
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubekuma
rules:
  - apiGroups: ["monitoring.kubekuma.io"]
    resources: ["*"]
    verbs: ["*"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
  - apiGroups: ["coordination.k8s.io"]
    resources: ["leases"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kubekuma
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kubekuma
subjects:
  - kind: ServiceAccount
    name: kubekuma
    namespace: kubekuma
```

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:./kubekuma.db` |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Pino log level | `info` |
| `KUBECONFIG` | Path to kubeconfig | In-cluster config |
| `KUBE_NAMESPACE` | Default namespace | `kubekuma` |
| `AUTH_MODE` | Authentication mode | `local` |
| `SESSION_SECRET` | JWT signing secret | **Required** |
| `SESSION_MAX_AGE` | Session TTL (seconds) | `604800` (7 days) |

### Database Connection Strings

**SQLite:**
```
sqlite:./kubekuma.db
sqlite:/data/kubekuma.db
```

**PostgreSQL:**
```
postgresql://user:password@host:5432/kubekuma
postgres://user:password@host/kubekuma?sslmode=require
```

### Logging Configuration

```typescript
// Log levels (ascending verbosity)
"fatal" | "error" | "warn" | "info" | "debug" | "trace"

// Example log output
{
  "level": 30,
  "time": 1705312800000,
  "pid": 1,
  "hostname": "kubekuma-abc123",
  "msg": "Monitor check completed",
  "monitorId": "production/api-health",
  "state": "up",
  "latencyMs": 45
}
```

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **CRD** | Custom Resource Definition - Kubernetes extension mechanism |
| **Heartbeat** | Single check result with state, latency, and timestamp |
| **Incident** | Period of downtime from first failure to recovery |
| **Monitor** | Configuration for checking an endpoint's availability |
| **Reconciler** | Controller component that syncs desired vs actual state |
| **Silence** | Temporary suppression of alerts for a monitor |

### File Structure

```
/
├── src/
│   ├── index.ts              # Application entry point
│   ├── server/
│   │   ├── app.ts            # Fastify application
│   │   ├── routes/           # API route handlers
│   │   └── middleware/       # Request middleware
│   ├── controller/
│   │   ├── index.ts          # Controller orchestration
│   │   ├── k8s-client.ts     # Kubernetes client
│   │   ├── informers.ts      # CRD watchers
│   │   └── reconcilers/      # Resource handlers
│   ├── scheduler/
│   │   ├── index.ts          # Scheduler state machine
│   │   ├── queue.ts          # Priority queue
│   │   └── lock.ts           # Distributed lock
│   ├── checkers/
│   │   ├── index.ts          # Check dispatcher
│   │   ├── http.ts           # HTTP checker
│   │   ├── tcp.ts            # TCP checker
│   │   └── ...               # Other checkers
│   ├── alerting/
│   │   ├── coordinator.ts    # Alert orchestration
│   │   ├── alert-engine.ts   # Incident management
│   │   ├── delivery-engine.ts # Notification queuing
│   │   └── providers.ts      # Provider implementations
│   ├── db/
│   │   ├── index.ts          # Database initialization
│   │   └── schema/           # Drizzle ORM schemas
│   ├── types/
│   │   ├── crd/              # CRD type definitions
│   │   └── schemas/          # Zod validation schemas
│   └── lib/
│       ├── logger.ts         # Pino logger
│       ├── config.ts         # Environment config
│       └── crypto.ts         # Cryptographic utilities
├── web/                      # React frontend
├── k8s/                      # CRD definitions
├── timoni/                   # Timoni module
├── docs/                     # Documentation
├── package.json
└── tsconfig.json
```

---

*Generated: December 2024*
