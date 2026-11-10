import assert from "node:assert/strict";
import { test } from "node:test";

import { InvalidMembershipCursorError } from "../errors/invalid-membership-cursor.error.js";

import {
  decodeMembershipCursor,
  encodeMembershipCursor,
} from "./membership-cursor.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("encodes and decodes a membership cursor", () => {
  const cursor = {
    version: 1 as const,
    search: "acme",
    sortName: "acme",
    id: tenantId,
  };

  const encoded = encodeMembershipCursor(cursor);

  assert.deepEqual(decodeMembershipCursor(encoded, "acme"), cursor);
});

test("rejects a cursor from a different search", () => {
  const encoded = encodeMembershipCursor({
    version: 1,
    search: "acme",
    sortName: "acme",
    id: tenantId,
  });

  assert.throws(
    () => decodeMembershipCursor(encoded, "contoso"),
    InvalidMembershipCursorError,
  );
});

test("rejects invalid cursor content", () => {
  assert.throws(
    () => decodeMembershipCursor("invalid", ""),
    InvalidMembershipCursorError,
  );
});

test("rejects malformed tenant identifiers", () => {
  const encoded = encodeMembershipCursor({
    version: 1,
    search: "",
    sortName: "acme",
    id: "not-a-uuid",
  });

  assert.throws(
    () => decodeMembershipCursor(encoded, ""),
    InvalidMembershipCursorError,
  );
});
