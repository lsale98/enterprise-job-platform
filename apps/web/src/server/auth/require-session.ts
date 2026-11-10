import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";

export async function requireSession() {
  await connection();

  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return {
    ...session,
    user: session.user,
  };
}
