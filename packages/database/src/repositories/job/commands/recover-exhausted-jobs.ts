import type { Pool } from "pg";

import { insertAuditEvent } from "../../audit/audit.repository.js";

export async function recoverExhaustedJobs(
  pool: Pool,
  batchSize = 100,
): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new RangeError("Invalid recovery batch size");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      tenantId: string;
    }>(
      `WITH expired AS (
        SELECT id
        FROM jobs
        WHERE status = 'running'
          AND lease_until < clock_timestamp()
          AND attempts >= max_attempts
        ORDER BY lease_until ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE jobs AS j
      SET status = 'failed',
          result = NULL,
          error = 'Lease expired after maximum attempts',
          lease_owner = NULL,
          lease_until = NULL,
          updated_at = clock_timestamp()
      FROM expired
      WHERE j.id = expired.id
      RETURNING
        j.id::text AS id,
        j.tenant_id::text AS "tenantId"`,
      [batchSize],
    );

    for (const job of result.rows) {
      await insertAuditEvent(client, {
        tenantId: job.tenantId,
        actor: "system:worker-recovery",
        action: "job.failed",
        resourceId: job.id,
      });
    }

    await client.query("COMMIT");

    return result.rows.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error.
    }

    throw error;
  } finally {
    client.release();
  }
}
