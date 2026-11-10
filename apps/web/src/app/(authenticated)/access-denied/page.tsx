import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>

        <p className="text-muted-foreground">
          Your account does not have access to any organization or the platform
          administration. Contact your administrator.
        </p>

        <Link
          href="/api/auth/signout"
          className="inline-block rounded-md border px-4 py-2"
        >
          Sign out
        </Link>
      </div>
    </main>
  );
}
