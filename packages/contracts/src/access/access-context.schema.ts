import { z } from "zod";

import { RoleSchema } from "../authorization/role.schema.js";
import { PermissionSchema } from "../authorization/permission.js";

export const EntryContextSchema = z.object({
  defaultTenantId: z.uuid().nullable(),
  canAccessPlatform: z.boolean(),
});

export const TenantSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  role: RoleSchema,
});

export const TenantListSchema = z.object({
  items: z.array(TenantSummarySchema),
  nextCursor: z.string().nullable(),
});

export const TenantContextSchema = z.object({
  tenant: TenantSummarySchema,
  permissions: z.array(PermissionSchema),
});

export const PlatformPermissionSchema = z.enum([
  "platform:organizations:read",
  "platform:organizations:manage",
  "platform:users:manage",
  "platform:system:read",
]);

export const PlatformContextSchema = z.object({
  role: z.literal("platform_admin"),
  permissions: z.array(PlatformPermissionSchema),
});

export type EntryContext = z.infer<typeof EntryContextSchema>;
export type TenantSummary = z.infer<typeof TenantSummarySchema>;
export type TenantList = z.infer<typeof TenantListSchema>;
export type TenantContext = z.infer<typeof TenantContextSchema>;

export type PlatformPermission = z.infer<typeof PlatformPermissionSchema>;

export type PlatformContext = z.infer<typeof PlatformContextSchema>;
