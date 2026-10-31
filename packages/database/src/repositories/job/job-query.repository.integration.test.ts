import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createDatabasePool } from "../../connection/pool.js";
import { createJobIdempotently } from "./job.repository.js";
import { listJobs } from "./job-query.repository.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set for integration tests");
}

const pool = createDatabasePool({ connectionString });

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const alice = "11111111-1111-4111-8111-111111111111";
const carol = "33333333-3333-4333-8333-333333333333";

const createdJobs: string[] = [];

const runId = randomUUID().replaceAll("-", "");
const keyPrefix = `query_${runId}_`;

async function createTestJob(
  tenantId: string,
  createdBy: string,
  type: "report" | "notification",
): Promise<string> {
  const idempotencyKey = `${keyPrefix}${createdJobs.length}`;

  const input =
    type === "report"
      ? { type: "report" as const, numbers: [1, 2, 3] }
      : {
          type: "notification" as const,
          subject: "Integration test",
          message: "Job query validation",
        };

  const outcome = await createJobIdempotently(pool, {
    tenantId,
    createdBy,
    idempotencyKey,
    input,
  });

  createdJobs.push(outcome.job.id);

  return outcome.job.id;
}

before(async () => {
  await createTestJob(tenantA, alice, "report");
  await createTestJob(tenantA, alice, "report");
  await createTestJob(tenantA, alice, "notification");
  await createTestJob(tenantB, carol, "report");
});

after(async () => {
  try {
    if (createdJobs.length > 0) {
      await pool.query(
        `DELETE FROM audit_events
         WHERE resource_id = ANY($1::text[])
           AND action = 'job.created'`,
        [createdJobs],
      );

      await pool.query(
        `DELETE FROM jobs
         WHERE id = ANY($1::uuid[])`,
        [createdJobs],
      );
    }
  } finally {
    await pool.end();
  }
});

test("lists only jobs belonging to the requested tenant", async () => {
  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: { limit: 100 },
  });

  assert.ok(result.jobs.length >= 3);
  assert.ok(result.jobs.every((job) => job.tenantId === tenantA));

  assert.ok(
    createdJobs
      .slice(0, 3)
      .every((id) => result.jobs.some((job) => job.id === id)),
  );

  assert.ok(!result.jobs.some((job) => job.id === createdJobs[3]));
});

test("filters jobs by type", async () => {
  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: { type: "notification", limit: 100 },
  });

  assert.ok(result.jobs.every((job) => job.type === "notification"));
  assert.ok(result.jobs.some((job) => job.id === createdJobs[2]));
});

test("filters jobs by status", async () => {
  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: { status: "queued", limit: 100 },
  });

  assert.ok(result.jobs.every((job) => job.status === "queued"));
});

test("returns jobs in deterministic descending order", async () => {
  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: { limit: 100 },
  });

  const expected = await pool.query<{ id: string }>(
    `SELECT id::text AS id
     FROM jobs
     WHERE tenant_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [tenantA],
  );

  assert.deepEqual(
    result.jobs.map((job) => job.id),
    expected.rows.map((row) => row.id),
  );
});

test("returns hasMore when additional jobs exist", async () => {
  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: { limit: 1 },
  });

  assert.equal(result.jobs.length, 1);
  assert.equal(result.hasMore, true);
});

test("continues pagination using the last returned job", async () => {
  const firstPage = await listJobs(pool, {
    tenantId: tenantA,
    query: { limit: 2 },
  });

  assert.equal(firstPage.jobs.length, 2);

  const lastJob = firstPage.jobs.at(-1)!;

  const secondPage = await listJobs(pool, {
    tenantId: tenantA,
    query: { limit: 2 },
    cursor: {
      version: 1,
      tenantId: tenantA,
      id: lastJob.id,
      createdAt: lastJob.createdAt,
      filters: {},
      limit: 2,
    },
  });

  const firstIds = new Set(firstPage.jobs.map((job) => job.id));

  assert.ok(secondPage.jobs.every((job) => !firstIds.has(job.id)));
});

test("filters jobs by creation date", async () => {
  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();

  const result = await listJobs(pool, {
    tenantId: tenantA,
    query: {
      createdFrom: from,
      createdTo: to,
      limit: 100,
    },
  });

  assert.ok(
    result.jobs.every((job) => job.createdAt >= from && job.createdAt <= to),
  );
});
