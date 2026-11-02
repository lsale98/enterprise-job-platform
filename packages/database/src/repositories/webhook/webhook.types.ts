export type WebhookEventType = "job.completed" | "job.failed";

export type WebhookDeliveryStatus =
  "pending" | "processing" | "delivered" | "failed";

export interface EnqueueWebhookEventsParams {
  tenantId: string;
  jobId: string;
  eventType: WebhookEventType;
}

export interface EnqueueWebhookEventsResult {
  inserted: number;
}
