import type { Pool } from "pg";

import type {
  JobSummary,
  JobSummaryRow,
  ListJobsParams,
  ListJobsResult,
} from "./job-query.types.js";

export async function listJobs(
  pool: Pool,
  params: ListJobsParams,
): Promise<ListJobsResult> {
  const { tenantId, query, cursor } = params;

  const conditions: string[] = ["tenant_id = $1"];
  const values: unknown[] = [tenantId];

  function addCondition(
    column: string,
    operator: "=" | ">=" | "<=",
    value: unknown,
  ): void {
    values.push(value);
    conditions.push(`${column} ${operator} $${values.length}`);
  }

  if (query.status !== undefined) {
    addCondition("status", "=", query.status);
  }

  if (query.type !== undefined) {
    addCondition("type", "=", query.type);
  }

  if (query.createdFrom !== undefined) {
    addCondition("created_at", ">=", query.createdFrom);
  }

  if (query.createdTo !== undefined) {
    addCondition("created_at", "<=", query.createdTo);
  }

  if (cursor) {
    values.push(cursor.createdAt, cursor.id);

    conditions.push(
      `(created_at, id) < ($${values.length - 1}, $${values.length})`,
    );
  }

  values.push(query.limit + 1);

  const sql = `
    SELECT
      id::text,
      tenant_id::text AS "tenantId",
      type,
      status,
      attempts,
      max_attempts AS "maxAttempts",
     to_char(
      created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS "createdAt",
    to_char(
      updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS "updatedAt"
    FROM jobs
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    LIMIT $${values.length}
  `;

  const result = await pool.query<JobSummaryRow>(sql, values);

  const hasMore = result.rows.length > query.limit;

  const jobs: JobSummary[] = result.rows.slice(0, query.limit).map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return {
    jobs,
    hasMore,
  };
}
