import { describe, expect, test } from "bun:test";
import type { Monitor } from "../types/crd";
import { checkWebSocket } from "./websocket";

function websocketMonitor(url: string): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: { name: "websocket-test", namespace: "default" },
    spec: {
      enabled: true,
      type: "websocket",
      schedule: { intervalSeconds: 30, timeoutSeconds: 10 },
      target: { websocket: { url } },
    },
  } as unknown as Monitor;
}

describe("checkWebSocket", () => {
  test("rejects malformed URLs", async () => {
    const result = await checkWebSocket(websocketMonitor("not-a-url"), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("WebSocket URL must be a valid URL");
  });

  test("rejects non-WebSocket protocols", async () => {
    const result = await checkWebSocket(websocketMonitor("https://example.com/socket"), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("WebSocket URL must use a WebSocket protocol");
  });
});
