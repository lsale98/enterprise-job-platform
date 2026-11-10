import assert from "node:assert/strict";
import { test } from "node:test";

import { InvalidMembershipCursorError } from "@lab/database/access-repository";

import type { AccessDependencies } from "./access.types.js";
import { buildAccessTestApp } from "./testing/build-access-test-app.js";

const subject = "11111111-1111-4111-8111-111111111111";

const acmeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contosoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const issuer = "https://auth.example.test/realms/enterprise-job-platform";

const headers = {
  authorization: "Bearer valid-token",
};

function createTestApp(overrides: Partial<AccessDependencies> = {}) {
  const dependencies: AccessDependencies = {
    findTenantAccess: async () => null,
    findDefaultTenantId: async () => null,
    isPlatformAdmin: async () => false,
    listAvailableMemberships: async () => ({
      items: [],
      nextCursor: null,
    }),
    ...overrides,
  };

  return buildAccessTestApp({
    ...dependencies,

    verifyAccessToken: async (token) => {
      if (token !== "valid-token") {
        throw new Error("Invalid token");
      }

      return {
        subject,
        issuer,
      };
    },
  });
}

test("GET entry rejects missing authentication", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/entry",
  });

  assert.equal(response.statusCode, 401);
});

test("GET entry returns tenant and platform access", async (t) => {
  const app = createTestApp({
    findDefaultTenantId: async () => acmeId,
    isPlatformAdmin: async () => true,
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/entry",
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    defaultTenantId: acmeId,
    canAccessPlatform: true,
  });
});

test("GET entry supports no organization access", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/entry",
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    defaultTenantId: null,
    canAccessPlatform: false,
  });
});

test("GET tenant context returns viewer permissions", async (t) => {
  const app = createTestApp({
    findTenantAccess: async () => ({
      id: acmeId,
      name: "Acme",
      role: "viewer",
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${acmeId}/context`,
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    tenant: {
      id: acmeId,
      name: "Acme",
      role: "viewer",
    },
    permissions: ["jobs:read"],
  });
});

test("GET tenant context returns operator permissions", async (t) => {
  const app = createTestApp({
    findTenantAccess: async () => ({
      id: contosoId,
      name: "Contoso",
      role: "operator",
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${contosoId}/context`,
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json().permissions, [
    "jobs:read",
    "jobs:create",
    "jobs:cancel",
  ]);
});

test("GET tenant context returns admin permissions", async (t) => {
  const app = createTestApp({
    findTenantAccess: async () => ({
      id: acmeId,
      name: "Acme",
      role: "admin",
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${acmeId}/context`,
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json().permissions, [
    "jobs:read",
    "jobs:create",
    "jobs:cancel",
    "members:manage",
    "audit:read",
  ]);
});

test("GET tenant context hides missing memberships", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${contosoId}/context`,
    headers,
  });

  assert.equal(response.statusCode, 404);
});

test("GET tenant context rejects mismatched tenant", async (t) => {
  const app = createTestApp({
    findTenantAccess: async () => ({
      id: contosoId,
      name: "Contoso",
      role: "admin",
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${acmeId}/context`,
    headers,
  });

  assert.equal(response.statusCode, 404);
});

test("GET tenant context rejects invalid UUID", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/tenants/invalid/context",
    headers,
  });

  assert.equal(response.statusCode, 400);
});

test("GET tenant context requires authentication", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/tenants/${acmeId}/context`,
  });

  assert.equal(response.statusCode, 401);
});

test("GET tenant listing returns memberships", async (t) => {
  const app = createTestApp({
    listAvailableMemberships: async () => ({
      items: [
        {
          id: acmeId,
          name: "Acme",
          role: "admin",
        },
      ],
      nextCursor: null,
    }),
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/tenants?limit=20",
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    items: [
      {
        id: acmeId,
        name: "Acme",
        role: "admin",
      },
    ],
    nextCursor: null,
  });
});

test("GET tenant listing forwards query parameters", async (t) => {
  let received:
    | {
        subject: string;
        search: string;
        limit: number;
      }
    | undefined;

  const app = createTestApp({
    listAvailableMemberships: async (authenticatedSubject, options) => {
      received = {
        subject: authenticatedSubject,
        search: options.search,
        limit: options.limit,
      };

      return {
        items: [],
        nextCursor: null,
      };
    },
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/tenants?search=Acme&limit=5",
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(received, {
    subject,
    search: "Acme",
    limit: 5,
  });
});

test("GET tenant listing rejects invalid limits", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  for (const limit of ["0", "-1", "51", "abc"]) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/me/tenants?limit=${limit}`,
      headers,
    });

    assert.equal(response.statusCode, 400);
  }
});

test("GET tenant listing rejects invalid cursor", async (t) => {
  const app = createTestApp({
    listAvailableMemberships: async () => {
      throw new InvalidMembershipCursorError();
    },
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/tenants?cursor=invalid",
    headers,
  });

  assert.equal(response.statusCode, 400);
});

test("GET tenant listing requires authentication", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/me/tenants",
  });

  assert.equal(response.statusCode, 401);
});

test("GET platform context denies tenant-only users", async (t) => {
  const app = createTestApp({
    isPlatformAdmin: async () => false,
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/me",
    headers,
  });

  assert.equal(response.statusCode, 403);
});

test("GET platform context permits platform admins", async (t) => {
  const app = createTestApp({
    isPlatformAdmin: async () => true,
  });

  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/me",
    headers,
  });

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.json(), {
    role: "platform_admin",
    permissions: [
      "platform:organizations:read",
      "platform:organizations:manage",
      "platform:users:manage",
      "platform:system:read",
    ],
  });
});

test("GET platform context requires authentication", async (t) => {
  const app = createTestApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/platform/me",
  });

  assert.equal(response.statusCode, 401);
});
