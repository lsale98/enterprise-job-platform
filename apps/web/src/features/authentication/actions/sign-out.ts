"use server";

import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { getKeycloakLogoutUrl } from "../lib/keycloak-logout-url";

export async function logoutAction(): Promise<void> {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Resolve and validate configuration before destroying the local session.
  const keycloakLogoutUrl = getKeycloakLogoutUrl();

  // Invalidate the Auth.js application session without redirecting.
  await signOut({ redirect: false });

  // Continue with Keycloak RP-Initiated Logout.
  redirect(keycloakLogoutUrl);
}
