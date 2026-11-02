import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "v1=";
const DEFAULT_TOLERANCE_SECONDS = 300;

export interface SignWebhookParams {
  secret: string;
  timestamp: number;
  body: string;
}

export interface VerifyWebhookParams extends SignWebhookParams {
  signature: string;
  now?: number;
  toleranceSeconds?: number;
}

function validateSecret(secret: string): void {
  if (!secret || secret.trim().length === 0) {
    throw new Error("Webhook signing secret is required");
  }
}

function validateTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("Invalid webhook timestamp");
  }
}

function calculateDigest({
  secret,
  timestamp,
  body,
}: SignWebhookParams): Buffer {
  validateSecret(secret);
  validateTimestamp(timestamp);

  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest();
}

export function signWebhook(params: SignWebhookParams): string {
  return SIGNATURE_PREFIX + calculateDigest(params).toString("hex");
}

export function verifyWebhook({
  secret,
  timestamp,
  body,
  signature,
  now = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}: VerifyWebhookParams): boolean {
  validateSecret(secret);

  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(toleranceSeconds) ||
    toleranceSeconds < 0
  ) {
    return false;
  }

  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  if (
    !signature.startsWith(SIGNATURE_PREFIX) ||
    !/^v1=[0-9a-f]{64}$/.test(signature)
  ) {
    return false;
  }

  const expected = calculateDigest({
    secret,
    timestamp,
    body,
  });

  const received = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), "hex");

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
