import "server-only";

import { cache } from "react";

import { notFound } from "next/navigation";

import { PlatformContextSchema } from "@lab/contracts";

import { requestAuthenticated } from "../requestAuthenticated";
import { ApiError } from "../../http/ApiError";

export const getPlatformContext = cache(async () => {
  let payload: unknown;

  try {
    payload = await requestAuthenticated({
      path: "/v1/platform/me",
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")
    ) {
      notFound();
    }

    throw error;
  }

  const parsed = PlatformContextSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError("INVALID_RESPONSE");
  }

  return parsed.data;
});
