import type { Pool } from "pg";

import type {
  GetJobByIdParams,
  JobDetails,
  JobDetailsRow,
} from "./job-query.types.js";

export async function getJobById(
  pool: Pool,
  params: GetJobByIdParams,
): Promise<JobDetails | null> {
  const result = await pool.query<JobDetailsRow>(
    `SELECT
      id::text,
      tenant_id::text AS "tenantId",
      type,
      status,
      attempts,
      max_attempts AS "maxAttempts",
      input,
      result,
      error,
      to_char(
        created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "createdAt",
      to_char(
        updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "updatedAt"
    FROM jobs
    WHERE tenant_id = $1
      AND id = $2`,
    [params.tenantId, params.jobId],
  );

  const job = result.rows[0];

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    tenantId: job.tenantId,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    input: job.input,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
