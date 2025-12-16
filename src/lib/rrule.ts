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
    const config: any = { interval: 1 };

    for (const part of parts) {
      const [key, value] = part.split("=");

      switch (key) {
        case "FREQ":
          config.freq = value;
          break;
        case "INTERVAL":
          config.interval = parseInt(value, 10);
          break;
        case "BYDAY":
          config.byDay = value.split(",");
          break;
        case "BYHOUR":
          config.byHour = value.split(",").map((h) => parseInt(h, 10));
          break;
        case "BYMINUTE":
          config.byMinute = value.split(",").map((m) => parseInt(m, 10));
          break;
        case "BYMONTHDAY":
          config.byMonthDay = value.split(",").map((d) => parseInt(d, 10));
          break;
        case "COUNT":
          config.count = parseInt(value, 10);
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

/**
 * Calculate next occurrence of an RRULE after a given date
 */
export function getNextOccurrence(
  rruleConfig: RRuleConfig,
  after: Date = new Date()
): Date | null {
  const now = new Date(after);
  const candidate = new Date(now);

  // Limit iterations to prevent infinite loops
  let iterations = 0;
  const maxIterations = 10000;

  while (iterations++ < maxIterations) {
    // Increment candidate based on frequency
    switch (rruleConfig.freq) {
      case "DAILY":
        candidate.setDate(candidate.getDate() + (rruleConfig.interval || 1));
        break;
      case "WEEKLY":
        candidate.setDate(candidate.getDate() + 7 * (rruleConfig.interval || 1));
        break;
      case "MONTHLY":
        candidate.setMonth(candidate.getMonth() + (rruleConfig.interval || 1));
        break;
      case "YEARLY":
        candidate.setFullYear(
          candidate.getFullYear() + (rruleConfig.interval || 1)
        );
        break;
    }

    // Check UNTIL
    if (rruleConfig.until && candidate > rruleConfig.until) {
      return null;
    }

    // Check COUNT
    if (rruleConfig.count && iterations > rruleConfig.count) {
      return null;
    }

    // Check BYDAY for weekly
    if (rruleConfig.byDay && rruleConfig.freq !== "WEEKLY") {
      continue; // BYDAY only applies to WEEKLY in simple parser
    }

    if (rruleConfig.byDay) {
      const dayOfWeek = candidate.getDay();
      const dayMatch = Object.entries(dayAbbr).find(
        ([abbr, day]) =>
          day === dayOfWeek && rruleConfig.byDay?.includes(abbr)
      );
      if (!dayMatch) {
        continue;
      }
    }

    // Check BYMONTHDAY
    if (rruleConfig.byMonthDay) {
      if (!rruleConfig.byMonthDay.includes(candidate.getDate())) {
        continue;
      }
    }

    // Set time constraints
    if (rruleConfig.byHour) {
      candidate.setHours(rruleConfig.byHour[0], 0, 0, 0);
    }

    if (rruleConfig.byMinute) {
      const minutes = rruleConfig.byMinute[0] || 0;
      candidate.setMinutes(minutes, 0, 0);
    }

    // Must be in the future
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
  checkTime: Date = new Date()
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
