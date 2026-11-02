import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import {
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery,
  recoverWebhookDeliveries,
} from "./webhook.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = new Pool({ connectionString });

interface Fixture {
  tenantId: string;
  subject: string;
  jobId: string;
  endpointId: string;
  eventId: string;
}

before(async () => {
  const result = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );

  assert.equal(result.rows[0]?.name, "lab_test");
});

after(async () => {
  await pool.end();
});

async function createFixture(maxAttempts = 5): Promise<Fixture> {
  const fixture: Fixture = {
    tenantId: randomUUID(),
    subject: `delivery-test-${randomUUID()}`,
    jobId: randomUUID(),
    endpointId: randomUUID(),
    eventId: randomUUID(),
  };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
      fixture.tenantId,
      "Webhook delivery test",
    ]);

    await client.query(
      `INSERT INTO identities (subject, email)
       VALUES ($1, $2)`,
      [fixture.subject, `${randomUUID()}@example.test`],
    );

    await client.query(
      `INSERT INTO jobs (
         id, tenant_id, created_by, type, input,
         idempotency_key, request_hash
       )
       VALUES ($1, $2, $3, 'report', '{}'::jsonb, $4, $5)`,
      [
        fixture.jobId,
        fixture.tenantId,
        fixture.subject,
        randomUUID(),
        randomUUID(),
      ],
    );

    await client.query(
      `INSERT INTO webhook_endpoints (
         id, tenant_id, url, signing_secret_ref
       )
       VALUES ($1, $2, $3, $4)`,
      [
        fixture.endpointId,
        fixture.tenantId,
        "https://example.test/webhook",
        "test/webhook-secret",
      ],
    );

    await client.query(
      `INSERT INTO webhook_outbox (
         id, tenant_id, endpoint_id, job_id,
         event_type, payload, max_attempts
       )
       VALUES (
         $1, $2, $3, $4, 'job.completed',
         $5::jsonb, $6
       )`,
      [
        fixture.eventId,
        fixture.tenantId,
        fixture.endpointId,
        fixture.jobId,
        JSON.stringify({
          id: fixture.eventId,
          type: "job.completed",
          tenantId: fixture.tenantId,
          data: { jobId: fixture.jobId, status: "completed" },
        }),
        maxAttempts,
      ],
    );

    await client.query("COMMIT");
    return fixture;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup(fixture: Fixture): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM webhook_outbox WHERE id = $1", [
      fixture.eventId,
    ]);

    await client.query("DELETE FROM webhook_endpoints WHERE id = $1", [
      fixture.endpointId,
    ]);

    await client.query("DELETE FROM jobs WHERE id = $1", [fixture.jobId]);

    await client.query("DELETE FROM identities WHERE subject = $1", [
      fixture.subject,
    ]);

    await client.query("DELETE FROM tenants WHERE id = $1", [fixture.tenantId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readState(id: string) {
  const result = await pool.query<{
    status: string;
    attempts: number;
    lease_owner: string | null;
    lease_until: Date | null;
    last_error: string | null;
  }>(
    `SELECT status, attempts, lease_owner, lease_until,
            last_error
     FROM webhook_outbox WHERE id = $1`,
    [id],
  );

  assert.equal(result.rowCount, 1);
  return result.rows[0]!;
}

test("concurrent dispatchers cannot claim the same delivery", async () => {
  const fixture = await createFixture();

  try {
    const [a, b] = await Promise.all([
      claimWebhookDelivery(pool, {
        workerId: "dispatcher-a",
        leaseSeconds: 60,
      }),
      claimWebhookDelivery(pool, {
        workerId: "dispatcher-b",
        leaseSeconds: 60,
      }),
    ]);

    const claimed = [a, b].filter((item) => item?.id === fixture.eventId);

    assert.equal(claimed.length, 1);

    const delivery = claimed[0]!;

    assert.equal(delivery.tenantId, fixture.tenantId);
    assert.equal(delivery.attempt, 1);

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "processing");
    assert.equal(state.attempts, 1);

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: delivery.id,
        leaseOwner: "stale-owner",
        attempt: delivery.attempt,
      }),
      { kind: "lease_lost" },
    );

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: delivery.id,
        leaseOwner: delivery.leaseOwner,
        attempt: delivery.attempt,
      }),
      { kind: "updated" },
    );

    assert.equal((await readState(fixture.eventId)).status, "delivered");
  } finally {
    await cleanup(fixture);
  }
});

