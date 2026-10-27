import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobListQuery } from "@lab/contracts";

import {
  createNextJobCursor,
  decodeJobCursor,
  encodeJobCursor,
  InvalidJobCursorError,
} from "./job-cursor.js";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jobId = "550e8400-e29b-41d4-a716-446655440000";
const createdAt = "2026-10-27T10:00:00.000Z";

const query: JobListQuery = {
  status: "queued",
  type: "report",
  limit: 20,
};

test("encodes and decodes a valid job cursor", () => {
  const encoded = createNextJobCursor({ id: jobId, createdAt }, tenantA, query);

  const decoded = decodeJobCursor(encoded, tenantA, query);

  assert.equal(decoded.version, 1);
  assert.equal(decoded.tenantId, tenantA);
  assert.equal(decoded.id, jobId);
  assert.equal(decoded.createdAt, createdAt);
  assert.equal(decoded.limit, 20);
  assert.deepEqual(decoded.filters, {
    status: "queued",
    type: "report",
  });
});

test("rejects cursor belonging to another tenant", () => {
  const encoded = createNextJobCursor({ id: jobId, createdAt }, tenantA, query);

  assert.throws(
    () => decodeJobCursor(encoded, tenantB, query),
    InvalidJobCursorError,
  );
});

test("rejects cursor when filters change", () => {
  const encoded = createNextJobCursor({ id: jobId, createdAt }, tenantA, query);

  assert.throws(
    () =>
      decodeJobCursor(encoded, tenantA, {
        ...query,
        status: "completed",
      }),
    InvalidJobCursorError,
  );
});

test("rejects cursor when pagination limit changes", () => {
  const encoded = createNextJobCursor({ id: jobId, createdAt }, tenantA, query);

  assert.throws(
    () =>
      decodeJobCursor(encoded, tenantA, {
        ...query,
        limit: 50,
      }),
    InvalidJobCursorError,
  );
});

test("rejects malformed Base64URL cursors", () => {
  for (const cursor of ["", "invalid!", "a", "%%%%", "a".repeat(4097)]) {
    assert.throws(
      () => decodeJobCursor(cursor, tenantA, query),
      InvalidJobCursorError,
    );
  }
});

test("rejects unsupported cursor versions", () => {
  const encoded = Buffer.from(
    JSON.stringify({
      version: 2,
      tenantId: tenantA,
      id: jobId,
      createdAt,
      filters: {
        status: "queued",
        type: "report",
      },
      limit: 20,
    }),
  ).toString("base64url");

  assert.throws(
    () => decodeJobCursor(encoded, tenantA, query),
    InvalidJobCursorError,
  );
});

test("rejects modified cursor payloads", () => {
  const valid = createNextJobCursor({ id: jobId, createdAt }, tenantA, query);

  const payload = JSON.parse(
    Buffer.from(valid, "base64url").toString("utf8"),
  ) as Record<string, unknown>;

  payload.tenantId = tenantB;

  const modified = Buffer.from(JSON.stringify(payload)).toString("base64url");

  assert.throws(
    () => decodeJobCursor(modified, tenantA, query),
    InvalidJobCursorError,
  );
});

test("rejects invalid cursor payload structure", () => {
  const encoded = Buffer.from(
    JSON.stringify({
      version: 1,
      tenantId: tenantA,
      id: "not-a-uuid",
      createdAt,
      filters: {},
      limit: 20,
    }),
  ).toString("base64url");

  assert.throws(
    () => decodeJobCursor(encoded, tenantA, query),
    InvalidJobCursorError,
  );
});

test("encodeJobCursor validates its input", () => {
  assert.throws(() =>
    encodeJobCursor({
      version: 1,
      tenantId: tenantA,
      id: "invalid-id",
      createdAt,
      filters: {},
      limit: 20,
    }),
  );
});
