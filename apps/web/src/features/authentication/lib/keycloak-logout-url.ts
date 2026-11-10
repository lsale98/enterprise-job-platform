import "server-only";

export function getKeycloakLogoutUrl(): string {
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const appUrl = process.env.AUTH_URL;

  if (!issuer || !clientId || !appUrl) {
    throw new Error("Missing Keycloak logout configuration");
  }

  const issuerUrl = new URL(issuer);
  const applicationUrl = new URL(appUrl);

  const isLocalhost = (hostname: string) =>
    hostname === "localhost" || hostname === "127.0.0.1";

  if (
    (issuerUrl.protocol !== "https:" &&
      !(issuerUrl.protocol === "http:" && isLocalhost(issuerUrl.hostname))) ||
    (applicationUrl.protocol !== "https:" &&
      !(
        applicationUrl.protocol === "http:" &&
        isLocalhost(applicationUrl.hostname)
      ))
  ) {
    throw new Error("Keycloak logout requires HTTPS outside local development");
  }

  const logoutUrl = new URL(
    `${issuerUrl.pathname.replace(/\/$/, "")}/protocol/openid-connect/logout`,
    issuerUrl.origin,
  );

  const redirectUrl = new URL("/auth/signin", applicationUrl);

  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    redirectUrl.toString(),
  );

  return logoutUrl.toString();
}
