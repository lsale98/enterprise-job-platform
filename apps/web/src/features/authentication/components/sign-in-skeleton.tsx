export function SignInSkeleton() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p role="status" className="text-sm text-muted-foreground">
        Checking authentication...
      </p>
    </main>
  );
}
