import type { PoolClient } from "pg";

export interface CreateAuditEventParams {
  tenantId: string;
  actor: string;
  action: string;
  resourceId: string;
}

export async function insertAuditEvent(
  client: PoolClient,
  params: CreateAuditEventParams,
): Promise<void> {
  const { tenantId, actor, action, resourceId } = params;

  await client.query(
    `INSERT INTO audit_events (
      tenant_id,
      actor,
      action,
      resource_id
    )
    VALUES ($1, $2, $3, $4)`,
    [tenantId, actor, action, resourceId],
  );
}
