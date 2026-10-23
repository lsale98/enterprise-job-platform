import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthorizer, type MembershipRepository } from "./authorize.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

function createRepository(): MembershipRepository {
  return {
    async findMembership() {
      throw new Error("Repository should not be called");
    },
  };
}

test("rejects an empty subject", async () => {
  const authorize = createAuthorizer(createRepository());

  const result = await authorize("", tenantId, "jobs:read");

  assert.deepEqual(result, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("rejects an invalid tenant ID", async () => {
  const authorize = createAuthorizer(createRepository());

  const result = await authorize("alice", "invalid-tenant-id", "jobs:read");

  assert.deepEqual(result, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("rejects an unsupported permission", async () => {
  const authorize = createAuthorizer(createRepository());

  const result = await authorize("alice", tenantId, "jobs:delete" as never);

  assert.deepEqual(result, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("viewer can read jobs but cannot create jobs", async () => {
  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      return {
        subject,
        tenantId: requestedTenantId,
        role: "viewer",
      };
    },
  });

  const read = await authorize("alice", tenantId, "jobs:read");
  const create = await authorize("alice", tenantId, "jobs:create");

  assert.deepEqual(read, {
    allowed: true,
    context: {
      subject: "alice",
      tenantId,
      role: "viewer",
    },
  });

  assert.deepEqual(create, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("operator can create and cancel jobs", async () => {
  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      return {
        subject,
        tenantId: requestedTenantId,
        role: "operator",
      };
    },
  });

  assert.equal((await authorize("bob", tenantId, "jobs:create")).allowed, true);

  assert.equal((await authorize("bob", tenantId, "jobs:cancel")).allowed, true);

  assert.equal(
    (await authorize("bob", tenantId, "members:manage")).allowed,
    false,
  );
});

test("admin can manage members and read audit", async () => {
  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      return {
        subject,
        tenantId: requestedTenantId,
        role: "admin",
      };
    },
  });

  assert.equal(
    (await authorize("carol", tenantId, "members:manage")).allowed,
    true,
  );

  assert.equal(
    (await authorize("carol", tenantId, "audit:read")).allowed,
    true,
  );
});

test("rejects a user without tenant membership", async () => {
  const authorize = createAuthorizer({
    async findMembership() {
      return null;
    },
  });

  assert.deepEqual(await authorize("carol", tenantId, "jobs:read"), {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("rejects an unknown membership role", async () => {
  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      return {
        subject,
        tenantId: requestedTenantId,
        role: "superadmin",
      };
    },
  });

  assert.equal(
    (await authorize("alice", tenantId, "jobs:read")).allowed,
    false,
  );
});

const otherTenantId = "22222222-2222-4222-8222-222222222222";

test("rejects access to another tenant", async () => {
  const authorize = createAuthorizer({
    async findMembership(subject) {
      // Repository returns a membership for the wrong tenant.
      return {
        subject,
        tenantId: otherTenantId,
        role: "admin",
      };
    },
  });

  const result = await authorize("alice", tenantId, "jobs:read");

  assert.deepEqual(result, {
    allowed: false,
    reason: "FORBIDDEN",
  });
});

test("role changes affect subsequent authorization checks", async () => {
  let role = "viewer";

  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      return {
        subject,
        tenantId: requestedTenantId,
        role,
      };
    },
  });

  assert.equal(
    (await authorize("bob", tenantId, "jobs:create")).allowed,
    false,
  );

  role = "operator";

  assert.equal((await authorize("bob", tenantId, "jobs:create")).allowed, true);
});

test("membership revocation denies subsequent authorization", async () => {
  let active = true;

  const authorize = createAuthorizer({
    async findMembership(subject, requestedTenantId) {
      if (!active) return null;

      return {
        subject,
        tenantId: requestedTenantId,
        role: "admin",
      };
    },
  });

  assert.equal(
    (await authorize("alice", tenantId, "jobs:create")).allowed,
    true,
  );

  active = false;

  assert.equal(
    (await authorize("alice", tenantId, "jobs:create")).allowed,
    false,
  );
});

test("repository failures never grant access", async () => {
  const authorize = createAuthorizer({
    async findMembership() {
      throw new Error("Database unavailable");
    },
  });

  await assert.rejects(() => authorize("alice", tenantId, "jobs:read"), {
    message: "Database unavailable",
  });
});

test("rejects membership belonging to a different subject", async () => {
  const authorize = createAuthorizer({
    async findMembership(_subject, requestedTenantId) {
      return {
        subject: "bob",
        tenantId: requestedTenantId,
        role: "admin",
      };
    },
  });

  assert.deepEqual(await authorize("alice", tenantId, "members:manage"), {
    allowed: false,
    reason: "FORBIDDEN",
  });
});
