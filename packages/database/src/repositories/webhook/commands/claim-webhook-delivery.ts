import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type {
  ClaimWebhookDeliveryParams,
  WebhookDelivery,
  WebhookEventType,
} from "../webhook.types.js";

interface ClaimedWebhookRow {
  id: string;
  tenantId: string;
  endpointId: string;
  jobId: string;
  eventType: WebhookEventType;
  payload: unknown;
  url: string;
  signingSecretRef: string;
  attempt: number;
}

export async function claimWebhookDelivery(
  pool: Pool,
  params: ClaimWebhookDeliveryParams,
): Promise<WebhookDelivery | null> {
  if (!params.workerId.trim()) {
    throw new RangeError("Webhook worker ID is required");
  }

  if (
    !Number.isSafeInteger(params.leaseSeconds) ||
    params.leaseSeconds < 1 ||
    params.leaseSeconds > 3600
  ) {
    throw new RangeError("Invalid webhook lease duration");
  }

  // Unique token per claim, not merely per dispatcher process.
  const leaseOwner = `${params.workerId}:${randomUUID()}`;

  const result = await pool.query<ClaimedWebhookRow>(
    `
      WITH candidate AS (
        SELECT w.id
        FROM webhook_outbox AS w
        JOIN webhook_endpoints AS e
          ON e.id = w.endpoint_id
         AND e.tenant_id = w.tenant_id
        WHERE w.status = 'pending'
          AND w.available_at <= clock_timestamp()
          AND w.attempts < w.max_attempts
          AND e.enabled = true
        ORDER BY w.available_at ASC, w.created_at ASC, w.id ASC
        FOR UPDATE OF w SKIP LOCKED
        LIMIT 1
      ),
      claimed AS (
        UPDATE webhook_outbox AS w
        SET status = 'processing',
            attempts = w.attempts + 1,
            lease_owner = $1,
            lease_until = clock_timestamp()
              + ($2::integer * interval '1 second'),
            updated_at = clock_timestamp()
        FROM candidate
        WHERE w.id = candidate.id
        RETURNING w.*
      )
      SELECT
        c.id::text AS id,
        c.tenant_id::text AS "tenantId",
        c.endpoint_id::text AS "endpointId",
        c.job_id::text AS "jobId",
        c.event_type AS "eventType",
        c.payload,
        e.url,
        e.signing_secret_ref AS "signingSecretRef",
        c.attempts AS attempt
      FROM claimed AS c
      JOIN webhook_endpoints AS e
        ON e.id = c.endpoint_id
       AND e.tenant_id = c.tenant_id
    `,
    [leaseOwner, params.leaseSeconds],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return { ...row, leaseOwner };
}
