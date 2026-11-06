import { describe, expect, it } from "vitest";

import type { Permission } from "@lab/contracts";

import { getTenantNavigation } from "./tenantNavigation";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("tenant navigation", () => {
  it.each([
    {
      permissions: ["jobs:read"] satisfies Permission[],
      expected: ["dashboard", "jobs"],
    },
    {
      permissions: [
        "jobs:read",
        "jobs:create",
        "jobs:cancel",
      ] satisfies Permission[],
      expected: ["dashboard", "jobs", "create-job"],
    },
    {
      permissions: [
        "jobs:read",
        "jobs:create",
        "jobs:cancel",
        "members:manage",
        "audit:read",
      ] satisfies Permission[],
      expected: ["dashboard", "jobs", "create-job", "members", "audit"],
    },
  ])(
    "renders navigation from effective permissions",
    ({ permissions, expected }) => {
      const navigation = getTenantNavigation(tenantId, permissions);

      expect(navigation.map((item) => item.id)).toEqual(expected);
    },
  );
});
