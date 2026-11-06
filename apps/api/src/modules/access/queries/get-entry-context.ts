import type { FastifyInstance } from "fastify";

import { EntryContextSchema } from "@lab/contracts";

import type { AccessDependencies } from "../access.types.js";

export function registerGetEntryContextRoute(
  app: FastifyInstance,
  dependencies: AccessDependencies,
): void {
  app.get(
    "/v1/me/entry",
    {
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const identity = request.identity;

      if (!identity) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const [defaultTenantId, canAccessPlatform] = await Promise.all([
        dependencies.findDefaultTenantId(identity.subject),
        dependencies.isPlatformAdmin(identity.subject),
      ]);

      const response = EntryContextSchema.parse({
        defaultTenantId,
        canAccessPlatform,
      });

      return reply.code(200).send(response);
    },
  );
}
