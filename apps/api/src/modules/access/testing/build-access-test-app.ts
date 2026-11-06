import Fastify from "fastify";

import type { AuthenticatedIdentity } from "@lab/auth";

import { errorHandler } from "../../../common/errors/error-handler.js";
import { authenticationPlugin } from "../../../plugins/authentication.js";

import { accessRoutes } from "../access.routes.js";
import type { AccessDependencies } from "../access.types.js";

export interface AccessTestAppDependencies extends AccessDependencies {
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
}

export function buildAccessTestApp(dependencies: AccessTestAppDependencies) {
  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler(errorHandler);

  app.register(authenticationPlugin, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.register(accessRoutes, {
    dependencies,
  });

  return app;
}
