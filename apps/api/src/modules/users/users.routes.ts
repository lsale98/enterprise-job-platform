import type { FastifyPluginAsync } from "fastify";

import type { UsersDependencies } from "./users.types.js";

import { registerGetCurrentUserRoute } from "./queries/get-current-user.js";

export interface UsersRoutesOptions {
  dependencies: UsersDependencies;
}

export const usersRoutes: FastifyPluginAsync<UsersRoutesOptions> = async (
  app,
  { dependencies },
) => {
  registerGetCurrentUserRoute(app, dependencies);
};
