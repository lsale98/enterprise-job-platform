import "dotenv/config";
import pg from "pg";
import type { QueryResultRow } from "pg";

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
