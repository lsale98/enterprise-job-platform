import type { FastifyInstance } from "fastify";

export interface ShutdownDependencies {
  app: FastifyInstance;
  closeResources: () => Promise<void>;
}

export function registerGracefulShutdown({
  app,
  closeResources,
}: ShutdownDependencies): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    app.log.info({ signal }, "Graceful shutdown initiated");

    try {
      // Stop accepting new connections and drain active requests.
      await app.close();

      // Close external resources after HTTP requests finish.
      await closeResources();

      app.log.info("Graceful shutdown completed");
    } catch (error) {
      app.log.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
