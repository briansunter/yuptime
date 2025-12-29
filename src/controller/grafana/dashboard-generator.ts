/**
 * Grafana Dashboard Generator
 *
 * Automatically generates Grafana dashboards from Monitor CRDs.
 * Creates ConfigMaps that Grafana auto-imports.
 */

import type { V1ConfigMap } from "@kubernetes/client-node";
import type { Monitor } from "../../types/crd/monitor";

/**
 * Generate Grafana dashboard ConfigMap from Monitor CRDs
 * @param monitors List of all monitors
 * @param grafanaNamespace Namespace where Grafana is deployed
 * @returns ConfigMap with dashboard JSON
 */
export function generateDashboardConfigMap(
  monitors: Monitor[],
  grafanaNamespace: string = "monitoring",
): V1ConfigMap {
  // Generate overview dashboard (all monitors)
  const overviewDashboard = generateOverviewDashboard(monitors);

  // Generate individual dashboards for each monitor
  const monitorDashboards = Object.fromEntries(
    monitors.map((monitor) => [
      `yuptime-monitor-${monitor.metadata.name}.json`,
      JSON.stringify(generateMonitorDashboard(monitor)),
    ]),
  );

  const configMap: V1ConfigMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "yuptime-dashboards",
      namespace: grafanaNamespace,
      labels: {
        grafana_dashboard: "1",
        "app.kubernetes.io/name": "yuptime",
        "app.kubernetes.io/component": "dashboards",
      },
      annotations: {
        "grafana-dashboard-folder": "Yuptime",
      },
    },
    data: {
      "yuptime-overview.json": JSON.stringify(overviewDashboard),
      ...monitorDashboards,
    },
  };

  return configMap;
}

/**
 * Grafana Dashboard JSON structure
 */
interface GrafanaDashboard {
  uid: string;
  title: string;
  tags: string[];
  timezone: string;
  refresh: string;
  panels: unknown[];
}

/**
 * Generate overview dashboard showing all monitors
 */
