import pg from "pg";
import "dotenv/config";
import type { PoolClient, QueryResultRow } from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString,
  max: 15,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) {
  return pool.query<T>(sql, params);
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const value = await fn(client);

    await client.query("COMMIT");

    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
