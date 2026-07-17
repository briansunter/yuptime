import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import { type CheckContext, createCheckContext } from "./context";
import { checkDns } from "./dns";
import { checkGrpc } from "./grpc";
import {
  type CheckResult,
  checkHtmlQuery,
  checkHttp,
  checkJsonQuery,
  checkKeyword,
  checkXmlQuery,
} from "./http";
import { checkKubernetes } from "./kubernetes";
import { checkMySql } from "./mysql";
import { checkPing } from "./ping";
import { checkPostgreSql } from "./postgresql";
import { checkPush } from "./push";
import { checkRedis } from "./redis";
import { checkSteam } from "./steam";
import { checkTcp } from "./tcp";
import { checkWebSocket } from "./websocket";

/**
 * Execute a check based on monitor type
 * Functional dispatcher pattern - compose checkers with logging and error handling
 */
export async function executeCheck(
  monitor: Monitor,
  timeout: number,
  context: CheckContext = createCheckContext(),
): Promise<CheckResult> {
  const type = monitor.spec.type;
  const start = Date.now();

  try {
    logger.debug({ monitor: monitor.metadata.name, type, timeout }, "Executing check");

    switch (type) {
      // Content-based HTTP checks
      case "http":
        return await checkHttp(monitor, timeout, context);

      case "keyword":
        return await checkKeyword(monitor, timeout, context);

      case "jsonQuery":
        return await checkJsonQuery(monitor, timeout, context);

      case "xmlQuery":
        return await checkXmlQuery(monitor, timeout, context);

      case "htmlQuery":
        return await checkHtmlQuery(monitor, timeout, context);

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

      // Database checks
      case "mysql":
        return await checkMySql(monitor, timeout, context);

      case "postgresql":
        return await checkPostgreSql(monitor, timeout, context);

      case "redis":
        return await checkRedis(monitor, timeout, context);

      // gRPC health check
      case "grpc":
        return await checkGrpc(monitor, timeout);

      default: {
        // Ensure all cases are handled
        const exhaustive: never = type;
        return {
          state: "down",
          latencyMs: 0,
          reason: "UNKNOWN_TYPE",
          message: `Unknown monitor type: ${exhaustive}`,
        };
      }
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error(
      { monitor: monitor.metadata.name, type, error },
      "Check execution failed with error",
    );

    return {
      state: "down",
      latencyMs,
      reason: "EXECUTION_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export type { CheckResult };
export type { CheckContext } from "./context";
export { createCheckContext } from "./context";
export { recordPush, validatePushToken } from "./push";
