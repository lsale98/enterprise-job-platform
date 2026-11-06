import Fastify from "fastify";

import type { AuthenticatedIdentity } from "@lab/auth";

import { errorHandler } from "../../../common/errors/error-handler.js";
import { authenticationPlugin } from "../../../plugins/authentication.js";

import { usersRoutes } from "../users.routes.js";
import type { UsersDependencies } from "../users.types.js";

export interface UsersTestAppDependencies extends UsersDependencies {
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
}

export function buildUsersTestApp(dependencies: UsersTestAppDependencies) {
  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler(errorHandler);

  app.register(authenticationPlugin, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.register(usersRoutes, {
    dependencies,
  });

  return app;
}
