import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { AuthenticatedIdentity } from "@lab/auth";

export interface AuthenticationPluginOptions {
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
}

const plugin: FastifyPluginAsync<AuthenticationPluginOptions> = async (
  app,
  { verifyAccessToken },
) => {
  app.decorateRequest("identity", null);

  app.decorate("authenticate", async function (request, reply) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Missing bearer token",
      });
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);

    if (!match) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid authorization header",
      });
    }

    try {
      request.identity = await verifyAccessToken(match[1]!);
    } catch {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid access token",
      });
    }
  });
};

export const authenticationPlugin = fp(plugin, {
  name: "authentication",
});
