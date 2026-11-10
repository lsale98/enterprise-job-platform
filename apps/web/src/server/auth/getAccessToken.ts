import "server-only";

import { cache } from "react";

import { headers } from "next/headers";
import { connection } from "next/server";
import { getToken } from "next-auth/jwt";

export const getAccessToken = cache(async (): Promise<string | null> => {
  await connection();

  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }

  const requestHeaders = await headers();

  const token = await getToken({
    req: { headers: requestHeaders },
    secret,
    secureCookie: process.env.AUTH_URL?.startsWith("https://") ?? false,
  });

  if (
    typeof token?.accessToken !== "string" ||
    typeof token.accessTokenExpires !== "number"
  ) {
    return null;
  }

  if (Date.now() >= token.accessTokenExpires - 30_000) {
    return null;
  }

  return token.accessToken;
});
