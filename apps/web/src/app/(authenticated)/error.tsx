"use client";

interface AuthenticatedErrorProps {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}

export default function AuthenticatedError({ reset }: AuthenticatedErrorProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">
        Service temporarily unavailable
      </h1>

      <p className="text-muted-foreground mt-3">
        We could not load this page. Please try again.
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg border px-4 py-2"
      >
        Retry
      </button>
    </main>
  );
}
