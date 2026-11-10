import type { FastifyInstance } from "fastify";

import {
  ROLE_PERMISSIONS,
  RoleSchema,
  TenantContextSchema,
} from "@lab/contracts";

import { z } from "zod";

import type {
  AccessDependencies,
  TenantContextRouteParams,
} from "../access.types.js";

const ParamsSchema = z.object({
  tenantId: z.uuid(),
});

export function registerGetTenantContextRoute(
  app: FastifyInstance,
  dependencies: AccessDependencies,
): void {
  app.get<{
    Params: TenantContextRouteParams;
  }>(
    "/v1/tenants/:tenantId/context",
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

      const params = ParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid tenant identifier",
        });
      }

      const membership = await dependencies.findTenantAccess(
        identity.subject,
        params.data.tenantId,
      );

      if (!membership || membership.id !== params.data.tenantId) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      const role = RoleSchema.safeParse(membership.role);

      if (!role.success) {
        throw new Error("Invalid persisted membership role");
      }

      const response = TenantContextSchema.parse({
        tenant: {
          id: membership.id,
          name: membership.name,
          role: role.data,
        },
        permissions: ROLE_PERMISSIONS[role.data],
      });

      return reply.code(200).send(response);
    },
  );
}
