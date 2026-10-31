import type { JobStatus, JobType } from "@lab/contracts";

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
