import "server-only";

import { cache } from "react";

import { TenantListSchema } from "@lab/contracts";

import { requestAuthenticated } from "../requestAuthenticated";
import { ApiError } from "../../http/ApiError";

export const listAvailableTenants = cache(
  async (search = "", cursor?: string) => {
    const query = new URLSearchParams({
      limit: "20",
    });

    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      query.set("search", normalizedSearch);
    }

    if (cursor) {
      query.set("cursor", cursor);
    }

    const payload = await requestAuthenticated({
      path: `/v1/me/tenants?${query.toString()}`,
    });

    const parsed = TenantListSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ApiError("INVALID_RESPONSE");
    }

    return parsed.data;
  },
);
