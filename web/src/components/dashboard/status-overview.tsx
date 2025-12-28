import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIcon } from "@/components/common/status-icon";
import type { MonitorWithStatus } from "@/hooks/use-monitors";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Server,
} from "lucide-react";

interface StatusOverviewProps {
  monitors: MonitorWithStatus[];
  loading?: boolean;
  className?: string;
}

interface StatusCount {
  up: number;
  down: number;
  warning: number;
  pending: number;
  total: number;
}

export function StatusOverview({
  monitors,
  loading,
  className,
}: StatusOverviewProps) {
  const counts = useMemo<StatusCount>(() => {
    const result = {
      up: 0,
      down: 0,
      warning: 0,
      pending: 0,
      total: monitors.length,
    };

    for (const monitor of monitors) {
      const state = monitor.status?.state || "pending";
      if (state === "up") result.up++;
      else if (state === "down") result.down++;
      else if (state === "flapping" || state === "paused") result.warning++;
      else result.pending++;
    }

    return result;
  }, [monitors]);

  const overallStatus = useMemo(() => {
    if (counts.down > 0) return "down";
    if (counts.warning > 0) return "warning";
    if (counts.pending === counts.total) return "pending";
    return "up";
  }, [counts]);

  if (loading) {
    return (
      <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Operational",
      value: counts.up,
      icon: CheckCircle2,
      colorClass: "text-[hsl(var(--status-up))]",
      bgClass: "bg-[hsl(var(--status-up))]/10",
      borderClass: "border-[hsl(var(--status-up))]/20",
    },
    {
      label: "Down",
      value: counts.down,
      icon: XCircle,
      colorClass: "text-[hsl(var(--status-down))]",
      bgClass: "bg-[hsl(var(--status-down))]/10",
      borderClass: "border-[hsl(var(--status-down))]/20",
      pulse: counts.down > 0,
    },
    {
      label: "Warning",
      value: counts.warning,
      icon: AlertTriangle,
      colorClass: "text-[hsl(var(--status-warning))]",
      bgClass: "bg-[hsl(var(--status-warning))]/10",
      borderClass: "border-[hsl(var(--status-warning))]/20",
    },
    {
      label: "Total Monitors",
      value: counts.total,
      icon: Server,
      colorClass: "text-foreground",
      bgClass: "bg-muted/50",
      borderClass: "border-border",
    },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall status banner */}
      <Card
        className={cn(
          "border-2",
          overallStatus === "up" && "border-[hsl(var(--status-up))]/30 bg-[hsl(var(--status-up))]/5",
          overallStatus === "down" && "border-[hsl(var(--status-down))]/30 bg-[hsl(var(--status-down))]/5",
          overallStatus === "warning" && "border-[hsl(var(--status-warning))]/30 bg-[hsl(var(--status-warning))]/5",
          overallStatus === "pending" && "border-border bg-muted/30"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon status={overallStatus} size="lg" showLabel={false} pulse={overallStatus === "down"} />
              <div>
                <div className="font-semibold">
                  {overallStatus === "up" && "All Systems Operational"}
                  {overallStatus === "down" && `${counts.down} System${counts.down > 1 ? "s" : ""} Down`}
                  {overallStatus === "warning" && "Degraded Performance"}
                  {overallStatus === "pending" && "Awaiting Initial Checks"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {counts.up} of {counts.total} monitors operational
                </div>
              </div>
            </div>
            <Activity className="h-8 w-8 text-muted-foreground/20" />
          </div>
        </CardContent>
      </Card>

      {/* Status counter cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className={cn(
                "transition-all duration-200 hover:shadow-md cursor-default",
                card.value > 0 && card.label === "Down" && "ring-1 ring-[hsl(var(--status-down))]/50"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">{card.label}</div>
                    <div
                      className={cn(
                        "text-3xl font-bold tabular-nums",
                        card.colorClass,
                        card.pulse && "animate-pulse"
                      )}
                    >
                      {card.value}
                    </div>
                  </div>
                  <div className={cn("p-2 rounded-lg", card.bgClass)}>
                    <Icon className={cn("h-5 w-5", card.colorClass)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default StatusOverview;
