import assert from "node:assert/strict";
import { test } from "node:test";

import { loadWebhookDispatcherConfig } from "./webhook.config.js";

test("loads safe default dispatcher configuration", () => {
  const config = loadWebhookDispatcherConfig({});

  assert.equal(config.leaseSeconds, 60);
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.equal(config.pollIntervalMs, 1000);
  assert.equal(config.recoveryBatchSize, 100);
});

test("rejects a lease shorter than request timeout", () => {
  assert.throws(
    () =>
      loadWebhookDispatcherConfig({
        WEBHOOK_LEASE_SECONDS: "5",
        WEBHOOK_REQUEST_TIMEOUT_MS: "10000",
      }),
    /Webhook lease must exceed request timeout/,
  );
});

test("rejects invalid numeric configuration", () => {
  assert.throws(
    () =>
      loadWebhookDispatcherConfig({
        WEBHOOK_POLL_INTERVAL_MS: "abc",
      }),
    RangeError,
  );
});
