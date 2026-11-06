export function TenantDashboardSkeleton() {
  return (
    <main
      role="status"
      aria-label="Loading organization dashboard"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <div aria-hidden="true" className="animate-pulse space-y-4">
        <div className="bg-foreground/10 h-4 w-40 rounded-md" />

        <div className="bg-foreground/10 h-9 w-64 rounded-lg" />

        <div className="bg-foreground/10 h-5 w-32 rounded-md" />

        <div className="bg-foreground/10 mt-10 h-32 rounded-xl" />
      </div>
    </main>
  );
}
