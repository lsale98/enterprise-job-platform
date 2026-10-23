import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedIdentity } from "@lab/auth";

declare module "fastify" {
  interface FastifyRequest {
    identity: AuthenticatedIdentity | null;
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
  }
}
