import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  claimJob,
  completeJob,
  failJob,
  heartbeatJob,
  recoverExhaustedJobs,
} from "@lab/database/job-repository";

import type { WorkerConfig } from "../config/worker.config.js";
import { executeJob } from "../processing/executors/execute-job.js";
import { processJob } from "../processing/process-job.js";
import type { WorkerDependencies } from "../runtime/run-worker.js";

export interface CreatedWorker {
  workerId: string;
  dependencies: WorkerDependencies;
  close: () => Promise<void>;
}

export function createWorker(config: WorkerConfig): CreatedWorker {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.concurrency + 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  const workerId = `worker-${randomUUID()}`;

  return {
    workerId,

    dependencies: {
      claim: (params) => claimJob(pool, params),

      recoverExhausted: () => recoverExhaustedJobs(pool),

      process: (job) =>
        processJob({
          job,
          leaseSeconds: config.leaseSeconds,
          heartbeatMs: config.heartbeatMs,
          dependencies: {
            execute: executeJob,
            heartbeat: (params) => heartbeatJob(pool, params),
            complete: (params) => completeJob(pool, params),
            fail: (params) => failJob(pool, params),
          },
        }),
    },

    close: () => pool.end(),
  };
}
