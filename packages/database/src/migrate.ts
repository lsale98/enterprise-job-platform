import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool, transaction } from "./index.js";

const dir = fileURLToPath(new URL("../migrations/", import.meta.url));

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
      new URL(`../migrations/${filename}`, import.meta.url),
      "utf8",
    );

    await transaction(async (client) => {
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
