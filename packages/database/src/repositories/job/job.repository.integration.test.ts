import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  createJobIdempotently,
  IdempotencyConflictError,
} from "./job.repository.js";

import { createDatabasePool } from "../../connection/pool.js";
import { transaction } from "../../connection/transaction.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set for integration tests");
}

const pool = createDatabasePool({ connectionString });

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";

const keys = new Set<string>();

function newKey(): string {
  const key = `test_${randomUUID().replaceAll("-", "")}`;
  keys.add(key);
  return key;
}

const report = {
  type: "report" as const,
  numbers: [1, 2, 3],
};

interface AuditEvent {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  resourceId: string;
  createdAt: Date;
}

async function findJobAuditEvents(jobId: string): Promise<AuditEvent[]> {
  const result = await pool.query<AuditEvent>(
    `SELECT
      id::text,
      tenant_id AS "tenantId",
      actor,
      action,
      resource_id AS "resourceId",
      created_at AS "createdAt"
    FROM audit_events
    WHERE resource_id = $1
      AND action = 'job.created'
    ORDER BY created_at ASC, id ASC`,
    [jobId],
  );

  return result.rows;
}

async function expectSingleCreationAudit(
  jobId: string,
  tenantId: string,
  actor: string,
): Promise<void> {
  const events = await findJobAuditEvents(jobId);

  assert.equal(events.length, 1);

  const event = events[0];

  assert.ok(event);
  assert.equal(event.tenantId, tenantId);
  assert.equal(event.actor, actor);
  assert.equal(event.action, "job.created");
  assert.equal(event.resourceId, jobId);
  assert.ok(event.createdAt instanceof Date);
  assert.ok(!Number.isNaN(event.createdAt.getTime()));
}

after(async () => {
  try {
    if (keys.size > 0) {
      await transaction(pool, async (client) => {
        // Delete only audit events belonging to jobs created
        // by this test suite.
        await client.query(
          `DELETE FROM audit_events
           WHERE action = 'job.created'
             AND EXISTS (
               SELECT 1
               FROM jobs
               WHERE jobs.id::text = audit_events.resource_id
                 AND jobs.tenant_id = audit_events.tenant_id
                 AND jobs.idempotency_key = ANY($1::text[])
             )`,
          [[...keys]],
        );

        await client.query(
          `DELETE FROM jobs
           WHERE idempotency_key = ANY($1::text[])`,
          [[...keys]],
        );
      });
    }
  } finally {
    await pool.end();
  }
});

test("creates a new job with an audit event", async () => {
  const result = await createJobIdempotently(pool, {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey: newKey(),
    input: report,
  });

  assert.equal(result.kind, "created");
  assert.equal(result.job.status, "queued");
  assert.deepEqual(result.job.input, report);

  await expectSingleCreationAudit(result.job.id, tenantA, alice);
});

test("same key and payload return the existing job without duplicate audit", async () => {
  const params = {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey: newKey(),
    input: report,
  };

  const first = await createJobIdempotently(pool, params);
  const second = await createJobIdempotently(pool, params);

  assert.equal(first.kind, "created");
  assert.equal(second.kind, "replayed");
  assert.equal(first.job.id, second.job.id);

  await expectSingleCreationAudit(first.job.id, tenantA, alice);
});

test("same key with different payload is rejected without duplicate audit", async () => {
  const idempotencyKey = newKey();

  const created = await createJobIdempotently(pool, {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey,
    input: report,
  });

  await assert.rejects(
    () =>
      createJobIdempotently(pool, {
        tenantId: tenantA,
        createdBy: alice,
        idempotencyKey,
        input: {
          type: "report",
          numbers: [99],
        },
      }),
    IdempotencyConflictError,
  );

  await expectSingleCreationAudit(created.job.id, tenantA, alice);
});

test("same key with different actor is rejected without duplicate audit", async () => {
  const idempotencyKey = newKey();

  const created = await createJobIdempotently(pool, {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey,
    input: report,
  });

  await assert.rejects(
    () =>
      createJobIdempotently(pool, {
        tenantId: tenantA,
        createdBy: bob,
        idempotencyKey,
        input: report,
      }),
    IdempotencyConflictError,
  );

  await expectSingleCreationAudit(created.job.id, tenantA, alice);
});

test("the same key can be used by different tenants with isolated audit events", async () => {
  const idempotencyKey = newKey();

  const a = await createJobIdempotently(pool, {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey,
    input: report,
  });

  const b = await createJobIdempotently(pool, {
    tenantId: tenantB,
    createdBy: carol,
    idempotencyKey,
    input: report,
  });

  assert.equal(a.kind, "created");
  assert.equal(b.kind, "created");
  assert.notEqual(a.job.id, b.job.id);

  await expectSingleCreationAudit(a.job.id, tenantA, alice);
  await expectSingleCreationAudit(b.job.id, tenantB, carol);
});

test("concurrent identical requests create exactly one job and audit event", async () => {
  const idempotencyKey = newKey();

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      createJobIdempotently(pool, {
        tenantId: tenantA,
        createdBy: alice,
        idempotencyKey,
        input: report,
      }),
    ),
  );

  assert.equal(results.filter((result) => result.kind === "created").length, 1);

  assert.equal(
    results.filter((result) => result.kind === "replayed").length,
    7,
  );

  assert.equal(new Set(results.map((result) => result.job.id)).size, 1);

  const jobId = results[0]?.job.id;

  assert.ok(jobId);

  const stored = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantA, idempotencyKey],
  );

  assert.equal(Number(stored.rows[0]?.count), 1);

  await expectSingleCreationAudit(jobId, tenantA, alice);
});

test("audit persistence failure rolls back job creation", async () => {
  const idempotencyKey = newKey();

  const params = {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey,
    input: report,
  };

  // Simulate an audit persistence failure after the job INSERT.
  await assert.rejects(
    () =>
      createJobIdempotently(pool, params, {
        insertAuditEvent: async () => {
          throw new Error("Simulated audit persistence failure");
        },
      }),
    /Simulated audit persistence failure/,
  );

  // The job INSERT must have been rolled back.
  const stored = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE tenant_id = $1
       AND idempotency_key = $2`,
    [tenantA, idempotencyKey],
  );

  assert.equal(Number(stored.rows[0]?.count), 0);

  // The same idempotency key must remain usable after rollback.
  const retry = await createJobIdempotently(pool, params);

  assert.equal(retry.kind, "created");

  // The successful retry must create exactly one audit event.
  await expectSingleCreationAudit(retry.job.id, tenantA, alice);
});
