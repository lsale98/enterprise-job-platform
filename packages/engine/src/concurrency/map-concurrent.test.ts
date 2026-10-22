import { test } from "node:test";
import assert from "node:assert/strict";
import { mapConcurrent } from "./map-concurrent.js";

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
