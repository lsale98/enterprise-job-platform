import assert from "node:assert/strict";
import { test } from "node:test";

import { buildUsersTestApp } from "./testing/build-users-test-app.js";

const subject = "11111111-1111-4111-8111-111111111111";
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createTestApp() {
  const calls: string[] = [];

  const app = buildUsersTestApp({
    verifyAccessToken: async (token) => {
      if (token !== "valid-token") {
        throw new Error("Invalid token");
      }

      return {
        subject,
        issuer: "https://auth.example.test/realms/test",
      };
    },

    listMembershipsBySubject: async (requestedSubject) => {
      calls.push(requestedSubject);

      return [
        {
          tenantId,
          tenantName: "Test Organization",
          role: "admin",
        },
      ];
    },
  });

  return { app, calls };
}

test("GET /v1/me rejects missing authentication", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("GET /v1/me rejects invalid access tokens", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: {
      authorization: "Bearer invalid-token",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("GET /v1/me returns authenticated user memberships", async (t) => {
  const { app, calls } = createTestApp();

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: {
      authorization: "Bearer valid-token",
    },
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    subject,
    tenants: [
      {
        tenantId,
        tenantName: "Test Organization",
        role: "admin",
      },
    ],
  });

  assert.deepEqual(calls, [subject]);
});

test("GET /v1/me returns empty tenants when no memberships exist", async (t) => {
  const app = buildUsersTestApp({
    verifyAccessToken: async () => ({
      subject,
      issuer: "https://auth.example.test/realms/test",
    }),

    listMembershipsBySubject: async () => [],
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: {
      authorization: "Bearer valid-token",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    subject,
    tenants: [],
  });
});

test("GET /v1/me rejects invalid repository response data", async (t) => {
  const app = buildUsersTestApp({
    verifyAccessToken: async () => ({
      subject,
      issuer: "https://auth.example.test/realms/test",
    }),

    listMembershipsBySubject: async () => [
      {
        tenantId,
        tenantName: "Test Organization",
        role: "invalid-role",
      },
    ],
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: {
      authorization: "Bearer valid-token",
    },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.includes("invalid-role"), false);
});
