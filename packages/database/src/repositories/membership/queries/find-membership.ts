import type { Pool } from "pg";

import type { MembershipRecord } from "../membership.types.js";

export async function findMembership(
  pool: Pool,
  subject: string,
  tenantId: string,
): Promise<MembershipRecord | null> {
  const result = await pool.query<MembershipRecord>(
    `
      SELECT
        tenant_id AS "tenantId",
        subject,
        role
      FROM memberships
      WHERE subject = $1
        AND tenant_id = $2
    `,
    [subject, tenantId],
  );

  return result.rows[0] ?? null;
}
