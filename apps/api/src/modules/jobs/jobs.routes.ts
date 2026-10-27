import type { FastifyPluginAsync } from "fastify";

import { CreateJobSchema } from "@lab/contracts";
import { IdempotencyConflictError } from "@lab/database/job-repository";

import type { CreateJobRouteParams, JobsDependencies } from "./jobs.types.js";

import { registerListJobsRoute } from "./queries/list-jobs.js";
import { registerGetJobByIdRoute } from "./queries/get-job-by-id.js";

export interface JobsRoutesOptions {
  dependencies: JobsDependencies;
}

export const jobsRoutes: FastifyPluginAsync<JobsRoutesOptions> = async (
  app,
  { dependencies },
) => {
  app.post<{ Params: CreateJobRouteParams }>(
    "/v1/tenants/:tenantId/jobs",
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

      const { tenantId } = request.params;

      // Always authorize before accessing tenant-scoped resources.
      const authorization = await dependencies.authorize(
        identity.subject,
        tenantId,
        "jobs:create",
      );

      if (!authorization.allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Insufficient permissions",
        });
      }

      const idempotencyKey = request.headers["idempotency-key"];

      if (
        typeof idempotencyKey !== "string" ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid Idempotency-Key header",
        });
      }

      const parsedBody = CreateJobSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid job payload",
        });
      }

      try {
        const outcome = await dependencies.createJob({
          tenantId: authorization.context.tenantId,
          createdBy: authorization.context.subject,
          idempotencyKey,
          input: parsedBody.data,
        });

        return reply.code(outcome.kind === "created" ? 201 : 200).send({
          job: outcome.job,
          replayed: outcome.kind === "replayed",
        });
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({
            error: "Conflict",
            message: error.message,
          });
        }

        throw error;
      }
    },
  );
  registerListJobsRoute(app, dependencies);
  registerGetJobByIdRoute(app, dependencies);
};
