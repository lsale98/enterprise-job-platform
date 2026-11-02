import assert from "node:assert/strict";
import { test } from "node:test";

import type { WebhookDelivery } from "@lab/database/webhook-repository";

import type { WebhookDispatcherConfig } from "../config/webhook.config.js";

import type { WebhookDispatcherDependencies } from "./dispatcher.types.js";

import {
  dispatchOneWebhook,
  runWebhookDispatcher,
} from "./run-webhook-dispatcher.js";

const config: WebhookDispatcherConfig = {
  workerId: "test-dispatcher",
  pollIntervalMs: 10,
  recoveryIntervalMs: 100,
  leaseSeconds: 60,
  requestTimeoutMs: 1000,
  retryBaseDelaySeconds: 5,
  recoveryBatchSize: 100,
};

const delivery: WebhookDelivery = {
  id: "event-123",
  tenantId: "tenant-123",
  endpointId: "endpoint-123",
  jobId: "job-123",
  eventType: "job.completed",
  payload: {
    id: "event-123",
    type: "job.completed",
  },
  url: "https://hooks.example.com/events",
  signingSecretRef: "env:WEBHOOK_SECRET_TEST",
  attempt: 1,
  leaseOwner: "worker:lease-123",
};

function createDependencies() {
  const calls: string[] = [];

  const dependencies: WebhookDispatcherDependencies = {
    claim: async () => {
      calls.push("claim");
      return delivery;
    },

    complete: async () => {
      calls.push("complete");
      return { kind: "updated" };
    },

    fail: async () => {
      calls.push("fail");
      return { kind: "retry_scheduled", availableAt: new Date() };
    },

    recover: async () => {
      calls.push("recover");
      return { retried: 0, failed: 0 };
    },

    resolveSecret: async () => {
      calls.push("resolve");
      return "test-secret-with-at-least-32-characters";
    },

    send: async () => {
      calls.push("send");
      return { kind: "delivered", statusCode: 200 };
    },

    sleep: async () => {
      calls.push("sleep");
    },

    onError: () => {
      calls.push("error");
    },
  };

  return { calls, dependencies };
}

test("successful delivery marks the webhook as delivered", async () => {
  const { calls, dependencies } = createDependencies();

  const processed = await dispatchOneWebhook(config, dependencies);

  assert.equal(processed, true);

  assert.deepEqual(calls, ["claim", "resolve", "send", "complete"]);
});

test("retryable HTTP failure schedules retry", async () => {
  const { calls, dependencies } = createDependencies();

  let retryable: boolean | undefined;

  dependencies.send = async () => ({
    kind: "failed",
    retryable: true,
    statusCode: 503,
    reason: "HTTP 503",
  });

  dependencies.fail = async (params) => {
    calls.push("fail");
    retryable = params.retryable;
    return {
      kind: "retry_scheduled",
      availableAt: new Date(),
    };
  };

  await dispatchOneWebhook(config, dependencies);

  assert.equal(retryable, true);
  assert.deepEqual(calls, ["claim", "resolve", "fail"]);
});

test("permanent HTTP failure stops retrying", async () => {
  const { dependencies } = createDependencies();

  let retryable: boolean | undefined;

  dependencies.send = async () => ({
    kind: "failed",
    retryable: false,
    statusCode: 400,
    reason: "HTTP 400",
  });

  dependencies.fail = async (params) => {
    retryable = params.retryable;
    return { kind: "failed" };
  };

  await dispatchOneWebhook(config, dependencies);

  assert.equal(retryable, false);
});

test("secret resolution failure marks delivery as failed", async () => {
  const { calls, dependencies } = createDependencies();

  dependencies.resolveSecret = async () => {
    throw new Error("Missing secret");
  };

  let retryable: boolean | undefined;

  dependencies.fail = async (params) => {
    calls.push("fail");
    retryable = params.retryable;
    return { kind: "failed" };
  };

  await dispatchOneWebhook(config, dependencies);

  assert.equal(retryable, false);
  assert.equal(calls.includes("send"), false);
  assert.equal(calls.includes("fail"), true);
});

test("no pending delivery returns false", async () => {
  const { dependencies } = createDependencies();

  dependencies.claim = async () => null;

  assert.equal(await dispatchOneWebhook(config, dependencies), false);
});

test("aborted runtime does not claim or recover", async () => {
  const { calls, dependencies } = createDependencies();

  const controller = new AbortController();
  controller.abort();

  await runWebhookDispatcher({
    config,
    dependencies,
    signal: controller.signal,
  });

  assert.deepEqual(calls, []);
});

test("runtime recovers deliveries and stops on abort", async () => {
  const { calls, dependencies } = createDependencies();

  const controller = new AbortController();

  dependencies.claim = async () => {
    calls.push("claim");
    return null;
  };

  dependencies.sleep = async () => {
    calls.push("sleep");
    controller.abort();
  };

  await runWebhookDispatcher({
    config,
    dependencies,
    signal: controller.signal,
  });

  assert.deepEqual(calls, ["recover", "claim", "sleep"]);
});
