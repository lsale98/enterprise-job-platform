import type { FastifyPluginAsync } from "fastify";

import type { AccessRoutesOptions } from "./access.types.js";

import { registerGetEntryContextRoute } from "./queries/get-entry-context.js";
import { registerGetTenantContextRoute } from "./queries/get-tenant-context.js";
import { registerListAvailableTenantsRoute } from "./queries/list-available-tenants.js";
import { registerGetPlatformContextRoute } from "./queries/get-platform-context.js";

export const accessRoutes: FastifyPluginAsync<AccessRoutesOptions> = async (
  app,
  { dependencies },
) => {
  registerGetEntryContextRoute(app, dependencies);
  registerGetTenantContextRoute(app, dependencies);
  registerListAvailableTenantsRoute(app, dependencies);
  registerGetPlatformContextRoute(app, dependencies);
};
