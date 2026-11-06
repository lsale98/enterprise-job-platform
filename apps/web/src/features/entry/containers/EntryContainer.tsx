import { redirect } from "next/navigation";

import { getEntryContext } from "@/server/dal/identity/getEntryContext";

export async function EntryContainer(): Promise<never> {
  const { defaultTenantId, canAccessPlatform } = await getEntryContext();

  if (defaultTenantId) {
    redirect(`/t/${defaultTenantId}/dashboard`);
  }

  if (canAccessPlatform) {
    redirect("/platform/dashboard");
  }

  redirect("/access-denied");
}
