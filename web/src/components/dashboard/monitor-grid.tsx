import { cn } from "@/lib/utils";
import { MonitorCard, MonitorCardSkeleton } from "./monitor-card";
import type { MonitorWithStatus } from "@/hooks/use-monitors";

interface MonitorGridProps {
  monitors: MonitorWithStatus[];
  loading?: boolean;
  onSelectMonitor?: (monitorId: string) => void;
  className?: string;
}

export function MonitorGrid({
  monitors,
  loading,
  onSelectMonitor,
  className,
}: MonitorGridProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
          className
        )}
      >
        {[...Array(8)].map((_, i) => (
          <MonitorCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (monitors.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-12 border-2 border-dashed rounded-lg",
          className
        )}
      >
        <div className="text-center">
          <div className="text-lg font-medium text-muted-foreground">No monitors found</div>
          <div className="text-sm text-muted-foreground mt-1">
            Create a Monitor CRD to start monitoring
          </div>
        </div>
      </div>
    );
  }

  // Sort monitors: down first, then warning, then up
  const sortedMonitors = [...monitors].sort((a, b) => {
    const order = { down: 0, flapping: 1, pending: 2, paused: 3, up: 4 };
    const stateA = a.status?.state || "pending";
    const stateB = b.status?.state || "pending";
    return (order[stateA] ?? 5) - (order[stateB] ?? 5);
  });

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
        className
      )}
    >
      {sortedMonitors.map((monitor) => {
        const monitorId = `${monitor.namespace}/${monitor.name}`;
        return (
          <MonitorCard
            key={monitorId}
            monitor={monitor}
            onClick={() => onSelectMonitor?.(monitorId)}
          />
        );
      })}
    </div>
  );
}

export default MonitorGrid;
