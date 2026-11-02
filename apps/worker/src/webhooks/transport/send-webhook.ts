import { lookup } from "node:dns/promises";
import { request } from "node:https";

import { signWebhook } from "../signing.js";

import { validateResolvedAddresses } from "./validate-webhook-address.js";

import { validateWebhookUrl } from "./validate-webhook-url.js";

import type {
  ResolvedWebhookAddress,
  SendWebhookParams,
  SendWebhookResult,
} from "./transport.types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16_384;

export function isRetryableHttpStatus(statusCode: number): boolean {
  return (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

export function classifyWebhookStatus(statusCode: number): SendWebhookResult {
  if (statusCode >= 200 && statusCode < 300) {
    return {
      kind: "delivered",
      statusCode,
    };
  }

  return {
    kind: "failed",
    retryable: isRetryableHttpStatus(statusCode),
    statusCode,
    reason: `HTTP ${statusCode}`,
  };
}

function networkFailure(reason: string): SendWebhookResult {
  return {
    kind: "failed",
    retryable: true,
    statusCode: null,
    reason,
  };
}

async function resolvePublicAddress(
  hostname: string,
  timeoutMs: number,
): Promise<ResolvedWebhookAddress> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const addresses = await Promise.race([
      lookup(hostname, {
        all: true,
        verbatim: true,
      }),

      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Webhook DNS lookup timed out"));
        }, timeoutMs);
      }),
    ]);

    const validated = validateResolvedAddresses(
      addresses.map((entry) => ({
        address: entry.address,
        family: entry.family as 4 | 6,
      })),
    );

    return validated[0]!;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function sendPinnedRequest(
  url: URL,
  address: ResolvedWebhookAddress,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxResponseBytes: number,
  trustedCertificate?: string,
): Promise<SendWebhookResult> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: SendWebhookResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        servername: url.hostname,

        ...(trustedCertificate ? { ca: trustedCertificate } : {}),

        signal: AbortSignal.timeout(timeoutMs),
        lookup: (_hostname, options, callback) => {
          const resolved = {
            address: address.address,
            family: address.family,
          };

          if (typeof options === "object" && options.all === true) {
            callback(null, [resolved]);
            return;
          }

          callback(null, resolved.address, resolved.family);
        },

        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body, "utf8").toString(),
        },

        // Node's https.request does not automatically follow
        // redirects. All 3xx responses remain unsuccessful.
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        let receivedBytes = 0;

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;

          if (receivedBytes > maxResponseBytes) {
            finish(networkFailure("Webhook response size exceeded limit"));

            response.destroy();
          }
        });

        response.on("end", () => {
          finish(classifyWebhookStatus(statusCode));
        });

        response.on("error", () => {
          finish(networkFailure("Webhook response stream failed"));
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      finish(networkFailure("Webhook request timed out"));
      req.destroy();
    });

    req.on("error", (error: Error) => {
      console.error("WEBHOOK_NETWORK_ERROR", {
        code: (error as NodeJS.ErrnoException).code,
        message: error.message,
        cause: error.cause,
      });

      finish(networkFailure("Webhook network request failed"));
    });

    req.end(body, "utf8");
  });
}

export async function sendWebhook(
  params: SendWebhookParams,
): Promise<SendWebhookResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const maxResponseBytes =
    params.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 60_000
  ) {
    throw new RangeError("Invalid webhook timeout");
  }

  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    maxResponseBytes > 1_048_576
  ) {
    throw new RangeError("Invalid webhook response size limit");
  }

  const url = validateWebhookUrl(params.url);

  const body = JSON.stringify(params.payload);

  if (body === undefined) {
    throw new TypeError("Webhook payload must be JSON serializable");
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const signature = signWebhook({
    secret: params.secret,
    timestamp,
    body,
  });

  let address: ResolvedWebhookAddress;

  const startedAt = Date.now();

  try {
    address = await resolvePublicAddress(url.hostname, timeoutMs);
  } catch (error) {
    // Invalid DNS targets are not transient delivery
    // failures and should not be retried indefinitely.
    const unsafeAddress =
      error instanceof Error && error.name === "UnsafeWebhookAddressError";

    return {
      kind: "failed",
      retryable: !unsafeAddress,
      statusCode: null,
      reason: unsafeAddress
        ? "Unsafe webhook destination"
        : "Webhook DNS resolution failed",
    };
  }

  const remainingMs = timeoutMs - (Date.now() - startedAt);

  if (remainingMs <= 0) {
    return networkFailure("Webhook request timed out");
  }

  return sendPinnedRequest(
    url,
    address,
    body,
    {
      "X-Webhook-Id": params.eventId,
      "X-Webhook-Timestamp": String(timestamp),
      "X-Webhook-Signature": signature,
    },
    remainingMs,
    maxResponseBytes,
  );
}
