import { InvalidMembershipCursorError } from "../errors/invalid-membership-cursor.error.js";

interface MembershipCursor {
  version: 1;
  search: string;
  sortName: string;
  id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeMembershipCursor(cursor: MembershipCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMembershipCursor(
  encoded: string,
  expectedSearch: string,
): MembershipCursor {
  if (!encoded || encoded.length > 2048) {
    throw new InvalidMembershipCursorError();
  }

  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");

    if (Buffer.from(json, "utf8").toString("base64url") !== encoded) {
      throw new InvalidMembershipCursorError();
    }

    const value: unknown = JSON.parse(json);

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new InvalidMembershipCursorError();
    }

    const cursor = value as Partial<MembershipCursor>;

    if (
      cursor.version !== 1 ||
      typeof cursor.search !== "string" ||
      cursor.search !== expectedSearch ||
      typeof cursor.sortName !== "string" ||
      cursor.sortName.length === 0 ||
      cursor.sortName.length > 1000 ||
      typeof cursor.id !== "string" ||
      !UUID_PATTERN.test(cursor.id)
    ) {
      throw new InvalidMembershipCursorError();
    }

    return {
      version: 1,
      search: cursor.search,
      sortName: cursor.sortName,
      id: cursor.id,
    };
  } catch {
    throw new InvalidMembershipCursorError();
  }
}
