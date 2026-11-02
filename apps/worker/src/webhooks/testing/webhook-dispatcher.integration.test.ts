import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import {
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery,
  recoverWebhookDeliveries,
} from "@lab/database/webhook-repository";

import type { WebhookDispatcherConfig } from "../config/webhook.config.js";

import type { WebhookDispatcherDependencies } from "../runtime/dispatcher.types.js";

import { dispatchOneWebhook } from "../runtime/run-webhook-dispatcher.js";

import type { SendWebhookResult } from "../transport/transport.types.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = new Pool({
  connectionString,
  max: 4,
});

const config: WebhookDispatcherConfig = {
  workerId: "webhook-integration-test",
  pollIntervalMs: 10,
  recoveryIntervalMs: 100,
  leaseSeconds: 60,
  requestTimeoutMs: 1000,
  retryBaseDelaySeconds: 5,
  recoveryBatchSize: 100,
};

interface Fixture {
  tenantId: string;
  subject: string;
  jobId: string;
  endpointId: string;
  eventId: string;
}

interface DeliveryState {
  status: string;
  attempts: number;
  lease_owner: string | null;
  lease_until: Date | null;
  last_error: string | null;
  delivered_at: Date | null;
  available_at: Date;
}

before(async () => {
  const result = await pool.query<{
    name: string;
  }>("SELECT current_database() AS name");

  assert.equal(result.rows[0]?.name, "lab_test", "Tests must use lab_test");
});

after(async () => {
  await pool.end();
});

