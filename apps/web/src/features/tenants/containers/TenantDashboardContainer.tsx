import { getTenantContext } from "@/server/dal/tenants/getTenantContext";

import { TenantDashboard } from "../components/TenantDashboard";

interface TenantDashboardContainerProps {
  tenantId: string;
}

export async function TenantDashboardContainer({
  tenantId,
}: TenantDashboardContainerProps) {
  const { tenant } = await getTenantContext(tenantId);

  return <TenantDashboard tenant={tenant} />;
}
