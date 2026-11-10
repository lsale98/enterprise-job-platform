import { connection } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { SignInForm } from "./sign-in-form";

export async function SignInContent() {
  await connection();

  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Enterprise Job Platform
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>

          <p className="text-sm leading-6 text-muted-foreground">
            Access your authorized platform or organization workspace.
          </p>
        </div>

        <SignInForm />

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Access is provisioned by your organization administrator.
          Self-registration is not available.
        </p>
      </section>
    </main>
  );
}
