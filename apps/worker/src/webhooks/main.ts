import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { loadWebhookDispatcherConfig } from "./config/webhook.config.js";

import { createWebhookDispatcher } from "./composition/create-webhook-dispatcher.js";

import { runWebhookDispatcher } from "./runtime/run-webhook-dispatcher.js";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const config = loadWebhookDispatcherConfig();

  const pool = new Pool({ connectionString });
  const controller = new AbortController();

  const shutdown = (): void => {
    controller.abort();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await pool.query("SELECT 1");

    const dependencies = createWebhookDispatcher(pool);

    await runWebhookDispatcher({
      config: {
        ...config,
        workerId: `${config.workerId}:${process.pid}:${randomUUID()}`,
      },
      dependencies,
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);

    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[webhook-dispatcher] fatal",
    error instanceof Error ? error.name : "UnknownError",
  );

  process.exitCode = 1;
});
