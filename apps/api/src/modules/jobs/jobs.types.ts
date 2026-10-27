import type { AuthorizationResult } from "@lab/auth";
import type { Permission } from "@lab/contracts";
import type {
  CreateJobOutcome,
  CreateJobParams,
} from "@lab/database/job-repository";
import type {
  GetJobByIdParams,
  JobDetails,
  ListJobsParams,
  ListJobsResult,
} from "@lab/database/job-query-repository";
import type {
  JobAuditEvent,
  ListJobAuditEventsParams,
} from "@lab/database/audit-query-repository";

export interface JobsDependencies {
  authorize: (
    subject: string,
    tenantId: string,
    permission: Permission,
  ) => Promise<AuthorizationResult>;

  createJob: (params: CreateJobParams) => Promise<CreateJobOutcome>;

  listJobs: (params: ListJobsParams) => Promise<ListJobsResult>;

  getJobById: (params: GetJobByIdParams) => Promise<JobDetails | null>;

  listJobAuditEvents: (
    params: ListJobAuditEventsParams,
  ) => Promise<JobAuditEvent[]>;
}

export interface CreateJobRouteParams {
  tenantId: string;
}

export interface GetJobRouteParams {
  tenantId: string;
  jobId: string;
}
