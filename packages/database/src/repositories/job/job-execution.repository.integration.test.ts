import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { Pool } from "pg";

import { resetJobQueue } from "../../test-support/reset-job-queue.js";

import { claimJob, completeJob, failJob } from "./job.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const pool = new Pool({
  connectionString,
});

beforeEach(async () => {
  await resetJobQueue(pool);
});

const tenantId = randomUUID();
const workerId = `worker-test-${randomUUID()}`;

const jobIds: string[] = [];

let createdBy: string;

before(async () => {
  const identity = await pool.query<{ subject: string }>(
    "SELECT subject FROM identities ORDER BY subject LIMIT 1",
  );

  const subject = identity.rows[0]?.subject;

  if (!subject) {
    throw new Error("A seeded identity is required");
  }

  createdBy = subject;

  await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2)", [
    tenantId,
    "E6-S1 execution integration tenant",
  ]);
});

after(async () => {
  try {
    await pool.query("DELETE FROM audit_events WHERE tenant_id = $1", [
      tenantId,
    ]);

    await pool.query("DELETE FROM jobs WHERE tenant_id = $1", [tenantId]);

    await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  } finally {
    await pool.end();
  }
});

async function createJobFixture(): Promise<string> {
  const id = randomUUID();

  jobIds.push(id);

  await pool.query(
    `INSERT INTO jobs (
       id,
       tenant_id,
       created_by,
       type,
       input,
       idempotency_key,
       request_hash
     )
     VALUES (
       $1, $2, $3, 'report', $4::jsonb, $5, $6
     )`,
    [
      id,
      tenantId,
      createdBy,
      JSON.stringify({
        type: "report",
        numbers: [1, 2, 3],
      }),
      randomUUID(),
      randomUUID(),
    ],
  );

  return id;
}

async function getJobState(jobId: string) {
  const result = await pool.query<{
    status: string;
    attempts: number;
    leaseOwner: string | null;
    result: unknown;
    error: string | null;
  }>(
    `SELECT
       status,
       attempts,
       lease_owner AS "leaseOwner",
       result,
       error
     FROM jobs
     WHERE id = $1`,
    [jobId],
  );

  return result.rows[0];
}

async function getAuditCount(jobId: string, action: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM audit_events
     WHERE tenant_id = $1
       AND resource_id = $2
       AND action = $3`,
    [tenantId, jobId, action],
  );

  return Number(result.rows[0]?.count ?? 0);
}

test("claimJob transitions queued to running", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);
  assert.equal(claimed.tenantId, tenantId);
  assert.equal(claimed.attempts, 1);
  assert.ok(claimed.leaseOwner);

  const state = await getJobState(jobId);

  assert.equal(state?.status, "running");
  assert.equal(state?.attempts, 1);
  assert.equal(state?.leaseOwner, claimed.leaseOwner);
});

test("completeJob persists result and clears lease", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  const executionResult = {
    count: 3,
    sum: 6,
    average: 2,
  };

  const completion = await completeJob(pool, {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
    result: executionResult,
  });

  assert.deepEqual(completion, { kind: "completed" });

  const state = await getJobState(jobId);

  assert.equal(state?.status, "completed");
  assert.equal(state?.leaseOwner, null);
  assert.deepEqual(state?.result, executionResult);

  assert.equal(await getAuditCount(jobId, "job.completed"), 1);
});

test("failJob persists error and clears lease", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  const failure = await failJob(pool, {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
    error: "Execution failed",
  });

  assert.deepEqual(failure, { kind: "failed" });

  const state = await getJobState(jobId);

  assert.equal(state?.status, "failed");
  assert.equal(state?.error, "Execution failed");
  assert.equal(state?.leaseOwner, null);

  assert.equal(await getAuditCount(jobId, "job.failed"), 1);
});

test("stale lease owner cannot complete a job", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  const completion = await completeJob(pool, {
    tenantId,
    jobId,
    leaseOwner: randomUUID(),
    attempt: claimed.attempts,
    result: { forged: true },
  });

  assert.deepEqual(completion, {
    kind: "lease_lost",
  });

  const state = await getJobState(jobId);

  assert.equal(state?.status, "running");
  assert.equal(await getAuditCount(jobId, "job.completed"), 0);
});

test("stale attempt cannot complete a job", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  const completion = await completeJob(pool, {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts + 1,
    result: { forged: true },
  });

  assert.deepEqual(completion, {
    kind: "lease_lost",
  });

  assert.equal((await getJobState(jobId))?.status, "running");
});

test("expired lease cannot complete a job", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  await pool.query(
    `UPDATE jobs
     SET lease_until = now() - interval '1 second'
     WHERE id = $1`,
    [jobId],
  );

  const completion = await completeJob(pool, {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
    result: { tooLate: true },
  });

  assert.deepEqual(completion, {
    kind: "lease_lost",
  });

  assert.equal((await getJobState(jobId))?.status, "running");
});

test("concurrent completion persists exactly one result", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  const params = {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
  };

  const results = await Promise.all([
    completeJob(pool, {
      ...params,
      result: { winner: "A" },
    }),
    completeJob(pool, {
      ...params,
      result: { winner: "B" },
    }),
  ]);

  assert.deepEqual(results.map((result) => result.kind).sort(), [
    "completed",
    "lease_lost",
  ]);

  assert.equal(await getAuditCount(jobId, "job.completed"), 1);
});

test("failed execution can be retried through E5-S3", async () => {
  const jobId = await createJobFixture();

  const claimed = await claimJob(pool, {
    workerId,
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, jobId);

  await failJob(pool, {
    tenantId,
    jobId,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
    error: "Transient error",
  });

  const { retryJob } = await import("./job.repository.js");

  const retry = await retryJob(pool, {
    tenantId,
    jobId,
    actor: createdBy,
  });

  assert.equal(retry.kind, "updated");
  assert.equal(retry.job?.status, "queued");
  assert.equal(retry.job?.attempts, 1);
});
