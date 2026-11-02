import type {
  ClaimWebhookDeliveryParams,
  FailWebhookDeliveryParams,
  FailWebhookDeliveryResult,
  RecoverWebhookDeliveriesResult,
  WebhookDelivery,
  WebhookDeliveryExecutionParams,
  WebhookDeliveryMutationResult,
} from "@lab/database/webhook-repository";

import type { WebhookDispatcherConfig } from "../config/webhook.config.js";

import type { SendWebhookResult } from "../transport/transport.types.js";

export interface WebhookDispatcherDependencies {
  claim: (
    params: ClaimWebhookDeliveryParams,
  ) => Promise<WebhookDelivery | null>;

  complete: (
    params: WebhookDeliveryExecutionParams,
  ) => Promise<WebhookDeliveryMutationResult>;

  fail: (
    params: FailWebhookDeliveryParams,
  ) => Promise<FailWebhookDeliveryResult>;

  recover: (batchSize: number) => Promise<RecoverWebhookDeliveriesResult>;

  resolveSecret: (reference: string) => Promise<string> | string;

  send: (params: {
    url: string;
    eventId: string;
    payload: unknown;
    secret: string;
    timeoutMs: number;
  }) => Promise<SendWebhookResult>;

  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  onError: (error: unknown) => void;
}

export interface RunWebhookDispatcherParams {
  config: WebhookDispatcherConfig;
  dependencies: WebhookDispatcherDependencies;
  signal: AbortSignal;
}
