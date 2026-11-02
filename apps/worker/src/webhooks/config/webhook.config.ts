export interface WebhookDispatcherConfig {
  workerId: string;
  pollIntervalMs: number;
  recoveryIntervalMs: number;
  leaseSeconds: number;
  requestTimeoutMs: number;
  retryBaseDelaySeconds: number;
  recoveryBatchSize: number;
}

function integerEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const number = value === undefined ? fallback : Number(value);

  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RangeError(`Invalid ${name}`);
  }

  return number;
}

export function loadWebhookDispatcherConfig(
  env: NodeJS.ProcessEnv = process.env,
): WebhookDispatcherConfig {
  const requestTimeoutMs = integerEnv(
    env.WEBHOOK_REQUEST_TIMEOUT_MS,
    10_000,
    100,
    60_000,
    "WEBHOOK_REQUEST_TIMEOUT_MS",
  );

  const leaseSeconds = integerEnv(
    env.WEBHOOK_LEASE_SECONDS,
    60,
    1,
    3600,
    "WEBHOOK_LEASE_SECONDS",
  );

  if (leaseSeconds * 1000 <= requestTimeoutMs) {
    throw new RangeError("Webhook lease must exceed request timeout");
  }

  return {
    workerId: env.WEBHOOK_WORKER_ID?.trim() || "webhook-dispatcher",
    pollIntervalMs: integerEnv(
      env.WEBHOOK_POLL_INTERVAL_MS,
      1000,
      50,
      60_000,
      "WEBHOOK_POLL_INTERVAL_MS",
    ),
    recoveryIntervalMs: integerEnv(
      env.WEBHOOK_RECOVERY_INTERVAL_MS,
      5000,
      100,
      300_000,
      "WEBHOOK_RECOVERY_INTERVAL_MS",
    ),
    leaseSeconds,
    requestTimeoutMs,
    retryBaseDelaySeconds: integerEnv(
      env.WEBHOOK_RETRY_BASE_DELAY_SECONDS,
      5,
      1,
      3600,
      "WEBHOOK_RETRY_BASE_DELAY_SECONDS",
    ),
    recoveryBatchSize: integerEnv(
      env.WEBHOOK_RECOVERY_BATCH_SIZE,
      100,
      1,
      1000,
      "WEBHOOK_RECOVERY_BATCH_SIZE",
    ),
  };
}
