const SECRET_PREFIX = "env:WEBHOOK_SECRET_";

export class WebhookSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSecretError";
  }
}

export function resolveSigningSecret(
  reference: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (
    !reference.startsWith(SECRET_PREFIX) ||
    !/^env:WEBHOOK_SECRET_[A-Z0-9_]+$/.test(reference)
  ) {
    throw new WebhookSecretError("Invalid webhook signing secret reference");
  }

  const variable = reference.slice("env:".length);
  const secret = environment[variable];

  if (!secret || secret.trim().length < 32) {
    throw new WebhookSecretError(
      "Webhook signing secret is missing or too short",
    );
  }

  return secret;
}
