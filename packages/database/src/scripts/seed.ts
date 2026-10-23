import { createDatabasePool, transaction } from "../index.js";

// Local demo identities only.
// Never execute seed scripts against staging or production databases.

if (
  process.env.NODE_ENV === "production" ||
  process.env.APP_ENV !== "development"
) {
  throw new Error("Seed is allowed only in development");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set for seed");
}

const pool = createDatabasePool({ connectionString });

const companyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

try {
  await transaction(pool, async (db) => {
    await db.query(
      `INSERT INTO tenants(id, name)
       VALUES ($1, 'Acme'), ($2, 'Contoso')
       ON CONFLICT DO NOTHING`,
      [companyA, companyB],
    );

    const users = [
      ["11111111-1111-4111-8111-111111111111", "alice@example.test"],
      ["22222222-2222-4222-8222-222222222222", "bob@example.test"],
      ["33333333-3333-4333-8333-333333333333", "carol@example.test"],
    ];

    for (const [sub, email] of users) {
      await db.query(
        `INSERT INTO identities(subject, email)
         VALUES ($1, $2)
         ON CONFLICT(subject)
         DO UPDATE SET email = EXCLUDED.email`,
        [sub, email],
      );
    }

    const memberships = [
      [companyA, users[0]![0], "admin"],
      [companyA, users[1]![0], "viewer"],
      [companyB, users[2]![0], "admin"],
    ];

    for (const [tenant, sub, role] of memberships) {
      await db.query(
        `INSERT INTO memberships(tenant_id, subject, role)
         VALUES ($1, $2, $3)
         ON CONFLICT(tenant_id, subject)
         DO UPDATE SET role = EXCLUDED.role`,
        [tenant, sub, role],
      );
    }
  });

  console.log("seed completed");
} finally {
  await pool.end();
}
