import {
  createAccessTokenVerifier,
  createAuthorizer,
  type AuthenticatedIdentity,
} from "@lab/auth";

import { createDatabasePool, type DatabasePool } from "@lab/database";
import { findMembership } from "@lab/database/membership-repository";
import { createJobIdempotently } from "@lab/database/job-repository";
import type { CreateJobParams } from "@lab/database/job-repository";

import type { AppConfig } from "../config/env.js";

type Authorize = ReturnType<typeof createAuthorizer>;

export interface AppDependencies {
  pool: DatabasePool;
  authorize: Authorize;
  verifyAccessToken: (token: string) => Promise<AuthenticatedIdentity>;
  createJob: (
    params: CreateJobParams,
  ) => ReturnType<typeof createJobIdempotently>;

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

    async close() {
      await pool.end();
    },
  };
}
