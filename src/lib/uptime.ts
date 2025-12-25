/**
 * Calculate uptime percentage from heartbeats
 */
export function calculateUptime(
  heartbeats: Array<{
    state: "up" | "down" | "pending" | "flapping" | "paused";
    checkedAt: string | Date;
  }>,
  windowMinutes: number,
): number {
  if (heartbeats.length === 0) return 100;

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  const relevantHeartbeats = heartbeats.filter((hb) => {
    const hbTime = new Date(hb.checkedAt);
    return hbTime >= windowStart;
  });

  if (relevantHeartbeats.length === 0) return 100;

  const upCount = relevantHeartbeats.filter((hb) => hb.state === "up").length;
  return (upCount / relevantHeartbeats.length) * 100;
}

/**
 * Format uptime percentage for display
 */
export function formatUptime(percentage: number): string {
  return `${percentage.toFixed(2)}%`;
}

/**
 * Calculate incident duration in seconds
 */
export function calculateDuration(startedAt: Date, endedAt?: Date): number {
  const end = endedAt || new Date();
  return Math.floor((end.getTime() - startedAt.getTime()) / 1000);
}

/**
 * Calculate SLA percentage (simplified: count uptime periods)
 */
export function calculateSLA(
  incidents: Array<{
    startedAt: Date;
    endedAt?: Date;
  }>,
  windowMs: number,
): number {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  let downtimeMs = 0;

  for (const incident of incidents) {
    const incidentStart = incident.startedAt;
    if (incidentStart > now) continue; // Future incident

    const incidentEnd = incident.endedAt || now;
    const periodStart = Math.max(
      incidentStart.getTime(),
      windowStart.getTime(),
    );
    const periodEnd = Math.min(incidentEnd.getTime(), now.getTime());

    if (periodStart < periodEnd) {
      downtimeMs += periodEnd - periodStart;
    }
  }

  const uptimePercentage = ((windowMs - downtimeMs) / windowMs) * 100;
  return Math.max(0, Math.min(100, uptimePercentage));
}

/**
 * Format SLA value for display
 */
export function formatSLA(percentage: number): string {
  const nines = Math.log10(100 / (100 - percentage));
  const formattedNines = nines.toFixed(2);
  return `${percentage.toFixed(2)}% (${formattedNines}N)`;
}

/**
 * Get uptime classification
 */
export function classifyUptime(
  percentage: number,
): "excellent" | "good" | "fair" | "poor" | "critical" {
  if (percentage >= 99.9) return "excellent";
  if (percentage >= 99) return "good";
  if (percentage >= 95) return "fair";
  if (percentage >= 90) return "poor";
  return "critical";
}
