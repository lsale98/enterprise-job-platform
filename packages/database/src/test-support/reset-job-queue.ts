import type { Pool } from "pg";

const TEST_DATABASE_NAME = "lab_test";

/**
 * Clears job-related test data.
 *
 * This operation is intentionally restricted to the
 * dedicated PostgreSQL integration-test database.
 *
 * Never use this helper from production code.
 */
export async function resetJobQueue(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const database = await client.query<{
      name: string;
    }>(`SELECT current_database() AS name`);

    const currentDatabase = database.rows[0]?.name;

    if (currentDatabase !== TEST_DATABASE_NAME) {
      throw new Error(
        `Refusing to reset job queue in database "${currentDatabase}". ` +
          `Expected "${TEST_DATABASE_NAME}".`,
      );
    }

    // Remove dependent records before their parent jobs.
    await client.query(`DELETE FROM notification_outbox`);

    await client.query(`DELETE FROM imported_records`);

    await client.query(`DELETE FROM audit_events`);

    await client.query(`DELETE FROM jobs`);

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve original error.
    }

    throw error;
  } finally {
    client.release();
  }
}
