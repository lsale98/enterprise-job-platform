import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDatabasePool } from "../../connection/pool.js";
import { cancelJob, retryJob } from "./job.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const pool = createDatabasePool({ connectionString });

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const actor = `job-command-test-${randomUUID()}`;

let createdBy: string;
const jobIds: string[] = [];

async function createFixtureJob(
  status: "queued" | "running" | "completed" | "failed" | "cancelled",
  attempts = 0,
  maxAttempts = 3,
): Promise<string> {
  const jobId = randomUUID();
  jobIds.push(jobId);

  await pool.query(
    `INSERT INTO jobs (
      id, tenant_id, created_by, type, input,
      status, idempotency_key, request_hash,
      attempts, max_attempts, error
    )
    VALUES (
      $1, $2, $3, 'report', $4::jsonb,
      $5, $6, $7, $8, $9, $10
    )`,
    [
      jobId,
      tenantId,
      createdBy,
      JSON.stringify({ type: "report", numbers: [1, 2, 3] }),
      status,
      randomUUID(),
      randomUUID(),
      attempts,
      maxAttempts,
      status === "failed" ? "Previous failure" : null,
    ],
  );

  return jobId;
}

async function auditCount(jobId: string, action: string): Promise<number> {
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

before(async () => {
  const identity = await pool.query<{ subject: string }>(
    "SELECT subject FROM identities ORDER BY subject LIMIT 1",
  );

  const subject = identity.rows[0]?.subject;

  if (!subject) {
    throw new Error("Test requires a seeded identity");
  }

  createdBy = subject;

  await pool.query(
    `INSERT INTO tenants (id, name)
     VALUES ($1, $2), ($3, $4)`,
    [
      tenantId,
      "Job command integration tenant",
      otherTenantId,
      "Job command other tenant",
    ],
  );
});

after(async () => {
  try {
    await pool.query(
      `DELETE FROM audit_events
       WHERE tenant_id = ANY($1::uuid[])`,
      [[tenantId, otherTenantId]],
    );

    await pool.query(
      `DELETE FROM jobs
       WHERE id = ANY($1::uuid[])`,
      [jobIds],
    );

    await pool.query(
      `DELETE FROM tenants
       WHERE id = ANY($1::uuid[])`,
      [[tenantId, otherTenantId]],
    );
  } finally {
    await pool.end();
  }
});

test("retries a failed job with remaining attempts", async () => {
  const jobId = await createFixtureJob("failed", 1, 3);

  const result = await retryJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "updated");
  assert.equal(result.job?.status, "queued");
  assert.equal(result.job?.attempts, 1);
  assert.equal(await auditCount(jobId, "job.retried"), 1);

  const persisted = await pool.query<{
    status: string;
    error: string | null;
    leaseOwner: string | null;
  }>(
    `SELECT status, error, lease_owner AS "leaseOwner"
     FROM jobs
     WHERE id = $1`,
    [jobId],
  );

  assert.equal(persisted.rows[0]?.status, "queued");
  assert.equal(persisted.rows[0]?.error, null);
  assert.equal(persisted.rows[0]?.leaseOwner, null);
});

test("rejects retry when attempt budget is exhausted", async () => {
  const jobId = await createFixtureJob("failed", 3, 3);

  const result = await retryJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "conflict");
  assert.equal(await auditCount(jobId, "job.retried"), 0);
});

test("rejects retry of a queued job", async () => {
  const jobId = await createFixtureJob("queued");

  const result = await retryJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "conflict");
});

test("cancels a queued job", async () => {
  const jobId = await createFixtureJob("queued");

  const result = await cancelJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "updated");
  assert.equal(result.job?.status, "cancelled");
  assert.equal(await auditCount(jobId, "job.cancelled"), 1);
});

test("rejects cancellation of a running job", async () => {
  const jobId = await createFixtureJob("running");

  const result = await cancelJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "conflict");
  assert.equal(await auditCount(jobId, "job.cancelled"), 0);
});

test("returns not_found for unknown jobs", async () => {
  const jobId = randomUUID();

  const retry = await retryJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  const cancel = await cancelJob(pool, {
    tenantId,
    jobId,
    actor,
  });

  assert.equal(retry.kind, "not_found");
  assert.equal(cancel.kind, "not_found");
});

test("does not allow cross-tenant commands", async () => {
  const jobId = await createFixtureJob("failed", 1, 3);

  const result = await retryJob(pool, {
    tenantId: otherTenantId,
    jobId,
    actor,
  });

  assert.equal(result.kind, "not_found");
  assert.equal(await auditCount(jobId, "job.retried"), 0);
});

test("concurrent retry requests produce one transition", async () => {
  const jobId = await createFixtureJob("failed", 1, 3);

  const results = await Promise.all([
    retryJob(pool, { tenantId, jobId, actor }),
    retryJob(pool, { tenantId, jobId, actor }),
  ]);

  assert.deepEqual(results.map((result) => result.kind).sort(), [
    "conflict",
    "updated",
  ]);

  assert.equal(await auditCount(jobId, "job.retried"), 1);
});

test("concurrent cancellations produce one transition", async () => {
  const jobId = await createFixtureJob("queued");

  const results = await Promise.all([
    cancelJob(pool, { tenantId, jobId, actor }),
    cancelJob(pool, { tenantId, jobId, actor }),
  ]);

  assert.deepEqual(results.map((result) => result.kind).sort(), [
    "conflict",
    "updated",
  ]);

  assert.equal(await auditCount(jobId, "job.cancelled"), 1);
});

test("audit failure rolls back cancellation", async () => {
  const jobId = await createFixtureJob("queued");

  await assert.rejects(() =>
    cancelJob(pool, {
      tenantId,
      jobId,
      actor: null as unknown as string,
    }),
  );

  const persisted = await pool.query<{ status: string }>(
    "SELECT status FROM jobs WHERE id = $1",
    [jobId],
  );

  assert.equal(persisted.rows[0]?.status, "queued");
  assert.equal(await auditCount(jobId, "job.cancelled"), 0);
});

test("audit failure rolls back retry", async () => {
  const jobId = await createFixtureJob("failed", 1, 3);

  await assert.rejects(() =>
    retryJob(pool, {
      tenantId,
      jobId,
      actor: null as unknown as string,
    }),
  );

  const persisted = await pool.query<{
    status: string;
    error: string | null;
  }>("SELECT status, error FROM jobs WHERE id = $1", [jobId]);

  assert.equal(persisted.rows[0]?.status, "failed");
  assert.equal(persisted.rows[0]?.error, "Previous failure");
  assert.equal(await auditCount(jobId, "job.retried"), 0);
});