test("retryable failure schedules a new attempt", async () => {
  const fixture = await createFixture();

  try {
    const first = await claimWebhookDelivery(pool, {
      workerId: "retry-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(first?.id, fixture.eventId);

    const result = await failWebhookDelivery(pool, {
      id: first!.id,
      leaseOwner: first!.leaseOwner,
      attempt: first!.attempt,
      error: "HTTP 503",
      retryable: true,
      baseDelaySeconds: 5,
    });

    assert.equal(result.kind, "retry_scheduled");

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "pending");
    assert.equal(state.attempts, 1);
    assert.equal(state.lease_owner, null);
    assert.equal(state.last_error, "HTTP 503");

    // Make the next attempt immediately eligible in the
    // isolated test database.
    await pool.query(
      `UPDATE webhook_outbox
       SET available_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.eventId],
    );

    const second = await claimWebhookDelivery(pool, {
      workerId: "retry-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(second?.id, fixture.eventId);
    assert.equal(second?.attempt, 2);
    assert.notEqual(second?.leaseOwner, first?.leaseOwner);

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: first!.id,
        leaseOwner: first!.leaseOwner,
        attempt: first!.attempt,
      }),
      { kind: "lease_lost" },
    );

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: second!.id,
        leaseOwner: second!.leaseOwner,
        attempt: second!.attempt,
      }),
      { kind: "updated" },
    );
  } finally {
    await cleanup(fixture);
  }
});

test("exhausted delivery transitions to failed", async () => {
  const fixture = await createFixture(1);

  try {
    const claimed = await claimWebhookDelivery(pool, {
      workerId: "exhausted-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(claimed?.id, fixture.eventId);

    const result = await failWebhookDelivery(pool, {
      id: claimed!.id,
      leaseOwner: claimed!.leaseOwner,
      attempt: claimed!.attempt,
      error: "HTTP 503",
      retryable: true,
    });

    assert.deepEqual(result, { kind: "failed" });

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "failed");
    assert.equal(state.attempts, 1);

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: claimed!.id,
        leaseOwner: claimed!.leaseOwner,
        attempt: claimed!.attempt,
      }),
      { kind: "lease_lost" },
    );
  } finally {
    await cleanup(fixture);
  }
});

test("expired lease is recovered and stale owner is rejected", async () => {
  const fixture = await createFixture(2);

  try {
    const first = await claimWebhookDelivery(pool, {
      workerId: "crashed-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(first?.id, fixture.eventId);

    await pool.query(
      `UPDATE webhook_outbox
       SET lease_until = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.eventId],
    );

    const recovered = await recoverWebhookDeliveries(pool, 100);

    assert.ok(recovered.retried >= 1);

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "pending");
    assert.equal(state.lease_owner, null);
    assert.equal(state.attempts, 1);

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: first!.id,
        leaseOwner: first!.leaseOwner,
        attempt: first!.attempt,
      }),
      { kind: "lease_lost" },
    );

    const second = await claimWebhookDelivery(pool, {
      workerId: "replacement-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(second?.id, fixture.eventId);
    assert.equal(second?.attempt, 2);

    await pool.query(
      `UPDATE webhook_outbox
       SET lease_until = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.eventId],
    );

    const exhausted = await recoverWebhookDeliveries(pool, 100);

    assert.ok(exhausted.failed >= 1);
    assert.equal((await readState(fixture.eventId)).status, "failed");
  } finally {
    await cleanup(fixture);
  }
});
