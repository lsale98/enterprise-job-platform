import type { Pool } from "pg";

import type { TenantAccessRecord } from "../access.types.js";

export async function findTenantAccess(
  pool: Pool,
  subject: string,
  tenantId: string,
): Promise<TenantAccessRecord | null> {
  const result = await pool.query<TenantAccessRecord>(
    `
      SELECT
        t.id,
        t.name,
        m.role
      FROM memberships AS m
      INNER JOIN tenants AS t
        ON t.id = m.tenant_id
      WHERE m.subject = $1
        AND m.tenant_id = $2
    `,
    [subject, tenantId],
  );

  return result.rows[0] ?? null;
}
