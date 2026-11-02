import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimedJob } from "@lab/database/job-repository";

import { processJob, type ProcessJobDependencies } from "./process-job.js";

const job: ClaimedJob = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  type: "report",
  input: {
    type: "report",
    numbers: [1, 2, 3],
  },
  attempts: 1,
  maxAttempts: 3,
  leaseOwner: "lease-test",
  leaseUntil: "2099-01-01T00:00:00.000Z",
};

function dependencies(
  overrides: Partial<ProcessJobDependencies> = {},
): ProcessJobDependencies {
  return {
    execute: async () => ({
      count: 3,
      sum: 6,
      average: 2,
    }),
    heartbeat: async () => ({
      kind: "extended",
      leaseUntil: "2099-01-01T00:00:00.000Z",
    }),
    complete: async () => ({
      kind: "completed",
    }),
    fail: async () => ({
      kind: "failed",
    }),
    ...overrides,
  };
}

test("completes a successful job", async () => {
  let saved: unknown;

  const response = await processJob({
    job,
    leaseSeconds: 60,
    heartbeatMs: 10000,
    dependencies: dependencies({
      complete: async (params) => {
        saved = params.result;
        assert.equal(params.tenantId, job.tenantId);
        assert.equal(params.leaseOwner, job.leaseOwner);
        return { kind: "completed" };
      },
    }),
  });

  assert.equal(response.outcome, "completed");
  assert.deepEqual(saved, {
    count: 3,
    sum: 6,
    average: 2,
  });
});

test("persists executor failures", async () => {
  let message = "";

  const response = await processJob({
    job,
    leaseSeconds: 60,
    heartbeatMs: 10000,
    dependencies: dependencies({
      execute: async () => {
        throw new Error("Execution failed");
      },
      fail: async (params) => {
        message = params.error;
        return { kind: "failed" };
      },
    }),
  });

  assert.equal(response.outcome, "failed");
  assert.equal(message, "Execution failed");
});

test("rejects completion after losing lease", async () => {
  const response = await processJob({
    job,
    leaseSeconds: 60,
    heartbeatMs: 10000,
    dependencies: dependencies({
      complete: async () => ({ kind: "lease_lost" }),
    }),
  });

  assert.equal(response.outcome, "lease_lost");
});

test("heartbeat loss prevents completion", async () => {
  let completeCalled = false;

  const response = await processJob({
    job,
    leaseSeconds: 60,
    heartbeatMs: 5,
    dependencies: dependencies({
      execute: async (_job, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ ok: true }), 100);

          const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
          };

          signal.addEventListener("abort", onAbort, { once: true });

          if (signal.aborted) {
            onAbort();
          }
        }),
      heartbeat: async () => ({
        kind: "lease_lost",
      }),
      complete: async () => {
        completeCalled = true;
        return { kind: "completed" };
      },
    }),
  });

  assert.equal(response.outcome, "lease_lost");
  assert.equal(completeCalled, false);
});
