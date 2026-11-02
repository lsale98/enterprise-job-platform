import type { Pool } from "pg";

import type {
  WebhookDeliveryExecutionParams,
  WebhookDeliveryMutationResult,
} from "../webhook.types.js";

export async function completeWebhookDelivery(
  pool: Pool,
  params: WebhookDeliveryExecutionParams,
): Promise<WebhookDeliveryMutationResult> {
  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new RangeError("Invalid delivery attempt");
  }

  if (!params.leaseOwner.trim()) {
    throw new RangeError("Lease owner is required");
  }

  const result = await pool.query(
    `
      UPDATE webhook_outbox
      SET status = 'delivered',
          delivered_at = clock_timestamp(),
          lease_owner = NULL,
          lease_until = NULL,
          last_error = NULL,
          updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'processing'
        AND lease_owner = $2
        AND attempts = $3
        AND lease_until > clock_timestamp()
      RETURNING id
    `,
    [params.id, params.leaseOwner, params.attempt],
  );

  return result.rowCount === 1 ? { kind: "updated" } : { kind: "lease_lost" };
}
