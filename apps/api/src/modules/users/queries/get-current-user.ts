import type { FastifyInstance } from "fastify";

import { CurrentUserSchema } from "@lab/contracts";

import type { UsersDependencies } from "../users.types.js";

export function registerGetCurrentUserRoute(
  app: FastifyInstance,
  dependencies: UsersDependencies,
): void {
  app.get(
    "/v1/me",
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

      const tenants = await dependencies.listMembershipsBySubject(
        identity.subject,
      );

      const response = CurrentUserSchema.parse({
        subject: identity.subject,
        tenants,
      });

      return reply.code(200).send(response);
    },
  );
}
