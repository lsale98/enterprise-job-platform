import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Pool } from "pg";

import {
  completeJob,
  failJob,
  recoverExhaustedJobs,
} from "../job/job.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = new Pool({
  connectionString,
  max: 3,
});

interface Fixture {
  tenantId: string;
  subject: string;
  jobId: string;
  endpointId: string | null;
  leaseOwner: string;
}

interface CreateFixtureOptions {
  withEndpoint?: boolean;
  attempts?: number;
  maxAttempts?: number;
  leaseExpired?: boolean;
}

interface JobState {
  status: string;
  attempts: number;
  lease_owner: string | null;
  lease_until: Date | null;
}

interface WebhookEvent {
  id: string;
  tenant_id: string;
  endpoint_id: string;
  job_id: string;
  event_type: string;
  status: string;
  payload: {
    id: string;
    type: string;
    tenantId: string;
    data: {
      jobId: string;
      status: string;
    };
  };
}

async function assertTestDatabase(): Promise<void> {
  const result = await pool.query<{
    database: string;
  }>("SELECT current_database() AS database");

  assert.equal(
    result.rows[0]?.database,
    "lab_test",
    "Integration tests must only run against lab_test",
  );
}

async function createFixture(
  options: CreateFixtureOptions = {},
): Promise<Fixture> {
  await assertTestDatabase();

  const tenantId = randomUUID();
  const subject = `webhook-lifecycle-${randomUUID()}`;
  const jobId = randomUUID();
  const leaseOwner = `test-worker-${randomUUID()}`;

  const attempts = options.attempts ?? 1;
  const maxAttempts = options.maxAttempts ?? 3;
  const withEndpoint = options.withEndpoint ?? true;

  const endpointId = withEndpoint ? randomUUID() : null;

  await pool.query(
    `
      INSERT INTO tenants (id, name)
      VALUES ($1, $2)
    `,
    [tenantId, `Webhook lifecycle ${tenantId}`],
  );

  await pool.query(
    `
      INSERT INTO identities (subject, email)
      VALUES ($1, $2)
    `,
    [subject, `${randomUUID()}@example.test`],
  );

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
        'running',
        $5,
        $6,
        $7,
        $8,
        $9,
        CASE
          WHEN $10::boolean
            THEN clock_timestamp() - interval '1 minute'
          ELSE clock_timestamp() + interval '5 minutes'
        END
      )
    `,
    [
      jobId,
      tenantId,
      subject,
      JSON.stringify({ numbers: [1, 2, 3] }),
      randomUUID(),
      randomUUID(),
      attempts,
      maxAttempts,
      leaseOwner,
      options.leaseExpired ?? false,
    ],
  );

  if (endpointId) {
    await pool.query(
      `
        INSERT INTO webhook_endpoints (
          id,
          tenant_id,
          url,
          signing_secret_ref
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        endpointId,
        tenantId,
        "https://webhook.example.test/events",
        `test/secrets/${endpointId}`,
      ],
    );
  }

  return {
    tenantId,
    subject,
    jobId,
    endpointId,
    leaseOwner,
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        DELETE FROM webhook_outbox
        WHERE job_id = $1
      `,
      [fixture.jobId],
    );

    await client.query(
      `
        DELETE FROM audit_events
        WHERE tenant_id = $1
      `,
      [fixture.tenantId],
    );

    await client.query(
      `
        DELETE FROM webhook_endpoints
        WHERE tenant_id = $1
      `,
      [fixture.tenantId],
    );

    await client.query(
      `
        DELETE FROM jobs
        WHERE id = $1
          AND tenant_id = $2
      `,
      [fixture.jobId, fixture.tenantId],
    );

    await client.query(
      `
        DELETE FROM identities
        WHERE subject = $1
      `,
      [fixture.subject],
    );

    await client.query(
      `
        DELETE FROM tenants
        WHERE id = $1
      `,
      [fixture.tenantId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getJobState(fixture: Fixture): Promise<JobState> {
  const result = await pool.query<JobState>(
    `
      SELECT
        status,
        attempts,
        lease_owner,
        lease_until
      FROM jobs
      WHERE id = $1
        AND tenant_id = $2
    `,
    [fixture.jobId, fixture.tenantId],
  );

  assert.equal(result.rowCount, 1);

  return result.rows[0]!;
}

async function getEvents(fixture: Fixture): Promise<WebhookEvent[]> {
  const result = await pool.query<WebhookEvent>(
    `
      SELECT
        id,
        tenant_id,
        endpoint_id,
        job_id,
        event_type,
        status,
        payload
      FROM webhook_outbox
      WHERE job_id = $1
        AND tenant_id = $2
      ORDER BY created_at, id
    `,
    [fixture.jobId, fixture.tenantId],
  );

  return result.rows;
}

async function getAuditCount(
  fixture: Fixture,
  action: string,
): Promise<number> {
  const result = await pool.query<{
    count: string;
  }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_events
      WHERE tenant_id = $1
        AND resource_id = $2
        AND action = $3
    `,
    [fixture.tenantId, fixture.jobId, action],
  );

  return Number(result.rows[0]?.count ?? 0);
}

