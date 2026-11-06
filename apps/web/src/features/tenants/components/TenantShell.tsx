import type { ReactNode } from "react";

import type { TenantContext, TenantList } from "@lab/contracts";

import { OrganizationSwitcher } from "@/features/navigation/components/OrganizationSwitcher";
import { TenantNavigation } from "@/features/navigation/components/TenantNavigation";
import { getTenantNavigation } from "@/features/navigation/config/tenantNavigation";

interface TenantShellProps {
  context: TenantContext;
  organizations: TenantList;
  platformAvailable: boolean;
  children: ReactNode;
}

export function TenantShell({
  context,
  organizations,
  platformAvailable,
  children,
}: TenantShellProps) {
  const navigation = getTenantNavigation(
    context.tenant.id,
    context.permissions,
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b p-4 md:border-r md:border-b-0">
        <OrganizationSwitcher
          key={context.tenant.id}
          activeTenant={context.tenant}
          initialPage={organizations}
          platformAvailable={platformAvailable}
        />

        <div className="mt-6">
          <TenantNavigation items={navigation} />
        </div>
      </aside>

      <main className="min-w-0 p-6">{children}</main>
    </div>
  );
}
