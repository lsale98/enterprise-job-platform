import type { JobSummary } from "../job.types.js";

export const JOB_COMMAND_PROJECTION = `
  id::text AS id,
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
`;

export function mapJobCommandRow(row: JobSummary): JobSummary {
  return row;
}
