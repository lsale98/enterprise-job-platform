import { Suspense, type ReactNode } from "react";

import { TenantLayoutContainer } from "@/features/tenants/containers/TenantLayoutContainer";
import { TenantDashboardSkeleton } from "@/features/tenants/components/TenantDashboardSkeleton";

interface TenantLayoutProps {
  params: Promise<{
    tenantId: string;
  }>;
  children: ReactNode;
}

export default function TenantLayout({ params, children }: TenantLayoutProps) {
  return (
    <Suspense fallback={<TenantDashboardSkeleton />}>
      <TenantLayoutContainer params={params}>{children}</TenantLayoutContainer>
    </Suspense>
  );
}
