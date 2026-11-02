import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyWebhookStatus,
  isRetryableHttpStatus,
  sendWebhook,
} from "./send-webhook.js";

test("accepts successful HTTP responses", () => {
  for (const statusCode of [200, 201, 202, 204]) {
    assert.deepEqual(classifyWebhookStatus(statusCode), {
      kind: "delivered",
      statusCode,
    });
  }
});

test("classifies transient HTTP failures", () => {
  for (const statusCode of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableHttpStatus(statusCode), true);

    assert.deepEqual(classifyWebhookStatus(statusCode), {
      kind: "failed",
      retryable: true,
      statusCode,
      reason: `HTTP ${statusCode}`,
    });
  }
});

test("classifies permanent HTTP failures", () => {
  for (const statusCode of [301, 302, 307, 308, 400, 401, 403, 404, 422]) {
    assert.equal(isRetryableHttpStatus(statusCode), false);

    assert.deepEqual(classifyWebhookStatus(statusCode), {
      kind: "failed",
      retryable: false,
      statusCode,
      reason: `HTTP ${statusCode}`,
    });
  }
});

test("rejects an invalid request timeout", async () => {
  await assert.rejects(
    sendWebhook({
      url: "https://hooks.example.com/events",
      eventId: "event-1",
      payload: { type: "job.completed" },
      secret: "test-secret",
      timeoutMs: 0,
    }),
    RangeError,
  );
});

test("rejects an invalid response size limit", async () => {
  await assert.rejects(
    sendWebhook({
      url: "https://hooks.example.com/events",
      eventId: "event-1",
      payload: { type: "job.completed" },
      secret: "test-secret",
      maxResponseBytes: 0,
    }),
    RangeError,
  );
});

test("rejects unsafe URLs before performing DNS lookup", async () => {
  await assert.rejects(
    sendWebhook({
      url: "https://127.0.0.1/events",
      eventId: "event-1",
      payload: { type: "job.completed" },
      secret: "test-secret",
    }),
    /IP literal webhook destinations are not allowed/,
  );
});

test("rejects unserializable payloads", async () => {
  await assert.rejects(
    sendWebhook({
      url: "https://hooks.example.com/events",
      eventId: "event-1",
      payload: { value: 1n },
      secret: "test-secret",
    }),
    TypeError,
  );
});
