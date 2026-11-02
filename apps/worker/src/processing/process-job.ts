import type {
  ClaimedJob,
  CompleteJobParams,
  CompleteJobResult,
  FailJobParams,
  FailJobResult,
  HeartbeatJobParams,
  HeartbeatJobResult,
} from "@lab/database/job-repository";

import type { JobExecutor, ProcessJobResult } from "./processing.types.js";

export interface ProcessJobDependencies {
  execute: JobExecutor;
  heartbeat: (params: HeartbeatJobParams) => Promise<HeartbeatJobResult>;
  complete: (params: CompleteJobParams) => Promise<CompleteJobResult>;
  fail: (params: FailJobParams) => Promise<FailJobResult>;
}

export interface ProcessJobOptions {
  job: ClaimedJob;
  leaseSeconds: number;
  heartbeatMs: number;
  dependencies: ProcessJobDependencies;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message || "Job execution failed"
    : "Unknown job execution failure";
}

export async function processJob({
  job,
  leaseSeconds,
  heartbeatMs,
  dependencies,
}: ProcessJobOptions): Promise<ProcessJobResult> {
  const controller = new AbortController();

  const execution = {
    tenantId: job.tenantId,
    jobId: job.id,
    leaseOwner: job.leaseOwner,
    attempt: job.attempts,
  };

  let leaseLost = false;
  let heartbeatInFlight: Promise<void> | undefined;

  async function heartbeat(): Promise<void> {
    if (heartbeatInFlight || controller.signal.aborted) {
      return;
    }

    const operation = (async (): Promise<void> => {
      try {
        const response = await dependencies.heartbeat({
          ...execution,
          leaseSeconds,
        });

        if (response.kind === "lease_lost") {
          leaseLost = true;
          controller.abort(new Error("Lease lost"));
        }
      } catch (error) {
        leaseLost = true;
        controller.abort(error);
      }
    })();

    heartbeatInFlight = operation;

    try {
      await operation;
    } finally {
      if (heartbeatInFlight === operation) {
        heartbeatInFlight = undefined;
      }
    }
  }

  const timer = setInterval(() => {
    void heartbeat();
  }, heartbeatMs);

  try {
    let result: unknown;
    let failure: unknown;
    let failed = false;

    try {
      result = await dependencies.execute(job, controller.signal);
    } catch (error) {
      failed = true;
      failure = error;
    }

    clearInterval(timer);

    if (heartbeatInFlight) {
      await heartbeatInFlight;
    }

    if (leaseLost || controller.signal.aborted) {
      return {
        jobId: job.id,
        outcome: "lease_lost",
      };
    }

    if (failed) {
      const response = await dependencies.fail({
        ...execution,
        error: errorMessage(failure).slice(0, 2000),
      });

      return {
        jobId: job.id,
        outcome: response.kind === "failed" ? "failed" : "lease_lost",
      };
    }

    const response = await dependencies.complete({
      ...execution,
      result,
    });

    return {
      jobId: job.id,
      outcome: response.kind === "completed" ? "completed" : "lease_lost",
    };
  } finally {
    clearInterval(timer);

    if (heartbeatInFlight) {
      await heartbeatInFlight;
    }
  }
}
