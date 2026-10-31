import type { JobInput, JobListCursor, JobListQuery } from "@lab/contracts";

import type { JobSummary } from "../job.types.js";

export interface ListJobsParams {
  tenantId: string;
  query: JobListQuery;
  cursor?: JobListCursor;
}

export interface ListJobsResult {
  jobs: JobSummary[];
  hasMore: boolean;
}

export interface JobDetails extends JobSummary {
  input: JobInput;
  result: unknown | null;
  error: string | null;
}

export type JobDetailsRow = JobDetails;

export interface GetJobByIdParams {
  tenantId: string;
  jobId: string;
}
