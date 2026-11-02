import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";

import { Pool } from "pg";

import {
  completeWebhookDelivery,
  recoverWebhookDeliveries,
} from "@lab/database/webhook-repository";

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

async function createFixture(): Promise<Fixture> {
  const fixture: Fixture = {
    tenantId: randomUUID(),
    subject: `webhook-crash-${randomUUID()}`,
    jobId: randomUUID(),
    endpointId: randomUUID(),
    eventId: randomUUID(),
  };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const db = await client.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    assert.equal(db.rows[0]?.name, "lab_test");

    await client.query("INSERT INTO tenants (id, name) VALUES ($1, $2)", [
      fixture.tenantId,
      "Webhook crash test",
    ]);

    await client.query(
      "INSERT INTO identities (subject, email) VALUES ($1, $2)",
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
        "https://hooks.example.com/events",
        "env:WEBHOOK_SECRET_TEST",
      ],
    );

    await client.query(
      `INSERT INTO webhook_outbox (
        id, tenant_id, endpoint_id, job_id,
        event_type, payload
      )
      VALUES (
        $1, $2, $3, $4, 'job.completed', $5::jsonb
      )`,
      [
        fixture.eventId,
        fixture.tenantId,
        fixture.endpointId,
        fixture.jobId,
        JSON.stringify({
          id: fixture.eventId,
          type: "job.completed",
        }),
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

function startProcess(mode: "crash" | "recover", eventId: string) {
  return fork(
    resolve(process.cwd(), "dist/webhooks/testing/crash-dispatcher.js"),
    {
      env: {
        ...process.env,
        WEBHOOK_TEST_MODE: mode,
        WEBHOOK_TEST_EVENT_ID: eventId,
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
}

function waitForMessage(
  child: ReturnType<typeof startProcess>,
  kind: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for ${kind}`));
    }, 10_000);

    function cleanupListeners() {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", finish);
    }

    function finish(error: Error) {
      cleanupListeners();
      reject(error);
    }

    function onExit() {
      finish(new Error(`Child exited before ${kind}`));
    }

    function onMessage(value: unknown) {
      if (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        value.kind === kind
      ) {
        cleanupListeners();
        resolveMessage(value as Record<string, unknown>);
      }
    }

    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", finish);
  });
}

async function forceKill(
  child: ReturnType<typeof startProcess>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });

  if (process.platform === "win32") {
    const { spawnSync } = await import("node:child_process");

    spawnSync("taskkill", ["/PID", String(child.pid), "/F", "/T"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGKILL");
  }

  await exited;
}

test("dispatcher process crash allows a replacement to complete delivery", async () => {
  const fixture = await createFixture();
  let first: ReturnType<typeof startProcess> | undefined;
  let replacement: ReturnType<typeof startProcess> | undefined;

  try {
    first = startProcess("crash", fixture.eventId);

    const claim = await waitForMessage(first, "claimed");

    const leaseOwner = String(claim.leaseOwner);
    const attempt = Number(claim.attempt);

    assert.equal(attempt, 1);

    await forceKill(first);

    const running = await pool.query<{
      status: string;
      lease_owner: string | null;
    }>("SELECT status, lease_owner FROM webhook_outbox WHERE id = $1", [
      fixture.eventId,
    ]);

    assert.equal(running.rows[0]?.status, "processing");
    assert.equal(running.rows[0]?.lease_owner, leaseOwner);

    // Deterministically expire the abandoned lease.
    await pool.query(
      `UPDATE webhook_outbox
       SET lease_until = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.eventId],
    );

    const recovery = await recoverWebhookDeliveries(pool);
    assert.ok(recovery.retried >= 1);

    replacement = startProcess("recover", fixture.eventId);
    await waitForMessage(replacement, "completed");

    const finalState = await pool.query<{
      status: string;
      attempts: number;
      lease_owner: string | null;
    }>(
      `SELECT status, attempts, lease_owner
       FROM webhook_outbox WHERE id = $1`,
      [fixture.eventId],
    );

    assert.equal(finalState.rows[0]?.status, "delivered");
    assert.equal(finalState.rows[0]?.attempts, 2);
    assert.equal(finalState.rows[0]?.lease_owner, null);

    assert.deepEqual(
      await completeWebhookDelivery(pool, {
        id: fixture.eventId,
        leaseOwner,
        attempt,
      }),
      { kind: "lease_lost" },
    );
  } finally {
    if (first) await forceKill(first);
    if (replacement) await forceKill(replacement);
    await cleanup(fixture);
    await pool.end();
  }
});
