# E4-S1 — OIDC Authentication Validation Evidence

## Metadata

- Date: 2026-10-22
- Epic: E4 — Identity and Access Management
- Story: E4-S1 — OIDC Authentication
- Branch: feat/e4-s1-oidc-authentication
- Git revision: d0a8968
- Node version: v24.15.0
- pnpm version: 10.18.3

## Verification Results

| Command                               | Status |
| ------------------------------------- | ------ |
| `pnpm --filter @lab/auth build`       | PASS   |
| `pnpm --filter @lab/auth typecheck`   | PASS   |
| `pnpm --filter @lab/auth test`        | PASS   |
| `pnpm --filter @lab/auth login:local` | PASS   |
| `docker compose config --quiet`       | PASS   |
| Keycloak OIDC discovery               | PASS   |
| Keycloak JWKS endpoint verification   | PASS   |
| Keycloak API audience evaluation      | PASS   |
| Keycloak realm JSON syntax validation | PASS   |

## Acceptance Criteria

### AC1 — OIDC identity provider is configured

**Status: PASS**

Keycloak is configured as the local OpenID Connect identity provider.

The `enterprise-job-platform` realm exposes valid OIDC discovery metadata and a JWKS endpoint.

The `enterprise-job-platform-web` client is configured for authentication.

### AC2 — Access tokens are cryptographically verified

**Status: PASS**

The `@lab/auth` package verifies JWT access tokens using `jose` and trusted signing keys.

The verifier validates:

- Digital signature
- Expected issuer
- Expected audience
- Token expiration
- Issued-at claim
- Not-before claim when present
- Required subject
- Supported signing algorithm
- Keycloak access token type

Invalid tokens are rejected.

### AC3 — Invalid authentication tokens are rejected

**Status: PASS**

Automated tests successfully validate rejection of:

- Invalid signatures
- Incorrect issuers
- Incorrect audiences
- Expired tokens
- Missing expiration claims
- Missing or empty subjects
- ID tokens used as access tokens
- Tokens that are not yet valid
- Unsupported signing algorithms
- Malformed tokens

### AC4 — API audience is configured correctly

**Status: PASS**

The Keycloak Audience mapper adds `enterprise-job-platform-api` to generated access tokens.

The configured audience matches `AUTH_API_AUDIENCE` in the application environment.

The mapper is also represented in the version-controlled Keycloak realm configuration.

### AC5 — Real OIDC login succeeds

**Status: PASS**

A real authentication flow was completed using the local Keycloak identity provider.

The local integration test successfully completed the Authorization Code flow with PKCE and verified the returned access token using `@lab/auth`.

Observed terminal output:

```text
OIDC LOGIN: PASS
ACCESS TOKEN VERIFICATION: PASS
Authenticated subject: 11111111-1111-4111-8111-111111111111
```

The browser displayed:

```text
OIDC authentication successful.
```

The authenticated subject matches the seeded development identity for Alice.

### AC6 — Authentication remains separate from authorization

**Status: PASS**

The authentication package returns a verified identity containing the subject and issuer.

It does not assign tenant roles, membership, or business permissions.

Tenant-based authorization remains the responsibility of E4-S2.

### AC7 — Local configuration and credentials are handled safely

**Status: PASS**

The local Keycloak Client Secret was regenerated and configured through environment variables.

The real secret is stored in the local `.env` file rather than committed to source control.

The repository contains a placeholder for the client secret and includes the required Docker Compose environment mapping.

Docker Compose configuration validation completed successfully.

## Known Limitations

- Tenant membership and role-based authorization are not implemented in E4-S1.
- HTTP API authentication middleware will be integrated in a subsequent story.
- The complete Next.js/Auth.js login experience is outside this story.
- The local OIDC integration test permits HTTP only for the localhost development environment.
- Production environments require HTTPS and hardened identity provider configuration.
- Multi-factor authentication policy enforcement was not independently validated in this story.
- Authentication token verification does not guarantee immediate identity provider session revocation.
- Automated unit tests and the local login succeeded; a clean Keycloak realm re-import with the environment-variable placeholder has not yet been independently verified.
- Production deployment, monitoring, and identity provider high availability are outside E4-S1.

## Final Result

**E4-S1 Status: DONE**

The authentication foundation is implemented and verified using automated tests and a real Keycloak OIDC login.

The `@lab/auth` package is ready for integration with the application's server-side authentication boundary.

The next story is **E4-S2 — Tenant RBAC**.
