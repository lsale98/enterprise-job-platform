import "server-only";

import { redirect } from "next/navigation";

import { getKeycloakAccessToken } from "../auth/getKeycloakAccessToken";
import { ApiError } from "./ApiError";
import { apiRequest } from "./apiRequest";

export async function authenticatedApiRequest(
  path: `/${string}`,
): Promise<unknown> {
  const accessToken = await getKeycloakAccessToken();

  if (!accessToken) {
    redirect("/auth/signin");
  }

  try {
    return await apiRequest({
      path,
      accessToken,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      redirect("/auth/signin");
    }

    throw error;
  }
}
