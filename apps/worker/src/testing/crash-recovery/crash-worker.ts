import { createWorker } from "../../composition/create-worker.js";
import { loadWorkerConfig } from "../../config/worker.config.js";
import { runWorker } from "../../runtime/run-worker.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required");
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);

  if (databaseName !== "lab_test") {
    throw new Error("Crash recovery worker must use the lab_test database");
  }

  if (config.databaseUrl !== testDatabaseUrl) {
    throw new Error("Worker DATABASE_URL must match TEST_DATABASE_URL");
  }

  // Only one job may be claimed during this failure-injection test.
  const testConfig = {
    ...config,
    concurrency: 1,
  };

  const worker = createWorker(testConfig);
  const controller = new AbortController();

  try {
    await runWorker({
      config: testConfig,
      workerId: worker.workerId,
      signal: controller.signal,
      dependencies: {
        ...worker.dependencies,

        // Keep the real PostgreSQL claiming mechanism.
        // Replace only execution, allowing the test to kill
        // the worker after the claim has been persisted.
        process: async (job) => {
          console.info(
            "CRASH_TEST_JOB_CLAIMED",
            JSON.stringify({
              jobId: job.id,
              tenantId: job.tenantId,
              attempts: job.attempts,
              leaseOwner: job.leaseOwner,
            }),
          );

          // Deliberately never resolve.
          // The parent test must terminate this process.
          return new Promise<never>(() => {});
        },
      },
    });
  } finally {
    await worker.close();
  }
}

main().catch((error: unknown) => {
  console.error("Crash recovery test worker failed", error);
  process.exitCode = 1;
});
