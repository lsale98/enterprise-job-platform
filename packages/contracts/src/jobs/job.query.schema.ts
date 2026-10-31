import { z } from "zod";

import { JobStatusSchema, JobTypeSchema } from "./job.schema.js";

const IsoDateTimeSchema = z.iso.datetime({
  offset: true,
});

export const JobListQuerySchema = z
  .strictObject({
    status: JobStatusSchema.optional(),
    type: JobTypeSchema.optional(),

    createdFrom: IsoDateTimeSchema.optional(),
    createdTo: IsoDateTimeSchema.optional(),

    limit: z.coerce.number<string>().int().min(1).max(100).default(20),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .refine(
    (query) =>
      !query.createdFrom ||
      !query.createdTo ||
      Date.parse(query.createdFrom) <= Date.parse(query.createdTo),
    {
      message: "createdFrom must not be later than createdTo",
      path: ["createdTo"],
    },
  );

export type JobListQuery = z.infer<typeof JobListQuerySchema>;

export const JobListCursorSchema = z.strictObject({
  version: z.literal(1),
  tenantId: z.uuid(),
  createdAt: IsoDateTimeSchema,
  id: z.uuid(),
  filters: z.strictObject({
    status: JobStatusSchema.optional(),
    type: JobTypeSchema.optional(),
    createdFrom: IsoDateTimeSchema.optional(),
    createdTo: IsoDateTimeSchema.optional(),
  }),
  limit: z.number().int().min(1).max(100),
});

export type JobListCursor = z.infer<typeof JobListCursorSchema>;
