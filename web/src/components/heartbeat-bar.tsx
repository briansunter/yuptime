import { cn, formatLatency, formatRelativeTime } from "../lib/utils";
import type { Heartbeat } from "../hooks/use-monitors";

interface HeartbeatBarProps {
  heartbeats: Heartbeat[];
  maxBars?: number;
  size?: "sm" | "md";
  showTooltip?: boolean;
}

export function HeartbeatBar({
  heartbeats,
  maxBars = 50,
  size = "md",
  showTooltip = true,
}: HeartbeatBarProps) {
  // Take the most recent heartbeats (they come in desc order, so reverse for display)
  const displayHeartbeats = heartbeats.slice(0, maxBars).reverse();

  // Pad with empty slots if we don't have enough data
  const paddedHeartbeats = [
    ...Array(Math.max(0, maxBars - displayHeartbeats.length)).fill(null),
    ...displayHeartbeats,
  ];

  const barHeight = size === "sm" ? "h-6" : "h-8";
  const barWidth = size === "sm" ? "w-1" : "w-1.5";
  const gap = size === "sm" ? "gap-0.5" : "gap-0.5";

  return (
    <div className={cn("flex items-center", gap)}>
      {paddedHeartbeats.map((hb, index) => {
        if (!hb) {
          return (
            <div
              key={`empty-${index}`}
              className={cn(
                barWidth,
                barHeight,
                "rounded-sm bg-muted/50"
              )}
            />
          );
        }

        const bgColor =
          hb.state === "up"
            ? "bg-status-up"
            : hb.state === "down"
              ? "bg-status-down"
              : hb.state === "flapping"
                ? "bg-status-flapping"
                : hb.state === "pending"
                  ? "bg-status-pending"
                  : "bg-status-paused";

        const bar = (
          <div
            key={`hb-${index}`}
            className={cn(
              barWidth,
              barHeight,
              "rounded-sm transition-all hover:opacity-80",
              bgColor
            )}
          />
        );

        if (showTooltip) {
          return (
            <div key={`hb-${index}`} className="group relative">
              {bar}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-popover text-popover-foreground text-xs rounded-md shadow-lg px-2 py-1 whitespace-nowrap border">
                  <div className="font-medium capitalize">{hb.state}</div>
                  <div className="text-muted-foreground">
                    {formatLatency(hb.latencyMs)}
                  </div>
                  <div className="text-muted-foreground">
                    {formatRelativeTime(hb.checkedAt)}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return bar;
      })}
    </div>
  );
}
