import type { Pool } from "pg";

import type { UserTenantMembership } from "../membership.types.js";

export async function listMembershipsBySubject(
  pool: Pool,
  subject: string,
): Promise<UserTenantMembership[]> {
  if (!subject.trim()) {
    return [];
  }

  const result = await pool.query<UserTenantMembership>(
    `
      SELECT
        m.tenant_id AS "tenantId",
        t.name AS "tenantName",
        m.role
      FROM memberships AS m
      INNER JOIN tenants AS t
        ON t.id = m.tenant_id
      WHERE m.subject = $1
      ORDER BY t.name ASC, m.tenant_id ASC
    `,
    [subject],
  );

  return result.rows;
}
