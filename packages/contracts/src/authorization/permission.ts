import { z } from "zod";
import type { Role } from "./role.schema.js";

export const PermissionSchema = z.enum([
  "jobs:read",
  "jobs:create",
  "jobs:cancel",
  "members:manage",
  "audit:read",
]);

export type Permission = z.infer<typeof PermissionSchema>;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ["jobs:read"],
  operator: ["jobs:read", "jobs:create", "jobs:cancel"],
  admin: [
    "jobs:read",
    "jobs:create",
    "jobs:cancel",
    "members:manage",
    "audit:read",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
