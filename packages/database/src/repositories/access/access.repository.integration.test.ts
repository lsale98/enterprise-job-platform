import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createDatabasePool } from "../../index.js";

import {
  findDefaultTenantId,
  findTenantAccess,
  InvalidMembershipCursorError,
  isPlatformAdmin,
  listAvailableMemberships,
} from "./access.repository.js";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required");
}

test("Access repository — real PostgreSQL integration", async (t) => {
  const pool = createDatabasePool({
    connectionString,
  });

  const subject = randomUUID();
  const otherSubject = randomUUID();

  const alphaId = randomUUID();
  const betaId = randomUUID();
  const gammaId = randomUUID();

  t.after(async () => {
    try {
      await pool.query(
        `
          DELETE FROM platform_role_assignments
          WHERE subject = ANY($1::text[])
        `,
        [[subject, otherSubject]],
      );

      await pool.query(
        `
          DELETE FROM memberships
          WHERE subject = ANY($1::text[])
        `,
        [[subject, otherSubject]],
      );

      await pool.query(
        `
          DELETE FROM identities
          WHERE subject = ANY($1::text[])
        `,
        [[subject, otherSubject]],
      );

      await pool.query(
        `
          DELETE FROM tenants
          WHERE id = ANY($1::uuid[])
        `,
        [[alphaId, betaId, gammaId]],
      );
    } finally {
      await pool.end();
    }
  });

  await t.test("setup — create isolated identities and tenants", async () => {
    await pool.query(
      `
        INSERT INTO identities (subject, email)
        VALUES
          ($1, $2),
          ($3, $4)
      `,
      [
        subject,
        `${subject}@example.test`,
        otherSubject,
        `${otherSubject}@example.test`,
      ],
    );

    await pool.query(
      `
        INSERT INTO tenants (id, name)
        VALUES
          ($1, 'Access Test Alpha'),
          ($2, 'Access Test Beta'),
          ($3, 'Access Test Gamma')
      `,
      [alphaId, betaId, gammaId],
    );

    await pool.query(
      `
        INSERT INTO memberships (tenant_id, subject, role)
        VALUES
          ($1, $4, 'admin'),
          ($2, $4, 'operator'),
          ($3, $4, 'viewer'),
          ($1, $5, 'viewer')
      `,
      [alphaId, betaId, gammaId, subject, otherSubject],
    );
  });

  await t.test("findTenantAccess returns the correct tenant role", async () => {
    const alpha = await findTenantAccess(pool, subject, alphaId);

    const beta = await findTenantAccess(pool, subject, betaId);

    const gamma = await findTenantAccess(pool, subject, gammaId);

    assert.deepEqual(alpha, {
      id: alphaId,
      name: "Access Test Alpha",
      role: "admin",
    });

    assert.deepEqual(beta, {
      id: betaId,
      name: "Access Test Beta",
      role: "operator",
    });

    assert.deepEqual(gamma, {
      id: gammaId,
      name: "Access Test Gamma",
      role: "viewer",
    });
  });

  await t.test("findTenantAccess isolates memberships by subject", async () => {
    assert.equal(await findTenantAccess(pool, otherSubject, betaId), null);

    assert.equal(await findTenantAccess(pool, otherSubject, gammaId), null);

    assert.deepEqual(await findTenantAccess(pool, otherSubject, alphaId), {
      id: alphaId,
      name: "Access Test Alpha",
      role: "viewer",
    });
  });

  await t.test("findTenantAccess rejects unknown tenant", async () => {
    const result = await findTenantAccess(pool, subject, randomUUID());

    assert.equal(result, null);
  });

  await t.test("findDefaultTenantId returns an authorized tenant", async () => {
    const defaultTenantId = await findDefaultTenantId(pool, subject);

    assert.ok(defaultTenantId);

    const authorizedTenantIds: ReadonlySet<string> = new Set([
      alphaId,
      betaId,
      gammaId,
    ]);

    assert.ok(authorizedTenantIds.has(defaultTenantId));
  });

  await t.test(
    "findDefaultTenantId returns null without membership",
    async () => {
      const noMembershipSubject = randomUUID();

      assert.equal(await findDefaultTenantId(pool, noMembershipSubject), null);
    },
  );

  await t.test(
    "listAvailableMemberships returns only subject memberships",
    async () => {
      const result = await listAvailableMemberships(pool, otherSubject, {
        search: "Access Test",
        limit: 20,
      });

      assert.equal(result.items.length, 1);

      assert.deepEqual(result.items[0], {
        id: alphaId,
        name: "Access Test Alpha",
        role: "viewer",
      });

      assert.equal(result.nextCursor, null);
    },
  );

  await t.test("listAvailableMemberships filters by search", async () => {
    const result = await listAvailableMemberships(pool, subject, {
      search: "beta",
      limit: 20,
    });

    assert.deepEqual(result.items, [
      {
        id: betaId,
        name: "Access Test Beta",
        role: "operator",
      },
    ]);
  });

  await t.test(
    "listAvailableMemberships paginates without duplicates",
    async () => {
      const collectedIds: string[] = [];

      let cursor: string | undefined;

      for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
        const page = await listAvailableMemberships(pool, subject, {
          search: "Access Test",
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });

        assert.equal(page.items.length, 1);

        collectedIds.push(page.items[0]!.id);

        if (!page.nextCursor) {
          break;
        }

        cursor = page.nextCursor;
      }

      assert.equal(collectedIds.length, 3);

      assert.equal(new Set(collectedIds).size, 3);

      assert.deepEqual(collectedIds, [alphaId, betaId, gammaId]);
    },
  );

  await t.test(
    "listAvailableMemberships rejects cursor from a different search",
    async () => {
      const firstPage = await listAvailableMemberships(pool, subject, {
        search: "Access Test",
        limit: 1,
      });

      assert.ok(firstPage.nextCursor);

      await assert.rejects(
        listAvailableMemberships(pool, subject, {
          search: "Different Search",
          limit: 1,
          cursor: firstPage.nextCursor,
        }),
        InvalidMembershipCursorError,
      );
    },
  );

  await t.test("listAvailableMemberships rejects invalid cursor", async () => {
    await assert.rejects(
      listAvailableMemberships(pool, subject, {
        search: "",
        limit: 20,
        cursor: "invalid",
      }),
      InvalidMembershipCursorError,
    );
  });

  await t.test("listAvailableMemberships validates page limits", async () => {
    for (const limit of [0, -1, 51, 1.5]) {
      await assert.rejects(
        listAvailableMemberships(pool, subject, {
          search: "",
          limit,
        }),
        RangeError,
      );
    }
  });

  await t.test(
    "platform role is independent from tenant membership",
    async () => {
      assert.equal(await isPlatformAdmin(pool, subject), false);

      await pool.query(
        `
        INSERT INTO platform_role_assignments (
          subject,
          role
        )
        VALUES ($1, 'platform_admin')
      `,
        [subject],
      );

      assert.equal(await isPlatformAdmin(pool, subject), true);

      assert.equal(await isPlatformAdmin(pool, otherSubject), false);
    },
  );

  await t.test(
    "platform admin does not inherit other tenant memberships",
    async () => {
      assert.equal(await isPlatformAdmin(pool, subject), true);

      assert.equal(await findTenantAccess(pool, subject, randomUUID()), null);
    },
  );
});
