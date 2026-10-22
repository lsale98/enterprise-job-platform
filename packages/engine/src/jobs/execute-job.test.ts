import { test } from "node:test";
import assert from "node:assert/strict";
import { executeJob } from "./execute-job.js";

test("deterministic report execution", async () => {
  assert.deepEqual(
    await executeJob({
      type: "report",
      numbers: [2, 3, 5],
    }),
    {
      count: 3,
      sum: 10,
      average: 10 / 3,
    },
  );
});
