import { loadWorkerConfig } from "./config/worker.config.js";
import { createWorker } from "./composition/create-worker.js";
import { runWorker } from "./runtime/run-worker.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  const controller = new AbortController();
  const worker = createWorker(config);

  const shutdown = () => {
    if (controller.signal.aborted) {
      return;
    }

    console.info("Worker shutdown requested", {
      workerId: worker.workerId,
    });

    controller.abort();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    console.info("Starting global worker", {
      workerId: worker.workerId,
      concurrency: config.concurrency,
    });

    await runWorker({
      config,
      workerId: worker.workerId,
      dependencies: worker.dependencies,
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);

    await worker.close();

    console.info("Worker stopped", {
      workerId: worker.workerId,
    });
  }
}

main().catch((error: unknown) => {
  console.error("Worker fatal error", error);
  process.exitCode = 1;
});
