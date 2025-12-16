import { logger } from "../lib/logger";
import { checkHttp, checkKeyword, checkJsonQuery, type CheckResult } from "./http";
import { checkTcp } from "./tcp";
import { checkDns } from "./dns";
import { checkPing } from "./ping";
import { checkWebSocket } from "./websocket";
import { checkPush } from "./push";
import { checkSteam } from "./steam";
import { checkKubernetes } from "./kubernetes";
import type { Monitor } from "../types/crd";

/**
 * Execute a check based on monitor type
 * Functional dispatcher pattern - compose checkers with logging and error handling
 */
export async function executeCheck(
  monitor: Monitor,
  timeout: number
): Promise<CheckResult> {
  const type = monitor.spec.type;
  const start = Date.now();

  try {
    logger.debug(
      { monitor: monitor.metadata.name, type, timeout },
      "Executing check"
    );

    switch (type) {
      // Content-based HTTP checks
      case "http":
        return await checkHttp(monitor, timeout);

      case "keyword":
        return await checkKeyword(monitor, timeout);

      case "jsonQuery":
        return await checkJsonQuery(monitor, timeout);

      // Network checks
      case "tcp":
        return await checkTcp(monitor, timeout);

      case "dns":
        return await checkDns(monitor, timeout);

      case "ping":
        return await checkPing(monitor, timeout);

      case "websocket":
        return await checkWebSocket(monitor, timeout);

      case "push":
        return await checkPush(monitor, timeout);

      case "steam":
        return await checkSteam(monitor, timeout);

      case "k8s":
        return await checkKubernetes(monitor, timeout);

      case "docker":
        return {
          state: "down",
          latencyMs: 0,
          reason: "NOT_IMPLEMENTED",
          message: "Docker checker not yet implemented",
        };

      default:
        const _exhaustive: never = type;
        return {
          state: "down",
          latencyMs: 0,
          reason: "UNKNOWN_TYPE",
          message: `Unknown monitor type: ${type}`,
        };
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error(
      { monitor: monitor.metadata.name, type, error },
      "Check execution failed with error"
    );

    return {
      state: "down",
      latencyMs,
      reason: "EXECUTION_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export { type CheckResult };
export { validatePushToken, recordPush } from "./push";
