import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimedJob } from "@lab/database/job-repository";

import type { WorkerConfig } from "../config/worker.config.js";
import { runWorker } from "./run-worker.js";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const config: WorkerConfig = {
  databaseUrl: "postgresql://localhost/test",
  concurrency: 2,
  pollMs: 100,
  leaseSeconds: 60,
  heartbeatMs: 10000,
};

function makeJob(id: string, tenantId: string): ClaimedJob {
  return {
    id,
    tenantId,
    type: "report",
    input: {
      type: "report",
      numbers: [1, 2, 3],
    },
    attempts: 1,
    maxAttempts: 3,
    leaseOwner: `lease-${id}`,
    leaseUntil: "2099-01-01T00:00:00.000Z",
  };
}

test("global claim does not receive tenant ID", async () => {
  const controller = new AbortController();
  let params: unknown;

  await runWorker({
    config: { ...config, concurrency: 1 },
    workerId: "test-worker",
    signal: controller.signal,
    dependencies: {
      claim: async (value) => {
        params = value;
        controller.abort();
        return null;
      },
      recoverExhausted: async () => 0,
      process: async (job) => ({
        jobId: job.id,
        outcome: "completed",
      }),
    },
  });

  assert.deepEqual(params, {
    workerId: "test-worker",
    leaseSeconds: 60,
  });
});

test("processes jobs from different tenants", async () => {
  const controller = new AbortController();

  const jobs = [
    makeJob("550e8400-e29b-41d4-a716-446655440001", tenantA),
    makeJob("550e8400-e29b-41d4-a716-446655440002", tenantB),
  ];

  const processed = new Set<string>();
  let index = 0;

  await runWorker({
    config: { ...config, concurrency: 1 },
    workerId: "test-worker",
    signal: controller.signal,
    dependencies: {
      claim: async () => {
        const job = jobs[index++];

        if (!job) {
          controller.abort();
          return null;
        }

        return job;
      },
      recoverExhausted: async () => 0,
      process: async (job) => {
        processed.add(job.tenantId);

        return {
          jobId: job.id,
          outcome: "completed",
        };
      },
    },
  });

  assert.deepEqual([...processed].sort(), [tenantA, tenantB].sort());
});

test("finishes a job claimed before shutdown", async () => {
  const controller = new AbortController();

  const job = makeJob("550e8400-e29b-41d4-a716-446655440003", tenantA);

  let processed = false;

  await runWorker({
    config: { ...config, concurrency: 1 },
    workerId: "test-worker",
    signal: controller.signal,
    dependencies: {
      claim: async () => {
        controller.abort();
        return job;
      },
      recoverExhausted: async () => 0,
      process: async () => {
        processed = true;

        return {
          jobId: job.id,
          outcome: "completed",
        };
      },
    },
  });

  assert.equal(processed, true);
});

test("does not exceed configured concurrency", async () => {
  const controller = new AbortController();

  const jobs = [
    makeJob("550e8400-e29b-41d4-a716-446655440004", tenantA),
    makeJob("550e8400-e29b-41d4-a716-446655440005", tenantB),
    makeJob("550e8400-e29b-41d4-a716-446655440006", tenantA),
  ];

  let index = 0;
  let active = 0;
  let maximumActive = 0;
  let completed = 0;

  await runWorker({
    config,
    workerId: "test-worker",
    signal: controller.signal,
    dependencies: {
      claim: async () => {
        const job = jobs[index++];

        if (!job && completed === jobs.length) {
          controller.abort();
        }

        return job ?? null;
      },
      recoverExhausted: async () => 0,
      process: async (job) => {
        active++;
        maximumActive = Math.max(maximumActive, active);

        try {
          await new Promise<void>((resolve) => setTimeout(resolve, 20));

          completed++;

          if (completed === jobs.length) {
            controller.abort();
          }

          return {
            jobId: job.id,
            outcome: "completed",
          };
        } finally {
          active--;
        }
      },
    },
  });

  assert.equal(completed, 3);
  assert.ok(maximumActive <= 2);
});
