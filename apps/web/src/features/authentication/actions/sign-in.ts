"use server";

import { signIn } from "@/auth";

export async function signInAction(): Promise<void> {
  await signIn("keycloak", {
    redirectTo: "/entry",
  });
}
