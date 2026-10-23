import "dotenv/config";

import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDependencies } from "./composition/dependencies.js";
import { registerGracefulShutdown } from "./common/lifecycle/graceful-shutdown.js";

const config = loadConfig();
const dependencies = createDependencies(config);

const app = buildApp(config, dependencies);

registerGracefulShutdown({
  app,
  closeResources: () => dependencies.close(),
});

try {
  await app.listen({
    host: config.HOST,
    port: config.PORT,
  });
} catch (error) {
  app.log.error({ err: error }, "Failed to start API server");

  process.exitCode = 1;

  await app.close();
  await dependencies.close();
}
