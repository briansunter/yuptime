import { useParams, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { cn, formatLatency, formatRelativeTime, formatUptime, formatDuration } from "@/lib/utils";
import { useMonitorStats, useHeartbeatHistory } from "@/hooks/use-monitors";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusIcon, StatusBadge } from "@/components/common/status-icon";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { UptimeHistory } from "@/components/charts/uptime-history";
import { LatencyPercentilesChart } from "@/components/charts/latency-percentiles";
import { Sparkline } from "@/components/charts/sparkline";

import {
  ArrowLeft,
  Globe,
  Server,
  Network,
  Radio,
  ExternalLink,
  RefreshCw,
  Clock,
  Activity,
  Zap,
  Calendar,
  Settings,
  ChevronRight,
} from "lucide-react";

interface MonitorSpec {
  type: string;
  enabled: boolean;
  schedule?: { intervalSeconds?: number };
  target?: {
    http?: { url: string; method?: string };
    tcp?: { host: string; port: number };
    dns?: { name: string; recordType?: string };
    ping?: { host: string };
  };
  tags?: string[];
}

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  tcp: Network,
  dns: Server,
  ping: Radio,
};

export default function MonitorDetail() {
  const params = useParams({ from: "/monitors/$monitorId" });
  const monitorId = decodeURIComponent(params.monitorId);
  const [namespace, name] = monitorId.split("/");

  const { stats, loading: statsLoading, refetch: refetchStats } = useMonitorStats(monitorId);
  const { heartbeats, loading: heartbeatsLoading, refetch: refetchHeartbeats } = useHeartbeatHistory(monitorId, 500);

  const [monitorSpec, setMonitorSpec] = useState<MonitorSpec | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch monitor spec
  useEffect(() => {
    fetch("/api/v1/monitors")
      .then((res) => res.json())
      .then((data) => {
        const monitor = data.items?.find(
          (m: { namespace: string; name: string }) => m.namespace === namespace && m.name === name
        );
        if (monitor) {
          setMonitorSpec(monitor.spec);
        }
      })
      .catch(console.error);
  }, [namespace, name]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStats(), refetchHeartbeats()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const loading = statsLoading || heartbeatsLoading;

  const target = useMemo(() => {
    if (!monitorSpec?.target) return null;
    if (monitorSpec.target.http) return monitorSpec.target.http.url;
    if (monitorSpec.target.tcp)
      return `${monitorSpec.target.tcp.host}:${monitorSpec.target.tcp.port}`;
    if (monitorSpec.target.dns) return monitorSpec.target.dns.name;
    if (monitorSpec.target.ping) return monitorSpec.target.ping.host;
    return null;
  }, [monitorSpec]);

  const intervalSeconds = monitorSpec?.schedule?.intervalSeconds || 60;
  const TypeIcon = typeIcons[monitorSpec?.type || "http"] || Globe;
  const state = stats?.state || "pending";

  type Status = "up" | "down" | "pending" | "flapping" | "paused" | "warning" | "maintenance";

  // Event log from heartbeats (last 20 state changes)
  const events = useMemo(() => {
    if (!heartbeats.length) return [];

    const stateChanges: { timestamp: string; state: Status; latency: number; reason?: string }[] = [];
    let prevState: string | null = null;

    for (const hb of [...heartbeats].reverse()) {
      if (hb.state !== prevState) {
        stateChanges.push({
          timestamp: hb.checkedAt,
          state: hb.state as Status,
          latency: hb.latencyMs,
          reason: hb.reason,
        });
        prevState = hb.state;
      }
    }

    return stateChanges.slice(0, 20);
  }, [heartbeats]);

  if (loading && !stats) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "p-3 rounded-xl",
              state === "up" && "bg-[hsl(var(--status-up))]/10",
              state === "down" && "bg-[hsl(var(--status-down))]/10",
              state === "pending" && "bg-muted"
            )}
          >
            <TypeIcon
              className={cn(
                "h-8 w-8",
                state === "up" && "text-[hsl(var(--status-up))]",
                state === "down" && "text-[hsl(var(--status-down))]",
                state === "pending" && "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{name}</h1>
              <StatusBadge status={state} size="md" />
            </div>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <Badge variant="secondary" className="text-xs font-normal">
                {monitorSpec?.type?.toUpperCase() || "HTTP"}
              </Badge>
              {target && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={target.startsWith("http") ? target : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm hover:text-foreground transition-colors max-w-[300px] truncate"
                      >
                        {target}
                        {target.startsWith("http") && (
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        )}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>{target}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Quick Stats Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Zap className="h-3 w-3" />
                Current
              </div>
              <div className="text-lg font-bold tabular-nums">
                {stats?.currentLatency ? formatLatency(stats.currentLatency) : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Activity className="h-3 w-3" />
                Avg (24h)
              </div>
              <div className="text-lg font-bold tabular-nums">
                {stats?.avgLatency24h ? formatLatency(stats.avgLatency24h) : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Calendar className="h-3 w-3" />
                Avg (7d)
              </div>
              <div className="text-lg font-bold tabular-nums">
                {stats?.avgLatency7d ? formatLatency(stats.avgLatency7d) : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Uptime (24h)</div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
                  (stats?.uptime24h ?? 100) >= 99.9 && "text-[hsl(var(--status-up))]",
                  (stats?.uptime24h ?? 100) >= 99 && (stats?.uptime24h ?? 100) < 99.9 && "text-[hsl(var(--status-warning))]",
                  (stats?.uptime24h ?? 100) < 99 && "text-[hsl(var(--status-down))]"
                )}
              >
                {formatUptime(stats?.uptime24h)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Uptime (7d)</div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
                  (stats?.uptime7d ?? 100) >= 99.9 && "text-[hsl(var(--status-up))]",
                  (stats?.uptime7d ?? 100) >= 99 && (stats?.uptime7d ?? 100) < 99.9 && "text-[hsl(var(--status-warning))]",
                  (stats?.uptime7d ?? 100) < 99 && "text-[hsl(var(--status-down))]"
                )}
              >
                {formatUptime(stats?.uptime7d)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Uptime (30d)</div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
                  (stats?.uptime30d ?? 100) >= 99.9 && "text-[hsl(var(--status-up))]",
                  (stats?.uptime30d ?? 100) >= 99 && (stats?.uptime30d ?? 100) < 99.9 && "text-[hsl(var(--status-warning))]",
                  (stats?.uptime30d ?? 100) < 99 && "text-[hsl(var(--status-down))]"
                )}
              >
                {formatUptime(stats?.uptime30d)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Uptime History */}
      <UptimeHistory
        heartbeats={heartbeats}
        loading={heartbeatsLoading}
        defaultGranularity="hourly"
        defaultRange="7d"
      />

      {/* Tabbed Content */}
      <Tabs defaultValue="charts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="charts" className="gap-2">
            <Activity className="h-4 w-4" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2">
            <Clock className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* Charts Tab */}
        <TabsContent value="charts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponseTimeChart heartbeats={heartbeats} loading={heartbeatsLoading} />
            <LatencyPercentilesChart heartbeats={heartbeats} loading={heartbeatsLoading} />
          </div>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No state changes recorded yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {events.map((event, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <StatusIcon status={event.state} size="sm" showLabel={false} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium capitalize">{event.state}</div>
                        {event.reason && (
                          <div className="text-sm text-muted-foreground truncate">
                            {event.reason}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-muted-foreground">
                          {formatRelativeTime(event.timestamp)}
                        </div>
                        <div className="tabular-nums text-muted-foreground/70">
                          {formatLatency(event.latency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Heartbeats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Checks</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Latency</th>
                      <th className="text-left p-3 font-medium">Time</th>
                      <th className="text-left p-3 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {heartbeats.slice(0, 50).map((hb, index) => (
                      <tr key={index} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <StatusBadge status={hb.state} size="sm" />
                        </td>
                        <td className="p-3 tabular-nums font-medium">
                          {formatLatency(hb.latencyMs)}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {formatRelativeTime(hb.checkedAt)}
                        </td>
                        <td className="p-3 text-muted-foreground truncate max-w-[200px]">
                          {hb.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Monitor Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Namespace</dt>
                  <dd className="font-medium">{namespace}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Name</dt>
                  <dd className="font-medium">{name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Type</dt>
                  <dd className="font-medium flex items-center gap-2">
                    <TypeIcon className="h-4 w-4" />
                    {monitorSpec?.type?.toUpperCase() || "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Check Interval</dt>
                  <dd className="font-medium">{formatDuration(intervalSeconds * 1000)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Status</dt>
                  <dd className="font-medium flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        monitorSpec?.enabled ? "bg-[hsl(var(--status-up))]" : "bg-muted-foreground"
                      )}
                    />
                    {monitorSpec?.enabled ? "Enabled" : "Disabled"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Last Check</dt>
                  <dd className="font-medium">
                    {stats?.lastCheckedAt ? formatRelativeTime(stats.lastCheckedAt) : "Never"}
                  </dd>
                </div>
                {target && (
                  <div className="md:col-span-2">
                    <dt className="text-sm text-muted-foreground mb-1">Target</dt>
                    <dd className="font-mono text-sm bg-muted p-2 rounded break-all">
                      {target}
                    </dd>
                  </div>
                )}
                {monitorSpec?.tags && monitorSpec.tags.length > 0 && (
                  <div className="md:col-span-2">
                    <dt className="text-sm text-muted-foreground mb-1">Tags</dt>
                    <dd className="flex flex-wrap gap-2">
                      {monitorSpec.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Sparkline Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Latency Trend (Last 50 Checks)</CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline heartbeats={heartbeats} height={60} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
