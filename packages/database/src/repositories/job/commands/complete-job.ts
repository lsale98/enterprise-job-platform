import type { Pool } from "pg";

import { insertAuditEvent } from "../../audit/audit.repository.js";

import type { JobExecutionParams } from "./job-command.types.js";

export interface CompleteJobParams extends JobExecutionParams {
  result: unknown;
}

export type CompleteJobResult = { kind: "completed" } | { kind: "lease_lost" };

export async function completeJob(
  pool: Pool,
  params: CompleteJobParams,
): Promise<CompleteJobResult> {
  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new RangeError("Invalid execution attempt");
  }

  if (!params.leaseOwner.trim()) {
    throw new RangeError("Lease owner is required");
  }

  const resultJson = JSON.stringify(params.result);

  if (resultJson === undefined) {
    throw new TypeError("Job result is not JSON serializable");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string }>(
      `UPDATE jobs
       SET status = 'completed',
           result = $5::jsonb,
           error = NULL,
           lease_owner = NULL,
           lease_until = NULL,
           updated_at = clock_timestamp()
       WHERE tenant_id = $1
         AND id = $2
         AND lease_owner = $3
         AND attempts = $4
         AND status = 'running'
         AND lease_until > clock_timestamp()
       RETURNING id::text AS id`,
      [
        params.tenantId,
        params.jobId,
        params.leaseOwner,
        params.attempt,
        resultJson,
      ],
    );

    if (result.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { kind: "lease_lost" };
    }

    await insertAuditEvent(client, {
      tenantId: params.tenantId,
      actor: `system:worker:${params.leaseOwner}`,
      action: "job.completed",
      resourceId: params.jobId,
    });

    await client.query("COMMIT");

    return { kind: "completed" };
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
