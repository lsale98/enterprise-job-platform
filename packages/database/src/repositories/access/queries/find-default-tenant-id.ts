import type { Pool } from "pg";

export async function findDefaultTenantId(
  pool: Pool,
  subject: string,
): Promise<string | null> {
  const result = await pool.query<{ tenantId: string }>(
    `
      SELECT
        tenant_id AS "tenantId"
      FROM memberships
      WHERE subject = $1
      ORDER BY tenant_id
      LIMIT 1
    `,
    [subject],
  );

  return result.rows[0]?.tenantId ?? null;
}
