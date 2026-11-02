import assert from "node:assert/strict";
import { test } from "node:test";

import { signWebhook, verifyWebhook } from "./signing.js";

const secret = "test-secret-not-for-production";
const timestamp = 1_800_000_000;
const body = JSON.stringify({
  id: "event-123",
  type: "job.completed",
  data: {
    jobId: "job-123",
  },
});

test("produces a deterministic HMAC-SHA256 signature", () => {
  const first = signWebhook({
    secret,
    timestamp,
    body,
  });

  const second = signWebhook({
    secret,
    timestamp,
    body,
  });

  assert.equal(first, second);
  assert.match(first, /^v1=[0-9a-f]{64}$/);
});

test("accepts an authentic payload within the replay window", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  assert.equal(
    verifyWebhook({
      secret,
      timestamp,
      body,
      signature,
      now: timestamp + 60,
    }),
    true,
  );
});

test("rejects a modified payload", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  assert.equal(
    verifyWebhook({
      secret,
      timestamp,
      body: body.replace("job-123", "job-456"),
      signature,
      now: timestamp,
    }),
    false,
  );
});

test("rejects a different signing secret", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  assert.equal(
    verifyWebhook({
      secret: "another-secret",
      timestamp,
      body,
      signature,
      now: timestamp,
    }),
    false,
  );
});

test("rejects expired and future-dated requests", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  for (const now of [timestamp + 301, timestamp - 301]) {
    assert.equal(
      verifyWebhook({
        secret,
        timestamp,
        body,
        signature,
        now,
      }),
      false,
    );
  }
});

test("accepts timestamps exactly at tolerance boundaries", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  for (const now of [timestamp - 300, timestamp + 300]) {
    assert.equal(
      verifyWebhook({
        secret,
        timestamp,
        body,
        signature,
        now,
      }),
      true,
    );
  }
});

test("rejects malformed signatures", () => {
  for (const signature of [
    "",
    "v1=xyz",
    "v2=" + "a".repeat(64),
    "v1=" + "a".repeat(63),
    "v1=" + "A".repeat(64),
  ]) {
    assert.equal(
      verifyWebhook({
        secret,
        timestamp,
        body,
        signature,
        now: timestamp,
      }),
      false,
    );
  }
});

test("rejects invalid timestamps", () => {
  const signature = signWebhook({
    secret,
    timestamp,
    body,
  });

  assert.equal(
    verifyWebhook({
      secret,
      timestamp: Number.NaN,
      body,
      signature,
    }),
    false,
  );

  assert.equal(
    verifyWebhook({
      secret,
      timestamp: -1,
      body,
      signature,
    }),
    false,
  );
});

test("requires a nonempty signing secret", () => {
  assert.throws(
    () =>
      signWebhook({
        secret: "",
        timestamp,
        body,
      }),
    /secret is required/,
  );
});
