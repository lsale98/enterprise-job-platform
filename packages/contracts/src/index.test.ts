import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateJobSchema, JobSchema, hasPermission } from "./index.js";

test("report validation rejects NaN and empty arrays", () => {
  assert.equal(
    CreateJobSchema.safeParse({ type: "report", numbers: [2, 3] }).success,
    true,
  );
  assert.equal(
    CreateJobSchema.safeParse({ type: "report", numbers: [] }).success,
    false,
  );
  assert.equal(
    CreateJobSchema.safeParse({ type: "report", numbers: [NaN] }).success,
    false,
  );
});
test("viewer cannot create jobs", () => {
  assert.equal(hasPermission("viewer", "jobs:create"), false);
  assert.equal(hasPermission("operator", "jobs:create"), true);
});

test("all supported job types accept valid payloads", () => {
  assert.equal(
    CreateJobSchema.safeParse({ type: "report", numbers: [1, 2] }).success,
    true,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "import",
      records: [{ externalId: "r-1", value: 4 }],
    }).success,
    true,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "notification",
      subject: "Hello",
      message: "World",
    }).success,
    true,
  );
});

test("rejects malformed import and notification payloads", () => {
  assert.equal(
    CreateJobSchema.safeParse({ type: "import", records: [] }).success,
    false,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "import",
      records: [{ externalId: "", value: 2 }],
    }).success,
    false,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "notification",
      subject: "",
      message: "Content",
    }).success,
    false,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "notification",
      subject: "Topic",
      message: "",
    }).success,
    false,
  );
});

test("rejects unsupported job types and mismatched discriminated union payloads", () => {
  assert.equal(
    CreateJobSchema.safeParse({ type: "unknown", numbers: [1] }).success,
    false,
  );
  assert.equal(
    CreateJobSchema.safeParse({
      type: "report",
      subject: "Wrong",
      message: "Shape",
    }).success,
    false,
  );
  assert.equal(CreateJobSchema.safeParse(null).success, false);
});

test("validates job API response at runtime", () => {
  const valid = {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    type: "report",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    input: { type: "report", numbers: [1, 2, 3] },
    result: null,
    error: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
  };
  assert.equal(JobSchema.safeParse(valid).success, true);
  assert.equal(
    JobSchema.safeParse({ ...valid, id: "not-a-uuid" }).success,
    false,
  );
  assert.equal(
    JobSchema.safeParse({ ...valid, status: "unknown" }).success,
    false,
  );
  assert.equal(
    JobSchema.safeParse({ ...valid, input: { type: "report", numbers: [] } })
      .success,
    false,
  );
});
