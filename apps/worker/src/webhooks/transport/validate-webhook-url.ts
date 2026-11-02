import { isIP } from "node:net";

export class UnsafeWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeWebhookUrlError";
  }
}

export function validateWebhookUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new UnsafeWebhookUrlError("Invalid webhook URL");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeWebhookUrlError("Webhook endpoint must use HTTPS");
  }

  if (url.username || url.password) {
    throw new UnsafeWebhookUrlError("Webhook URL credentials are not allowed");
  }

  if (url.hash) {
    throw new UnsafeWebhookUrlError("Webhook URL fragments are not allowed");
  }

  if (url.port && url.port !== "443") {
    throw new UnsafeWebhookUrlError("Webhook endpoint must use port 443");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test")
  ) {
    throw new UnsafeWebhookUrlError(
      "Local or reserved hostnames are not allowed",
    );
  }

  // Require a DNS hostname. DNS results must also be validated
  // and pinned by the HTTP transport.
  if (isIP(hostname) !== 0 || hostname.includes(":")) {
    throw new UnsafeWebhookUrlError(
      "IP literal webhook destinations are not allowed",
    );
  }

  if (
    hostname.length > 253 ||
    !hostname.includes(".") ||
    !hostname
      .split(".")
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  ) {
    throw new UnsafeWebhookUrlError("Invalid webhook hostname");
  }

  return url;
}
