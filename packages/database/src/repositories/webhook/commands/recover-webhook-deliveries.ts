import type { Pool } from "pg";

import type { RecoverWebhookDeliveriesResult } from "../webhook.types.js";

interface RecoveryCountRow {
  retried: string;
  failed: string;
}

export async function recoverWebhookDeliveries(
  pool: Pool,
  batchSize = 100,
): Promise<RecoverWebhookDeliveriesResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new RangeError("Invalid recovery batch size");
  }

  const result = await pool.query<RecoveryCountRow>(
    `
      WITH expired AS (
        SELECT id
        FROM webhook_outbox
        WHERE status = 'processing'
          AND lease_until <= clock_timestamp()
        ORDER BY lease_until ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      ),
      recovered AS (
        UPDATE webhook_outbox AS w
        SET status = CASE
              WHEN w.attempts >= w.max_attempts
                THEN 'failed'
              ELSE 'pending'
            END,
            lease_owner = NULL,
            lease_until = NULL,
            available_at = CASE
              WHEN w.attempts < w.max_attempts
                THEN clock_timestamp()
              ELSE w.available_at
            END,
            last_error = 'Delivery lease expired',
            updated_at = clock_timestamp()
        FROM expired
        WHERE w.id = expired.id
        RETURNING w.status
      )
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'pending'
        )::text AS retried,
        COUNT(*) FILTER (
          WHERE status = 'failed'
        )::text AS failed
      FROM recovered
    `,
    [batchSize],
  );

  return {
    retried: Number(result.rows[0]?.retried ?? 0),
    failed: Number(result.rows[0]?.failed ?? 0),
  };
}
