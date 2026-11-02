import type { WebhookDeliveryExecutionParams } from "@lab/database/webhook-repository";

import type {
  RunWebhookDispatcherParams,
  WebhookDispatcherDependencies,
} from "./dispatcher.types.js";

function executionIdentity(delivery: {
  id: string;
  leaseOwner: string;
  attempt: number;
}): WebhookDeliveryExecutionParams {
  return {
    id: delivery.id,
    leaseOwner: delivery.leaseOwner,
    attempt: delivery.attempt,
  };
}

export async function dispatchOneWebhook(
  config: RunWebhookDispatcherParams["config"],
  dependencies: WebhookDispatcherDependencies,
): Promise<boolean> {
  const delivery = await dependencies.claim({
    workerId: config.workerId,
    leaseSeconds: config.leaseSeconds,
  });

  if (!delivery) {
    return false;
  }

  const identity = executionIdentity(delivery);

  try {
    const secret = await dependencies.resolveSecret(delivery.signingSecretRef);

    const result = await dependencies.send({
      url: delivery.url,
      eventId: delivery.id,
      payload: delivery.payload,
      secret,
      timeoutMs: config.requestTimeoutMs,
    });

    if (result.kind === "delivered") {
      const completion = await dependencies.complete(identity);

      if (completion.kind === "lease_lost") {
        dependencies.onError(
          new Error(`Webhook delivery lease lost: ${delivery.id}`),
        );
      }

      return true;
    }

    const failure = await dependencies.fail({
      ...identity,
      error: result.reason,
      retryable: result.retryable,
      baseDelaySeconds: config.retryBaseDelaySeconds,
    });

    if (failure.kind === "lease_lost") {
      dependencies.onError(
        new Error(`Webhook failure lease lost: ${delivery.id}`),
      );
    }

    return true;
  } catch {
    // Never persist exception messages that might contain
    // secret values, URLs or arbitrary response data.
    try {
      const failure = await dependencies.fail({
        ...identity,
        error: "Webhook dispatch failed",
        retryable: false,
        baseDelaySeconds: config.retryBaseDelaySeconds,
      });

      if (failure.kind === "lease_lost") {
        dependencies.onError(
          new Error(`Webhook exception lease lost: ${delivery.id}`),
        );
      }
    } catch (persistError) {
      // The lease will eventually expire and recovery
      // will make the delivery eligible again.
      dependencies.onError(persistError);
    }

    dependencies.onError(new Error("Webhook dispatch operation failed"));
    return true;
  }
}

export async function runWebhookDispatcher({
  config,
  dependencies,
  signal,
}: RunWebhookDispatcherParams): Promise<void> {
  let nextRecoveryAt = 0;

  while (!signal.aborted) {
    const now = Date.now();

    if (now >= nextRecoveryAt) {
      try {
        await dependencies.recover(config.recoveryBatchSize);
      } catch (error) {
        dependencies.onError(error);
      }

      nextRecoveryAt = Date.now() + config.recoveryIntervalMs;
    }

    if (signal.aborted) {
      break;
    }

    try {
      const processed = await dispatchOneWebhook(config, dependencies);

      if (processed) {
        continue;
      }
    } catch (error) {
      dependencies.onError(error);
    }

    if (signal.aborted) {
      break;
    }

    try {
      await dependencies.sleep(config.pollIntervalMs, signal);
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  }
}
