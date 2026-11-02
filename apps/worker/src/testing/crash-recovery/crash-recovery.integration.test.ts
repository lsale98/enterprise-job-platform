import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { completeJob } from "@lab/database/job-repository";

import {
  assertTestDatabase,
  expireJobLease,
  getJobState,
  waitForJobState,
} from "./job-state.js";

import {
  startWorkerProcess,
  type StartedWorkerProcess,
} from "./worker-process.js";

function getTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for crash recovery tests");
  }

  if (new URL(value).pathname !== "/lab_test") {
    throw new Error("Crash recovery tests require the lab_test database");
  }

  return value;
}

const databaseUrl = getTestDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
  max: 3,
});

const tenantId = randomUUID();

const processes = new Set<StartedWorkerProcess>();

let createdBy: string;

function startWorker(mode: "normal" | "crash"): StartedWorkerProcess {
  const worker = startWorkerProcess({
    databaseUrl,
    mode,
  });

  processes.add(worker);

  return worker;
}

async function stopWorker(worker: StartedWorkerProcess): Promise<void> {
  try {
    await worker.kill();
  } finally {
    processes.delete(worker);
  }
}

async function createReportJob(): Promise<string> {
  const jobId = randomUUID();

  await pool.query(
    `
      INSERT INTO jobs (
        id,
        tenant_id,
        created_by,
        type,
        input,
        status,
        idempotency_key,
        request_hash,
        attempts,
        max_attempts,
        lease_owner,
        lease_until
      )
      VALUES (
        $1,
        $2,
        $3,
        'report',
        $4::jsonb,
        'queued',
        $5,
        $6,
        0,
        3,
        NULL,
        NULL
      )
    `,
    [
      jobId,
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

  return jobId;
}

before(async () => {
  await assertTestDatabase(pool);

  const identity = await pool.query<{ subject: string }>(
    "SELECT subject FROM identities LIMIT 1",
  );

  if (!identity.rows[0]) {
    throw new Error("A seeded test identity is required");
  }

  createdBy = identity.rows[0].subject;

  await pool.query(
    `
      INSERT INTO tenants (id, name)
      VALUES ($1, 'E6-S2 Crash Recovery Tenant')
    `,
    [tenantId],
  );
});

after(async () => {
  try {
    await Promise.allSettled([...processes].map((worker) => worker.kill()));

    await assertTestDatabase(pool);

    await pool.query("DELETE FROM audit_events WHERE tenant_id = $1", [
      tenantId,
    ]);

    await pool.query("DELETE FROM jobs WHERE tenant_id = $1", [tenantId]);

    await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  } finally {
    await pool.end();
  }
});

test(
  "recovers a job after worker crash and rejects stale ownership",
  { timeout: 45_000 },
  async () => {
    const jobId = await createReportJob();

    // Phase 1: Worker A claims the job but never executes it.

    const workerA = startWorker("crash");

    await workerA.waitForStart();
    await workerA.waitForClaim(jobId);

    const firstAttempt = await waitForJobState(
      pool,
      jobId,
      (state) =>
        state.status === "running" &&
        state.attempts === 1 &&
        state.leaseOwner !== null,
    );

    assert.equal(firstAttempt.tenantId, tenantId);
    assert.equal(firstAttempt.attempts, 1);
    assert.ok(firstAttempt.leaseOwner);
    assert.ok(firstAttempt.leaseUntil);

    const originalLeaseOwner = firstAttempt.leaseOwner;

    // Phase 2: Simulate an unexpected process crash.

    await stopWorker(workerA);

    const afterCrash = await getJobState(pool, jobId);

    assert.equal(afterCrash?.status, "running");
    assert.equal(afterCrash?.attempts, 1);
    assert.equal(afterCrash?.leaseOwner, originalLeaseOwner);

    // Phase 3: Expire the abandoned lease.

    await expireJobLease(pool, {
      jobId,
      leaseOwner: originalLeaseOwner,
      attempts: firstAttempt.attempts,
    });

    const expired = await getJobState(pool, jobId);

    assert.equal(expired?.status, "running");
    assert.equal(expired?.attempts, 1);

    // Phase 4: The old attempt cannot persist a result.

    const staleBeforeRecovery = await completeJob(pool, {
      tenantId,
      jobId,
      leaseOwner: originalLeaseOwner,
      attempt: 1,
      result: { forged: true },
    });

    assert.equal(staleBeforeRecovery.kind, "lease_lost");

    // Phase 5: Start a real worker to reclaim the job.

    const workerB = startWorker("normal");

    await workerB.waitForStart();

    const completed = await waitForJobState(
      pool,
      jobId,
      (state) => state.status === "completed",
      {
        timeoutMs: 20_000,
        pollMs: 50,
      },
    );

    assert.equal(completed.tenantId, tenantId);
    assert.equal(completed.status, "completed");

    // Reclaiming must consume exactly one additional attempt.
    assert.equal(completed.attempts, 2);
    assert.equal(completed.maxAttempts, 3);

    // Completion must release the active lease.
    assert.equal(completed.leaseOwner, null);
    assert.equal(completed.leaseUntil, null);

    // Verify that the real report executor ran.
    assert.deepEqual(completed.result, {
      count: 3,
      sum: 6,
      average: 2,
    });

    assert.equal(completed.error, null);

    // Phase 6: Original ownership must remain invalid.

    const staleAfterRecovery = await completeJob(pool, {
      tenantId,
      jobId,
      leaseOwner: originalLeaseOwner,
      attempt: 1,
      result: { forged: true },
    });

    assert.equal(staleAfterRecovery.kind, "lease_lost");

    const finalState = await getJobState(pool, jobId);

    assert.equal(finalState?.status, "completed");
    assert.equal(finalState?.attempts, 2);

    assert.deepEqual(finalState?.result, {
      count: 3,
      sum: 6,
      average: 2,
    });

    // Check that the completed execution produced audit data.
    const audit = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    assert.ok(
      Number(audit.rows[0]?.count ?? 0) >= 1,
      "Expected an audit event for recovered job execution",
    );

    await stopWorker(workerB);
  },
);
