/**
 * Simple RRULE parser for RFC 5545 Recurrence Rules
 *
 * Supports basic patterns:
 * - RRULE:FREQ=DAILY;BYHOUR=2;BYMINUTE=30
 * - RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=14
 * - RRULE:FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=9
 */

interface RRuleConfig {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  byDay?: string[];
  byHour?: number[];
  byMinute?: number[];
  byMonthDay?: number[];
  count?: number;
  until?: Date;
  interval?: number;
}

/**
 * Parse RRULE string into config
 */
export function parseRRule(rruleString: string): RRuleConfig | null {
  try {
    const parts = rruleString.replace(/^RRULE:/, "").split(";");
    const config: Partial<RRuleConfig> = { interval: 1 };

    for (const part of parts) {
      const [key, value] = part.split("=");

      if (!value) continue;

      switch (key) {
        case "FREQ":
          config.freq = value as RRuleConfig["freq"];
          break;
        case "INTERVAL":
          config.interval = Number.parseInt(value, 10);
          break;
        case "BYDAY":
          config.byDay = value.split(",");
          break;
        case "BYHOUR":
          config.byHour = value.split(",").map((h) => Number.parseInt(h, 10));
          break;
        case "BYMINUTE":
          config.byMinute = value.split(",").map((m) => Number.parseInt(m, 10));
          break;
        case "BYMONTHDAY":
          config.byMonthDay = value.split(",").map((d) => Number.parseInt(d, 10));
          break;
        case "COUNT":
          config.count = Number.parseInt(value, 10);
          break;
        case "UNTIL":
          config.until = new Date(value);
          break;
      }
    }

    if (!config.freq) {
      return null;
    }

    return config as RRuleConfig;
  } catch (_error) {
    return null;
  }
}

const dayAbbr = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 0,
};

function advanceCandidate(candidate: Date, config: RRuleConfig): void {
  const interval = config.interval || 1;
  switch (config.freq) {
    case "DAILY":
      candidate.setDate(candidate.getDate() + interval);
      break;
    case "WEEKLY":
      candidate.setDate(candidate.getDate() + 7 * interval);
      break;
    case "MONTHLY":
      candidate.setMonth(candidate.getMonth() + interval);
      break;
    case "YEARLY":
      candidate.setFullYear(candidate.getFullYear() + interval);
      break;
  }
}

function matchesByDay(candidate: Date, config: RRuleConfig): boolean {
  if (!config.byDay) return true;
  if (config.freq !== "WEEKLY") return false;

  const dayOfWeek = candidate.getDay();
  return Object.entries(dayAbbr).some(
    ([abbr, day]) => day === dayOfWeek && config.byDay?.includes(abbr),
  );
}

function applyTimeConstraints(candidate: Date, config: RRuleConfig): void {
  if (config.byHour && config.byHour[0] !== undefined) {
    candidate.setHours(config.byHour[0], 0, 0, 0);
  }
  if (config.byMinute) {
    candidate.setMinutes(config.byMinute[0] ?? 0, 0, 0);
  }
}

/**
 * Calculate next occurrence of an RRULE after a given date
 */
export function getNextOccurrence(rruleConfig: RRuleConfig, after: Date = new Date()): Date | null {
  const now = new Date(after);
  const candidate = new Date(now);
  const maxIterations = 10000;

  for (let iterations = 1; iterations <= maxIterations; iterations++) {
    advanceCandidate(candidate, rruleConfig);

    if (rruleConfig.until && candidate > rruleConfig.until) {
      return null;
    }
    if (rruleConfig.count && iterations > rruleConfig.count) {
      return null;
    }

    if (!matchesByDay(candidate, rruleConfig)) {
      continue;
    }

    if (rruleConfig.byMonthDay && !rruleConfig.byMonthDay.includes(candidate.getDate())) {
      continue;
    }

    applyTimeConstraints(candidate, rruleConfig);

    if (candidate > now) {
      return candidate;
    }
  }

  return null;
}

/**
 * Check if a date/time is within a maintenance window
 * based on RRULE and duration
 */
export function isInMaintenanceWindow(
  rruleConfig: RRuleConfig,
  durationMinutes: number,
  checkTime: Date = new Date(),
): boolean {
  // Get the most recent occurrence before or at checkTime
  const oneYearAgo = new Date(checkTime);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let lastOccurrence = oneYearAgo;

  // Iterate backwards to find the most recent occurrence
  for (let i = 0; i < 10000; i++) {
    const next = getNextOccurrence(rruleConfig, lastOccurrence);
    if (!next || next > checkTime) {
      // next is in the future, so lastOccurrence is the most recent
      break;
    }
    lastOccurrence = new Date(next);
  }

  const windowEnd = new Date(lastOccurrence);
  windowEnd.setMinutes(windowEnd.getMinutes() + durationMinutes);

  return lastOccurrence <= checkTime && checkTime < windowEnd;
}
