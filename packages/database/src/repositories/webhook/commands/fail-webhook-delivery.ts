import type { Pool } from "pg";

import type {
  FailWebhookDeliveryParams,
  FailWebhookDeliveryResult,
} from "../webhook.types.js";

interface FailedDeliveryRow {
  status: "pending" | "failed";
  availableAt: Date;
}

export async function failWebhookDelivery(
  pool: Pool,
  params: FailWebhookDeliveryParams,
): Promise<FailWebhookDeliveryResult> {
  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new RangeError("Invalid delivery attempt");
  }

  if (!params.leaseOwner.trim()) {
    throw new RangeError("Lease owner is required");
  }

  const error = params.error.trim().slice(0, 2000);

  if (!error) {
    throw new RangeError("Delivery failure reason is required");
  }

  const baseDelaySeconds = params.baseDelaySeconds ?? 5;

  if (
    !Number.isSafeInteger(baseDelaySeconds) ||
    baseDelaySeconds < 1 ||
    baseDelaySeconds > 3600
  ) {
    throw new RangeError("Invalid retry base delay");
  }

  const result = await pool.query<FailedDeliveryRow>(
    `
      UPDATE webhook_outbox
      SET status = CASE
            WHEN $4::boolean AND attempts < max_attempts
              THEN 'pending'
            ELSE 'failed'
          END,
          available_at = CASE
            WHEN $4::boolean AND attempts < max_attempts
              THEN clock_timestamp()
                + (
                    LEAST(
                      $5::numeric * power(
                        2::numeric,
                        LEAST(attempts - 1, 16)
                      ),
                      3600::numeric
                    ) * interval '1 second'
                  )
            ELSE available_at
          END,
          last_error = $6,
          lease_owner = NULL,
          lease_until = NULL,
          updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'processing'
        AND lease_owner = $2
        AND attempts = $3
        AND lease_until > clock_timestamp()
      RETURNING
        status,
        available_at AS "availableAt"
    `,
    [
      params.id,
      params.leaseOwner,
      params.attempt,
      params.retryable,
      baseDelaySeconds,
      error,
    ],
  );

  const row = result.rows[0];

  if (!row) {
    return { kind: "lease_lost" };
  }

  if (row.status === "failed") {
    return { kind: "failed" };
  }

  return {
    kind: "retry_scheduled",
    availableAt: row.availableAt,
  };
}
