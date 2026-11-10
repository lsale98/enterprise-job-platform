import type { Pool } from "pg";

export async function isPlatformAdmin(
  pool: Pool,
  subject: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM platform_role_assignments
      WHERE subject = $1
        AND role = 'platform_admin'
      LIMIT 1
    `,
    [subject],
  );

  return result.rowCount === 1;
}
