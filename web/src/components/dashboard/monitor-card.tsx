import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/common/status-icon";
import { Sparkline } from "@/components/charts/sparkline";
import { UptimeHistoryInline } from "@/components/charts/uptime-history";
import type { MonitorWithStatus } from "@/hooks/use-monitors";
import { formatLatency, formatUptime, formatRelativeTime } from "@/lib/utils";
import { Globe, Server, Network, Radio, ExternalLink } from "lucide-react";

interface MonitorCardProps {
  monitor: MonitorWithStatus;
  onClick?: () => void;
  className?: string;
}

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  tcp: Network,
  dns: Server,
  ping: Radio,
};

export function MonitorCard({ monitor, onClick, className }: MonitorCardProps) {
  const status = monitor.status?.state || "pending";
  const TypeIcon = typeIcons[monitor.spec.type] || Globe;

  const target = useMemo(() => {
    if (monitor.spec.target?.http?.url) {
      try {
        const url = new URL(monitor.spec.target.http.url);
        return url.hostname;
      } catch {
        return monitor.spec.target.http.url;
      }
    }
    if (monitor.spec.target?.tcp) {
      return `${monitor.spec.target.tcp.host}:${monitor.spec.target.tcp.port}`;
    }
    if (monitor.spec.target?.dns?.name) {
      return monitor.spec.target.dns.name;
    }
    return monitor.name;
  }, [monitor]);

  const uptime = monitor.uptime ?? 100;
  const latency = monitor.status?.latencyMs;
  const lastChecked = monitor.status?.lastCheckedAt;

  return (
    <Card
      className={cn(
        "card-hover cursor-pointer group transition-all duration-200",
        status === "down" && "border-[hsl(var(--status-down))]/30",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "p-1.5 rounded-md shrink-0",
                      status === "up" && "bg-[hsl(var(--status-up))]/10",
                      status === "down" && "bg-[hsl(var(--status-down))]/10",
                      status === "pending" && "bg-muted"
                    )}
                  >
                    <TypeIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>{monitor.spec.type.toUpperCase()}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{monitor.name}</div>
              <div className="text-xs text-muted-foreground truncate">{target}</div>
            </div>
          </div>
          <StatusBadge status={status} size="sm" />
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {/* Sparkline chart */}
        {monitor.recentHeartbeats && monitor.recentHeartbeats.length > 0 && (
          <Sparkline heartbeats={monitor.recentHeartbeats} height={32} className="w-full" />
        )}

        {/* Uptime timeline mini */}
        {monitor.recentHeartbeats && monitor.recentHeartbeats.length > 0 && (
          <UptimeHistoryInline heartbeats={monitor.recentHeartbeats} days={14} />
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Response Time</div>
            <div className="font-semibold tabular-nums">
              {latency !== undefined ? formatLatency(latency) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Uptime</div>
            <div
              className={cn(
                "font-semibold tabular-nums",
                uptime >= 99.9 && "text-[hsl(var(--status-up))]",
                uptime >= 99 && uptime < 99.9 && "text-[hsl(var(--status-warning))]",
                uptime < 99 && "text-[hsl(var(--status-down))]"
              )}
            >
              {formatUptime(uptime)}
            </div>
          </div>
        </div>

        {/* Last checked */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Last checked {lastChecked ? formatRelativeTime(new Date(lastChecked)) : "never"}
          </span>
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton
export function MonitorCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div>
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div>
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

export default MonitorCard;