function assertWebhook(
  event: WebhookEvent,
  fixture: Fixture,
  type: "job.completed" | "job.failed",
): void {
  assert.equal(event.tenant_id, fixture.tenantId);
  assert.equal(event.endpoint_id, fixture.endpointId);
  assert.equal(event.job_id, fixture.jobId);
  assert.equal(event.event_type, type);
  assert.equal(event.status, "pending");

  assert.equal(event.payload.type, type);
  assert.equal(event.payload.tenantId, fixture.tenantId);
  assert.equal(event.payload.data.jobId, fixture.jobId);

  assert.equal(
    event.payload.data.status,
    type === "job.completed" ? "completed" : "failed",
  );

  assert.match(
    event.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
}

test("completeJob atomically persists completion, audit and webhook", async () => {
  const fixture = await createFixture();

  try {
    const result = await completeJob(pool, {
      tenantId: fixture.tenantId,
      jobId: fixture.jobId,
      leaseOwner: fixture.leaseOwner,
      attempt: 1,
      result: {
        count: 3,
        sum: 6,
        average: 2,
      },
    });

    assert.equal(result.kind, "completed");

    const job = await getJobState(fixture);

    assert.equal(job.status, "completed");
    assert.equal(job.lease_owner, null);
    assert.equal(job.lease_until, null);

    const events = await getEvents(fixture);

    assert.equal(events.length, 1);

    assertWebhook(events[0]!, fixture, "job.completed");

    assert.equal(await getAuditCount(fixture, "job.completed"), 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("completeJob rejects stale ownership without persisting events", async () => {
  const fixture = await createFixture();

  try {
    const result = await completeJob(pool, {
      tenantId: fixture.tenantId,
      jobId: fixture.jobId,
      leaseOwner: "wrong-lease-owner",
      attempt: 1,
      result: {
        count: 3,
        sum: 6,
        average: 2,
      },
    });

    assert.equal(result.kind, "lease_lost");

    const job = await getJobState(fixture);

    assert.equal(job.status, "running");
    assert.equal(job.lease_owner, fixture.leaseOwner);

    assert.equal((await getEvents(fixture)).length, 0);

    assert.equal(await getAuditCount(fixture, "job.completed"), 0);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("failJob atomically persists terminal failure, audit and webhook", async () => {
  const fixture = await createFixture();

  try {
    const result = await failJob(pool, {
      tenantId: fixture.tenantId,
      jobId: fixture.jobId,
      leaseOwner: fixture.leaseOwner,
      attempt: 1,
      error: "Report execution failed",
    });

    assert.equal(result.kind, "failed");

    const job = await getJobState(fixture);

    assert.equal(job.status, "failed");
    assert.equal(job.lease_owner, null);
    assert.equal(job.lease_until, null);

    const events = await getEvents(fixture);

    assert.equal(events.length, 1);

    assertWebhook(events[0]!, fixture, "job.failed");

    assert.equal(await getAuditCount(fixture, "job.failed"), 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("failJob rejects stale ownership without persisting events", async () => {
  const fixture = await createFixture();

  try {
    const result = await failJob(pool, {
      tenantId: fixture.tenantId,
      jobId: fixture.jobId,
      leaseOwner: "wrong-lease-owner",
      attempt: 1,
      error: "Should not persist",
    });

    assert.equal(result.kind, "lease_lost");

    assert.equal((await getJobState(fixture)).status, "running");

    assert.equal((await getEvents(fixture)).length, 0);

    assert.equal(await getAuditCount(fixture, "job.failed"), 0);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("recoverExhaustedJobs atomically persists terminal failure and webhook", async () => {
  const fixture = await createFixture({
    attempts: 3,
    maxAttempts: 3,
    leaseExpired: true,
  });

  try {
    const recovered = await recoverExhaustedJobs(pool, 100);

    assert.ok(recovered >= 1, "Recovery must process the exhausted fixture");

    const job = await getJobState(fixture);

    assert.equal(job.status, "failed");
    assert.equal(job.attempts, 3);
    assert.equal(job.lease_owner, null);
    assert.equal(job.lease_until, null);

    const events = await getEvents(fixture);

    assert.equal(events.length, 1);

    assertWebhook(events[0]!, fixture, "job.failed");

    assert.equal(await getAuditCount(fixture, "job.failed"), 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("job completion succeeds without configured webhook endpoints", async () => {
  const fixture = await createFixture({
    withEndpoint: false,
  });

  try {
    const result = await completeJob(pool, {
      tenantId: fixture.tenantId,
      jobId: fixture.jobId,
      leaseOwner: fixture.leaseOwner,
      attempt: 1,
      result: {
        count: 3,
        sum: 6,
        average: 2,
      },
    });

    assert.equal(result.kind, "completed");

    assert.equal((await getJobState(fixture)).status, "completed");

    assert.equal((await getEvents(fixture)).length, 0);

    assert.equal(await getAuditCount(fixture, "job.completed"), 1);
  } finally {
    await cleanupFixture(fixture);
  }
});
