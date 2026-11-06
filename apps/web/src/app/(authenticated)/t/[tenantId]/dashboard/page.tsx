import { Suspense } from "react";

import { TenantDashboardContainer } from "@/features/tenants/containers/TenantDashboardContainer";
import { TenantDashboardSkeleton } from "@/features/tenants/components/TenantDashboardSkeleton";

interface TenantDashboardPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function TenantDashboardPage({
  params,
}: TenantDashboardPageProps) {
  const { tenantId } = await params;

  return (
    <Suspense fallback={<TenantDashboardSkeleton />}>
      <TenantDashboardContainer tenantId={tenantId} />
    </Suspense>
  );
}
