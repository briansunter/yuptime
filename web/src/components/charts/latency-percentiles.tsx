import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Heartbeat } from "@/hooks/use-monitors";
import { formatLatency } from "@/lib/utils";

interface LatencyPercentilesChartProps {
  heartbeats: Heartbeat[];
  loading?: boolean;
  className?: string;
  autoAdjustRange?: boolean;
}

const chartConfig = {
  p50: {
    label: "P50 (Median)",
    color: "hsl(var(--chart-2))",
  },
  p90: {
    label: "P90",
    color: "hsl(var(--chart-3))",
  },
  p99: {
    label: "P99",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

type TimeRange = "1h" | "6h" | "24h" | "7d";

interface BucketData {
  time: number;
  formattedTime: string;
  p50: number | null;
  p90: number | null;
  p99: number | null;
}

export function LatencyPercentilesChart({
  heartbeats,
  loading,
  className,
  autoAdjustRange = true,
}: LatencyPercentilesChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("6h");

  const { chartData, stats, dateRangeStr } = useMemo(() => {
    const now = new Date();
    const rangeMs = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
    }[timeRange];

    // Find actual data range for smart bucketing
    let earliestData: Date | null = null;
    let latestData: Date | null = null;
    for (const h of heartbeats) {
      if (h.state !== "up") continue;
      const d = new Date(h.checkedAt);
      if (!earliestData || d < earliestData) earliestData = d;
      if (!latestData || d > latestData) latestData = d;
    }

    const cutoff = new Date(now.getTime() - rangeMs);
    const filtered = heartbeats.filter(
      (h) => h.state === "up" && new Date(h.checkedAt) >= cutoff
    );

    // If we have data, use smarter bucket calculation based on actual data range
    let effectiveCutoff = cutoff;
    let effectiveRangeMs = rangeMs;
    if (autoAdjustRange && earliestData && earliestData > cutoff) {
      // Adjust to start from when we have data, with some padding
      const dataDuration = now.getTime() - earliestData.getTime();
      const paddedDuration = Math.min(rangeMs, dataDuration * 1.2); // 20% padding
      effectiveCutoff = new Date(now.getTime() - paddedDuration);
      effectiveRangeMs = paddedDuration;
    }

    // Dynamic bucket count based on data density
    const baseBucketCount = {
      "1h": 12,
      "6h": 24,
      "24h": 24,
      "7d": 28,
    }[timeRange];

    // Reduce buckets if we have limited data
    const dataPoints = filtered.length;
    const bucketCount = dataPoints < baseBucketCount ? Math.max(6, Math.ceil(dataPoints / 2)) : baseBucketCount;

    // Check if data spans multiple days
    const sortedTimes = filtered.map(h => new Date(h.checkedAt).getTime()).sort((a, b) => a - b);
    const firstDay = sortedTimes.length > 0 ? new Date(sortedTimes[0]).toDateString() : null;
    const lastDay = sortedTimes.length > 0 ? new Date(sortedTimes[sortedTimes.length - 1]).toDateString() : null;
    const isSingleDay = firstDay === lastDay;

    // Create time buckets
    const bucketDuration = effectiveRangeMs / bucketCount;
    const buckets: BucketData[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = effectiveCutoff.getTime() + i * bucketDuration;
      const bucketEnd = bucketStart + bucketDuration;

      const bucketHeartbeats = filtered
        .filter((h) => {
          const t = new Date(h.checkedAt).getTime();
          return t >= bucketStart && t < bucketEnd;
        })
        .map((h) => h.latencyMs)
        .sort((a, b) => a - b);

      if (bucketHeartbeats.length > 0) {
        buckets.push({
          time: bucketStart,
          formattedTime: formatBucketTime(new Date(bucketStart), timeRange, isSingleDay),
          p50: percentile(bucketHeartbeats, 50),
          p90: percentile(bucketHeartbeats, 90),
          p99: percentile(bucketHeartbeats, 99),
        });
      } else {
        buckets.push({
          time: bucketStart,
          formattedTime: formatBucketTime(new Date(bucketStart), timeRange, isSingleDay),
          p50: null,
          p90: null,
          p99: null,
        });
      }
    }

    // Filter out empty buckets from the beginning
    const firstDataIndex = buckets.findIndex(b => b.p50 !== null);
    const trimmedBuckets = firstDataIndex > 0 ? buckets.slice(Math.max(0, firstDataIndex - 1)) : buckets;

    // Calculate overall stats
    const allLatencies = filtered.map((h) => h.latencyMs).sort((a, b) => a - b);

    // Format date range string - use time format if single day
    const formatOpts: Intl.DateTimeFormatOptions = isSingleDay || timeRange === "1h" || timeRange === "6h" || timeRange === "24h"
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric" };
    const rangeStr = trimmedBuckets.length > 0
      ? `${new Date(trimmedBuckets[0].time).toLocaleString(undefined, formatOpts)} - ${new Date(trimmedBuckets[trimmedBuckets.length - 1].time).toLocaleString(undefined, formatOpts)}`
      : "";

    return {
      chartData: trimmedBuckets,
      stats: {
        p50: allLatencies.length > 0 ? percentile(allLatencies, 50) : 0,
        p90: allLatencies.length > 0 ? percentile(allLatencies, 90) : 0,
        p99: allLatencies.length > 0 ? percentile(allLatencies, 99) : 0,
        count: allLatencies.length,
      },
      dateRangeStr: rangeStr,
    };
  }, [heartbeats, timeRange, autoAdjustRange]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Latency Percentiles</CardTitle>
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
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--chart-2))]/10">
            <div className="text-xs text-muted-foreground">P50 (Median)</div>
            <div className="text-lg font-bold tabular-nums text-[hsl(var(--chart-2))]">
              {formatLatency(stats.p50)}
            </div>
          </div>
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--chart-3))]/10">
            <div className="text-xs text-muted-foreground">P90</div>
            <div className="text-lg font-bold tabular-nums text-[hsl(var(--chart-3))]">
              {formatLatency(stats.p90)}
            </div>
          </div>
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--chart-5))]/10">
            <div className="text-xs text-muted-foreground">P99</div>
            <div className="text-lg font-bold tabular-nums text-[hsl(var(--chart-5))]">
              {formatLatency(stats.p99)}
            </div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="p50Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="p90Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="p99Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-5))" stopOpacity={0.05} />
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
                    const label = chartConfig[name as keyof typeof chartConfig]?.label || name;
                    return [formatLatency(value as number), label];
                  }}
                />
              }
            />
            {/* P99 (bottom layer - largest values) */}
            <Area
              type="monotone"
              dataKey="p99"
              stroke="hsl(var(--chart-5))"
              strokeWidth={1.5}
              fill="url(#p99Gradient)"
              connectNulls={false}
              dot={false}
            />
            {/* P90 (middle layer) */}
            <Area
              type="monotone"
              dataKey="p90"
              stroke="hsl(var(--chart-3))"
              strokeWidth={1.5}
              fill="url(#p90Gradient)"
              connectNulls={false}
              dot={false}
            />
            {/* P50 (top layer - smallest values) */}
            <Area
              type="monotone"
              dataKey="p50"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              fill="url(#p50Gradient)"
              connectNulls={false}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>

        <div className="text-xs text-center text-muted-foreground mt-2">
          Based on {stats.count.toLocaleString()} successful checks
        </div>
      </CardContent>
    </Card>
  );
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

function formatBucketTime(date: Date, range: TimeRange, isSingleDay: boolean): string {
  // Always show time format for single day data
  if (isSingleDay || range === "1h" || range === "6h" || range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default LatencyPercentilesChart;
