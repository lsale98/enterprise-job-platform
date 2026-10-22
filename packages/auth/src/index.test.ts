import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { createAccessTokenVerifier } from "./index.js";

const issuer = "http://localhost:8080/realms/enterprise-job-platform";

const audience = "enterprise-job-platform-api";

const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
});

const { privateKey: wrongPrivateKey } = await generateKeyPair("RS256");

const publicJwk = await exportJWK(publicKey);

const verifier = createAccessTokenVerifier({
  issuer,
  audience,
  keyResolver: createLocalJWKSet({
    keys: [
      {
        ...publicJwk,
        kid: "test-key",
        alg: "RS256",
        use: "sig",
      },
    ],
  }),
});

interface TokenOptions {
  issuer?: string;
  audience?: string;
  tokenType?: string;
  subject?: string;
  expiration?: string;
  notBefore?: string;
  omitExpiration?: boolean;
  omitSubject?: boolean;
  useWrongKey?: boolean;
}

function makeToken(options: TokenOptions = {}) {
  let jwt = new SignJWT({
    typ: options.tokenType ?? "Bearer",
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "test-key",
    })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt();

  if (!options.omitSubject) {
    jwt = jwt.setSubject(options.subject ?? "alice-subject");
  }

  if (!options.omitExpiration) {
    jwt = jwt.setExpirationTime(options.expiration ?? "5m");
  }

  if (options.notBefore) {
    jwt = jwt.setNotBefore(options.notBefore);
  }

  return jwt.sign(options.useWrongKey ? wrongPrivateKey : privateKey);
}

test("accepts a valid signed access token", async () => {
  const token = await makeToken();

  const identity = await verifier(token);

  assert.deepEqual(identity, {
    subject: "alice-subject",
    issuer,
  });
});

test("rejects a token signed by an untrusted key", async () => {
  const token = await makeToken({
    useWrongKey: true,
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an incorrect issuer", async () => {
  const token = await makeToken({
    issuer: "https://untrusted.example/realms/other",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an incorrect audience", async () => {
  const token = await makeToken({
    audience: "another-service",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an expired token", async () => {
  const token = await makeToken({
    expiration: "-1h",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects a token without expiration", async () => {
  const token = await makeToken({
    omitExpiration: true,
  });

  await assert.rejects(() => verifier(token));
});

test("rejects a token without a subject", async () => {
  const token = await makeToken({
    omitSubject: true,
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an empty subject", async () => {
  const token = await makeToken({
    subject: "",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an ID token", async () => {
  const token = await makeToken({
    tokenType: "ID",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects a token that is not valid yet", async () => {
  const token = await makeToken({
    notBefore: "1h",
  });

  await assert.rejects(() => verifier(token));
});

test("rejects an unsupported signing algorithm", async () => {
  const token = await new SignJWT({
    typ: "Bearer",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("alice-subject")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("local-test-secret-not-for-production"));

  await assert.rejects(() => verifier(token));
});

test("rejects malformed tokens", async () => {
  await assert.rejects(() => verifier("not-a-jwt"));
});
