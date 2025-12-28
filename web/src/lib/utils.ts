import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format latency in milliseconds to a human-readable string
 */
export function formatLatency(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/**
 * Format uptime percentage with appropriate precision
 */
export function formatUptime(percentage: number | undefined | null): string {
  if (percentage === undefined || percentage === null) return "—";
  if (percentage >= 99.99) return "99.99%";
  if (percentage >= 99.9) return `${percentage.toFixed(2)}%`;
  if (percentage >= 99) return `${percentage.toFixed(1)}%`;
  return `${percentage.toFixed(0)}%`;
}

/**
 * Format a date to a relative time string (e.g., "2 minutes ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date to a compact time string
 */
export function formatCompactTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a date to full datetime string
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Calculate uptime percentage from heartbeat data
 */
export function calculateUptime(
  heartbeats: { state: string }[]
): number {
  if (heartbeats.length === 0) return 100;
  const upCount = heartbeats.filter((h) => h.state === "up").length;
  return (upCount / heartbeats.length) * 100;
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "up":
      return "text-[hsl(var(--status-up))]";
    case "down":
      return "text-[hsl(var(--status-down))]";
    case "warning":
    case "flapping":
      return "text-[hsl(var(--status-warning))]";
    case "pending":
      return "text-[hsl(var(--status-pending))]";
    case "paused":
      return "text-[hsl(var(--status-paused))]";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Get status background color class
 */
export function getStatusBgColor(status: string): string {
  switch (status) {
    case "up":
      return "bg-[hsl(var(--status-up))]/10";
    case "down":
      return "bg-[hsl(var(--status-down))]/10";
    case "warning":
    case "flapping":
      return "bg-[hsl(var(--status-warning))]/10";
    case "pending":
      return "bg-[hsl(var(--status-pending))]/10";
    case "paused":
      return "bg-[hsl(var(--status-paused))]/10";
    default:
      return "bg-muted";
  }
}
