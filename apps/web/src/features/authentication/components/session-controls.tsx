import { connection } from "next/server";

import { auth } from "@/auth";

import { LogoutButton } from "./logout-button";

export async function SessionControls() {
  await connection();

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return <LogoutButton />;
}
