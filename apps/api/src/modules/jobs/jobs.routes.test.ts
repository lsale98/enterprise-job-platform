import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

import { IdempotencyConflictError } from "@lab/database/job-repository";

import { buildJobsTestApp } from "./testing/build-jobs-test-app.js";
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

const secondTenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const testJobId = "550e8400-e29b-41d4-a716-446655440000";

const testJob = {
  id: testJobId,
  tenantId,
  type: "report" as const,
  status: "queued" as const,
  attempts: 0,
  maxAttempts: 3,
  input: validBody,
  result: null,
  error: null,
  createdAt: "2026-10-27T10:00:00.123456Z",
  updatedAt: "2026-10-27T10:00:00.123456Z",
};

function createTestApp(overrides: Partial<JobsDependencies> = {}) {
  const calls: Array<{
    tenantId: string;
    createdBy: string;
    idempotencyKey: string;
  }> = [];

  const app = buildJobsTestApp({
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

    listJobs:
      overrides.listJobs ??
      (async () => ({
        jobs: [],
        hasMore: false,
      })),

    getJobById: overrides.getJobById ?? (async () => null),

    listJobAuditEvents: overrides.listJobAuditEvents ?? (async () => []),

    retryJob:
      overrides.retryJob ?? (async () => ({ kind: "not_found" as const })),

    cancelJob:
      overrides.cancelJob ?? (async () => ({ kind: "not_found" as const })),
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

function listRequest(query = "") {
  return {
    method: "GET" as const,
    url: `/v1/tenants/${tenantId}/jobs${query}`,
    headers: {
      authorization: "Bearer valid-token",
    },
  };
}

function detailsRequest(jobId = testJobId, requestedTenantId = tenantId) {
  return {
    method: "GET" as const,
    url: `/v1/tenants/${requestedTenantId}/jobs/${jobId}`,
    headers: {
      authorization: "Bearer valid-token",
    },
  };
}

test("GET jobs returns an empty list", async (t) => {
  const { app } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(listRequest());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    jobs: [],
    nextCursor: null,
  });
});

test("GET jobs passes filters to the repository", async (t) => {
  let receivedQuery: unknown;

  const { app } = createTestApp({
    listJobs: async (params) => {
      receivedQuery = params.query;

      assert.equal(params.tenantId, tenantId);

      return {
        jobs: [],
        hasMore: false,
      };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(
    listRequest("?status=queued&type=report&limit=5"),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(receivedQuery, {
    status: "queued",
    type: "report",
    limit: 5,
  });
});

test("GET jobs returns nextCursor when another page exists", async (t) => {
  const { app } = createTestApp({
    listJobs: async () => ({
      jobs: [testJob],
      hasMore: true,
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject(listRequest("?limit=1"));

  assert.equal(response.statusCode, 200);

  const body = response.json();

  assert.equal(body.jobs.length, 1);
  assert.equal(typeof body.nextCursor, "string");
  assert.ok(body.nextCursor.length > 0);
});

test("GET jobs accepts a cursor from the previous page", async (t) => {
  let receivedCursor: unknown;

  const { app } = createTestApp({
    listJobs: async (params) => {
      receivedCursor = params.cursor;

      if (!params.cursor) {
        return {
          jobs: [testJob],
          hasMore: true,
        };
      }

      return {
        jobs: [],
        hasMore: false,
      };
    },
  });

  t.after(async () => app.close());

  const first = await app.inject(listRequest("?limit=1"));

  assert.equal(first.statusCode, 200);

  const cursor = first.json().nextCursor;

  const second = await app.inject(
    listRequest(`?limit=1&cursor=${encodeURIComponent(cursor)}`),
  );

  assert.equal(second.statusCode, 200);
  assert.ok(receivedCursor);
  assert.equal(second.json().nextCursor, null);
});

test("GET jobs rejects invalid filters", async (t) => {
  let called = false;

  const { app } = createTestApp({
    listJobs: async () => {
      called = true;
      return { jobs: [], hasMore: false };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(listRequest("?status=invalid&limit=999"));

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test("GET jobs rejects an invalid cursor", async (t) => {
  let called = false;

  const { app } = createTestApp({
    listJobs: async () => {
      called = true;
      return { jobs: [], hasMore: false };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(listRequest("?cursor=invalid!"));

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test("GET jobs rejects requests without authentication", async (t) => {
  const { app } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/jobs`,
  });

  assert.equal(response.statusCode, 401);
});

test("GET jobs enforces jobs:read permission", async (t) => {
  let called = false;

  const { app } = createTestApp({
    authorize: async () => ({
      allowed: false,
      reason: "FORBIDDEN",
    }),
    listJobs: async () => {
      called = true;
      return { jobs: [], hasMore: false };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(listRequest());

  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
});

test("GET job details returns 404 for an unknown job", async (t) => {
  const { app } = createTestApp({
    getJobById: async () => null,
  });

  t.after(async () => app.close());

  const response = await app.inject(detailsRequest());

  assert.equal(response.statusCode, 404);
});

test("GET job details returns a job without audit history", async (t) => {
  let auditCalled = false;

  const { app } = createTestApp({
    authorize: async (authenticatedSubject, requestedTenantId, permission) => {
      if (permission === "audit:read") {
        return {
          allowed: false,
          reason: "FORBIDDEN",
        };
      }

      return {
        allowed: true,
        context: {
          subject: authenticatedSubject,
          tenantId: requestedTenantId,
          role: "operator",
        },
      };
    },

    getJobById: async () => testJob,

    listJobAuditEvents: async () => {
      auditCalled = true;
      return [];
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(detailsRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().job.id, testJobId);
  assert.equal("auditEvents" in response.json(), false);
  assert.equal(auditCalled, false);
});

test("GET job details includes audit history for authorized users", async (t) => {
  const auditEvent = {
    id: "1",
    tenantId,
    actor: subject,
    action: "job.created",
    resourceId: testJobId,
    createdAt: "2026-10-27T10:00:00.123456Z",
  };

  const { app } = createTestApp({
    authorize: async (authenticatedSubject, requestedTenantId) => ({
      allowed: true,
      context: {
        subject: authenticatedSubject,
        tenantId: requestedTenantId,
        role: "admin",
      },
    }),

    getJobById: async () => testJob,

    listJobAuditEvents: async (params) => {
      assert.equal(params.tenantId, tenantId);
      assert.equal(params.jobId, testJobId);

      return [auditEvent];
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(detailsRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().job.id, testJobId);
  assert.deepEqual(response.json().auditEvents, [auditEvent]);
});

test("GET job details rejects unauthorized tenant access", async (t) => {
  let called = false;

  const { app } = createTestApp({
    authorize: async () => ({
      allowed: false,
      reason: "FORBIDDEN",
    }),
    getJobById: async () => {
      called = true;
      return testJob;
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(detailsRequest(testJobId, secondTenantId));

  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
});

test("GET job details rejects invalid job IDs", async (t) => {
  const { app } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject(detailsRequest("invalid-id"));

  assert.equal(response.statusCode, 400);
});

test("GET job details rejects requests without authentication", async (t) => {
  const { app } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/jobs/${testJobId}`,
  });

  assert.equal(response.statusCode, 401);
});

const commandJobId = "550e8400-e29b-41d4-a716-446655440000";

function commandRequest(
  action: "retry" | "cancel",
  options: {
    token?: string;
    jobId?: string;
    tenant?: string;
  } = {},
) {
  return {
    method: "POST" as const,
    url: `/v1/tenants/${options.tenant ?? tenantId}/jobs/${options.jobId ?? commandJobId}/${action}`,
    headers: {
      authorization: `Bearer ${options.token ?? "valid-token"}`,
    },
  };
}

function commandJob(status: "queued" | "cancelled") {
  return {
    id: commandJobId,
    tenantId,
    type: "report" as const,
    status,
    attempts: 1,
    maxAttempts: 3,
    createdAt: "2026-10-31T10:00:00.000000Z",
    updatedAt: "2026-10-31T10:01:00.000000Z",
  };
}

test("POST retry returns 200 for a successful transition", async (t) => {
  let receivedParams: unknown;

  const { app } = createTestApp({
    retryJob: async (params) => {
      receivedParams = params;

      return {
        kind: "updated",
        job: commandJob("queued"),
      };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject(commandRequest("retry"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().job.status, "queued");

  assert.deepEqual(receivedParams, {
    tenantId,
    jobId: commandJobId,
    actor: subject,
  });
});

test("POST cancel returns 200 for a successful transition", async (t) => {
  const { app } = createTestApp({
    cancelJob: async () => ({
      kind: "updated",
      job: commandJob("cancelled"),
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject(commandRequest("cancel"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().job.status, "cancelled");
});

for (const action of ["retry", "cancel"] as const) {
  test(`POST ${action} returns 400 for invalid job ID`, async (t) => {
    const { app } = createTestApp();

    t.after(async () => app.close());

    const response = await app.inject(
      commandRequest(action, { jobId: "invalid-id" }),
    );

    assert.equal(response.statusCode, 400);
  });

  test(`POST ${action} returns 401 without authentication`, async (t) => {
    const { app } = createTestApp();

    t.after(async () => app.close());

    const response = await app.inject({
      method: "POST",
      url: `/v1/tenants/${tenantId}/jobs/${commandJobId}/${action}`,
    });

    assert.equal(response.statusCode, 401);
  });

  test(`POST ${action} returns 401 with invalid token`, async (t) => {
    const { app } = createTestApp();

    t.after(async () => app.close());

    const response = await app.inject(
      commandRequest(action, { token: "invalid-token" }),
    );

    assert.equal(response.statusCode, 401);
  });

  test(`POST ${action} returns 403 without permission`, async (t) => {
    let called = false;

    const overrides: Partial<JobsDependencies> = {
      authorize: async () => ({
        allowed: false,
        reason: "FORBIDDEN",
      }),
      retryJob: async () => {
        called = true;
        return { kind: "not_found" };
      },
      cancelJob: async () => {
        called = true;
        return { kind: "not_found" };
      },
    };

    const { app } = createTestApp(overrides);

    t.after(async () => app.close());

    const response = await app.inject(commandRequest(action));

    assert.equal(response.statusCode, 403);
    assert.equal(called, false);
  });

  test(`POST ${action} returns 404 for nonexistent jobs`, async (t) => {
    const { app } = createTestApp({
      retryJob: async () => ({ kind: "not_found" }),
      cancelJob: async () => ({ kind: "not_found" }),
    });

    t.after(async () => app.close());

    const response = await app.inject(commandRequest(action));

    assert.equal(response.statusCode, 404);
  });

  test(`POST ${action} returns 409 for invalid transitions`, async (t) => {
    const { app } = createTestApp({
      retryJob: async () => ({ kind: "conflict" }),
      cancelJob: async () => ({ kind: "conflict" }),
    });

    t.after(async () => app.close());

    const response = await app.inject(commandRequest(action));

    assert.equal(response.statusCode, 409);
  });

  test(`POST ${action} hides unexpected internal errors`, async (t) => {
    const { app } = createTestApp({
      retryJob: async () => {
        throw new Error("Sensitive database details");
      },
      cancelJob: async () => {
        throw new Error("Sensitive database details");
      },
    });

    t.after(async () => app.close());

    const response = await app.inject(commandRequest(action));

    assert.equal(response.statusCode, 500);
    assert.notEqual(response.json().message, "Sensitive database details");
  });
}
