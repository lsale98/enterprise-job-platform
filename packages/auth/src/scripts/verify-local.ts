import "dotenv/config";
import { createAccessTokenVerifier } from "../authentication/access-token.verifier.js";

const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
const audience = process.env.AUTH_API_AUDIENCE;
const token = process.env.KEYCLOAK_ACCESS_TOKEN;

if (!issuer || !audience || !token) {
  throw new Error(
    "AUTH_KEYCLOAK_ISSUER, AUTH_API_AUDIENCE and KEYCLOAK_ACCESS_TOKEN are required",
  );
}

const verify = createAccessTokenVerifier({
  issuer,
  audience,
});

try {
  const identity = await verify(token);

  console.log("Access token verification: PASS");
  console.log("Authenticated subject:", identity.subject);
} catch {
  // Never print or log the bearer token.
  console.error("Access token verification: FAIL");
  process.exitCode = 1;
}
