import { signInAction } from "../actions/sign-in";

export function SignInForm() {
  return (
    <form action={signInAction} className="mt-8">
      <button
        type="submit"
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Continue with Enterprise SSO
      </button>
    </form>
  );
}
