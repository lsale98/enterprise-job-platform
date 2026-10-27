import type { FastifyInstance } from "fastify";

import { JobListQuerySchema } from "@lab/contracts";

import type { JobsDependencies } from "../jobs.types.js";

import {
  createNextJobCursor,
  decodeJobCursor,
  InvalidJobCursorError,
} from "../pagination/job-cursor.js";

interface ListJobsRouteParams {
  tenantId: string;
}

export function registerListJobsRoute(
  app: FastifyInstance,
  dependencies: JobsDependencies,
): void {
  app.get<{
    Params: ListJobsRouteParams;
  }>(
    "/v1/tenants/:tenantId/jobs",
    {
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const { tenantId } = request.params;

      if (!request.identity) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const authorization = await dependencies.authorize(
        request.identity.subject,
        tenantId,
        "jobs:read",
      );

      if (!authorization.allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Insufficient permissions",
        });
      }

      const parsed = JobListQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid job query parameters",
        });
      }

      const query = parsed.data;

      let cursor;

      if (query.cursor !== undefined) {
        try {
          cursor = decodeJobCursor(query.cursor, tenantId, query);
        } catch (error) {
          if (error instanceof InvalidJobCursorError) {
            return reply.code(400).send({
              error: "Bad Request",
              message: "Invalid pagination cursor",
            });
          }

          throw error;
        }
      }

      const result = await dependencies.listJobs({
        tenantId,
        query,
        ...(cursor !== undefined ? { cursor } : {}),
      });

      const lastJob = result.jobs.at(-1);

      const nextCursor =
        result.hasMore && lastJob
          ? createNextJobCursor(lastJob, tenantId, query)
          : null;

      return reply.code(200).send({
        jobs: result.jobs,
        nextCursor,
      });
    },
  );
}
