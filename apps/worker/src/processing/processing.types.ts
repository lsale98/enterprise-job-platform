import type { ClaimedJob } from "@lab/database/job-repository";

export type JobExecutor = (
  job: ClaimedJob,
  signal: AbortSignal,
) => Promise<unknown>;

export interface ProcessJobResult {
  jobId: string;
  outcome: "completed" | "failed" | "lease_lost";
}
