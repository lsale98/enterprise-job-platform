import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UnsafeWebhookUrlError,
  validateWebhookUrl,
} from "./validate-webhook-url.js";

test("accepts valid HTTPS webhook endpoints", () => {
  const url = validateWebhookUrl(
    "https://hooks.example.com/events?source=jobs",
  );

  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "hooks.example.com");
  assert.equal(url.pathname, "/events");
  assert.equal(url.searchParams.get("source"), "jobs");
});

test("rejects HTTP destinations", () => {
  assert.throws(
    () => validateWebhookUrl("http://hooks.example.com"),
    UnsafeWebhookUrlError,
  );
});

test("rejects URLs containing credentials", () => {
  assert.throws(
    () => validateWebhookUrl("https://user:password@hooks.example.com/events"),
    UnsafeWebhookUrlError,
  );
});

test("rejects nonstandard HTTPS ports", () => {
  assert.throws(
    () => validateWebhookUrl("https://hooks.example.com:8443/events"),
    UnsafeWebhookUrlError,
  );
});

test("rejects local and reserved destinations", () => {
  const destinations = [
    "https://localhost/events",
    "https://api.localhost/events",
    "https://service.internal/events",
    "https://service.local/events",
    "https://example.test/events",
    "https://127.0.0.1/events",
    "https://10.0.0.1/events",
    "https://[::1]/events",
  ];

  for (const destination of destinations) {
    assert.throws(
      () => validateWebhookUrl(destination),
      UnsafeWebhookUrlError,
      destination,
    );
  }
});

test("rejects fragments and malformed URLs", () => {
  const destinations = [
    "not-a-url",
    "https://hooks.example.com/events#fragment",
    "ftp://hooks.example.com/events",
  ];

  for (const destination of destinations) {
    assert.throws(
      () => validateWebhookUrl(destination),
      UnsafeWebhookUrlError,
      destination,
    );
  }
});
