import {
  JobListCursorSchema,
  type JobListCursor,
  type JobListQuery,
} from "@lab/contracts";

export class InvalidJobCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor");
    this.name = "InvalidJobCursorError";
  }
}

type JobCursorFilters = JobListCursor["filters"];

function getFilters(query: JobListQuery): JobCursorFilters {
  return {
    ...(query.status !== undefined && { status: query.status }),
    ...(query.type !== undefined && { type: query.type }),
    ...(query.createdFrom !== undefined && {
      createdFrom: query.createdFrom,
    }),
    ...(query.createdTo !== undefined && {
      createdTo: query.createdTo,
    }),
  };
}

export function encodeJobCursor(cursor: JobListCursor): string {
  const validated = JobListCursorSchema.parse(cursor);

  return Buffer.from(JSON.stringify(validated), "utf8").toString("base64url");
}

export function decodeJobCursor(
  encoded: string,
  tenantId: string,
  query: JobListQuery,
): JobListCursor {
  try {
    if (
      encoded.length === 0 ||
      encoded.length > 4096 ||
      !/^[A-Za-z0-9_-]+$/.test(encoded)
    ) {
      throw new InvalidJobCursorError();
    }

    const json = Buffer.from(encoded, "base64url").toString("utf8");

    // Reject non-canonical Base64URL representations.
    if (Buffer.from(json, "utf8").toString("base64url") !== encoded) {
      throw new InvalidJobCursorError();
    }

    const parsed = JobListCursorSchema.parse(JSON.parse(json));

    if (parsed.tenantId !== tenantId) {
      throw new InvalidJobCursorError();
    }

    if (parsed.limit !== query.limit) {
      throw new InvalidJobCursorError();
    }

    const expectedFilters = getFilters(query);

    if (JSON.stringify(parsed.filters) !== JSON.stringify(expectedFilters)) {
      throw new InvalidJobCursorError();
    }

    return parsed;
  } catch {
    throw new InvalidJobCursorError();
  }
}

export function createNextJobCursor(
  lastJob: { id: string; createdAt: string },
  tenantId: string,
  query: JobListQuery,
): string {
  return encodeJobCursor({
    version: 1,
    tenantId,
    id: lastJob.id,
    createdAt: lastJob.createdAt,
    filters: getFilters(query),
    limit: query.limit,
  });
}
