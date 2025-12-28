import { cn, formatUptime, formatLatency } from "@/lib/utils";
import { SparklineMini } from "@/components/charts/sparkline";
import { StatusDot } from "@/components/common/status-icon";
import type { MonitorWithStatus } from "@/hooks/use-monitors";

interface MonitorListItemProps {
  monitor: MonitorWithStatus;
  isSelected?: boolean;
  onClick?: () => void;
}

export function MonitorListItem({
  monitor,
  isSelected = false,
  onClick,
}: MonitorListItemProps) {
  const state = monitor.status?.state || "pending";
  const uptime = monitor.uptime;
  const latency = monitor.status?.latencyMs;

  return (
    <div
      className={cn(
        "px-4 py-3 cursor-pointer transition-all duration-150",
        isSelected
          ? "bg-accent/80 border-l-2 border-l-primary"
          : "hover:bg-accent/40 border-l-2 border-l-transparent"
      )}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <StatusDot status={state} size="sm" pulse={state === "down"} />
        <span className="font-medium text-sm truncate flex-1 text-foreground">
          {monitor.name}
        </span>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full",
            state === "up" && "bg-[hsl(var(--status-up))]/15 text-[hsl(var(--status-up))]",
            state === "down" && "bg-[hsl(var(--status-down))]/15 text-[hsl(var(--status-down))]",
            state === "pending" && "bg-[hsl(var(--status-pending))]/15 text-[hsl(var(--status-pending))]",
            state === "flapping" && "bg-[hsl(var(--status-warning))]/15 text-[hsl(var(--status-warning))]",
            state === "paused" && "bg-muted text-muted-foreground"
          )}
        >
          {uptime !== undefined ? formatUptime(uptime) : "—"}
        </span>
      </div>

      {/* Sparkline */}
      {monitor.recentHeartbeats && monitor.recentHeartbeats.length > 0 ? (
        <SparklineMini heartbeats={monitor.recentHeartbeats} className="mb-1.5" />
      ) : (
        <div className="h-5 flex items-center mb-1.5">
          <span className="text-xs text-muted-foreground">Awaiting data...</span>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate max-w-[150px]">{monitor.namespace}</span>
        {latency !== undefined && (
          <span className="tabular-nums">{formatLatency(latency)}</span>
        )}
      </div>
    </div>
  );
}
