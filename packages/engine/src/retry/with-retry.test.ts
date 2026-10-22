import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./with-retry.js";

test("retries transient failure with bounded attempts", async () => {
  let attempts = 0;

  const value = await withRetry(
    async () => {
      attempts++;

      if (attempts < 3) {
        throw new Error("temporary");
      }

      return "ok";
    },
    {
      maxAttempts: 3,
      baseDelayMs: 1,
    },
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});
