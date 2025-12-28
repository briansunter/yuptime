import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "../lib/utils";
import type { Heartbeat } from "../hooks/use-monitors";

type TimeRange = "6h" | "24h" | "7d" | "30d";

interface LatencyChartProps {
  heartbeats: Heartbeat[];
  className?: string;
}

export function LatencyChart({ heartbeats, className }: LatencyChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("6h");

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: "6h", label: "6h" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
  ];

  const filteredData = useMemo(() => {
    const now = new Date();
    let cutoff: Date;

    switch (timeRange) {
      case "6h":
        cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case "24h":
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    return heartbeats
      .filter((hb) => new Date(hb.checkedAt) >= cutoff)
      .sort(
        (a, b) =>
          new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
      )
      .map((hb) => ({
        timestamp: new Date(hb.checkedAt).getTime(),
        latency: hb.latencyMs,
        state: hb.state,
        formattedTime: formatTime(hb.checkedAt, timeRange),
      }));
  }, [heartbeats, timeRange]);

  const downPeriods = useMemo(() => {
    return filteredData
      .filter((d) => d.state === "down")
      .map((d) => d.timestamp);
  }, [filteredData]);

  if (filteredData.length === 0) {
    return (
      <div className={cn("bg-card rounded-lg border border-border p-6", className)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Response Time</h3>
          <TimeRangeSelector
            value={timeRange}
            onChange={setTimeRange}
            options={timeRanges}
          />
        </div>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No data available for this time range
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-card rounded-lg border border-border p-6", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Response Time</h3>
        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
          options={timeRanges}
        />
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.5}
            />
            <XAxis
              dataKey="formattedTime"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}ms`}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                color: "hsl(var(--popover-foreground))",
              }}
              labelFormatter={(label) => `Time: ${label}`}
              formatter={(value: number) => [`${value}ms`, "Latency"]}
            />
            {/* Red reference lines for down periods */}
            {downPeriods.map((timestamp, i) => (
              <ReferenceLine
                key={i}
                x={timestamp}
                stroke="#ef4444"
                strokeWidth={2}
                strokeOpacity={0.8}
              />
            ))}
            <Line
              type="monotone"
              dataKey="latency"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "#10b981",
                stroke: "hsl(var(--background))",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatTime(dateString: string, range: TimeRange): string {
  const date = new Date(dateString);

  if (range === "6h" || range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  options: { value: TimeRange; label: string }[];
}

function TimeRangeSelector({
  value,
  onChange,
  options,
}: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-md p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 py-1 text-sm rounded transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
