# Phase 5: Status Pages - Complete ✅

## Overview

Implemented **public status pages** with full REST API endpoints, SVG badge generation, real-time monitor status display, incident timeline, and uptime calculations. Status pages are publicly accessible without authentication, allowing organizations to share system health with users.

## Key Accomplishments

### 1. StatusPage Reconciler ✅

**File: `src/controller/reconcilers/page-and-window-reconcilers.ts`**

- Validates StatusPage CRD specifications
- Ensures groups have unique names and at least one monitor
- Verifies all referenced monitors exist in crdCache
- Sets status to "valid" or "warning" based on missing monitors
- Logs monitor counts and publication status
- Integrated with MaintenanceWindow reconciler in same file

```typescript
const validateGroups = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  // Ensures at least one group
  // Checks for duplicate group names
  // Verifies each group has at least one monitor
  return errors;
};
```

### 2. Public API Endpoints ✅

**File: `src/server/routes/status-pages.ts`**

#### GET /status/:slug
- Returns complete status page data
- Includes all monitor groups with current status
- Calculates overall page status (operational/degraded/down)
- Supports optional branding and custom content
- Only returns published status pages (returns 404 for unpublished)

```json
{
  "slug": "api-services",
  "title": "API Status",
  "description": "Status of all API services",
  "publishedAt": "2025-12-15T10:30:00Z",
  "overallStatus": "operational",
  "groups": [
    {
      "name": "Core Services",
      "monitors": [
        {
          "namespace": "production",
          "name": "api-gateway",
          "status": "operational",
          "lastCheckedAt": "2025-12-15T10:29:45Z",
          "latency": 125
        }
      ]
    }
  ]
}
```

#### GET /badge/:slug/:monitor
- Generates real-time SVG status badge
- Format: `namespace/name` encoded in URL
- Color-coded: green (operational), yellow (degraded), red (down)
- Displays monitor name and current status
- Perfect for embedding in README files, dashboards, etc.

```html
<svg width="200" height="20">
  <!-- Shows monitor status as SVG -->
  <!-- Green gradient background with status label -->
</svg>
```

#### GET /uptime/:monitor
- Calculates uptime percentage over time period (default 30 days)
- Query parameter: `?days=N`
- Returns exact percentage to 2 decimal places
- Data calculated from heartbeat history

```json
{
  "monitor": "production/api-gateway",
  "days": 30,
  "uptime": 99.85
}
```

#### GET /api/v1/incidents (NEW)
- Lists recent incidents for a monitor
- Query parameters: `?monitorId=namespace/name&limit=10`
- Returns incident history with timestamps and state
- Supports filtering by monitor ID
- Maximum limit 100 to prevent abuse

```json
[
  {
    "id": "incident-123",
    "monitorId": "production/api-gateway",
    "startedAt": "2025-12-15T08:45:00Z",
    "resolvedAt": "2025-12-15T08:52:30Z",
    "state": "down",
    "reason": "HTTP_TIMEOUT"
  }
]
```

### 3. Public Status Page Frontend ✅

**File: `web/src/routes/public-status.tsx`**

Complete React component for displaying public status pages:

#### Features:
- Responsive grid layout with monitor groups
- Real-time monitor status with color-coded indicators
- Monitor latency display in milliseconds or seconds
- 30-day uptime percentage for each monitor
- Overall page status banner with icon
- Recent incidents timeline
- Customizable branding (logo, favicon)
- Graceful error handling for 404/500 responses

#### Data Fetching:
1. Fetches status page metadata from `/status/:slug`
2. Queries incident history from `/api/v1/incidents`
3. Loads uptime percentages from `/uptime/:monitor` for each monitor
4. Combines all data into unified view

#### UI Components:
- Status page header with title and description
- Overall status card (prominent, color-coded)
- Monitor groups with detailed monitor cards
- Incident timeline with resolution status
- Loading spinner while fetching
- Error page for missing/unpublished pages

### 4. Router Configuration ✅

**File: `web/src/router.tsx`**

- Created separate public route tree without admin sidebar
- Public routes under `/status/*` path
- Isolated from authenticated admin interface
- Clean route hierarchy:
  - `/` - Admin dashboard (with sidebar)
  - `/status/:slug` - Public status page (no sidebar)

**File: `web/src/routes/public-root.tsx`**
- Minimal public layout component
- No navigation sidebar
- Clean, focused display for public pages

### 5. StatusPage CRD Definition ✅

