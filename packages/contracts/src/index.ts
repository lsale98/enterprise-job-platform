import { z } from "zod";

export const JobTypeSchema = z.enum(["report", "import", "notification"]);
export type JobType = z.infer<typeof JobTypeSchema>;
export const JobInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("report"),
    numbers: z.array(z.number()).min(1).max(10000),
  }),
  z.object({
    type: z.literal("import"),
    records: z
      .array(
        z.object({
          externalId: z.string().min(1).max(80),
          value: z.number(),
        }),
      )
      .min(1)
      .max(1000),
  }),
  z.object({
    type: z.literal("notification"),
    subject: z.string().min(1).max(100),
    message: z.string().min(1).max(1000),
  }),
]);
export type JobInput = z.infer<typeof JobInputSchema>;
export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  input: JobInputSchema,
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
export const CreateJobSchema = JobInputSchema;
export const RoleSchema = z.enum(["viewer", "operator", "admin"]);
export type Role = z.infer<typeof RoleSchema>;
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

// `satisfies` checks every discriminant while preserving narrow literal values.
export const JOB_LABELS = {
  report: "Report",
  import: "Data import",
  notification: "Notification",
} satisfies Record<JobType, string>;

// Conditional/extract types: valid payload depends on the selected job kind.
export type PayloadFor<K extends JobType> = Extract<JobInput, { type: K }>;