function generateOverviewDashboard(_monitors: Monitor[]): GrafanaDashboard {
  return {
    uid: "yuptime-overview",
    title: "Yuptime Overview",
    tags: ["yuptime", "overview"],
    timezone: "browser",
    refresh: "30s",
    panels: [
      // Overall uptime percentage
      {
        id: 1,
        title: "Overall Uptime % (24h)",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 0, y: 0 },
        targets: [
          {
            expr: "avg(rate(yuptime_monitor_state[24h])) * 100",
            legendFormat: "24h",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "percent",
            min: 0,
            max: 100,
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "red" },
                { value: 95, color: "yellow" },
                { value: 99, color: "green" },
              ],
            },
          },
        },
      },
      // Overall uptime percentage (7d)
      {
        id: 2,
        title: "Overall Uptime % (7d)",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 6, y: 0 },
        targets: [
          {
            expr: "avg(rate(yuptime_monitor_state[7d])) * 100",
            legendFormat: "7d",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "percent",
            min: 0,
            max: 100,
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "red" },
                { value: 95, color: "yellow" },
                { value: 99, color: "green" },
              ],
            },
          },
        },
      },
      // Active incidents
      {
        id: 3,
        title: "Active Incidents",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 12, y: 0 },
        targets: [
          {
            expr: "sum(yuptime_active_incidents)",
            legendFormat: "Incidents",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "green" },
                { value: 1, color: "yellow" },
                { value: 5, color: "red" },
              ],
            },
          },
        },
      },
      // Total checks
      {
        id: 4,
        title: "Total Checks (24h)",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 18, y: 0 },
        targets: [
          {
            expr: "sum(increase(yuptime_monitor_checks_total[24h]))",
            legendFormat: "Checks",
            refId: "A",
          },
        ],
      },
      // Monitor status table
      {
        id: 5,
        title: "Monitor Status",
        type: "table",
        gridPos: { h: 12, w: 24, x: 0, y: 4 },
        targets: [
          {
            expr: "yuptime_monitor_state",
            format: "table",
            legendFormat: "{{monitor}}",
            refId: "A",
          },
        ],
        transformations: [
          {
            id: "organize",
            options: {
              excludeByName: {},
              indexByName: {},
              renameByName: {
                Value: "Status",
                monitor: "Monitor",
                namespace: "Namespace",
                type: "Type",
                url: "URL",
              },
            },
          },
        ],
        fieldConfig: {
          defaults: {
            custom: {
              align: "left",
              displayMode: "auto",
            },
          },
          overrides: [
            {
              matcher: { id: "byName", options: "Status" },
              properties: [
                {
                  id: "custom.displayMode",
                  value: "color-background",
                },
                {
                  id: "thresholds",
                  value: {
                    mode: "absolute",
                    steps: [
                      { value: 0, color: "red" },
                      { value: 0.5, color: "yellow" },
                      { value: 1, color: "green" },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
      // Monitor state changes graph
      {
        id: 6,
        title: "State Changes (24h)",
        type: "graph",
        gridPos: { h: 8, w: 12, x: 0, y: 16 },
        targets: [
          {
            expr: "sum(rate(yuptime_monitor_state_changes_total[24h]))",
            legendFormat: "State Changes",
            refId: "A",
          },
        ],
      },
      // Average response time
      {
        id: 7,
        title: "Average Response Time",
        type: "graph",
        gridPos: { h: 8, w: 12, x: 12, y: 16 },
        targets: [
          {
            expr: "avg(yuptime_monitor_latency_ms)",
            legendFormat: "Latency (ms)",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "ms",
          },
        },
      },
    ],
  };
}

/**
 * Generate individual monitor dashboard
 */
function generateMonitorDashboard(monitor: Monitor): GrafanaDashboard {
  const name = monitor.metadata.name;
  const namespace = monitor.metadata.namespace || "default";
  const type = monitor.spec.type;
  const url = getMonitorUrl(monitor);

  return {
    uid: `yuptime-monitor-${name}`,
    title: `Monitor: ${name}`,
    tags: ["yuptime", type],
    timezone: "browser",
    refresh: "30s",
    panels: [
      // Current status
      {
        id: 1,
        title: "Current Status",
        type: "stat",
        gridPos: { h: 6, w: 6, x: 0, y: 0 },
        targets: [
          {
            expr: `yuptime_monitor_state{monitor="${name}"}`,
            legendFormat: "{{state}}",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            mappings: [
              {
                type: "value",
                options: {
                  0: { text: "DOWN", color: "red" },
                  0.5: { text: "PENDING", color: "yellow" },
                  1: { text: "UP", color: "green" },
                },
              },
            ],
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "red" },
                { value: 0.5, color: "yellow" },
                { value: 1, color: "green" },
              ],
            },
          },
        },
        options: {
          colorMode: "background",
          graphMode: "none",
        },
      },
      // Uptime percentage (24h)
      {
        id: 2,
        title: "Uptime % (24h)",
        type: "stat",
        gridPos: { h: 6, w: 6, x: 6, y: 0 },
        targets: [
          {
            expr: `avg(rate(yuptime_monitor_state{monitor="${name}"}[24h])) * 100`,
            legendFormat: "24h",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "percent",
            min: 0,
            max: 100,
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "red" },
                { value: 95, color: "yellow" },
                { value: 99, color: "green" },
              ],
            },
          },
        },
      },
      // Uptime percentage (7d)
      {
        id: 3,
        title: "Uptime % (7d)",
        type: "stat",
        gridPos: { h: 6, w: 6, x: 12, y: 0 },
        targets: [
          {
            expr: `avg(rate(yuptime_monitor_state{monitor="${name}"}[7d])) * 100`,
            legendFormat: "7d",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "percent",
            min: 0,
            max: 100,
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "red" },
                { value: 95, color: "yellow" },
                { value: 99, color: "green" },
              ],
            },
          },
        },
      },
      // Check success rate
      {
        id: 4,
        title: "Success Rate (24h)",
        type: "stat",
        gridPos: { h: 6, w: 6, x: 18, y: 0 },
        targets: [
          {
            expr: `
              sum(rate(yuptime_monitor_checks_total{monitor="${name}",result="up"}[24h])) /
              sum(rate(yuptime_monitor_checks_total{monitor="${name}"}[24h])) * 100
            `,
            legendFormat: "Success %",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "percent",
            min: 0,
            max: 100,
          },
        },
      },
      // Response time graph
      {
        id: 5,
        title: "Response Time",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 0, y: 6 },
        targets: [
          {
            expr: `yuptime_monitor_latency_ms{monitor="${name}"}`,
            legendFormat: "Latency",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            unit: "ms",
          },
        },
      },
      // Uptime history graph
      {
        id: 6,
        title: "Uptime History",
        type: "timeseries",
        gridPos: { h: 8, w: 12, x: 12, y: 6 },
        targets: [
          {
            expr: `yuptime_monitor_state{monitor="${name}"}`,
            legendFormat: "Status",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            mappings: [
              {
                type: "value",
                options: {
                  0: { text: "DOWN", color: "red" },
                  0.5: { text: "PENDING", color: "yellow" },
                  1: { text: "UP", color: "green" },
                },
              },
            ],
          },
        },
      },
      // Total checks
      {
        id: 7,
        title: "Total Checks",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 0, y: 14 },
        targets: [
          {
            expr: `sum(yuptime_monitor_checks_total{monitor="${name}"})`,
            legendFormat: "Total",
            refId: "A",
          },
        ],
      },
      // Failed checks
      {
        id: 8,
        title: "Failed Checks (24h)",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 6, y: 14 },
        targets: [
          {
            expr: `sum(increase(yuptime_monitor_checks_total{monitor="${name}",result="down"}[24h]))`,
            legendFormat: "Failed",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "green" },
                { value: 10, color: "yellow" },
                { value: 100, color: "red" },
              ],
            },
          },
        },
      },
      // Active incidents
      {
        id: 9,
        title: "Active Incidents",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 12, y: 14 },
        targets: [
          {
            expr: `yuptime_active_incidents{monitor="${name}"}`,
            legendFormat: "Incidents",
            refId: "A",
          },
        ],
        fieldConfig: {
          defaults: {
            thresholds: {
              mode: "absolute",
              steps: [
                { value: 0, color: "green" },
                { value: 1, color: "red" },
              ],
            },
          },
        },
      },
      // State changes
      {
        id: 10,
        title: "State Changes (24h)",
        type: "stat",
        gridPos: { h: 4, w: 6, x: 18, y: 14 },
        targets: [
          {
            expr: `sum(increase(yuptime_monitor_state_changes_total{monitor="${name}"}[24h]))`,
            legendFormat: "Changes",
            refId: "A",
          },
        ],
      },
      // Monitor info
      {
        id: 11,
        title: "Monitor Information",
        type: "text",
        gridPos: { h: 4, w: 24, x: 0, y: 18 },
        options: {
          content: `**Name:** ${name}\n**Namespace:** ${namespace}\n**Type:** ${type}\n**URL:** ${url}\n`,
          mode: "markdown",
        },
      },
    ],
  };
}

/**
 * Extract monitor URL for display
 */
function getMonitorUrl(monitor: Monitor): string {
  const target = monitor.spec.target;

  if (target?.http) {
    return target.http.url;
  }
  if (target?.tcp) {
    return `${target.tcp.host}:${target.tcp.port}`;
  }
  if (target?.dns) {
    return target.dns.name;
  }
  if (target?.ping) {
    return target.ping.host;
  }
  if (target?.websocket) {
    return target.websocket.url;
  }
  if (target?.k8s) {
    return `${target.k8s.resource.kind}/${target.k8s.resource.name}`;
  }

  return "unknown";
}
