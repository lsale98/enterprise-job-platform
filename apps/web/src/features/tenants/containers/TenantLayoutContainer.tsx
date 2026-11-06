import type { ReactNode } from "react";

import { getEntryContext } from "@/server/dal/identity/getEntryContext";
import { getTenantContext } from "@/server/dal/tenants/getTenantContext";
import { listAvailableTenants } from "@/server/dal/tenants/listAvailableTenants";

import { TenantShell } from "../components/TenantShell";

interface TenantLayoutContainerProps {
  params: Promise<{
    tenantId: string;
  }>;
  children: ReactNode;
}

export async function TenantLayoutContainer({
  params,
  children,
}: TenantLayoutContainerProps) {
  const { tenantId } = await params;

  const context = await getTenantContext(tenantId);

  const [organizations, entry] = await Promise.all([
    listAvailableTenants(),
    getEntryContext(),
  ]);

  return (
    <TenantShell
      context={context}
      organizations={organizations}
      platformAvailable={entry.canAccessPlatform}
    >
      {children}
    </TenantShell>
  );
}
