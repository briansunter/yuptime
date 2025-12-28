import { Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useMonitors } from "@/hooks/use-monitors";
import { Activity, Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function RootLayout() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const { monitors, loading } = useMonitors();

  // Extract monitorId from URL if on detail page
  const selectedMonitorId = (params as { monitorId?: string })?.monitorId
    ? decodeURIComponent((params as { monitorId?: string }).monitorId!)
    : null;

  const handleSelectMonitor = (monitorId: string) => {
    navigate({
      to: "/monitors/$monitorId",
      params: { monitorId },
    });
  };

  // Calculate status counts for header
  const downCount = monitors.filter(
    (m) => m.status?.state === "down"
  ).length;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar with monitors */}
      <Sidebar
        monitors={monitors}
        selectedMonitorId={selectedMonitorId}
        onSelectMonitor={handleSelectMonitor}
        loading={loading}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Kubernetes Monitoring
            </h2>
            {downCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(var(--status-down))]/10 text-[hsl(var(--status-down))] animate-pulse">
                {downCount} down
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="w-px h-6 bg-border mx-1" />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
