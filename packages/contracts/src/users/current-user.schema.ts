import { z } from "zod";

import { RoleSchema } from "../authorization/role.schema.js";

export const UserTenantSchema = z.object({
  tenantId: z.uuid(),
  tenantName: z.string().min(1),
  role: RoleSchema,
});

export const CurrentUserSchema = z.object({
  subject: z.string().min(1),
  tenants: z.array(UserTenantSchema),
});

export type UserTenant = z.infer<typeof UserTenantSchema>;
export type CurrentUser = z.infer<typeof CurrentUserSchema>;
