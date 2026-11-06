import { createAccessTokenVerifier, createAuthorizer } from "@lab/auth";

import type { AuthenticatedIdentity } from "@lab/auth";

import { createDatabasePool, type DatabasePool } from "@lab/database";

import { findMembership } from "@lab/database/membership-repository";

import {
  findTenantAccess,
  findDefaultTenantId,
  isPlatformAdmin,
  listAvailableMemberships,
} from "@lab/database/access-repository";

import {
  createJobIdempotently,
  retryJob,
  cancelJob,
} from "@lab/database/job-repository";

import type {
  CreateJobParams,
  JobCommandParams,
  JobCommandResult,
} from "@lab/database/job-repository";

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

import type { AccessDependencies } from "../modules/access/access.types.js";

import type { AppConfig } from "../config/env.js";

type Authorize = ReturnType<typeof createAuthorizer>;

export interface AppDependencies {
  pool: DatabasePool;

  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;

  authorize: Authorize;

  access: AccessDependencies;

  createJob: (
    params: CreateJobParams,
  ) => ReturnType<typeof createJobIdempotently>;

  listJobs: (params: ListJobsParams) => Promise<ListJobsResult>;

  getJobById: (params: GetJobByIdParams) => Promise<JobDetails | null>;

  listJobAuditEvents: (
    params: ListJobAuditEventsParams,
  ) => Promise<JobAuditEvent[]>;

  retryJob: (params: JobCommandParams) => Promise<JobCommandResult>;

  cancelJob: (params: JobCommandParams) => Promise<JobCommandResult>;

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

  const access: AccessDependencies = {
    findTenantAccess: (subject, tenantId) =>
      findTenantAccess(pool, subject, tenantId),

    findDefaultTenantId: (subject) => findDefaultTenantId(pool, subject),

    isPlatformAdmin: (subject) => isPlatformAdmin(pool, subject),

    listAvailableMemberships: (subject, options) =>
      listAvailableMemberships(pool, subject, options),
  };

  return {
    pool,
    authorize,
    verifyAccessToken,
    access,
    createJob,

    listJobs: (params) => listJobs(pool, params),

    getJobById: (params) => getJobById(pool, params),

    listJobAuditEvents: (params) => listJobAuditEvents(pool, params),

    retryJob: (params) => retryJob(pool, params),

    cancelJob: (params) => cancelJob(pool, params),

    async close() {
      await pool.end();
    },
  };
}
