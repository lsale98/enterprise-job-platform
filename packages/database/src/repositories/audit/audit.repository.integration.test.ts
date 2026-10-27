import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { createDatabasePool } from "../../connection/pool.js";
import { insertAuditEvent } from "./audit.repository.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const pool = createDatabasePool({ connectionString });

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const actor = `audit-command-test-${randomUUID()}`;

after(async () => {
  try {
    await pool.query("DELETE FROM audit_events WHERE actor = $1", [actor]);
  } finally {
    await pool.end();
  }
});

test("inserts an audit event within a transaction", async () => {
  const client = await pool.connect();
  const resourceId = randomUUID();

  try {
    await client.query("BEGIN");

    await insertAuditEvent(client, {
      tenantId,
      actor,
      action: "job.created",
      resourceId,
    });

    const insideTransaction = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM audit_events
       WHERE tenant_id = $1
         AND actor = $2
         AND resource_id = $3`,
      [tenantId, actor, resourceId],
    );

    assert.equal(insideTransaction.rows[0]?.count, "1");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const persisted = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM audit_events
     WHERE tenant_id = $1
       AND actor = $2
       AND resource_id = $3`,
    [tenantId, actor, resourceId],
  );

  assert.equal(persisted.rows[0]?.count, "1");
});

test("rolls back an audit event when the transaction fails", async () => {
  const client = await pool.connect();
  const resourceId = randomUUID();

  try {
    await client.query("BEGIN");

    await insertAuditEvent(client, {
      tenantId,
      actor,
      action: "job.created",
      resourceId,
    });

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM audit_events
     WHERE tenant_id = $1
       AND actor = $2
       AND resource_id = $3`,
    [tenantId, actor, resourceId],
  );

  assert.equal(result.rows[0]?.count, "0");
});

test("rejects audit events referencing nonexistent tenants", async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await assert.rejects(
      () =>
        insertAuditEvent(client, {
          tenantId: randomUUID(),
          actor,
          action: "job.created",
          resourceId: randomUUID(),
        }),
      (error: unknown) => {
        return (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23503"
        );
      },
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
