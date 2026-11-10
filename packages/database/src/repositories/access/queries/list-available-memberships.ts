import type { Pool } from "pg";

import type {
  ListMembershipsOptions,
  MembershipPage,
  TenantListRow,
} from "../access.types.js";

import {
  decodeMembershipCursor,
  encodeMembershipCursor,
} from "../pagination/membership-cursor.js";

export async function listAvailableMemberships(
  pool: Pool,
  subject: string,
  options: ListMembershipsOptions,
): Promise<MembershipPage> {
  const { limit, cursor } = options;
  const search = options.search.trim().toLowerCase();

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    search.length > 100
  ) {
    throw new RangeError("Invalid membership list options");
  }

  const after = cursor ? decodeMembershipCursor(cursor, search) : null;

  const result = await pool.query<TenantListRow>(
    `
      SELECT
        t.id,
        t.name,
        m.role,
        LOWER(t.name) AS "sortName"
      FROM memberships AS m
      INNER JOIN tenants AS t
        ON t.id = m.tenant_id
      WHERE m.subject = $1
        AND (
          $2::text = ''
          OR POSITION($2 IN LOWER(t.name)) > 0
        )
        AND (
          $3::text IS NULL
          OR (
            LOWER(t.name),
            t.id
          ) > (
            $3::text,
            $4::uuid
          )
        )
      ORDER BY
        LOWER(t.name) ASC,
        t.id ASC
      LIMIT $5
    `,
    [subject, search, after?.sortName ?? null, after?.id ?? null, limit + 1],
  );

  const hasMore = result.rows.length > limit;
  const page = result.rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: page.map(({ id, name, role }) => ({
      id,
      name,
      role,
    })),
    nextCursor:
      hasMore && last
        ? encodeMembershipCursor({
            version: 1,
            search,
            sortName: last.sortName,
            id: last.id,
          })
        : null,
  };
}
