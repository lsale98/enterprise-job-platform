import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  createJobIdempotently,
  IdempotencyConflictError,
} from "./job.repository.js";

import { createDatabasePool } from "../../connection/pool.js";

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

after(async () => {
  try {
    if (keys.size > 0) {
      await pool.query(
        "DELETE FROM jobs WHERE idempotency_key = ANY($1::text[])",
        [[...keys]],
      );
    }
  } finally {
    await pool.end();
  }
});

test("creates a new job", async () => {
  const result = await createJobIdempotently(pool, {
    tenantId: tenantA,
    createdBy: alice,
    idempotencyKey: newKey(),
    input: report,
  });

  assert.equal(result.kind, "created");
  assert.equal(result.job.status, "queued");
  assert.deepEqual(result.job.input, report);
});

test("same key and payload return the existing job", async () => {
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
});

test("same key with different payload is rejected", async () => {
  const idempotencyKey = newKey();

  await createJobIdempotently(pool, {
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
});

test("same key with different actor is rejected", async () => {
  const idempotencyKey = newKey();

  await createJobIdempotently(pool, {
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
});

test("the same key can be used by different tenants", async () => {
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
});

test("concurrent identical requests create exactly one job", async () => {
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

  const stored = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantA, idempotencyKey],
  );

  assert.equal(Number(stored.rows[0]?.count), 1);
});
