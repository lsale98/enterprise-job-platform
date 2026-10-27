import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { JobsDependencies } from "../jobs.types.js";

const ParamsSchema = z.strictObject({
  tenantId: z.uuid(),
  jobId: z.uuid(),
});

interface GetJobRouteParams {
  tenantId: string;
  jobId: string;
}

export function registerGetJobByIdRoute(
  app: FastifyInstance,
  dependencies: JobsDependencies,
): void {
  app.get<{
    Params: GetJobRouteParams;
  }>(
    "/v1/tenants/:tenantId/jobs/:jobId",
    {
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      if (!request.identity) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const parsed = ParamsSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid job route parameters",
        });
      }

      const { tenantId, jobId } = parsed.data;
      const subject = request.identity.subject;

      const authorization = await dependencies.authorize(
        subject,
        tenantId,
        "jobs:read",
      );

      if (!authorization.allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Insufficient permissions",
        });
      }

      const job = await dependencies.getJobById({
        tenantId,
        jobId,
      });

      if (!job) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Job not found",
        });
      }

      const auditAuthorization = await dependencies.authorize(
        subject,
        tenantId,
        "audit:read",
      );

      if (!auditAuthorization.allowed) {
        return reply.code(200).send({
          job,
        });
      }

      const auditEvents = await dependencies.listJobAuditEvents({
        tenantId,
        jobId,
      });

      return reply.code(200).send({
        job,
        auditEvents,
      });
    },
  );
}
