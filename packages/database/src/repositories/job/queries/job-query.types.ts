import type {
  JobInput,
  JobListCursor,
  JobListQuery,
  JobStatus,
  JobType,
} from "@lab/contracts";

export interface JobSummary {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export type JobSummaryRow = JobSummary;

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

export interface JobDetailsRow extends JobSummaryRow {
  input: JobInput;
  result: unknown | null;
  error: string | null;
}

export interface GetJobByIdParams {
  tenantId: string;
  jobId: string;
}
