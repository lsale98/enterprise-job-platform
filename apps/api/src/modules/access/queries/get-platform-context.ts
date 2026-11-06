import type { FastifyInstance } from "fastify";

import { PlatformContextSchema } from "@lab/contracts";

import type { AccessDependencies } from "../access.types.js";

export function registerGetPlatformContextRoute(
  app: FastifyInstance,
  dependencies: AccessDependencies,
): void {
  app.get(
    "/v1/platform/me",
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

      const allowed = await dependencies.isPlatformAdmin(identity.subject);

      if (!allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Insufficient permissions",
        });
      }

      const response = PlatformContextSchema.parse({
        role: "platform_admin",
        permissions: [
          "platform:organizations:read",
          "platform:organizations:manage",
          "platform:users:manage",
          "platform:system:read",
        ],
      });

      return reply.code(200).send(response);
    },
  );
}
