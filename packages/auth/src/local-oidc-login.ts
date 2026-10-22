import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import * as oidc from "openid-client";
import { createAccessTokenVerifier } from "./index.js";

// Read the local .env from the repository root.
loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

if (process.env.NODE_ENV === "production") {
  throw new Error("Local OIDC test is development-only");
}

const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
const clientId = process.env.AUTH_KEYCLOAK_ID;
const clientSecret = process.env.AUTH_KEYCLOAK_SECRET;
const audience = process.env.AUTH_API_AUDIENCE;

if (!issuer || !clientId || !clientSecret || !audience) {
  throw new Error("Missing Keycloak environment variables");
}

const redirectUri = "http://localhost:3000/api/auth/callback/keycloak";

const issuerUrl = new URL(issuer);

if (
  process.env.NODE_ENV === "production" ||
  issuerUrl.protocol !== "http:" ||
  issuerUrl.hostname !== "localhost"
) {
  throw new Error("Local HTTP Keycloak only");
}

const config = await oidc.discovery(
  issuerUrl,
  clientId,
  clientSecret,
  undefined,
  {
    execute: [oidc.allowInsecureRequests],
  },
);

const codeVerifier = oidc.randomPKCECodeVerifier();
const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

const state = oidc.randomState();
const nonce = oidc.randomNonce();

const authorizationUrl = oidc.buildAuthorizationUrl(config, {
  redirect_uri: redirectUri,
  scope: "openid profile email",
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
  state,
  nonce,
});

const verifyAccessToken = createAccessTokenVerifier({
  issuer,
  audience,
});

let callbackProcessed = false;

const server = createServer(async (request, response) => {
  if (request.headers.host !== "localhost:3000") {
    response.writeHead(400);
    response.end("Invalid host");
    return;
  }

  const url = new URL(request.url ?? "/", redirectUri);

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(302, {
      Location: authorizationUrl.href,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  if (
    request.method !== "GET" ||
    url.pathname !== "/api/auth/callback/keycloak"
  ) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  if (callbackProcessed) {
    response.writeHead(409);
    response.end("Callback already processed");
    return;
  }

  callbackProcessed = true;

  try {
    const tokens = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });

    const identity = await verifyAccessToken(tokens.access_token);

    console.log("OIDC LOGIN: PASS");
    console.log("ACCESS TOKEN VERIFICATION: PASS");
    console.log("Authenticated subject:", identity.subject);

    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });

    response.end("OIDC authentication successful.");
    server.close();
  } catch (error) {
    console.error(
      "OIDC verification failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    response.writeHead(401, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });

    response.end("OIDC authentication failed.");
    server.close();
    process.exitCode = 1;
  }
});

server.listen(3000, "localhost", () => {
  console.log("OIDC test server started.");
  console.log("Open http://localhost:3000/");
});
