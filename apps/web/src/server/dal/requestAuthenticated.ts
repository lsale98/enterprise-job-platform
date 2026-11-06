import "server-only";

import { redirect } from "next/navigation";

import { getAccessToken } from "../auth/getAccessToken";
import { apiRequest, type ApiRequestOptions } from "../http/apiRequest";
import { ApiError } from "../http/ApiError";

type AuthenticatedRequestOptions = Omit<ApiRequestOptions, "accessToken">;

export async function requestAuthenticated(
  options: AuthenticatedRequestOptions,
): Promise<unknown> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    redirect("/auth/signin");
  }

  try {
    return await apiRequest({
      ...options,
      accessToken,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      redirect("/auth/signin");
    }

    throw error;
  }
}
