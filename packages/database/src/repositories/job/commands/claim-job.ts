import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import type { JobInput } from "@lab/contracts";

import type { JobSummary } from "../job.types.js";

export interface ClaimJobParams {
  workerId: string;
  leaseSeconds: number;
}

export type ClaimedJob = Pick<
  JobSummary,
  "id" | "tenantId" | "type" | "attempts" | "maxAttempts"
> & {
  input: JobInput;
  leaseOwner: string;
  leaseUntil: string;
};

type ClaimedJobRow = Omit<ClaimedJob, "leaseUntil"> & {
  leaseUntil: Date;
};

export async function claimJob(
  pool: Pool,
  params: ClaimJobParams,
): Promise<ClaimedJob | null> {
  const { workerId, leaseSeconds } = params;

  if (!workerId.trim()) {
    throw new RangeError("workerId is required");
  }

  if (
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 10 ||
    leaseSeconds > 3600
  ) {
    throw new RangeError("Invalid lease duration");
  }

  const leaseToken = randomUUID();

  const result = await pool.query<ClaimedJobRow>(
    `WITH candidate AS (
      SELECT id
      FROM jobs
      WHERE type = 'report'
        AND attempts < max_attempts
        AND (
          (
            status = 'queued'
            AND available_at <= clock_timestamp()
          )
          OR (
            status = 'running'
            AND lease_until < clock_timestamp()
          )
        )
      ORDER BY available_at ASC, created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs AS j
    SET status = 'running',
        attempts = j.attempts + 1,
        lease_owner = $1,
        lease_until =
          clock_timestamp() + ($2::int * interval '1 second'),
        updated_at = clock_timestamp()
    FROM candidate
    WHERE j.id = candidate.id
    RETURNING
      j.id::text AS id,
      j.tenant_id::text AS "tenantId",
      j.type,
      j.input,
      j.attempts,
      j.max_attempts AS "maxAttempts",
      j.lease_owner AS "leaseOwner",
      j.lease_until AS "leaseUntil"`,
    [leaseToken, leaseSeconds],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    ...row,
    leaseUntil: row.leaseUntil.toISOString(),
  };
}
