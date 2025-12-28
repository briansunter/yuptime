import { useNavigate } from "@tanstack/react-router";
import { useMonitors } from "@/hooks/use-monitors";
import { StatusOverview, MonitorGrid } from "@/components/dashboard";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";

export default function Dashboard() {
  const { monitors, loading, refetch } = useMonitors();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSelectMonitor = useCallback(
    (monitorId: string) => {
      navigate({
        to: "/monitors/$monitorId",
        params: { monitorId },
      });
    },
    [navigate]
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refetch]);

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor status at a glance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Zone 1: Status Overview */}
      <StatusOverview monitors={monitors} loading={loading} />

      {/* Zone 3: Monitor Cards Grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          All Monitors
        </h2>
        <MonitorGrid
          monitors={monitors}
          loading={loading}
          onSelectMonitor={handleSelectMonitor}
        />
      </div>
    </div>
  );
}
