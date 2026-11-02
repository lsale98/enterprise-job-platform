import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { enqueueWebhookEvents } from "./webhook.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = new Pool({ connectionString });

const tenantA = randomUUID();
const tenantB = randomUUID();
const subject = `webhook-test-${randomUUID()}`;
const jobId = randomUUID();

const endpointA = randomUUID();
const endpointA2 = randomUUID();
const endpointB = randomUUID();

before(async () => {
  const database = await pool.query<{
    current_database: string;
  }>("SELECT current_database()");

  assert.equal(
    database.rows[0]?.current_database,
    "lab_test",
    "Integration tests must use lab_test",
  );

  await pool.query(
    `
      INSERT INTO tenants (id, name)
      VALUES
        ($1, 'Webhook test tenant A'),
        ($2, 'Webhook test tenant B')
    `,
    [tenantA, tenantB],
  );

  await pool.query(
    `
      INSERT INTO identities (subject, email)
      VALUES ($1, 'webhook-test@example.test')
    `,
    [subject],
  );

  await pool.query(
    `
      INSERT INTO jobs (
        id,
        tenant_id,
        created_by,
        type,
        input,
        idempotency_key,
        request_hash
      )
      VALUES (
        $1, $2, $3,
        'report',
        $4::jsonb,
        $5, $6
      )
    `,
    [
      jobId,
      tenantA,
      subject,
      JSON.stringify({ numbers: [1, 2, 3] }),
      randomUUID(),
      randomUUID(),
    ],
  );

  await pool.query(
    `
      INSERT INTO webhook_endpoints (
        id,
        tenant_id,
        url,
        signing_secret_ref
      )
      VALUES
        ($1, $4, 'https://a.example.test/webhook', 'test/secret/a'),
        ($2, $4, 'https://a2.example.test/webhook', 'test/secret/a2'),
        ($3, $5, 'https://b.example.test/webhook', 'test/secret/b')
    `,
    [endpointA, endpointA2, endpointB, tenantA, tenantB],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM webhook_outbox WHERE job_id = $1`, [jobId]);

    await pool.query(
      `
        DELETE FROM webhook_endpoints
        WHERE id = ANY($1::uuid[])
      `,
      [[endpointA, endpointA2, endpointB]],
    );

    await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);

    await pool.query(
      `
        DELETE FROM identities WHERE subject = $1
      `,
      [subject],
    );

    await pool.query(
      `
        DELETE FROM tenants
        WHERE id = ANY($1::uuid[])
      `,
      [[tenantA, tenantB]],
    );
  } finally {
    await pool.end();
  }
});

test("rollback removes both job transition and webhook events", async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
          UPDATE jobs
          SET status = 'completed',
              updated_at = now()
          WHERE id = $1
        `,
      [jobId],
    );

    const result = await enqueueWebhookEvents(client, {
      tenantId: tenantA,
      jobId,
      eventType: "job.completed",
    });

    assert.equal(result.inserted, 2);

    const insideTransaction = await client.query<{
      status: string;
    }>(`SELECT status FROM jobs WHERE id = $1`, [jobId]);

    assert.equal(insideTransaction.rows[0]?.status, "completed");

    await client.query("ROLLBACK");

    const job = await pool.query<{
      status: string;
    }>(`SELECT status FROM jobs WHERE id = $1`, [jobId]);

    assert.equal(job.rows[0]?.status, "queued");

    const events = await pool.query<{
      count: string;
    }>(
      `
          SELECT COUNT(*)::text AS count
          FROM webhook_outbox
          WHERE job_id = $1
        `,
      [jobId],
    );

    assert.equal(events.rows[0]?.count, "0");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test("commit persists the transition and tenant-scoped events", async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
          UPDATE jobs
          SET status = 'completed',
              updated_at = now()
          WHERE id = $1
        `,
      [jobId],
    );

    const result = await enqueueWebhookEvents(client, {
      tenantId: tenantA,
      jobId,
      eventType: "job.completed",
    });

    assert.equal(result.inserted, 2);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const job = await pool.query<{
    status: string;
  }>(`SELECT status FROM jobs WHERE id = $1`, [jobId]);

  assert.equal(job.rows[0]?.status, "completed");

  const events = await pool.query<{
    id: string;
    tenant_id: string;
    endpoint_id: string;
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
  }>(
    `
        SELECT
          id,
          tenant_id,
          endpoint_id,
          event_type,
          status,
          payload
        FROM webhook_outbox
        WHERE job_id = $1
        ORDER BY endpoint_id
      `,
    [jobId],
  );

  assert.equal(events.rows.length, 2);

  const endpointIds = events.rows.map((event) => event.endpoint_id);

  assert.deepEqual(endpointIds.sort(), [endpointA, endpointA2].sort());

  for (const event of events.rows) {
    assert.equal(event.tenant_id, tenantA);
    assert.equal(event.event_type, "job.completed");
    assert.equal(event.status, "pending");
    assert.equal(event.payload.type, "job.completed");
    assert.equal(event.payload.tenantId, tenantA);
    assert.equal(event.payload.data.jobId, jobId);
    assert.equal(event.payload.data.status, "completed");

    assert.match(event.payload.id, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/);
  }
});

test("repeated enqueue does not create duplicate events", async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await enqueueWebhookEvents(client, {
      tenantId: tenantA,
      jobId,
      eventType: "job.completed",
    });

    assert.equal(result.inserted, 0);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const events = await pool.query<{
    count: string;
  }>(
    `
        SELECT COUNT(*)::text AS count
        FROM webhook_outbox
        WHERE job_id = $1
          AND event_type = 'job.completed'
      `,
    [jobId],
  );

  assert.equal(events.rows[0]?.count, "2");
});

test("rejects an outbox endpoint belonging to another tenant", async () => {
  await assert.rejects(
    pool.query(
      `
          INSERT INTO webhook_outbox (
            tenant_id,
            endpoint_id,
            job_id,
            event_type,
            payload
          )
          VALUES (
            $1,
            $2,
            $3,
            'job.completed',
            '{}'::jsonb
          )
        `,
      [tenantA, endpointB, jobId],
    ),
    (error: unknown) => {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23503"
      );
    },
  );
});
