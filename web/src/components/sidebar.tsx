import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MonitorListItem } from "./monitor-list-item";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MonitorWithStatus } from "@/hooks/use-monitors";

type StatusFilter = "all" | "up" | "down" | "degraded";

interface SidebarProps {
  monitors: MonitorWithStatus[];
  selectedMonitorId: string | null;
  onSelectMonitor: (monitorId: string) => void;
  loading?: boolean;
}

const SIDEBAR_COLLAPSED_KEY = "kubekuma-sidebar-collapsed";

export function Sidebar({
  monitors,
  selectedMonitorId,
  onSelectMonitor,
  loading = false,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    }
    return false;
  });

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Keyboard shortcut (Cmd/Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const filteredMonitors = useMemo(() => {
    return monitors.filter((monitor) => {
      const matchesSearch =
        search === "" ||
        monitor.name.toLowerCase().includes(search.toLowerCase()) ||
        monitor.namespace.toLowerCase().includes(search.toLowerCase());

      const state = monitor.status?.state || "pending";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "up" && state === "up") ||
        (statusFilter === "down" && state === "down") ||
        (statusFilter === "degraded" &&
          (state === "flapping" || state === "pending"));

      return matchesSearch && matchesStatus;
    });
  }, [monitors, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { up: 0, down: 0, degraded: 0, total: monitors.length };
    monitors.forEach((m) => {
      const state = m.status?.state || "pending";
      if (state === "up") counts.up++;
      else if (state === "down") counts.down++;
      else counts.degraded++;
    });
    return counts;
  }, [monitors]);

  // Collapsed sidebar
  if (isCollapsed) {
    return (
      <div className="w-16 bg-card border-r border-border flex flex-col h-full">
        {/* Logo */}
        <div className="p-3 border-b border-border flex flex-col items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <Activity className="h-5 w-5 text-primary" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Dashboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapse}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Expand sidebar
                <kbd className="ml-2 text-xs bg-muted px-1 rounded">⌘B</kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Status indicators */}
        <div className="p-2 border-b border-border space-y-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[hsl(var(--status-up))]/10">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-up))]" />
                    <span className="text-xs font-medium tabular-nums">{statusCounts.up}</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{statusCounts.up} monitors up</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {statusCounts.down > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[hsl(var(--status-down))]/10 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-down))]" />
                      <span className="text-xs font-medium tabular-nums text-[hsl(var(--status-down))]">
                        {statusCounts.down}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{statusCounts.down} monitors down</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Collapsed monitor list (icons only) */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredMonitors.map((monitor) => {
              const monitorId = `${monitor.namespace}/${monitor.name}`;
              const state = monitor.status?.state || "pending";
              const isSelected = selectedMonitorId === monitorId;

              return (
                <TooltipProvider key={monitorId}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectMonitor(monitorId)}
                        className={cn(
                          "w-full p-2 rounded-lg flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-accent ring-2 ring-primary/50"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-3 h-3 rounded-full",
                            state === "up" && "bg-[hsl(var(--status-up))]",
                            state === "down" && "bg-[hsl(var(--status-down))] animate-pulse",
                            state === "pending" && "bg-[hsl(var(--status-pending))]",
                            state === "flapping" && "bg-[hsl(var(--status-warning))]",
                            state === "paused" && "bg-[hsl(var(--status-paused))]"
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div className="font-medium">{monitor.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{state}</div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Expanded sidebar
  return (
    <div className="w-72 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground">KubeKuma</span>
          </Link>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapse}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Collapse sidebar
                <kbd className="ml-2 text-xs bg-muted px-1 rounded">⌘B</kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search monitors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                statusFilter === "all"
                  ? "border-input bg-background hover:bg-accent"
                  : "border-primary/50 bg-primary/10 text-primary"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="capitalize">
                {statusFilter === "all" ? "All" : statusFilter}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {showFilterDropdown && (
              <div className="absolute top-full left-0 mt-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                {(["all", "up", "down", "degraded"] as StatusFilter[]).map(
                  (filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setStatusFilter(filter);
                        setShowFilterDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center justify-between transition-colors",
                        statusFilter === filter && "bg-accent"
                      )}
                    >
                      <span className="capitalize">{filter}</span>
                      {filter !== "all" && (
                        <span
                          className={cn(
                            "text-xs tabular-nums px-1.5 py-0.5 rounded-full",
                            filter === "up" && "bg-[hsl(var(--status-up))]/10 text-[hsl(var(--status-up))]",
                            filter === "down" && "bg-[hsl(var(--status-down))]/10 text-[hsl(var(--status-down))]",
                            filter === "degraded" && "bg-[hsl(var(--status-warning))]/10 text-[hsl(var(--status-warning))]"
                          )}
                        >
                          {statusCounts[filter]}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          <div className="flex-1 text-right text-sm text-muted-foreground">
            {filteredMonitors.length} monitor{filteredMonitors.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Status summary bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-up))]" />
          <span className="tabular-nums font-medium">{statusCounts.up}</span>
          <span className="text-muted-foreground">up</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              "w-2 h-2 rounded-full bg-[hsl(var(--status-down))]",
              statusCounts.down > 0 && "animate-pulse"
            )}
          />
          <span
            className={cn(
              "tabular-nums font-medium",
              statusCounts.down > 0 && "text-[hsl(var(--status-down))]"
            )}
          >
            {statusCounts.down}
          </span>
          <span className="text-muted-foreground">down</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-warning))]" />
          <span className="tabular-nums font-medium">{statusCounts.degraded}</span>
          <span className="text-muted-foreground">other</span>
        </div>
      </div>

      {/* Monitor List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            <div className="inline-block animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full mb-2" />
            <p className="text-sm">Loading monitors...</p>
          </div>
        ) : filteredMonitors.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No monitors found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredMonitors.map((monitor) => {
              const monitorId = `${monitor.namespace}/${monitor.name}`;
              return (
                <MonitorListItem
                  key={monitorId}
                  monitor={monitor}
                  isSelected={selectedMonitorId === monitorId}
                  onClick={() => onSelectMonitor(monitorId)}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
