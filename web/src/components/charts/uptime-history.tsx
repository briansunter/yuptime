import { useMemo, useState, Fragment } from "react";
import { cn, formatLatency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Heartbeat } from "@/hooks/use-monitors";

type Granularity = "hourly" | "daily";
type TimeRange = "24h" | "7d" | "30d" | "90d";

interface UptimeHistoryProps {
  heartbeats: Heartbeat[];
  loading?: boolean;
  className?: string;
  defaultGranularity?: Granularity;
  defaultRange?: TimeRange;
  showControls?: boolean;
  showLegend?: boolean;
  compact?: boolean;
}

interface Bucket {
  start: Date;
  end: Date;
  uptime: number;
  upCount: number;
  downCount: number;
  totalCount: number;
  avgLatency: number;
  status: "up" | "partial" | "degraded" | "down" | "no-data";
  isNewDay: boolean;
  dayLabel?: string;
}

// Get bucket status based on uptime percentage
function getBucketStatus(uptime: number, hasData: boolean): Bucket["status"] {
  if (!hasData) return "no-data";
  if (uptime >= 99.9) return "up";
  if (uptime >= 99) return "partial";
  if (uptime >= 95) return "degraded";
  return "down";
}

// Format time range for tooltip
function formatTimeRange(start: Date, end: Date, granularity: Granularity): string {
  if (granularity === "hourly") {
    const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
    return `${start.toLocaleTimeString(undefined, timeOpts)} - ${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function UptimeHistory({
  heartbeats,
  loading,
  className,
  defaultGranularity = "hourly",
  defaultRange = "7d",
  showControls = true,
  showLegend = true,
  compact = false,
}: UptimeHistoryProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [range, setRange] = useState<TimeRange>(defaultRange);

  // Adjust granularity based on range (30d and 90d force daily - too many hourly buckets)
  const effectiveGranularity = range === "30d" || range === "90d" ? "daily" : granularity;

  const { buckets, overallUptime, totalChecks, dateRangeStr } = useMemo(() => {
    const now = new Date();
    const rangeMs = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
    }[range];

    const cutoff = new Date(now.getTime() - rangeMs);

    // Filter heartbeats within range
    const filtered = heartbeats.filter(
      (h) => new Date(h.checkedAt) >= cutoff
    );

    // Calculate bucket duration
    const bucketMs = effectiveGranularity === "hourly"
      ? 60 * 60 * 1000  // 1 hour
      : 24 * 60 * 60 * 1000;  // 1 day

    // Calculate number of buckets (+1 to include current partial day/hour)
    const numBuckets = Math.ceil(rangeMs / bucketMs) + 1;

    // Align start time to bucket boundary
    const startTime = new Date(cutoff);
    if (effectiveGranularity === "hourly") {
      startTime.setMinutes(0, 0, 0);
    } else {
      startTime.setHours(0, 0, 0, 0);
    }

    // Create buckets
    const bucketsArray: Bucket[] = [];
    let prevDay = -1;

    for (let i = 0; i < numBuckets; i++) {
      const bucketStart = new Date(startTime.getTime() + i * bucketMs);
      const bucketEnd = new Date(bucketStart.getTime() + bucketMs);

      // Skip future buckets
      if (bucketStart > now) continue;

      // Get heartbeats in this bucket
      const bucketHeartbeats = filtered.filter((h) => {
        const t = new Date(h.checkedAt);
        return t >= bucketStart && t < bucketEnd;
      });

      const upCount = bucketHeartbeats.filter((h) => h.state === "up").length;
      const downCount = bucketHeartbeats.filter((h) => h.state === "down").length;
      const totalCount = bucketHeartbeats.length;
      const uptime = totalCount > 0 ? (upCount / totalCount) * 100 : -1;
      const avgLatency = totalCount > 0
        ? bucketHeartbeats.reduce((sum, h) => sum + h.latencyMs, 0) / totalCount
        : 0;

      // Check if this is a new day
      const currentDay = bucketStart.getDate();
      const isNewDay = currentDay !== prevDay;
      prevDay = currentDay;

      bucketsArray.push({
        start: bucketStart,
        end: bucketEnd,
        uptime,
        upCount,
        downCount,
        totalCount,
        avgLatency,
        status: getBucketStatus(uptime, totalCount > 0),
        isNewDay,
        dayLabel: isNewDay
          ? bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : undefined,
      });
    }

    // Calculate overall uptime
    const totalUp = filtered.filter((h) => h.state === "up").length;
    const total = filtered.length;
    const overall = total > 0 ? (totalUp / total) * 100 : 100;

    // Format date range string
    const formatOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const rangeStr = bucketsArray.length > 0
      ? `${bucketsArray[0].start.toLocaleDateString(undefined, formatOpts)} - ${bucketsArray[bucketsArray.length - 1].start.toLocaleDateString(undefined, formatOpts)}`
      : "";

    return {
      buckets: bucketsArray,
      overallUptime: overall,
      totalChecks: total,
      dateRangeStr: rangeStr,
    };
  }, [heartbeats, range, effectiveGranularity]);

  // Group buckets by day for day labels
  const dayLabels = useMemo(() => {
    const labels: { label: string; index: number; isToday: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    buckets.forEach((bucket, i) => {
      if (bucket.isNewDay && bucket.dayLabel) {
        const bucketDay = new Date(bucket.start);
        bucketDay.setHours(0, 0, 0, 0);
        labels.push({
          label: bucket.dayLabel,
          index: i,
          isToday: bucketDay.getTime() === today.getTime(),
        });
      }
    });
    return labels;
  }, [buckets]);

  if (loading) {
    return (
      <Card className={cn(className, compact && "border-0 shadow-none")}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const statusColors = {
    up: "bg-[hsl(var(--status-up))]",
    partial: "bg-[hsl(var(--status-warning))]",
    degraded: "bg-[hsl(var(--status-degraded))]",
    down: "bg-[hsl(var(--status-down))]",
    "no-data": "bg-muted/50",
  };

  const chipHeight = compact ? "h-4" : "h-6";
  const chipGap = "gap-[1px]";

  const content = (
    <>
      {/* Chips row */}
      <TooltipProvider>
        <div className={cn("flex", chipGap, "overflow-hidden")}>
          {buckets.map((bucket, i) => (
            <Fragment key={i}>
              {/* Day divider */}
              {bucket.isNewDay && i > 0 && effectiveGranularity === "hourly" && (
                <div className="w-[2px] bg-border/50 mx-[1px]" />
              )}
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex-1 min-w-[3px] rounded-[2px] transition-opacity hover:opacity-80 cursor-pointer",
                      chipHeight,
                      statusColors[bucket.status]
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium mb-1">
                    {bucket.start.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-muted-foreground mb-1">
                    {formatTimeRange(bucket.start, bucket.end, effectiveGranularity)}
                  </div>
                  {bucket.totalCount > 0 ? (
                    <>
                      <div className="flex justify-between gap-4">
                        <span>Uptime</span>
                        <span
                          className={cn(
                            "font-semibold",
                            bucket.uptime >= 99.9
                              ? "text-[hsl(var(--status-up))]"
                              : bucket.uptime >= 99
                              ? "text-[hsl(var(--status-warning))]"
                              : "text-[hsl(var(--status-down))]"
                          )}
                        >
                          {bucket.uptime.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Checks</span>
                        <span>
                          {bucket.upCount}/{bucket.totalCount}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Avg latency</span>
                        <span>{formatLatency(bucket.avgLatency)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No data</div>
                  )}
                </TooltipContent>
              </Tooltip>
            </Fragment>
          ))}
        </div>
      </TooltipProvider>

      {/* Day labels row */}
      {effectiveGranularity === "hourly" && dayLabels.length > 1 && (
        <div className="relative h-5 mt-1">
          {dayLabels.map((day, i) => {
            // Calculate position as percentage
            const position = (day.index / buckets.length) * 100;
            return (
              <span
                key={i}
                className={cn(
                  "absolute text-[10px] text-muted-foreground whitespace-nowrap",
                  day.isToday && "font-medium text-foreground"
                )}
                style={{ left: `${position}%` }}
              >
                {day.label}
                {day.isToday && " (Today)"}
              </span>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {showLegend && !compact && (
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[hsl(var(--status-up))]" />
            <span>&gt;99.9%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[hsl(var(--status-warning))]" />
            <span>99-99.9%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[hsl(var(--status-degraded))]" />
            <span>95-99%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[hsl(var(--status-down))]" />
            <span>&lt;95%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-muted/50" />
            <span>No data</span>
          </div>
        </div>
      )}
    </>
  );

  if (compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Uptime History</CardTitle>
          {dateRangeStr && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {dateRangeStr} • {totalChecks.toLocaleString()} checks
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showControls && (
            <>
              {/* Granularity selector */}
              <Select
                value={effectiveGranularity}
                onValueChange={(v: string) => setGranularity(v as Granularity)}
                disabled={range === "30d" || range === "90d"}
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>

              {/* Range tabs */}
              <Tabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
                <TabsList className="h-8">
                  <TabsTrigger value="24h" className="text-xs px-2">24h</TabsTrigger>
                  <TabsTrigger value="7d" className="text-xs px-2">7d</TabsTrigger>
                  <TabsTrigger value="30d" className="text-xs px-2">30d</TabsTrigger>
                  <TabsTrigger value="90d" className="text-xs px-2">90d</TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}

          {/* Overall uptime */}
          <span
            className={cn(
              "text-2xl font-bold tabular-nums",
              overallUptime >= 99.9
                ? "text-[hsl(var(--status-up))]"
                : overallUptime >= 99
                ? "text-[hsl(var(--status-warning))]"
                : "text-[hsl(var(--status-down))]"
            )}
          >
            {overallUptime.toFixed(2)}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{content}</CardContent>
    </Card>
  );
}

// Compact inline version for cards and sidebar
export function UptimeHistoryInline({
  heartbeats,
  days = 14,
  className,
}: {
  heartbeats: Heartbeat[];
  days?: number;
  className?: string;
}) {
  return (
    <UptimeHistory
      heartbeats={heartbeats}
      className={className}
      defaultGranularity="daily"
      defaultRange={days <= 7 ? "7d" : days <= 30 ? "30d" : "90d"}
      showControls={false}
      showLegend={false}
      compact
    />
  );
}

export default UptimeHistory;
