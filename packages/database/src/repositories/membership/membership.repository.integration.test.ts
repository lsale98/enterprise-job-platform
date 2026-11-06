import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDatabasePool } from "../../connection/pool.js";

import {
  findMembership,
  listMembershipsBySubject,
} from "./membership.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

const pool = createDatabasePool({ connectionString });

const tenantA = randomUUID();
const tenantB = randomUUID();

const alice = randomUUID();
const bob = randomUUID();

before(async () => {
  await pool.query(
    `
      INSERT INTO tenants (id, name)
      VALUES ($1, $2), ($3, $4)
    `,
    [tenantA, "Integration Alpha", tenantB, "Integration Beta"],
  );

  await pool.query(
    `
      INSERT INTO identities (subject, email)
      VALUES ($1, $2), ($3, $4)
    `,
    [
      alice,
      "integration-alice@example.test",
      bob,
      "integration-bob@example.test",
    ],
  );

  await pool.query(
    `
      INSERT INTO memberships (tenant_id, subject, role)
      VALUES
        ($1, $2, 'admin'),
        ($3, $2, 'operator'),
        ($3, $4, 'viewer')
    `,
    [tenantA, alice, tenantB, bob],
  );
});

after(async () => {
  try {
    await pool.query(
      "DELETE FROM memberships WHERE subject = ANY($1::text[])",
      [[alice, bob]],
    );

    await pool.query("DELETE FROM identities WHERE subject = ANY($1::text[])", [
      [alice, bob],
    ]);

    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
      [tenantA, tenantB],
    ]);
  } finally {
    await pool.end();
  }
});

test("lists only memberships belonging to the subject", async () => {
  const memberships = await listMembershipsBySubject(pool, alice);

  assert.deepEqual(memberships, [
    {
      tenantId: tenantA,
      tenantName: "Integration Alpha",
      role: "admin",
    },
    {
      tenantId: tenantB,
      tenantName: "Integration Beta",
      role: "operator",
    },
  ]);
});

test("isolates memberships between users", async () => {
  const memberships = await listMembershipsBySubject(pool, bob);

  assert.deepEqual(memberships, [
    {
      tenantId: tenantB,
      tenantName: "Integration Beta",
      role: "viewer",
    },
  ]);
});

test("returns empty memberships for unknown subjects", async () => {
  const memberships = await listMembershipsBySubject(pool, randomUUID());

  assert.deepEqual(memberships, []);
});

test("rejects empty subjects without querying memberships", async () => {
  const memberships = await listMembershipsBySubject(pool, "  ");

  assert.deepEqual(memberships, []);
});

test("preserves existing findMembership behavior", async () => {
  const membership = await findMembership(pool, alice, tenantA);

  assert.deepEqual(membership, {
    tenantId: tenantA,
    subject: alice,
    role: "admin",
  });
});

test("does not return another user's membership", async () => {
  const membership = await findMembership(pool, bob, tenantA);

  assert.equal(membership, null);
});
