import type { Permission } from "@lab/contracts";

export interface TenantNavigationItem {
  id: string;
  label: string;
  href: string;
  requiredPermission?: Permission;
}

export function filterTenantNavigation(
  items: readonly TenantNavigationItem[],
  permissions: readonly Permission[],
): TenantNavigationItem[] {
  const available = new Set(permissions);

  return items.filter(
    (item) =>
      item.requiredPermission === undefined ||
      available.has(item.requiredPermission),
  );
}

export function getTenantNavigation(
  tenantId: string,
  permissions: readonly Permission[],
): TenantNavigationItem[] {
  const basePath = `/t/${tenantId}`;

  const items: TenantNavigationItem[] = [
    {
      id: "dashboard",
      label: "Overview",
      href: `${basePath}/dashboard`,
    },
    {
      id: "jobs",
      label: "Jobs",
      href: `${basePath}/jobs`,
      requiredPermission: "jobs:read",
    },
    {
      id: "create-job",
      label: "Create Job",
      href: `${basePath}/jobs/new`,
      requiredPermission: "jobs:create",
    },
    {
      id: "members",
      label: "Members",
      href: `${basePath}/members`,
      requiredPermission: "members:manage",
    },
    {
      id: "audit",
      label: "Audit",
      href: `${basePath}/audit`,
      requiredPermission: "audit:read",
    },
  ];

  return filterTenantNavigation(items, permissions);
}
