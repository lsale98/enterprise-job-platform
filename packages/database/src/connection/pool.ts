import pg from "pg";
import type { Pool as PgPool } from "pg";

const { Pool } = pg;

export interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export function createDatabasePool(config: DatabaseConfig): PgPool {
  if (!config.connectionString?.trim()) {
    throw new Error("Database connection string is required");
  }

  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 15,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
  });
}
