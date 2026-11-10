import "server-only";

import { ApiError } from "./ApiError";

export interface ApiRequestOptions {
  path: `/${string}`;
  accessToken: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
}

function getApiUrl(path: string): URL {
  const configuredUrl = process.env.API_INTERNAL_URL;

  if (!configuredUrl) {
    throw new Error("API_INTERNAL_URL is required");
  }

  const base = new URL(configuredUrl);

  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new Error("Invalid API_INTERNAL_URL");
  }

  const url = new URL(path, base);

  if (url.origin !== base.origin || !url.pathname.startsWith("/v1/")) {
    throw new Error("Invalid internal API path");
  }

  return url;
}

export async function apiRequest({
  path,
  accessToken,
  method = "GET",
  body,
  idempotencyKey,
}: ApiRequestOptions): Promise<unknown> {
  if (method === "GET" && body !== undefined) {
    throw new Error("GET requests cannot contain a body");
  }

  if (body !== undefined && method === "DELETE") {
    throw new Error("DELETE bodies are not supported");
  }

  const url = getApiUrl(path);

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ApiError("UNAVAILABLE");
  }

  if (response.status === 401) {
    throw new ApiError("UNAUTHORIZED", 401);
  }

  if (response.status === 403) {
    throw new ApiError("FORBIDDEN", 403);
  }

  if (response.status === 404) {
    throw new ApiError("NOT_FOUND", 404);
  }

  if (!response.ok) {
    throw new ApiError("UNAVAILABLE", response.status);
  }

  if (response.status === 204) {
    return null;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiError("INVALID_RESPONSE");
  }
}
