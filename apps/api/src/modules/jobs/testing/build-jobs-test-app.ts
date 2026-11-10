import Fastify from "fastify";

import type { AuthenticatedIdentity } from "@lab/auth";

import { errorHandler } from "../../../common/errors/error-handler.js";
import { authenticationPlugin } from "../../../plugins/authentication.js";

import { jobsRoutes } from "../jobs.routes.js";
import type { JobsDependencies } from "../jobs.types.js";

export interface JobsTestAppDependencies extends JobsDependencies {
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
}

export function buildJobsTestApp(dependencies: JobsTestAppDependencies) {
  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler(errorHandler);

  app.register(authenticationPlugin, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.register(jobsRoutes, {
    dependencies,
  });

  return app;
}
