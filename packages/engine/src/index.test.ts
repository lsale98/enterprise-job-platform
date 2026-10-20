import { test } from "node:test";
import assert from "node:assert/strict";
import { executeJob, mapConcurrent, withRetry } from "./index.js";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
test("bounded concurrency preserves order", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await pause((5 - value) * 5);
      return value * 10;
    } finally {
      active--;
    }
  });
  assert.deepEqual(result, [10, 20, 30, 40]);
  assert.equal(peak, 2);
});
test("retries transient failure with bounded attempts", async () => {
  let attempts = 0;
  const value = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw Error("temporary");
      return "ok";
    },
    { maxAttempts: 3, baseDelayMs: 1 },
  );
  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});
test("deterministic report execution", async () => {
  assert.deepEqual(await executeJob({ type: "report", numbers: [2, 3, 5] }), {
    count: 3,
    sum: 10,
    average: 10 / 3,
  });
});
