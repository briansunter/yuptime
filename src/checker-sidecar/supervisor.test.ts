import { describe, expect, test } from "bun:test";
import type { AttemptRequest } from "../check-runner/types";
import { createHttpMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd";
import { createCheckerSupervisor } from "./supervisor";

function request(executionId: string, deadlineMs: number): AttemptRequest {
  return {
    protocolVersion: 1,
    executionId,
    attempt: 1,
    scheduledAt: new Date().toISOString(),
    deadline: new Date(Date.now() + deadlineMs).toISOString(),
    monitor: {
      ...createHttpMonitor({ jitterPercent: 0 }),
      metadata: {
        name: "supervisor",
        namespace: "default",
        uid: "supervisor",
        generation: 1,
        creationTimestamp: new Date().toISOString(),
      },
    } as Monitor,
  };
}

describe("checker supervisor", () => {
  test("hard-kills a hung worker, replaces it, and continues checking", async () => {
    const supervisor = createCheckerSupervisor(1, {
      workerCommand: ["bun", "src/checker-sidecar/test-worker.ts"],
      hardDeadlineGraceMs: 10,
    });
    for (let attempt = 0; attempt < 50 && !supervisor.ready(); attempt++) await Bun.sleep(5);
    expect(supervisor.ready()).toBe(true);
    const timeout = await supervisor.run(request("hang", 40), new AbortController().signal);
    expect(timeout.state).toBe("down");
    expect(timeout.reason).toBe("TIMEOUT");
    await Bun.sleep(30);
    expect(supervisor.snapshot().restarts).toBe(1);
    expect(supervisor.snapshot().restartsByReason.timeout).toBe(1);
    for (let attempt = 0; attempt < 50 && !supervisor.ready(); attempt++) await Bun.sleep(5);
    const result = await supervisor.run(request("ok", 1_000), new AbortController().signal);
    expect(result.state).toBe("up");
    await supervisor.stop(100);
  });
});