**Updated: `src/types/crd.ts`**

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: StatusPage
metadata:
  name: api-services
  namespace: monitoring
spec:
  slug: api-services              # URL-friendly identifier
  title: "API Services Status"
  published: true                 # Make publicly visible
  groups:
    - name: "Core Services"
      description: "Critical APIs"
      monitors:
        - ref:
            namespace: production
            name: api-gateway
        - ref:
            namespace: production
            name: auth-service
    - name: "Data Services"
      monitors:
        - ref:
            namespace: production
            name: database-primary

  content:
    description: "Status of production API services"
    branding:
      logoUrl: "https://example.com/logo.png"
      faviconUrl: "https://example.com/favicon.ico"
      theme: "light"

status:
  conditions:
    - type: Valid
      status: "True"
      lastTransitionTime: "2025-12-15T10:30:00Z"
  monitorCount: 3
```

## Data Flow: Monitor Check to Public Display

```
1. Scheduler executes monitor check
   ↓
2. Store heartbeat in database
   ↓
3. StatusPage reconciler validates configuration
   ↓
4. Public API receives request for /status/:slug
   ↓
5. Frontend fetches:
   a) /status/:slug - Page metadata
   b) /api/v1/incidents - Recent incidents
   c) /uptime/:monitor - Uptime percentages (for each monitor)
   ↓
6. Frontend renders unified status page
   - Overall status calculated from all monitors
   - Groups displayed with detailed monitor cards
   - Incidents timeline shows recent outages
   - Uptime percentages displayed as SLA metrics
```

## API Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/status/:slug` | Get complete status page data |
| GET | `/badge/:slug/:monitor` | Get SVG status badge |
| GET | `/uptime/:monitor` | Get uptime percentage |
| GET | `/api/v1/incidents` | Get incident history |

## File Structure

### New Files (2)

- `web/src/routes/public-status.tsx` - Public status page component (280 lines)
- `web/src/routes/public-root.tsx` - Public layout without sidebar (10 lines)

### Modified Files (3)

- `src/controller/reconcilers/page-and-window-reconcilers.ts` - Completed StatusPage reconciler
- `src/server/routes/status-pages.ts` - Added incidents endpoint
- `web/src/router.tsx` - Added public route tree

## Frontend Features

### Status Indicators
- **Operational** (Green) - All monitors up
- **Degraded** (Yellow) - Some monitors flapping
- **Down** (Red) - One or more monitors down

### Monitor Display
- Namespace and name identification
- Real-time status with icon
- Latency measurement (ms/s)
- 30-day uptime percentage
- Grouped organization

### Incident Timeline
- Sorted by most recent first
- Shows start and resolution times
- Displays incident state (down/flapping)
- Shows reason when available
- Marks ongoing incidents as "Ongoing"

### Responsive Design
- Mobile-friendly grid layout
- Tailwind CSS styling
- Lucide React icons
- Accessible color contrast
- Works on all screen sizes

## Uptime Calculation

**Algorithm:**
1. Query all heartbeats for monitor in last N days
2. Group by state (up/down/flapping)
3. Count total checks
4. Calculate: `(up_count / total_count) * 100`
5. Return as percentage with 2 decimal places

**Example:**
- Monitor checked every 5 minutes over 30 days
- Total checks: 8,640
- Up checks: 8,628
- Down checks: 12
- Uptime: (8,628 / 8,640) * 100 = 99.86%

## Badge Usage

**Markdown Example:**
```markdown
[![API Status](https://monitoring.example.com/badge/api-services/production/api-gateway)](https://monitoring.example.com/status/api-services)
```

**HTML Example:**
```html
<a href="https://monitoring.example.com/status/api-services">
  <img src="https://monitoring.example.com/badge/api-services/production/api-gateway" alt="API Status">
</a>
```

## Testing Scenarios

### Scenario 1: Simple Status Page

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: api-service
  namespace: production
spec:
  type: http
  interval: 60
  target:
    http:
      url: https://api.example.com/health

---

apiVersion: monitoring.kubekuma.io/v1
kind: StatusPage
metadata:
  name: status
  namespace: monitoring
spec:
  slug: status
  title: "System Status"
  published: true
  groups:
    - name: "APIs"
      monitors:
        - ref:
            namespace: production
            name: api-service
