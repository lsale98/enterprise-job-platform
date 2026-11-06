import Fastify from "fastify";

import type { AuthenticatedIdentity } from "@lab/auth";

import type { AppConfig } from "../config/env.js";

import { errorHandler } from "./errors/error-handler.js";
import { authenticationPlugin } from "../plugins/authentication.js";

export interface AppCoreDependencies {
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
}

export function buildAppCore(
  config: Pick<AppConfig, "LOG_LEVEL">,
  dependencies: AppCoreDependencies,
) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
    },
    requestIdHeader: false,
  });

  app.setErrorHandler(errorHandler);

  app.register(authenticationPlugin, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.get("/health", async () => ({
    status: "ok",
  }));

  return app;
}
