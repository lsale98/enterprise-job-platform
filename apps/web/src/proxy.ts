import { NextResponse } from "next/server";

import { auth } from "@/auth";

export const proxy = auth((request) => {
  if (request.auth?.user) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/auth/signin", request.url);

  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/entry", "/t/:path*", "/platform/:path*", "/access-denied"],
};
