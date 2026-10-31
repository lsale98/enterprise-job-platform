import type { Pool } from "pg";

import { insertAuditEvent } from "../../audit/audit.repository.js";

import {
  JOB_COMMAND_PROJECTION,
  mapJobCommandRow,
} from "./job-command.helpers.js";

import type {
  JobCommandParams,
  JobCommandResult,
} from "./job-command.types.js";
import type { JobSummaryRow } from "../job.types.js";

export async function cancelJob(
  pool: Pool,
  params: JobCommandParams,
): Promise<JobCommandResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query<{ status: string }>(
      `SELECT status
       FROM jobs
       WHERE tenant_id = $1
         AND id = $2
       FOR UPDATE`,
      [params.tenantId, params.jobId],
    );

    const job = existing.rows[0];

    if (!job) {
      await client.query("ROLLBACK");
      return { kind: "not_found" };
    }

    if (job.status !== "queued") {
      await client.query("ROLLBACK");
      return { kind: "conflict" };
    }

    const updated = await client.query<JobSummaryRow>(
      `UPDATE jobs
       SET status = 'cancelled',
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'queued'
       RETURNING ${JOB_COMMAND_PROJECTION}`,
      [params.tenantId, params.jobId],
    );

    const updatedJob = updated.rows[0];

    if (!updatedJob) {
      await client.query("ROLLBACK");
      return { kind: "conflict" };
    }

    await insertAuditEvent(client, {
      tenantId: params.tenantId,
      actor: params.actor,
      action: "job.cancelled",
      resourceId: params.jobId,
    });

    await client.query("COMMIT");

    return {
      kind: "updated",
      job: mapJobCommandRow(updatedJob),
    };
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
