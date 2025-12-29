/**
 * Convert interval seconds to Kubernetes CronJob schedule
 *
 * Kubernetes CronJobs use 5-field cron format: minute hour day month weekday
 * Minimum granularity is 1 minute
 */

export interface CronConversion {
  schedule: string;
  needsSubMinuteSleep: boolean;
  sleepSeconds?: number;
}

/**
 * Convert interval in seconds to cron schedule format
 * @param intervalSeconds - Check interval in seconds (minimum 20)
 * @returns Cron schedule string and sub-minute sleep info if needed
 */
export function intervalToCron(intervalSeconds: number): CronConversion {
  if (intervalSeconds < 20) {
    throw new Error("intervalSeconds must be at least 20");
  }

  // Sub-minute intervals (20-59 seconds)
  if (intervalSeconds < 60) {
    // Kubernetes CronJobs don't support sub-minute granularity
    // Run every minute and sleep in the checker pod
    return {
      schedule: "* * * * *", // Every minute
      needsSubMinuteSleep: true,
      sleepSeconds: intervalSeconds,
    };
  }

  // Minute intervals (1 minute to 1 hour)
  if (intervalSeconds < 3600) {
    const minutes = intervalSeconds / 60;

    // Check if it divides evenly into minutes
    if (Number.isInteger(minutes)) {
      return {
        schedule: `*/${minutes} * * * *`,
        needsSubMinuteSleep: false,
      };
    }

    // For non-integer minutes (e.g., 90 seconds = 1.5 minutes)
    // Round up to nearest minute and sleep the difference
    const roundedMinutes = Math.ceil(minutes);
    const sleepSeconds = intervalSeconds - roundedMinutes * 60;

    return {
      schedule: `*/${roundedMinutes} * * * *`,
      needsSubMinuteSleep: true,
      sleepSeconds,
    };
  }

  // Hour intervals (1 hour to 1 day)
  if (intervalSeconds < 86400) {
    const hours = intervalSeconds / 3600;

    // Check if it divides evenly into hours
    if (Number.isInteger(hours)) {
      return {
        schedule: `0 */${hours} * * *`,
        needsSubMinuteSleep: false,
      };
    }

    // For non-integer hours, use the closest hour
    const roundedHours = Math.ceil(hours);

    return {
      schedule: `0 */${roundedHours} * * *`,
      needsSubMinuteSleep: false, // Don't sleep for hour-level intervals
    };
  }

  // Daily or longer (use specific time)
  const days = Math.floor(intervalSeconds / 86400);

  if (days === 1) {
    return {
      schedule: "0 0 * * *", // Daily at midnight
      needsSubMinuteSleep: false,
    };
  }

  return {
    schedule: `0 0 */${days} * *`, // Every N days at midnight
    needsSubMinuteSleep: false,
  };
}

/**
 * Get a human-readable description of the cron schedule
 * @param schedule - Cron schedule string
 * @returns Human-readable description
 */
export function describeSchedule(schedule: string): string {
  const parts = schedule.split(" ");
  const [minute, hour, day, _month, _weekday] = parts;

  if (minute === "*" && hour === "*") {
    return "Every minute";
  }

  if (minute?.startsWith("*/") && hour === "*") {
    const minStr = minute.slice(2);
    const min = parseInt(minStr, 10);
    if (!Number.isNaN(min)) {
      return `Every ${min} minute${min > 1 ? "s" : ""}`;
    }
  }

  if (minute === "0" && hour?.startsWith("*/")) {
    const hrStr = hour.slice(2);
    const hr = parseInt(hrStr, 10);
    if (!Number.isNaN(hr)) {
      return `Every ${hr} hour${hr > 1 ? "s" : ""}`;
    }
  }

  if (minute === "0" && hour === "0" && day?.startsWith("*/")) {
    const dStr = day.slice(2);
    const d = parseInt(dStr, 10);
    if (!Number.isNaN(d)) {
      return `Every ${d} day${d > 1 ? "s" : ""}`;
    }
  }

  if (minute === "0" && hour === "0" && day === "*") {
    return "Daily at midnight";
  }

  return schedule; // Fallback to raw schedule
}
