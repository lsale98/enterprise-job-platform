import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

import { IdempotencyConflictError } from "@lab/database/job-repository";

import { buildApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";

import type { JobsDependencies } from "./jobs.types.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const subject = "11111111-1111-4111-8111-111111111111";

const config = loadConfig({
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_KEYCLOAK_ISSUER: "https://auth.example.test/realms/test",
  AUTH_API_AUDIENCE: "enterprise-job-platform-api",
  LOG_LEVEL: "silent",
});

const validBody = {
  type: "report" as const,
  numbers: [1, 2, 3],
};

function createTestApp(overrides: Partial<JobsDependencies> = {}) {
  const calls: Array<{
    tenantId: string;
    createdBy: string;
    idempotencyKey: string;
  }> = [];

  const app = buildApp(config, {
    verifyAccessToken: async (token) => {
      if (token !== "valid-token") {
        throw new Error("Invalid token");
      }

      return {
        subject,
        issuer: config.AUTH_KEYCLOAK_ISSUER,
      };
    },

    authorize:
      overrides.authorize ??
      (async (authenticatedSubject, requestedTenantId) => ({
        allowed: true as const,
        context: {
          subject: authenticatedSubject,
          tenantId: requestedTenantId,
          role: "operator" as const,
        },
      })),

    createJob:
      overrides.createJob ??
      (async (params) => {
        calls.push({
          tenantId: params.tenantId,
          createdBy: params.createdBy,
          idempotencyKey: params.idempotencyKey,
        });

        return {
          kind: "created" as const,
          job: {
            id: randomUUID(),
            tenantId: params.tenantId,
            createdBy: params.createdBy,
            type: params.input.type,
            input: params.input,
            status: "queued" as const,
            requestHash: "test-hash",
          },
        };
      }),
  });

  return { app, calls };
}

function createRequest(
  options: {
    token?: string;
    idempotencyKey?: string;
    payload?: unknown;
  } = {},
) {
  return {
    method: "POST" as const,
    url: `/v1/tenants/${tenantId}/jobs`,
    headers: {
      authorization: `Bearer ${options.token ?? "valid-token"}`,
      "idempotency-key": options.idempotencyKey ?? "test_key_123",
    },
    payload: options.payload ?? validBody,
  };
}

test("creates a job and returns 201", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(createRequest());

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().replayed, false);
  assert.equal(response.json().job.status, "queued");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.tenantId, tenantId);
  assert.equal(calls[0]?.createdBy, subject);
});

test("returns 401 without a bearer token", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const request = createRequest();
  const response = await app.inject({
    ...request,
    headers: {
      "idempotency-key": "test_key_123",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("returns 401 for an invalid token", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(createRequest({ token: "invalid-token" }));

  assert.equal(response.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("returns 403 when membership lacks jobs:create permission", async (t) => {
  const { app, calls } = createTestApp({
    authorize: async () => ({
      allowed: false,
      reason: "FORBIDDEN",
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject(createRequest());

  assert.equal(response.statusCode, 403);
  assert.equal(calls.length, 0);
});

test("returns 400 for an invalid idempotency key", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(createRequest({ idempotencyKey: "short" }));

  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("returns 400 for an invalid job payload", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(
    createRequest({ payload: { type: "invalid-type" } }),
  );

  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("returns 200 for an idempotent replay", async (t) => {
  const { app } = createTestApp({
    createJob: async (params) => ({
      kind: "replayed",
      job: {
        id: randomUUID(),
        tenantId: params.tenantId,
        createdBy: params.createdBy,
        type: params.input.type,
        input: params.input,
        status: "queued",
        requestHash: "test-hash",
      },
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject(createRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().replayed, true);
});

test("returns 409 for an idempotency conflict", async (t) => {
  const { app } = createTestApp({
    createJob: async () => {
      throw new IdempotencyConflictError();
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(createRequest());

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "Conflict");
});

test("returns 500 when job creation fails unexpectedly", async (t) => {
  const { app } = createTestApp({
    createJob: async () => {
      throw new Error("Database unavailable");
    },
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject(createRequest());

  assert.equal(response.statusCode, 500);

  // Internal error details must not be exposed to clients.
  assert.notEqual(response.json().message, "Database unavailable");
});
