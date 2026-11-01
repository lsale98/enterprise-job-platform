import type { FastifyInstance } from "fastify";

import type { JobsDependencies } from "../jobs.types.js";

import {
  JobCommandParamsSchema,
  type JobCommandRouteParams,
} from "@lab/contracts";

export function registerCancelJobRoute(
  app: FastifyInstance,
  dependencies: JobsDependencies,
): void {
  app.post<{ Params: JobCommandRouteParams }>(
    "/v1/tenants/:tenantId/jobs/:jobId/cancel",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = JobCommandParamsSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid job route parameters",
        });
      }

      if (!request.identity) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const { tenantId, jobId } = parsed.data;

      const authorization = await dependencies.authorize(
        request.identity.subject,
        tenantId,
        "jobs:cancel",
      );

      if (!authorization.allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Insufficient permissions",
        });
      }

      const result = await dependencies.cancelJob({
        tenantId,
        jobId,
        actor: request.identity.subject,
      });

      if (result.kind === "not_found") {
        return reply.code(404).send({
          error: "Not Found",
          message: "Job not found",
        });
      }

      if (result.kind === "conflict") {
        return reply.code(409).send({
          error: "Conflict",
          message: "Job cannot be cancelled in its current state",
        });
      }

      return reply.code(200).send({ job: result.job });
    },
  );
}
