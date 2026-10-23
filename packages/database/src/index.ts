export { createDatabasePool, type DatabaseConfig } from "./connection/pool.js";

export { transaction } from "./connection/transaction.js";

export type { Pool as DatabasePool } from "pg";