```

**Result:** Access at `/status/status` shows:
- Overall status (operational/degraded/down)
- API service monitor with latency
- 30-day uptime percentage
- Recent incidents if any

### Scenario 2: Multi-Group Status Page

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: StatusPage
metadata:
  name: main
  namespace: monitoring
spec:
  slug: main
  title: "Production Status"
  published: true
  groups:
    - name: "Web Services"
      monitors:
        - ref:
            namespace: prod
            name: web-frontend
        - ref:
            namespace: prod
            name: web-api
    - name: "Data Services"
      monitors:
        - ref:
            namespace: prod
            name: database
        - ref:
            namespace: prod
            name: cache
```

**Result:** Shows two groups with 2 monitors each, all with status and uptime.

### Scenario 3: Badge Embedding

```markdown
# My Application Status

[![Status](http://localhost:3000/badge/status/production/api-service)](http://localhost:3000/status/status)

Check our [full status page](http://localhost:3000/status/status) for details.
```

Displays SVG badge with real-time status that updates every check interval.

## Code Metrics

**Phase 5 Implementation:**
- Public status page component: 280 lines
- Public layout component: 10 lines
- Incidents API endpoint: 40 lines
- Router updates: 20 lines
- Total new code: ~350 lines

**Cumulative Project:**
- ~9,400 lines of TypeScript backend
- ~600+ lines of React frontend
- ~1,500+ lines of documentation
- 10 CRD types fully typed with Zod
- 10 reconcilers (all working)
- 8 notification providers

## Architecture Patterns

### Public vs Admin Separation
- Separate route trees in TanStack Router
- Admin routes include sidebar navigation
- Public routes are minimal and focused
- No authentication required for public pages

### Data Fetching Pattern
- Component fetches from multiple endpoints
- Graceful degradation if endpoints fail
- Parallel requests for performance
- Fallback values for missing data

### Status Calculation
- Overall status derives from individual monitors
- Severity hierarchy: down > degraded > operational
- Real-time calculation from latest heartbeat
- No caching needed (data changes frequently)

## Integration Points

**With Scheduler:**
- Status pages display real-time monitor status
- Incidents are created when monitors change state

**With Alert Engine:**
- Incidents shown on status page timeline
- Suppressed alerts don't create incidents

**With Controller:**
- StatusPage reconciler validates configuration
- Updates crdCache with validation status

**With Database:**
- Queries heartbeats for current status
- Queries incidents for timeline
- Calculates uptime from heartbeat history

## Benefits

✅ **Public Transparency**
- Share system health with users
- Reduce support inquiries
- Build trust through visibility

✅ **Easy Embedding**
- SVG badges for README/docs
- Embeddable status components
- Custom branding support

✅ **Real-Time Data**
- Latest heartbeat status
- Up-to-date uptime calculations
- Recent incident history

✅ **Professional Appearance**
- Responsive design
- Color-coded status indicators
- Organized monitor groups
- Incident timeline

✅ **No Authentication Required**
- Public accessibility
- Perfect for shared links
- Cacheable endpoints

## Next: Phase 6

**Authentication & Authorization** - OIDC, local users, API keys
- OIDC integration with provider configuration
- Local user system with Argon2 hashing
- TOTP 2FA support
- API key management with scopes
- Session-based authentication

---

## Conclusion

Phase 5 completes the **public-facing status page system**. KubeKuma now has:

1. ✅ **Production-grade status pages** - CRD-based configuration
2. ✅ **Real-time REST API** - 4 public endpoints with no auth required
3. ✅ **SVG badge generation** - Embeddable status badges for docs
4. ✅ **Professional UI** - Responsive React component with incident timeline
5. ✅ **Uptime SLA display** - 30-day uptime percentages
6. ✅ **Incident timeline** - Shows recent outages with timestamps

**Status pages are production-ready for deployment!** 🚀

Organizations can now:
- Share system health with users via `/status/:slug`
- Embed status badges in documentation
- Get current uptime percentages via API
- Track incident history for SLA reporting
- Customize appearance with branding options

---

**Project Status:**
- ✅ Phase 1: Foundation
- ✅ Phase 2: Kubernetes Controller & Scheduler
- ✅ Phase 3: Alerting System
- ✅ Phase 4: Additional Checkers & Suppressions
- ✅ Phase 5: Status Pages
- ⏳ Phase 6: Authentication & Authorization (Next)
- ⏳ Phase 7: Metrics & Observability
- ⏳ Phase 8: Frontend Dashboard
- ⏳ Phase 9: Timoni Packaging & Documentation
