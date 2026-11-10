import type { TenantSummary } from "@lab/contracts";

interface TenantDashboardProps {
  tenant: TenantSummary;
}

export function TenantDashboard({ tenant }: TenantDashboardProps) {
  return (
    <section aria-labelledby="tenant-dashboard-title">
      <header>
        <h1 id="tenant-dashboard-title" className="text-2xl font-semibold">
          {tenant.name}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Your role: {tenant.role}
        </p>
      </header>
    </section>
  );
}
