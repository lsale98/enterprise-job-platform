export interface SendWebhookParams {
  url: string;
  eventId: string;
  payload: unknown;
  secret: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export type SendWebhookResult =
  | {
      kind: "delivered";
      statusCode: number;
    }
  | {
      kind: "failed";
      retryable: boolean;
      statusCode: number | null;
      reason: string;
    };

export interface ResolvedWebhookAddress {
  address: string;
  family: 4 | 6;
}
