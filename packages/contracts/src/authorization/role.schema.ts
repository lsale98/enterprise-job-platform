import { z } from "zod";

export const RoleSchema = z.enum(["viewer", "operator", "admin"]);

export type Role = z.infer<typeof RoleSchema>;
