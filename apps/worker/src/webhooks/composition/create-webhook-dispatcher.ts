import type { Pool } from "pg";

import {
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery,
  recoverWebhookDeliveries,
} from "@lab/database/webhook-repository";

import { resolveSigningSecret } from "../security/resolve-signing-secret.js";

import { sendWebhook } from "../transport/send-webhook.js";

import type { WebhookDispatcherDependencies } from "../runtime/dispatcher.types.js";

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);

    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }

    signal.addEventListener("abort", finish, {
      once: true,
    });
  });
}

export function createWebhookDispatcher(
  pool: Pool,
): WebhookDispatcherDependencies {
  return {
    claim: (params) => claimWebhookDelivery(pool, params),

    complete: (params) => completeWebhookDelivery(pool, params),

    fail: (params) => failWebhookDelivery(pool, params),

    recover: (batchSize) => recoverWebhookDeliveries(pool, batchSize),

    resolveSecret: (reference) => resolveSigningSecret(reference),

    send: (params) => sendWebhook(params),

    sleep,

    onError: (error) => {
      // Do not log signing secrets or raw HTTP payloads.
      // Replace this with structured, redacted telemetry.
      console.error(
        "[webhook-dispatcher]",
        error instanceof Error ? error.name : "UnknownError",
      );
    },
  };
}
