import type { JobSummary } from "../job.types.js";

export interface JobCommandParams {
  tenantId: string;
  jobId: string;
  actor: string;
}

export type JobCommandResult =
  | {
      kind: "updated";
      job: JobSummary;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "conflict";
    };
