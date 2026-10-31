import type { Pool } from "pg";

import type {
  JobAuditEvent,
  JobAuditEventRow,
  ListJobAuditEventsParams,
} from "./audit-query.types.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export async function listJobAuditEvents(
  pool: Pool,
  params: ListJobAuditEventsParams,
): Promise<JobAuditEvent[]> {
  const { tenantId, jobId } = params;
  const limit = params.limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError("Invalid audit event limit");
  }

  const result = await pool.query<JobAuditEventRow>(
    `SELECT
      ae.id::text AS id,
      ae.tenant_id::text AS "tenantId",
      ae.actor,
      ae.action,
      ae.resource_id AS "resourceId",
      ae.created_at AS "createdAt"
    FROM audit_events AS ae
    INNER JOIN jobs AS j
      ON j.id::text = ae.resource_id
      AND j.tenant_id = ae.tenant_id
    WHERE ae.tenant_id = $1
      AND j.id = $2
    ORDER BY ae.created_at ASC, ae.id ASC
    LIMIT $3`,
    [tenantId, jobId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    actor: row.actor,
    action: row.action,
    resourceId: row.resourceId,
    createdAt: row.createdAt.toISOString(),
  }));
}
