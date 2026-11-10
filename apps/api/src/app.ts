import { buildAppCore } from "./common/app-core.js";

import type { AppConfig } from "./config/env.js";
import type { AppDependencies } from "./composition/dependencies.js";

import { accessRoutes } from "./modules/access/access.routes.js";
import { jobsRoutes } from "./modules/jobs/jobs.routes.js";

export type AppRouteDependencies = Pick<
  AppDependencies,
  | "verifyAccessToken"
  | "authorize"
  | "access"
  | "createJob"
  | "listJobs"
  | "getJobById"
  | "listJobAuditEvents"
  | "cancelJob"
  | "retryJob"
>;

export function buildApp(
  config: AppConfig,
  dependencies: AppRouteDependencies,
) {
  const app = buildAppCore(config, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.register(accessRoutes, {
    dependencies: dependencies.access,
  });

  app.register(jobsRoutes, {
    dependencies: {
      authorize: dependencies.authorize,
      createJob: dependencies.createJob,
      listJobs: dependencies.listJobs,
      getJobById: dependencies.getJobById,
      listJobAuditEvents: dependencies.listJobAuditEvents,
      retryJob: dependencies.retryJob,
      cancelJob: dependencies.cancelJob,
    },
  });

  return app;
}
