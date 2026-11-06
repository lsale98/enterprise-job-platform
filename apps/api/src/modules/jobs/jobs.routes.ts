import type { FastifyPluginAsync } from "fastify";

import type { JobsDependencies } from "./jobs.types.js";

import { registerCreateJobRoute } from "./commands/create-job.js";
import { registerRetryJobRoute } from "./commands/retry-job.js";
import { registerCancelJobRoute } from "./commands/cancel-job.js";

import { registerListJobsRoute } from "./queries/list-jobs.js";
import { registerGetJobByIdRoute } from "./queries/get-job-by-id.js";

export interface JobsRoutesOptions {
  dependencies: JobsDependencies;
}

export const jobsRoutes: FastifyPluginAsync<JobsRoutesOptions> = async (
  app,
  { dependencies },
) => {
  registerCreateJobRoute(app, dependencies);
  registerListJobsRoute(app, dependencies);
  registerGetJobByIdRoute(app, dependencies);
  registerRetryJobRoute(app, dependencies);
  registerCancelJobRoute(app, dependencies);
};
