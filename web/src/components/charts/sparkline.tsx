import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";
import type { Heartbeat } from "@/hooks/use-monitors";

interface SparklineProps {
  heartbeats: Heartbeat[];
  className?: string;
  showDownPeriods?: boolean;
  height?: number;
}

export function Sparkline({
  heartbeats,
  className,
  showDownPeriods = true,
  height = 24,
}: SparklineProps) {
  const chartData = useMemo(() => {
    if (!heartbeats.length) return [];

    // Sort by time and take last 50 points for sparkline
    const sorted = [...heartbeats]
      .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
      .slice(-50);

    return sorted.map((h) => ({
      time: new Date(h.checkedAt).getTime(),
      latency: h.state === "up" ? h.latencyMs : null,
      isDown: h.state === "down",
    }));
  }, [heartbeats]);

  // Calculate if there are any down periods
  const hasDownPeriods = chartData.some((d) => d.isDown);

  if (chartData.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground text-xs",
          className
        )}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        >
          <defs>
            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={hasDownPeriods ? "hsl(var(--status-warning))" : "hsl(var(--status-up))"}
                stopOpacity={0.4}
              />
              <stop
                offset="100%"
                stopColor={hasDownPeriods ? "hsl(var(--status-warning))" : "hsl(var(--status-up))"}
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="latency"
            stroke={hasDownPeriods ? "hsl(var(--status-warning))" : "hsl(var(--status-up))"}
            strokeWidth={1.5}
            fill="url(#sparklineGradient)"
            connectNulls={false}
            dot={false}
            isAnimationActive={false}
          />
          {/* Show red dots for down periods */}
          {showDownPeriods &&
            chartData.map((point, index) =>
              point.isDown ? (
                <ReferenceLine
                  key={index}
                  x={point.time}
                  stroke="hsl(var(--status-down))"
                  strokeWidth={2}
                  strokeOpacity={0.8}
                />
              ) : null
            )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Compact variant for sidebar items
export function SparklineMini({
  heartbeats,
  className,
}: {
  heartbeats: Heartbeat[];
  className?: string;
}) {
  return (
    <Sparkline
      heartbeats={heartbeats}
      className={className}
      height={20}
      showDownPeriods={true}
    />
  );
}

export default Sparkline;
