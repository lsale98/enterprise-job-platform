import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessTokenVerifierConfig {
  issuer: string;
  audience: string;

  // Injected only for isolated tests.
  keyResolver?: JWTVerifyGetKey;
}

export interface AuthenticatedIdentity {
  subject: string;
  issuer: string;
}

export function createAccessTokenVerifier(config: AccessTokenVerifierConfig) {
  const { issuer, audience } = config;

  if (!issuer || !audience?.trim()) {
    throw new Error("Issuer and audience are required");
  }

  const issuerUrl = new URL(issuer);

  const isLocalHttp =
    issuerUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(issuerUrl.hostname);

  if (
    !(issuerUrl.protocol === "https:" || isLocalHttp) ||
    issuerUrl.search ||
    issuerUrl.hash ||
    !/^\/realms\/[^/]+\/?$/.test(issuerUrl.pathname)
  ) {
    throw new Error("Invalid Keycloak issuer URL");
  }

  const jwksUrl = new URL(
    `${issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`,
  );

  // Resolver is cached for this verifier instance.
  const keyResolver =
    config.keyResolver ??
    createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
    });

  return async function verifyAccessToken(
    token: string,
  ): Promise<AuthenticatedIdentity> {
    if (!token || token.length > 16_000) {
      throw new Error("Invalid access token");
    }

    const { payload } = await jwtVerify(token, keyResolver, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "typ"],
      clockTolerance: 5,
    });

    // Keycloak access tokens use a Bearer token type.
    // Do not accept an ID token as an API access token.
    if (payload.typ !== "Bearer") {
      throw new Error("Expected Keycloak access token");
    }

    if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
      throw new Error("Missing authenticated subject");
    }

    return {
      subject: payload.sub,
      issuer,
    };
  };
}
