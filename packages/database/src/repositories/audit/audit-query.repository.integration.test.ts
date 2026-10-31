import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDatabasePool } from "../../connection/pool.js";
import { listJobAuditEvents } from "./audit-query.repository.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const pool = createDatabasePool({ connectionString });

const tenantA = randomUUID();
const tenantB = randomUUID();

const jobA = randomUUID();
const jobB = randomUUID();

const actor = `audit-query-test-${randomUUID()}`;

async function insertTestJob(
  tenantId: string,
  jobId: string,
  createdBy: string,
): Promise<void> {
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
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      jobId,
      tenantId,
      createdBy,
      "report",
      JSON.stringify({
        type: "report",
        numbers: [1, 2, 3],
      }),
      randomUUID(),
      randomUUID(),
    ],
  );
}

async function insertAuditEventForTest(
  tenantId: string,
  jobId: string,
  action: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events (
      tenant_id,
      actor,
      action,
      resource_id
    )
    VALUES ($1, $2, $3, $4)`,
    [tenantId, actor, action, jobId],
  );
}

const identityResult = await pool.query<{ subject: string }>(
  `SELECT subject
   FROM identities
   ORDER BY subject
   LIMIT 1`,
);

const identity = identityResult.rows[0];

if (!identity) {
  throw new Error(
    "Integration test requires at least one identity in the database",
  );
}

const createdBy = identity.subject;

before(async () => {
  await pool.query(
    `INSERT INTO tenants (id, name)
     VALUES ($1, $2), ($3, $4)`,
    [
      tenantA,
      "Audit query test tenant A",
      tenantB,
      "Audit query test tenant B",
    ],
  );

  await insertTestJob(tenantA, jobA, createdBy);
  await insertTestJob(tenantB, jobB, createdBy);
});

after(async () => {
  try {
    await pool.query(
      `DELETE FROM audit_events
       WHERE actor = $1`,
      [actor],
    );

    await pool.query(
      `DELETE FROM jobs
       WHERE id = ANY($1::uuid[])`,
      [[jobA, jobB]],
    );

    await pool.query(
      `DELETE FROM tenants
       WHERE id = ANY($1::uuid[])`,
      [[tenantA, tenantB]],
    );
  } finally {
    await pool.end();
  }
});

test("returns audit events belonging to a job", async () => {
  await insertAuditEventForTest(tenantA, jobA, "job.created");

  const events = await listJobAuditEvents(pool, {
    tenantId: tenantA,
    jobId: jobA,
  });

  assert.equal(events.length, 1);

  const event = events[0]!;

  assert.equal(event.action, "job.created");
  assert.equal(event.tenantId, tenantA);
  assert.equal(event.resourceId, jobA);
  assert.equal(event.actor, actor);
  assert.ok(!Number.isNaN(Date.parse(event.createdAt)));
});

test("does not expose events from another tenant", async () => {
  await insertAuditEventForTest(tenantB, jobB, "job.created");

  const events = await listJobAuditEvents(pool, {
    tenantId: tenantA,
    jobId: jobB,
  });

  assert.deepEqual(events, []);
});

test("returns an empty list for nonexistent jobs", async () => {
  const events = await listJobAuditEvents(pool, {
    tenantId: tenantA,
    jobId: randomUUID(),
  });

  assert.deepEqual(events, []);
});

test("rejects invalid limits", async () => {
  for (const limit of [0, -1, 101, 1.5, Number.NaN]) {
    await assert.rejects(
      () =>
        listJobAuditEvents(pool, {
          tenantId: tenantA,
          jobId: jobA,
          limit,
        }),
      RangeError,
    );
  }
});

test("returns a limited number of events", async () => {
  await insertAuditEventForTest(tenantA, jobA, "job.integration-test");

  const events = await listJobAuditEvents(pool, {
    tenantId: tenantA,
    jobId: jobA,
    limit: 1,
  });

  assert.equal(events.length, 1);
});

test("returns audit events in chronological order", async () => {
  const events = await listJobAuditEvents(pool, {
    tenantId: tenantA,
    jobId: jobA,
  });

  assert.ok(events.length >= 2);

  for (let i = 1; i < events.length; i++) {
    const previous = events[i - 1]!;
    const current = events[i]!;

    const previousTimestamp = Date.parse(previous.createdAt);
    const currentTimestamp = Date.parse(current.createdAt);

    assert.ok(previousTimestamp <= currentTimestamp);

    if (previousTimestamp === currentTimestamp) {
      assert.ok(BigInt(previous.id) < BigInt(current.id));
    }
  }
});
