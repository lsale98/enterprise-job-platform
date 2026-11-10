import { logoutAction } from "../actions/sign-out";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:opacity-70"
      >
        Sign out
      </button>
    </form>
  );
}
