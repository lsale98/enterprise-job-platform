import type { Pool } from "pg";

export interface TenantContextRecord {
  id: string;
  name: string;
  role: string;
}

export async function findTenantContext(
  pool: Pool,
  subject: string,
  tenantId: string,
): Promise<TenantContextRecord | null> {
  const result = await pool.query<TenantContextRecord>(
    `
      SELECT
        t.id,
        t.name,
        m.role
      FROM memberships AS m
      INNER JOIN tenants AS t
        ON t.id = m.tenant_id
      WHERE m.tenant_id = $1
        AND m.subject = $2
    `,
    [tenantId, subject],
  );

  return result.rows[0] ?? null;
}
