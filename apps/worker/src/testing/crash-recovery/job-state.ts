import assert from "node:assert/strict";

import type { Pool } from "pg";

export interface JobExecutionState {
  id: string;
  tenantId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  result: unknown;
  error: string | null;
}

interface JobStateRow {
  id: string;
  tenantId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  result: unknown;
  error: string | null;
}

export interface WaitForJobOptions {
  timeoutMs?: number;
  pollMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 50;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function assertTestDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{ database: string }>(
    "SELECT current_database() AS database",
  );

  assert.equal(
    result.rows[0]?.database,
    "lab_test",
    "Crash recovery tests must use lab_test",
  );
}

export async function getJobState(
  pool: Pool,
  jobId: string,
): Promise<JobExecutionState | null> {
  const result = await pool.query<JobStateRow>(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        status,
        attempts,
        max_attempts AS "maxAttempts",
        lease_owner AS "leaseOwner",
        lease_until AS "leaseUntil",
        result,
        error
      FROM jobs
      WHERE id = $1
    `,
    [jobId],
  );

  return result.rows[0] ?? null;
}

export async function waitForJobState(
  pool: Pool,
  jobId: string,
  predicate: (state: JobExecutionState) => boolean,
  options: WaitForJobOptions = {},
): Promise<JobExecutionState> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;

  const startedAt = Date.now();

  let lastState: JobExecutionState | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastState = await getJobState(pool, jobId);

    if (lastState && predicate(lastState)) {
      return lastState;
    }

    await delay(pollMs);
  }

  throw new Error(
    [
      `Timed out waiting for job ${jobId}.`,
      `Last state: ${JSON.stringify(lastState)}`,
    ].join("\n"),
  );
}

export async function expireJobLease(
  pool: Pool,
  params: {
    jobId: string;
    leaseOwner: string;
    attempts: number;
  },
): Promise<void> {
  await assertTestDatabase(pool);

  const result = await pool.query(
    `
      UPDATE jobs
      SET lease_until = now() - interval '1 second'
      WHERE id = $1
        AND status = 'running'
        AND lease_owner = $2
        AND attempts = $3
        AND lease_until > now()
    `,
    [params.jobId, params.leaseOwner, params.attempts],
  );

  assert.equal(
    result.rowCount,
    1,
    "Expected exactly one active job lease to expire",
  );
}

export async function deleteTestJob(pool: Pool, jobId: string): Promise<void> {
  await assertTestDatabase(pool);

  await pool.query(
    `
      DELETE FROM audit_events
      WHERE resource_type = 'job'
        AND resource_id = $1
    `,
    [jobId],
  );

  await pool.query("DELETE FROM jobs WHERE id = $1", [jobId]);
}
