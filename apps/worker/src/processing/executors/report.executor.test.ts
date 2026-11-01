import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimedJob } from "@lab/database/job-repository";

import { executeReport } from "./report.executor.js";

const job: ClaimedJob = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  type: "report",
  input: {
    type: "report",
    numbers: [10, 20, 30],
  },
  attempts: 1,
  maxAttempts: 3,
  leaseOwner: "lease-test",
  leaseUntil: "2099-01-01T00:00:00.000Z",
};

test("calculates report statistics", async () => {
  const result = await executeReport(job, new AbortController().signal);

  assert.deepEqual(result, {
    count: 3,
    sum: 60,
    average: 20,
  });
});

test("rejects an aborted execution", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(() => executeReport(job, controller.signal));
});

test("rejects incompatible job input", async () => {
  await assert.rejects(() =>
    executeReport(
      {
        ...job,
        input: {
          type: "report",
          numbers: [],
        },
      },
      new AbortController().signal,
    ),
  );
});
