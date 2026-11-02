import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSigningSecret,
  WebhookSecretError,
} from "./resolve-signing-secret.js";

const secret = "test-secret-with-at-least-32-characters-long";

test("resolves an allowlisted environment secret", () => {
  assert.equal(
    resolveSigningSecret("env:WEBHOOK_SECRET_CUSTOMER_A", {
      WEBHOOK_SECRET_CUSTOMER_A: secret,
    }),
    secret,
  );
});

test("rejects arbitrary environment variables", () => {
  assert.throws(
    () =>
      resolveSigningSecret("env:DATABASE_URL", {
        DATABASE_URL: secret,
      }),
    WebhookSecretError,
  );
});

test("rejects missing or weak secrets", () => {
  assert.throws(
    () => resolveSigningSecret("env:WEBHOOK_SECRET_CUSTOMER_A", {}),
    WebhookSecretError,
  );

  assert.throws(
    () =>
      resolveSigningSecret("env:WEBHOOK_SECRET_CUSTOMER_A", {
        WEBHOOK_SECRET_CUSTOMER_A: "short",
      }),
    WebhookSecretError,
  );
});
