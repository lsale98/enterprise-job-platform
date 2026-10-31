import Fastify from "fastify";

import type { AppConfig } from "./config/env.js";
import type { AppDependencies } from "./composition/dependencies.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { authenticationPlugin } from "./plugins/authentication.js";
import { jobsRoutes } from "./modules/jobs/jobs.routes.js";

export function buildApp(
  config: AppConfig,
  dependencies: Pick<
    AppDependencies,
    | "verifyAccessToken"
    | "authorize"
    | "createJob"
    | "listJobs"
    | "getJobById"
    | "listJobAuditEvents"
    | "cancelJob"
    | "retryJob"
  >,
) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
    },
    requestIdHeader: false,
  });

  app.setErrorHandler(errorHandler);

  app.register(authenticationPlugin, {
    verifyAccessToken: dependencies.verifyAccessToken,
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

  app.get("/health", async () => ({
    status: "ok",
  }));

  return app;
}
