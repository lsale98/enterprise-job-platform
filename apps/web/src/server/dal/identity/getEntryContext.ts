import "server-only";

import { cache } from "react";

import { EntryContextSchema } from "@lab/contracts";

import { requestAuthenticated } from "../requestAuthenticated";
import { ApiError } from "../../http/ApiError";

export const getEntryContext = cache(async () => {
  const payload = await requestAuthenticated({
    path: "/v1/me/entry",
  });

  const parsed = EntryContextSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError("INVALID_RESPONSE");
  }

  return parsed.data;
});
