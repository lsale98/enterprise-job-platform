import { createHash } from "node:crypto";
import type { Pool } from "pg";

import {
  CreateJobSchema,
  type JobInput,
  type JobStatus,
  type JobType,
} from "@lab/contracts";

import { transaction } from "../../connection/transaction.js";

export interface PersistedJob {
  id: string;
  tenantId: string;
  createdBy: string;
  type: JobType;
  input: JobInput;
  status: JobStatus;
  requestHash: string;
}

export interface CreateJobParams {
  tenantId: string;
  createdBy: string;
  idempotencyKey: string;
  input: JobInput;
}

export type CreateJobOutcome =
  | { kind: "created"; job: PersistedJob }
  | { kind: "replayed"; job: PersistedJob };

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key already used for a different request");
    this.name = "IdempotencyConflictError";
  }
}

// Sort object keys so property order does not change
// the request fingerprint. Array order remains significant.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export async function createJobIdempotently(
  pool: Pool,
  params: CreateJobParams,
): Promise<CreateJobOutcome> {
  const { tenantId, createdBy, idempotencyKey } = params;

  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) {
    throw new RangeError("Invalid idempotency key");
  }

  const input = CreateJobSchema.parse(params.input);
  const json = JSON.stringify(canonicalize(input));

  const requestHash = createHash("sha256").update(json).digest("hex");

  return transaction(pool, async (client) => {
    const inserted = await client.query<PersistedJob>(
      `INSERT INTO jobs (
        tenant_id,
        created_by,
        type,
        input,
        idempotency_key,
        request_hash
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6)
      ON CONFLICT (tenant_id, idempotency_key)
      DO NOTHING
      RETURNING
        id,
        tenant_id AS "tenantId",
        created_by AS "createdBy",
        type,
        input,
        status,
        request_hash AS "requestHash"`,
      [tenantId, createdBy, input.type, json, idempotencyKey, requestHash],
    );

    const created = inserted.rows[0];

    if (created) {
      return { kind: "created", job: created };
    }

    const existing = await client.query<PersistedJob>(
      `SELECT
        id,
        tenant_id AS "tenantId",
        created_by AS "createdBy",
        type,
        input,
        status,
        request_hash AS "requestHash"
      FROM jobs
      WHERE tenant_id = $1
        AND idempotency_key = $2`,
      [tenantId, idempotencyKey],
    );

    const job = existing.rows[0];

    if (!job) {
      throw new Error("Idempotency resolution failed");
    }

    if (job.requestHash !== requestHash || job.createdBy !== createdBy) {
      throw new IdempotencyConflictError();
    }

    return { kind: "replayed", job };
  });
}
