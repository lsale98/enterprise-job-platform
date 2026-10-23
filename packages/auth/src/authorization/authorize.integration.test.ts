import assert from "node:assert/strict";
import { after, test } from "node:test";

import { findMembership } from "@lab/database/membership-repository";
import { createDatabasePool } from "@lab/database";
import { createAuthorizer } from "./authorize.js";
import { randomUUID } from "node:crypto";

const acmeTenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contosoTenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const aliceSubject = "11111111-1111-4111-8111-111111111111";
const bobSubject = "22222222-2222-4222-8222-222222222222";
const carolSubject = "33333333-3333-4333-8333-333333333333";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set for integration tests");
}

const pool = createDatabasePool({ connectionString });

const authorize = createAuthorizer({
  findMembership: (subject, tenantId) =>
    findMembership(pool, subject, tenantId),
});

after(async () => {
  await pool.end();
});

test("Alice can manage members in Acme", async () => {
  const result = await authorize(aliceSubject, acmeTenantId, "members:manage");

  assert.deepEqual(result, {
    allowed: true,
    context: {
      subject: aliceSubject,
      tenantId: acmeTenantId,
      role: "admin",
    },
  });
});

test("Bob can read jobs but cannot create them in Acme", async () => {
  const read = await authorize(bobSubject, acmeTenantId, "jobs:read");

  const create = await authorize(bobSubject, acmeTenantId, "jobs:create");

  assert.equal(read.allowed, true);
  assert.deepEqual(create, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("Carol cannot access Acme despite being Contoso admin", async () => {
  const acmeResult = await authorize(carolSubject, acmeTenantId, "jobs:read");

  const contosoResult = await authorize(
    carolSubject,
    contosoTenantId,
    "members:manage",
  );

  assert.deepEqual(acmeResult, {
    allowed: false,
    reason: "FORBIDDEN",
  });

  assert.equal(contosoResult.allowed, true);
});

test("role changes and membership revocation take effect immediately", async () => {
  const testTenantId = randomUUID();
  const testSubject = `e4-s2-test-${randomUUID()}`;

  try {
    // Create isolated test data.
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2)", [
      testTenantId,
      "E4-S2 Integration Test",
    ]);

    await pool.query(
      "INSERT INTO identities (subject, email) VALUES ($1, $2)",
      [testSubject, `${randomUUID()}@example.test`],
    );

    await pool.query(
      `INSERT INTO memberships (tenant_id, subject, role)
       VALUES ($1, $2, $3)`,
      [testTenantId, testSubject, "viewer"],
    );

    // Viewer cannot create jobs.
    assert.equal(
      (await authorize(testSubject, testTenantId, "jobs:create")).allowed,
      false,
    );

    // Promote viewer to operator.
    await pool.query(
      `UPDATE memberships
       SET role = $3
       WHERE tenant_id = $1 AND subject = $2`,
      [testTenantId, testSubject, "operator"],
    );

    // New permission becomes effective without reauthentication.
    assert.equal(
      (await authorize(testSubject, testTenantId, "jobs:create")).allowed,
      true,
    );

    // Revoke membership.
    await pool.query(
      `DELETE FROM memberships
       WHERE tenant_id = $1 AND subject = $2`,
      [testTenantId, testSubject],
    );

    // Access is denied on the next authorization check.
    assert.equal(
      (await authorize(testSubject, testTenantId, "jobs:read")).allowed,
      false,
    );
  } finally {
    // Always clean up isolated test data.
    await pool.query(
      "DELETE FROM memberships WHERE tenant_id = $1 AND subject = $2",
      [testTenantId, testSubject],
    );

    await pool.query("DELETE FROM identities WHERE subject = $1", [
      testSubject,
    ]);

    await pool.query("DELETE FROM tenants WHERE id = $1", [testTenantId]);
  }
});
