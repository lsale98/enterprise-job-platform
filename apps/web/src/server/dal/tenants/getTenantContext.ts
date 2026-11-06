import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";

import { TenantContextSchema } from "@lab/contracts";

import { ApiError } from "../../http/ApiError";
import { requestAuthenticated } from "../requestAuthenticated";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getTenantContext = cache(async (tenantId: string) => {
  if (!UUID_PATTERN.test(tenantId)) {
    notFound();
  }

  let payload: unknown;

  try {
    payload = await requestAuthenticated({
      path: `/v1/tenants/${tenantId}/context`,
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    ) {
      notFound();
    }

    throw error;
  }

  const parsed = TenantContextSchema.safeParse(payload);

  if (!parsed.success || parsed.data.tenant.id !== tenantId) {
    throw new ApiError("INVALID_RESPONSE");
  }

  return parsed.data;
});
