import { Button } from "@lab/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-primary">
          Enterprise Job Platform
        </p>

        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Operator Web Application
        </h1>

        <p className="max-w-2xl text-base text-muted">
          Next.js application foundation using shared React components and
          Tailwind CSS v4.
        </p>
      </header>

      <section className="space-y-5 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Shared UI components
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary action</Button>

          <Button variant="secondary">Secondary action</Button>

          <Button variant="outline">Outline action</Button>

          <Button variant="ghost">Ghost action</Button>

          <Button variant="destructive">Destructive action</Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>

          <Button size="md">Medium</Button>

          <Button size="lg">Large</Button>

          <Button loading loadingText="Processing...">
            Submit
          </Button>

          <Button disabled>Disabled</Button>
        </div>
      </section>

      <p className="text-sm text-muted">
        Development-only UI verification screen. Authentication and tenant-aware
        dashboard functionality will be implemented in E8-S1.
      </p>
    </main>
  );
}
