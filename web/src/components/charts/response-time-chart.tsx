import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
  Bar,
  ComposedChart,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Heartbeat } from "@/hooks/use-monitors";
import { formatLatency } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface ResponseTimeChartProps {
  heartbeats: Heartbeat[];
  loading?: boolean;
  className?: string;
}

const chartConfig = {
  latency: {
    label: "Response Time",
    color: "hsl(var(--chart-2))",
  },
  avg: {
    label: "Average",
    color: "hsl(var(--chart-3))",
  },
  down: {
    label: "Down",
    color: "hsl(var(--status-down))",
  },
} satisfies ChartConfig;

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

export function ResponseTimeChart({
  heartbeats,
  loading,
  className,
}: ResponseTimeChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("6h");

  const { chartData, stats, trend, dateRangeStr } = useMemo(() => {
    const now = new Date();
    const rangeMs = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    }[timeRange];

    const cutoff = new Date(now.getTime() - rangeMs);
    const filtered = heartbeats.filter(
      (h) => new Date(h.checkedAt) >= cutoff
    );

    // Calculate stats
    const latencies = filtered
      .filter((h) => h.state === "up")
      .map((h) => h.latencyMs);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    const p95Latency =
      latencies.length > 0
        ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
        : 0;

    // Calculate trend (compare first half to second half)
    const midpoint = Math.floor(latencies.length / 2);
    const firstHalf = latencies.slice(0, midpoint);
    const secondHalf = latencies.slice(midpoint);
    const firstAvg =
      firstHalf.length > 0
        ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
        : 0;
    const secondAvg =
      secondHalf.length > 0
        ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
        : 0;
    const trendPercent =
      firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

    // Check if data spans multiple days
    const sortedTimes = filtered.map(h => new Date(h.checkedAt).getTime()).sort((a, b) => a - b);
    const firstDay = sortedTimes.length > 0 ? new Date(sortedTimes[0]).toDateString() : null;
    const lastDay = sortedTimes.length > 0 ? new Date(sortedTimes[sortedTimes.length - 1]).toDateString() : null;
    const isSingleDay = firstDay === lastDay;

    // Format data for chart
    const data = filtered
      .map((h) => ({
        time: new Date(h.checkedAt).getTime(),
        latency: h.state === "up" ? h.latencyMs : null,
        isDown: h.state === "down" ? maxLatency * 1.1 : null,
        state: h.state,
        formattedTime: formatTime(new Date(h.checkedAt), timeRange, isSingleDay),
      }))
      .sort((a, b) => a.time - b.time);

    // Format date range string - use time format if single day
    const formatOpts: Intl.DateTimeFormatOptions = isSingleDay || timeRange === "1h" || timeRange === "6h" || timeRange === "24h"
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric" };
    const rangeStr = data.length > 0
      ? `${new Date(data[0].time).toLocaleString(undefined, formatOpts)} - ${new Date(data[data.length - 1].time).toLocaleString(undefined, formatOpts)}`
      : "";

    return {
      chartData: data,
      stats: {
        avg: avgLatency,
        min: minLatency,
        max: maxLatency,
        p95: p95Latency,
        count: filtered.length,
        downCount: filtered.filter((h) => h.state === "down").length,
      },
      trend: trendPercent,
      dateRangeStr: rangeStr,
    };
  }, [heartbeats, timeRange]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">Response Time</CardTitle>
            {trend !== 0 && (
              <Badge
                variant={trend < 0 ? "default" : trend > 10 ? "destructive" : "secondary"}
                className="flex items-center gap-1"
              >
                {trend < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {Math.abs(trend).toFixed(1)}%
              </Badge>
            )}
          </div>
          {dateRangeStr && (
            <p className="text-xs text-muted-foreground mt-0.5">{dateRangeStr}</p>
          )}
        </div>
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList className="h-8">
            <TabsTrigger value="1h" className="text-xs px-2">1h</TabsTrigger>
            <TabsTrigger value="6h" className="text-xs px-2">6h</TabsTrigger>
            <TabsTrigger value="24h" className="text-xs px-2">24h</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs px-2">7d</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs px-2">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
          <div className="text-center">
            <div className="text-muted-foreground text-xs">Average</div>
            <div className="font-semibold tabular-nums">{formatLatency(stats.avg)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-xs">P95</div>
            <div className="font-semibold tabular-nums">{formatLatency(stats.p95)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-xs">Min</div>
            <div className="font-semibold tabular-nums text-[hsl(var(--status-up))]">
              {formatLatency(stats.min)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-xs">Max</div>
            <div className="font-semibold tabular-nums text-[hsl(var(--status-down))]">
              {formatLatency(stats.max)}
            </div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="formattedTime"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickMargin={8}
              minTickGap={30}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}ms`}
              width={50}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    if (payload?.[0]?.payload) {
                      const date = new Date(payload[0].payload.time);
                      return date.toLocaleString();
                    }
                    return "";
                  }}
                  formatter={(value, name) => {
                    if (name === "latency") {
                      return [formatLatency(value as number), "Response Time"];
                    }
                    return [value, name];
                  }}
                />
              }
            />
            {/* Down periods shown as bars */}
            <Bar
              dataKey="isDown"
              fill="hsl(var(--status-down) / 0.2)"
              radius={[2, 2, 0, 0]}
            />
            {/* Average reference line */}
            <ReferenceLine
              y={stats.avg}
              stroke="hsl(var(--chart-3))"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            {/* Main latency area */}
            <Area
              type="monotone"
              dataKey="latency"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              fill="url(#latencyGradient)"
              connectNulls={false}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                fill: "hsl(var(--background))",
              }}
            />
          </ComposedChart>
        </ChartContainer>

        {stats.downCount > 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            {stats.downCount} downtime event{stats.downCount > 1 ? "s" : ""} in this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(date: Date, range: TimeRange, isSingleDay: boolean): string {
  // Always show time format for single day data
  if (isSingleDay || range === "1h" || range === "6h" || range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "7d") {
    return date.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default ResponseTimeChart;
