import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPermission } from "./permission.js";

test("viewer cannot create jobs", () => {
  assert.equal(hasPermission("viewer", "jobs:create"), false);
  assert.equal(hasPermission("operator", "jobs:create"), true);
});
