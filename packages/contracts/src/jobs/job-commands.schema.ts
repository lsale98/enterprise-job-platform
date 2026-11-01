import { z } from "zod";

export const JobCommandParamsSchema = z.strictObject({
  tenantId: z.uuid(),
  jobId: z.uuid(),
});

export type JobCommandRouteParams = z.infer<typeof JobCommandParamsSchema>;
