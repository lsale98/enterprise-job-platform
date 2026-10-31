import { createAccessTokenVerifier, createAuthorizer } from "@lab/auth";
import type { AuthenticatedIdentity } from "@lab/auth";

import { createJobIdempotently } from "@lab/database/job-repository";
import type { CreateJobParams } from "@lab/database/job-repository";

import { getJobById, listJobs } from "@lab/database/job-query-repository";
import type {
  GetJobByIdParams,
  JobDetails,
  ListJobsParams,
  ListJobsResult,
} from "@lab/database/job-query-repository";

import { listJobAuditEvents } from "@lab/database/audit-query-repository";

import type {
  JobAuditEvent,
  ListJobAuditEventsParams,
} from "@lab/database/audit-query-repository";

import { createDatabasePool } from "@lab/database";
import type { DatabasePool } from "@lab/database";

import { findMembership } from "@lab/database/membership-repository";

import type { AppConfig } from "../config/env.js";

type Authorize = ReturnType<typeof createAuthorizer>;

export interface AppDependencies {
  pool: DatabasePool;
  authorize: Authorize;
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
  createJob: (
    params: CreateJobParams,
  ) => ReturnType<typeof createJobIdempotently>;
  listJobs: (params: ListJobsParams) => Promise<ListJobsResult>;

  getJobById: (params: GetJobByIdParams) => Promise<JobDetails | null>;

  listJobAuditEvents: (
    params: ListJobAuditEventsParams,
  ) => Promise<JobAuditEvent[]>;

  close(): Promise<void>;
}

export function createDependencies(config: AppConfig): AppDependencies {
  const pool = createDatabasePool({
    connectionString: config.DATABASE_URL,
  });

  const authorize = createAuthorizer({
    findMembership: (subject, tenantId) =>
      findMembership(pool, subject, tenantId),
  });

  const verifyAccessToken = createAccessTokenVerifier({
    issuer: config.AUTH_KEYCLOAK_ISSUER,
    audience: config.AUTH_API_AUDIENCE,
  });

  const createJob = (params: CreateJobParams) =>
    createJobIdempotently(pool, params);

  return {
    pool,
    authorize,
    verifyAccessToken,
    createJob,
    listJobs: (params: ListJobsParams) => listJobs(pool, params),

    getJobById: (params: GetJobByIdParams) => getJobById(pool, params),

    listJobAuditEvents: (params: ListJobAuditEventsParams) =>
      listJobAuditEvents(pool, params),

    async close() {
      await pool.end();
    },
  };
}
