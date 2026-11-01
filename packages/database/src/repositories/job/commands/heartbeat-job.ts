import type { Pool } from "pg";

import type { JobExecutionParams } from "./job-command.types.js";

export interface HeartbeatJobParams extends JobExecutionParams {
  leaseSeconds: number;
}

export type HeartbeatJobResult =
  | {
      kind: "extended";
      leaseUntil: string;
    }
  | {
      kind: "lease_lost";
    };

export async function heartbeatJob(
  pool: Pool,
  params: HeartbeatJobParams,
): Promise<HeartbeatJobResult> {
  if (
    !Number.isSafeInteger(params.leaseSeconds) ||
    params.leaseSeconds < 10 ||
    params.leaseSeconds > 3600
  ) {
    throw new RangeError("Invalid lease duration");
  }

  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new RangeError("Invalid execution attempt");
  }

  if (!params.leaseOwner.trim()) {
    throw new RangeError("Lease owner is required");
  }

  const result = await pool.query<{ leaseUntil: Date }>(
    `UPDATE jobs
     SET lease_until =
           clock_timestamp() + ($5::int * interval '1 second'),
         updated_at = clock_timestamp()
     WHERE tenant_id = $1
       AND id = $2
       AND lease_owner = $3
       AND attempts = $4
       AND status = 'running'
       AND lease_until > clock_timestamp()
     RETURNING lease_until AS "leaseUntil"`,
    [
      params.tenantId,
      params.jobId,
      params.leaseOwner,
      params.attempt,
      params.leaseSeconds,
    ],
  );

  const row = result.rows[0];

  if (!row) {
    return { kind: "lease_lost" };
  }

  return {
    kind: "extended",
    leaseUntil: row.leaseUntil.toISOString(),
  };
}
