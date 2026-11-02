import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { Pool } from "pg";

import { resetJobQueue } from "../../test-support/reset-job-queue.js";

import {
  claimJob,
  completeJob,
  heartbeatJob,
  recoverExhaustedJobs,
} from "./job.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = new Pool({ connectionString });

beforeEach(async () => {
  await resetJobQueue(pool);
});

const tenantA = randomUUID();
const tenantB = randomUUID();

let createdBy: string;

async function createJob(
  tenantId: string,
  options: {
    status?: "queued" | "running";
    attempts?: number;
    maxAttempts?: number;
    expired?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO jobs (
      id, tenant_id, created_by, type, input,
      status, idempotency_key, request_hash,
      attempts, max_attempts, lease_owner, lease_until
    )
    VALUES (
      $1, $2, $3, 'report', $4::jsonb,
      $5, $6, $7, $8, $9, $10, $11
    )`,
    [
      id,
      tenantId,
      createdBy,
      JSON.stringify({
        type: "report",
        numbers: [1, 2, 3],
      }),
      options.status ?? "queued",
      randomUUID(),
      randomUUID(),
      options.attempts ?? 0,
      options.maxAttempts ?? 3,
      options.status === "running" ? randomUUID() : null,
      options.status === "running"
        ? options.expired
          ? new Date(Date.now() - 60_000)
          : new Date(Date.now() + 60_000)
        : null,
    ],
  );

  return id;
}

before(async () => {
  const identity = await pool.query<{ subject: string }>(
    "SELECT subject FROM identities LIMIT 1",
  );

  if (!identity.rows[0]) {
    throw new Error("Seeded test identity required");
  }

  createdBy = identity.rows[0].subject;

  await pool.query(
    `INSERT INTO tenants (id, name)
     VALUES ($1, 'Worker Tenant A'),
            ($2, 'Worker Tenant B')`,
    [tenantA, tenantB],
  );
});

after(async () => {
  try {
    await pool.query(
      "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])",
      [[tenantA, tenantB]],
    );

    await pool.query("DELETE FROM jobs WHERE tenant_id = ANY($1::uuid[])", [
      [tenantA, tenantB],
    ]);

    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
      [tenantA, tenantB],
    ]);
  } finally {
    await pool.end();
  }
});

test("claims jobs belonging to different tenants", async () => {
  const firstId = await createJob(tenantA);
  const secondId = await createJob(tenantB);

  const first = await claimJob(pool, {
    workerId: "worker-A",
    leaseSeconds: 60,
  });

  const second = await claimJob(pool, {
    workerId: "worker-B",
    leaseSeconds: 60,
  });

  assert.ok(first);
  assert.ok(second);

  assert.deepEqual(
    new Set([first.id, second.id]),
    new Set([firstId, secondId]),
  );

  assert.deepEqual(
    new Set([first.tenantId, second.tenantId]),
    new Set([tenantA, tenantB]),
  );

  assert.notEqual(first.leaseOwner, second.leaseOwner);
});

test("concurrent workers cannot claim the same job", async () => {
  const id = await createJob(tenantA);

  const [first, second] = await Promise.all([
    claimJob(pool, {
      workerId: "worker-A",
      leaseSeconds: 60,
    }),
    claimJob(pool, {
      workerId: "worker-B",
      leaseSeconds: 60,
    }),
  ]);

  const claimed = [first, second].filter((job) => job?.id === id);

  assert.equal(claimed.length, 1);
});

test("heartbeat extends an active lease", async () => {
  const id = await createJob(tenantA);

  const claimed = await claimJob(pool, {
    workerId: "worker-A",
    leaseSeconds: 30,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, id);

  const response = await heartbeatJob(pool, {
    tenantId: claimed.tenantId,
    jobId: claimed.id,
    leaseOwner: claimed.leaseOwner,
    attempt: claimed.attempts,
    leaseSeconds: 60,
  });

  assert.equal(response.kind, "extended");
});

test("expired jobs are reclaimed with a new lease", async () => {
  const id = await createJob(tenantB, {
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    expired: true,
  });

  const claimed = await claimJob(pool, {
    workerId: "recovery-worker",
    leaseSeconds: 60,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, id);
  assert.equal(claimed.attempts, 2);
});

test("exhausted jobs become failed after lease expiry", async () => {
  const id = await createJob(tenantA, {
    status: "running",
    attempts: 3,
    maxAttempts: 3,
    expired: true,
  });

  const count = await recoverExhaustedJobs(pool);

  assert.ok(count >= 1);

  const result = await pool.query<{ status: string }>(
    "SELECT status FROM jobs WHERE id = $1",
    [id],
  );

  assert.equal(result.rows[0]?.status, "failed");
});

test("stale lease cannot commit completion", async () => {
  const id = await createJob(tenantB);

  const claimed = await claimJob(pool, {
    workerId: "worker-A",
    leaseSeconds: 60,
  });

  assert.ok(claimed);
  assert.equal(claimed.id, id);

  const result = await completeJob(pool, {
    tenantId: claimed.tenantId,
    jobId: claimed.id,
    leaseOwner: randomUUID(),
    attempt: claimed.attempts,
    result: { forged: true },
  });

  assert.equal(result.kind, "lease_lost");
});
