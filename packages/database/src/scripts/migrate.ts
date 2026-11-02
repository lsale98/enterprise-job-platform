import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createDatabasePool, transaction } from "../index.js";

const isTestDatabase = process.argv.includes("--test");

const connectionString = isTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    `${isTestDatabase ? "TEST_DATABASE_URL" : "DATABASE_URL"} is required`,
  );
}

const pool = createDatabasePool({ connectionString });

const dir = fileURLToPath(new URL("../../migrations/", import.meta.url));

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrations = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const filename of migrations) {
    const applied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename],
    );

    if (applied.rowCount) {
      continue;
    }

    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );

    await transaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(487273)");

      const check = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (check.rowCount) {
        return;
      }

      await client.query(sql);

      await client.query("INSERT INTO schema_migrations(filename) VALUES($1)", [
        filename,
      ]);
    });

    console.log("applied", filename);
  }
} finally {
  await pool.end();
}
