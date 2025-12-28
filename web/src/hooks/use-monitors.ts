import { useCallback, useEffect, useState } from "react";

export interface Monitor {
  namespace: string;
  name: string;
  spec: {
    type: string;
    enabled: boolean;
    schedule?: {
      intervalSeconds?: number;
    };
    target?: {
      http?: { url: string };
      tcp?: { host: string; port: number };
      dns?: { name: string };
    };
    tags?: string[];
  };
}

export interface MonitorWithStatus extends Monitor {
  status?: {
    state: "up" | "down" | "pending" | "flapping" | "paused";
    latencyMs?: number;
    lastCheckedAt?: string;
  };
  uptime?: number;
  recentHeartbeats?: Heartbeat[];
}

export interface Heartbeat {
  checkedAt: string;
  latencyMs: number;
  state: "up" | "down" | "pending" | "flapping" | "paused";
  reason?: string;
}

export interface MonitorStats {
  currentLatency: number | null;
  avgLatency24h: number | null;
  avgLatency7d: number | null;
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  lastCheckedAt: string | null;
  state: "up" | "down" | "pending" | "flapping" | "paused";
}

interface UseMonitorsResult {
  monitors: MonitorWithStatus[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMonitors(refreshInterval = 30000): UseMonitorsResult {
  const [monitors, setMonitors] = useState<MonitorWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/monitors");
      if (!res.ok) throw new Error("Failed to fetch monitors");
      const data = await res.json();

      const monitorsWithStatus: MonitorWithStatus[] = await Promise.all(
        (data.items || []).map(async (monitor: Monitor) => {
          const monitorId = `${monitor.namespace}/${monitor.name}`;

          // Fetch stats and heartbeats in parallel
          const [statsRes, heartbeatsRes] = await Promise.all([
            fetch(`/api/v1/monitors/${encodeURIComponent(monitorId)}/stats`).catch(() => null),
            fetch(`/api/v1/heartbeats/${encodeURIComponent(monitorId)}?limit=50`).catch(() => null),
          ]);

          let status: MonitorWithStatus["status"];
          let uptime: number | undefined;
          let recentHeartbeats: Heartbeat[] = [];

          if (statsRes?.ok) {
            const stats: MonitorStats = await statsRes.json();
            status = {
              state: stats.state,
              latencyMs: stats.currentLatency || undefined,
              lastCheckedAt: stats.lastCheckedAt || undefined,
            };
            uptime = stats.uptime30d;
          }

          if (heartbeatsRes?.ok) {
            const hbData = await heartbeatsRes.json();
            recentHeartbeats = hbData.heartbeats || [];
          }

          return {
            ...monitor,
            status,
            uptime,
            recentHeartbeats,
          };
        })
      );

      setMonitors(monitorsWithStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchMonitors, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchMonitors, refreshInterval]);

  return { monitors, loading, error, refetch: fetchMonitors };
}

interface UseMonitorStatsResult {
  stats: MonitorStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMonitorStats(
  monitorId: string,
  refreshInterval = 10000
): UseMonitorStatsResult {
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/monitors/${encodeURIComponent(monitorId)}/stats`
      );
      if (!res.ok) throw new Error("Failed to fetch monitor stats");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [monitorId]);

  useEffect(() => {
    fetchStats();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchStats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStats, refreshInterval]);

  return { stats, loading, error, refetch: fetchStats };
}

interface UseHeartbeatHistoryResult {
  heartbeats: Heartbeat[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useHeartbeatHistory(
  monitorId: string,
  limit = 100,
  refreshInterval = 10000
): UseHeartbeatHistoryResult {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHeartbeats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/heartbeats/${encodeURIComponent(monitorId)}?limit=${limit}`
      );
      if (!res.ok) throw new Error("Failed to fetch heartbeat history");
      const data = await res.json();
      setHeartbeats(data.heartbeats || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [monitorId, limit]);

  useEffect(() => {
    fetchHeartbeats();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchHeartbeats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchHeartbeats, refreshInterval]);

  return { heartbeats, loading, error, refetch: fetchHeartbeats };
}
