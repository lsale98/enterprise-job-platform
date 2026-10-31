import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuthenticatedIdentity } from "@lab/auth";

import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";

const testConfig = loadConfig({
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_KEYCLOAK_ISSUER: "https://auth.example.test/realms/test",
  AUTH_API_AUDIENCE: "enterprise-job-platform-api",
  LOG_LEVEL: "silent",
});

const testIdentity: AuthenticatedIdentity = {
  subject: "11111111-1111-4111-8111-111111111111",
  issuer: testConfig.AUTH_KEYCLOAK_ISSUER,
};

function createTestApp() {
  const app = buildApp(testConfig, {
    verifyAccessToken: async (token: string) => {
      if (token !== "valid-test-token") {
        throw new Error("Invalid token");
      }

      return testIdentity;
    },
    authorize: async (subject, tenantId) => ({
      allowed: true,
      context: {
        subject,
        tenantId,
        role: "operator",
      },
    }),

    createJob: async () => {
      throw new Error("Not implemented in this test");
    },

    listJobs: async () => ({
      jobs: [],
      hasMore: false,
    }),

    getJobById: async () => null,

    listJobAuditEvents: async () => [],
  });

  app.register(async (instance) => {
    instance.get(
      "/test/protected",
      {
        preHandler: instance.authenticate,
      },
      async (request) => ({
        subject: request.identity?.subject,
      }),
    );
  });

  return app;
}
test("GET /health returns 200 OK", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
  });
});

test("unknown routes return 404", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/unknown",
  });

  assert.equal(response.statusCode, 404);
});

test("protected route rejects missing bearer token", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/test/protected",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Missing bearer token");
});

test("protected route rejects malformed authorization header", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/test/protected",
    headers: {
      authorization: "Basic some-credentials",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Invalid authorization header");
});

test("protected route rejects invalid access token", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/test/protected",
    headers: {
      authorization: "Bearer invalid-test-token",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Invalid access token");
});

test("protected route accepts valid access token", async (t) => {
  const app = createTestApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/test/protected",
    headers: {
      authorization: "Bearer valid-test-token",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    subject: testIdentity.subject,
  });
});
