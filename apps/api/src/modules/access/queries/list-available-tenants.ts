import type { FastifyInstance } from "fastify";

import { TenantListSchema } from "@lab/contracts";
import { InvalidMembershipCursorError } from "@lab/database/access-repository";

import { z } from "zod";

import type {
  AccessDependencies,
  ListAvailableTenantsQuery,
} from "../access.types.js";

const QuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number<string>().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});

export function registerListAvailableTenantsRoute(
  app: FastifyInstance,
  dependencies: AccessDependencies,
): void {
  app.get<{
    Querystring: ListAvailableTenantsQuery;
  }>(
    "/v1/me/tenants",
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

      const query = QuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid query parameters",
        });
      }

      try {
        const result = await dependencies.listAvailableMemberships(
          identity.subject,
          {
            search: query.data.search,
            limit: query.data.limit,
            ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
          },
        );

        const response = TenantListSchema.parse(result);

        return reply.code(200).send(response);
      } catch (error) {
        if (error instanceof InvalidMembershipCursorError) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Invalid pagination cursor",
          });
        }

        throw error;
      }
    },
  );
}
