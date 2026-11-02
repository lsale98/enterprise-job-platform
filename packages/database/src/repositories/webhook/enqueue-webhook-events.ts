import type { PoolClient } from "pg";

import type {
  EnqueueWebhookEventsParams,
  EnqueueWebhookEventsResult,
} from "./webhook.types.js";

export async function enqueueWebhookEvents(
  client: PoolClient,
  params: EnqueueWebhookEventsParams,
): Promise<EnqueueWebhookEventsResult> {
  const { tenantId, jobId, eventType } = params;

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO webhook_outbox (
        tenant_id,
        endpoint_id,
        job_id,
        event_type,
        payload
      )
      SELECT
        e.tenant_id,
        e.id,
        $2::uuid,
        $3::text,
        jsonb_build_object(
          'id', gen_random_uuid(),
          'type', $3::text,
          'tenantId', $1::uuid,
          'data', jsonb_build_object(
            'jobId', $2::uuid,
            'status', CASE
              WHEN $3::text = 'job.completed'
                THEN 'completed'
              ELSE 'failed'
            END
          )
        )
      FROM webhook_endpoints AS e
      JOIN jobs AS j
        ON j.id = $2::uuid
      AND j.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1::uuid
        AND e.enabled = true
      ON CONFLICT (
        job_id,
        event_type,
        endpoint_id
      )
      DO NOTHING
      RETURNING id
    `,
    [tenantId, jobId, eventType],
  );

  return {
    inserted: result.rowCount ?? 0,
  };
}
