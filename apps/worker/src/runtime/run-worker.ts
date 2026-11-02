import type { ClaimJobParams, ClaimedJob } from "@lab/database/job-repository";

import type { WorkerConfig } from "../config/worker.config.js";
import type { ProcessJobResult } from "../processing/processing.types.js";

export interface WorkerDependencies {
  claim: (params: ClaimJobParams) => Promise<ClaimedJob | null>;

  recoverExhausted: () => Promise<number>;

  process: (job: ClaimedJob) => Promise<ProcessJobResult>;
}

export interface RunWorkerOptions {
  config: WorkerConfig;
  workerId: string;
  dependencies: WorkerDependencies;
  signal: AbortSignal;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const onAbort = () => finish();

    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    const timer = setTimeout(finish, milliseconds);

    signal.addEventListener("abort", onAbort, {
      once: true,
    });

    if (signal.aborted) {
      finish();
    }
  });
}

export async function runWorker({
  config,
  workerId,
  dependencies,
  signal,
}: RunWorkerOptions): Promise<void> {
  async function runSlot(slot: number): Promise<void> {
    while (!signal.aborted) {
      try {
        const job = await dependencies.claim({
          workerId,
          leaseSeconds: config.leaseSeconds,
        });

        if (!job) {
          await sleep(config.pollMs, signal);
          continue;
        }

        // The job may have been claimed just before shutdown.
        // Finish processing it instead of abandoning its lease.
        const result = await dependencies.process(job);

        console.info("Job processed", {
          workerId,
          slot,
          jobId: job.id,
          tenantId: job.tenantId,
          outcome: result.outcome,
        });
      } catch (error) {
        console.error("Worker slot failed", {
          workerId,
          slot,
          error,
        });

        if (!signal.aborted) {
          await sleep(config.pollMs, signal);
        }
      }
    }
  }

  async function runRecovery(): Promise<void> {
    while (!signal.aborted) {
      try {
        const recovered = await dependencies.recoverExhausted();

        if (recovered > 0) {
          console.info("Exhausted jobs recovered", {
            workerId,
            recovered,
          });
        }
      } catch (error) {
        console.error("Worker recovery failed", {
          workerId,
          error,
        });
      }

      await sleep(Math.max(config.pollMs, 5000), signal);
    }
  }

  console.info("Global worker started", {
    workerId,
    concurrency: config.concurrency,
  });

  await Promise.all([
    runRecovery(),
    ...Array.from({ length: config.concurrency }, (_, index) =>
      runSlot(index + 1),
    ),
  ]);

  console.info("Global worker stopped", {
    workerId,
  });
}
