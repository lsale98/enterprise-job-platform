import type { Pool } from "pg";

import { insertAuditEvent } from "../../audit/audit.repository.js";

import type { JobExecutionParams } from "./job-command.types.js";

export interface FailJobParams extends JobExecutionParams {
  error: string;
}

export type FailJobResult = { kind: "failed" } | { kind: "lease_lost" };

export async function failJob(
  pool: Pool,
  params: FailJobParams,
): Promise<FailJobResult> {
  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new RangeError("Invalid execution attempt");
  }

  if (!params.leaseOwner.trim()) {
    throw new RangeError("Lease owner is required");
  }

  const message = params.error.trim().slice(0, 2000);

  if (!message) {
    throw new RangeError("Failure reason is required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string }>(
      `UPDATE jobs
       SET status = 'failed',
           result = NULL,
           error = $5,
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
        message,
      ],
    );

    if (result.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { kind: "lease_lost" };
    }

    await insertAuditEvent(client, {
      tenantId: params.tenantId,
      actor: `system:worker:${params.leaseOwner}`,
      action: "job.failed",
      resourceId: params.jobId,
    });

    await client.query("COMMIT");

    return { kind: "failed" };
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
