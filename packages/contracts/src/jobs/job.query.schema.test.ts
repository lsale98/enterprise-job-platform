import assert from "node:assert/strict";
import { test } from "node:test";

import { JobListCursorSchema, JobListQuerySchema } from "./job.query.schema.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "550e8400-e29b-41d4-a716-446655440000";

test("uses the default pagination limit", () => {
  const result = JobListQuerySchema.parse({});

  assert.equal(result.limit, 20);
});

test("accepts valid filters and pagination", () => {
  const result = JobListQuerySchema.parse({
    status: "completed",
    type: "report",
    createdFrom: "2026-10-01T00:00:00Z",
    createdTo: "2026-10-27T23:59:59Z",
    limit: "50",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.type, "report");
  assert.equal(result.limit, 50);
});

test("accepts pagination limit boundaries", () => {
  assert.equal(JobListQuerySchema.parse({ limit: "1" }).limit, 1);
  assert.equal(JobListQuerySchema.parse({ limit: "100" }).limit, 100);
});

test("rejects invalid pagination limits", () => {
  for (const limit of ["0", "-1", "101", "1.5", "abc", ""]) {
    assert.equal(JobListQuerySchema.safeParse({ limit }).success, false);
  }
});

test("rejects invalid job status and type", () => {
  assert.equal(
    JobListQuerySchema.safeParse({ status: "unknown" }).success,
    false,
  );

  assert.equal(
    JobListQuerySchema.safeParse({ type: "invalid" }).success,
    false,
  );
});

test("rejects unknown query parameters", () => {
  const result = JobListQuerySchema.safeParse({
    limit: "20",
    tenantId,
  });

  assert.equal(result.success, false);
});

test("rejects dates without timezone information", () => {
  const result = JobListQuerySchema.safeParse({
    createdFrom: "2026-10-01T12:00:00",
  });

  assert.equal(result.success, false);
});

test("rejects reversed date ranges", () => {
  const result = JobListQuerySchema.safeParse({
    createdFrom: "2026-10-27T00:00:00Z",
    createdTo: "2026-10-01T00:00:00Z",
  });

  assert.equal(result.success, false);
});

test("accepts a valid cursor payload", () => {
  const result = JobListCursorSchema.safeParse({
    version: 1,
    tenantId,
    createdAt: "2026-10-27T10:00:00Z",
    id: jobId,
    filters: {
      status: "queued",
      type: "report",
    },
    limit: 20,
  });

  assert.equal(result.success, true);
});

test("rejects unsupported cursor versions", () => {
  const result = JobListCursorSchema.safeParse({
    version: 2,
    tenantId,
    createdAt: "2026-10-27T10:00:00Z",
    id: jobId,
    filters: {},
    limit: 20,
  });

  assert.equal(result.success, false);
});

test("rejects malformed cursor payloads", () => {
  const result = JobListCursorSchema.safeParse({
    version: 1,
    tenantId: "invalid",
    createdAt: "not-a-date",
    id: "invalid",
    filters: {},
    limit: 20,
  });

  assert.equal(result.success, false);
});

test("rejects unknown cursor fields", () => {
  const result = JobListCursorSchema.safeParse({
    version: 1,
    tenantId,
    createdAt: "2026-10-27T10:00:00Z",
    id: jobId,
    filters: {},
    limit: 20,
    isAdmin: true,
  });

  assert.equal(result.success, false);
});