async function createFixture(maxAttempts = 5): Promise<Fixture> {
  const fixture: Fixture = {
    tenantId: randomUUID(),
    subject: `webhook-dispatch-${randomUUID()}`,
    jobId: randomUUID(),
    endpointId: randomUUID(),
    eventId: randomUUID(),
  };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO tenants (id, name)
       VALUES ($1, $2)`,
      [fixture.tenantId, "Webhook dispatcher integration"],
    );

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
      VALUES (
        $1, $2, $3, 'report', '{}'::jsonb,
        $4, $5
      )`,
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
      VALUES (
        $1, $2, $3, $4
      )`,
      [
        fixture.endpointId,
        fixture.tenantId,
        "https://hooks.example.com/events",
        "env:WEBHOOK_SECRET_TEST",
      ],
    );

    await client.query(
      `INSERT INTO webhook_outbox (
        id, tenant_id, endpoint_id, job_id,
        event_type, payload, max_attempts
      )
      VALUES (
        $1, $2, $3, $4,
        'job.completed', $5::jsonb, $6
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
          data: {
            jobId: fixture.jobId,
            status: "completed",
          },
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

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM webhook_outbox WHERE id = $1`, [
      fixture.eventId,
    ]);

    await client.query(`DELETE FROM webhook_endpoints WHERE id = $1`, [
      fixture.endpointId,
    ]);

    await client.query(`DELETE FROM jobs WHERE id = $1`, [fixture.jobId]);

    await client.query(`DELETE FROM identities WHERE subject = $1`, [
      fixture.subject,
    ]);

    await client.query(`DELETE FROM tenants WHERE id = $1`, [fixture.tenantId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readState(eventId: string): Promise<DeliveryState> {
  const result = await pool.query<DeliveryState>(
    `SELECT
       status,
       attempts,
       lease_owner,
       lease_until,
       last_error,
       delivered_at,
       available_at
     FROM webhook_outbox
     WHERE id = $1`,
    [eventId],
  );

  assert.equal(result.rowCount, 1);

  return result.rows[0]!;
}

function createDependencies(
  send: WebhookDispatcherDependencies["send"],
): WebhookDispatcherDependencies {
  return {
    claim: (params) => claimWebhookDelivery(pool, params),

    complete: (params) => completeWebhookDelivery(pool, params),

    fail: (params) => failWebhookDelivery(pool, params),

    recover: (batchSize) => recoverWebhookDeliveries(pool, batchSize),

    resolveSecret: () => "integration-secret-with-at-least-32-characters",

    send,

    sleep: async () => {},

    onError: (error) => {
      throw error;
    },
  };
}

test("HTTP 200 completes a real PostgreSQL webhook delivery", async () => {
  const fixture = await createFixture();
  const requests: string[] = [];

  try {
    const dependencies = createDependencies(
      async (params): Promise<SendWebhookResult> => {
        requests.push(params.eventId);

        assert.equal(params.eventId, fixture.eventId);

        assert.equal(params.url, "https://hooks.example.com/events");

        assert.equal(params.timeoutMs, config.requestTimeoutMs);

        return {
          kind: "delivered",
          statusCode: 200,
        };
      },
    );

    const processed = await dispatchOneWebhook(config, dependencies);

    assert.equal(processed, true);
    assert.deepEqual(requests, [fixture.eventId]);

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "delivered");
    assert.equal(state.attempts, 1);
    assert.equal(state.lease_owner, null);
    assert.equal(state.lease_until, null);
    assert.equal(state.last_error, null);
    assert.ok(state.delivered_at instanceof Date);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("HTTP 503 schedules retry and reuses the event identifier", async () => {
  const fixture = await createFixture();
  const requests: string[] = [];

  try {
    let responseCount = 0;

    const dependencies = createDependencies(
      async (params): Promise<SendWebhookResult> => {
        requests.push(params.eventId);
        responseCount += 1;

        if (responseCount === 1) {
          return {
            kind: "failed",
            retryable: true,
            statusCode: 503,
            reason: "HTTP 503",
          };
        }

        return {
          kind: "delivered",
          statusCode: 200,
        };
      },
    );

    assert.equal(await dispatchOneWebhook(config, dependencies), true);

    const pending = await readState(fixture.eventId);

    assert.equal(pending.status, "pending");
    assert.equal(pending.attempts, 1);
    assert.equal(pending.last_error, "HTTP 503");
    assert.equal(pending.lease_owner, null);

    // Deterministic retry without sleeping.
    await pool.query(
      `UPDATE webhook_outbox
         SET available_at =
           clock_timestamp() - interval '1 second'
         WHERE id = $1`,
      [fixture.eventId],
    );

    assert.equal(await dispatchOneWebhook(config, dependencies), true);

    const delivered = await readState(fixture.eventId);

    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.attempts, 2);

    assert.deepEqual(requests, [fixture.eventId, fixture.eventId]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("HTTP 400 causes terminal failure without retry", async () => {
  const fixture = await createFixture();

  try {
    const dependencies = createDependencies(
      async (): Promise<SendWebhookResult> => ({
        kind: "failed",
        retryable: false,
        statusCode: 400,
        reason: "HTTP 400",
      }),
    );

    assert.equal(await dispatchOneWebhook(config, dependencies), true);

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "failed");
    assert.equal(state.attempts, 1);
    assert.equal(state.last_error, "HTTP 400");
    assert.equal(state.lease_owner, null);
    assert.equal(state.lease_until, null);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("expired dispatcher lease is recovered and delivered", async () => {
  const fixture = await createFixture();

  try {
    const original = await claimWebhookDelivery(pool, {
      workerId: "crashed-dispatcher",
      leaseSeconds: 60,
    });

    assert.equal(original?.id, fixture.eventId);

    await pool.query(
      `UPDATE webhook_outbox
         SET lease_until =
           clock_timestamp() - interval '1 second'
         WHERE id = $1`,
      [fixture.eventId],
    );

    const recovery = await recoverWebhookDeliveries(pool, 100);

    assert.ok(recovery.retried >= 1);

    const dependencies = createDependencies(
      async (): Promise<SendWebhookResult> => ({
        kind: "delivered",
        statusCode: 200,
      }),
    );

    assert.equal(await dispatchOneWebhook(config, dependencies), true);

    const state = await readState(fixture.eventId);

    assert.equal(state.status, "delivered");
    assert.equal(state.attempts, 2);

    const staleCompletion = await completeWebhookDelivery(pool, {
      id: fixture.eventId,
      leaseOwner: original!.leaseOwner,
      attempt: original!.attempt,
    });

    assert.deepEqual(staleCompletion, {
      kind: "lease_lost",
    });
  } finally {
    await cleanupFixture(fixture);
  }
});
