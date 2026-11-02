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

export interface WebhookDelivery {
  id: string;
  tenantId: string;
  endpointId: string;
  jobId: string;
  eventType: WebhookEventType;
  payload: unknown;
  url: string;
  signingSecretRef: string;
  attempt: number;
  leaseOwner: string;
}

export interface ClaimWebhookDeliveryParams {
  workerId: string;
  leaseSeconds: number;
}

export interface WebhookDeliveryExecutionParams {
  id: string;
  leaseOwner: string;
  attempt: number;
}

export type WebhookDeliveryMutationResult =
  { kind: "updated" } | { kind: "lease_lost" };

export interface FailWebhookDeliveryParams extends WebhookDeliveryExecutionParams {
  error: string;
  retryable: boolean;
  baseDelaySeconds?: number;
}

export type FailWebhookDeliveryResult =
  | { kind: "retry_scheduled"; availableAt: Date }
  | { kind: "failed" }
  | { kind: "lease_lost" };

export interface RecoverWebhookDeliveriesResult {
  retried: number;
  failed: number;
}
