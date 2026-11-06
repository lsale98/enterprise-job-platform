import "server-only";

import { cache } from "react";

import { CurrentUserSchema } from "@lab/contracts";

import { authenticatedApiRequest } from "../http/authenticatedApiRequest";
import { ApiError } from "../http/ApiError";

export const getCurrentUser = cache(async () => {
  const payload = await authenticatedApiRequest("/v1/me");

  const parsed = CurrentUserSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError("INVALID_RESPONSE");
  }

  return parsed.data;
});
