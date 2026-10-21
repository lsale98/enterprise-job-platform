# ADR-005 — OIDC Authentication and Identity Boundaries

| Field                 | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Status                | Accepted for E4-S1 implementation                                          |
| Date                  | 2026-10-21                                                                 |
| Epic                  | E4 — Identity and Access Management                                        |
| User story            | E4-S1 — OIDC Authentication                                                |
| Scope                 | `packages/auth/`, local Keycloak configuration                             |
| Related ADRs          | ADR-002 — Shared Contracts; ADR-004 — PostgreSQL Transactional Persistence |
| Verification evidence | `docs/evidence/auth/e4-s1-validation.md`                                   |

## 1. Context

The Enterprise Job Platform serves users belonging to multiple organizations.

The system must authenticate users through a trusted identity provider without implementing its own password management, account recovery, or multi-factor authentication infrastructure.

Authentication must establish a verified user identity. It must not automatically grant access to organization-specific resources.

A valid identity token alone does not demonstrate that a user belongs to a particular tenant or has permission to perform an operation.

E4-S1 establishes the identity verification boundary. Tenant membership, role-based authorization, and resource-level isolation are addressed in E4-S2 and subsequent API stories.

## 2. Decision drivers

- Use a standards-based authentication protocol.
- Avoid storing and managing user passwords in the application.
- Support multi-factor authentication through the identity provider.
- Verify token signatures using trusted public keys.
- Validate token issuer, audience, and expiration.
- Reject expired, malformed, tampered, or incorrectly targeted tokens.
- Prevent token algorithm substitution.
- Keep authentication logic reusable across server-side applications.
- Separate authenticated identity from tenant membership and permissions.
- Avoid exposing signing secrets or sensitive credentials to the browser.
- Provide deterministic automated tests for security-critical behavior.

## 3. Alternatives considered

| Alternative                                          | Advantages                                                                              | Trade-offs                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Custom username/password authentication              | Full control over authentication implementation                                         | Significant security responsibility, password handling, recovery, MFA, and maintenance     |
| Stateless JWT without a trusted identity provider    | Simple token-based architecture                                                         | Requires independently implementing secure token issuance and account lifecycle management |
| Authentication based only on unverified JWT payloads | Easy to implement                                                                       | Allows identity impersonation through tampered or forged claims                            |
| **Keycloak with OpenID Connect and verified JWTs**   | Standardized identity management, MFA support, asymmetric signing, established protocol | Requires identity provider configuration, availability, and lifecycle management           |

## 4. Decision

Use **Keycloak as the initial OpenID Connect identity provider** for the Enterprise Job Platform.

Implement reusable server-side authentication functionality in the `@lab/auth` workspace package.

The following rules apply.

### 4.1 OpenID Connect

Use the OIDC Authorization Code flow with PKCE for interactive user authentication.

The browser-facing login integration will use the identity provider through a trusted server-side application.

E4-S1 prepares and verifies the identity boundary; implementing the complete Next.js login interface is reserved for the web application story.

### 4.2 Identity provider responsibility

Keycloak is responsible for:

- Authenticating users.
- Managing authentication credentials.
- Supporting multi-factor authentication.
- Issuing signed identity and access tokens.
- Publishing public signing keys.
- Providing standard OIDC discovery metadata.

Local development uses the configured Keycloak realm.

Development credentials and realm settings must not be treated as production-ready security configuration.

### 4.3 Token signature verification

Server-side services must cryptographically verify received JWTs.

Use a trusted JWKS endpoint associated with the configured identity provider.

Restrict accepted signing algorithms to the explicitly configured asymmetric algorithm.

Do not trust decoded JWT claims before successful signature and claims verification.

### 4.4 Required token validation

Token verification must validate:

1. Digital signature.
2. Expected issuer (`iss`).
3. Expected audience (`aud`).
4. Expiration (`exp`).
5. Token validity period, including `nbf` when present.
6. Required subject (`sub`).
7. Supported signing algorithm.

The authentication boundary must reject tokens that fail any required check.

Only appropriately targeted access tokens may be used to authenticate API calls. OIDC ID tokens must not be substituted for API access tokens.

### 4.5 Identity representation

A successfully verified access token establishes an authenticated principal containing the identity provider subject.

The principal may contain verified identity metadata, but it must not be treated as an authorization decision.

The application must not derive tenant membership or business permissions solely from the token's claims.

### 4.6 Authorization boundary

Tenant membership, role assignment, and business permissions are enforced separately from authentication.

E4-S2 will use PostgreSQL membership records to determine whether the authenticated user may act within a particular tenant.

A client-selected tenant identifier is not proof of authorization.

### 4.7 Service integration

The authentication implementation must remain independent of Fastify, Next.js, and database-specific authorization logic.

The future API will consume verified identity information and perform additional authorization checks.

HTTP authentication failures will be mapped to appropriate responses when the API integration is implemented.

### 4.8 Secrets and operational security

- Do not commit credentials, secrets, access tokens, or refresh tokens.
- Use environment-specific identity provider configuration.
- Require HTTPS in production.
- Apply Keycloak production hardening before deployment.
- Support signing-key rotation through trusted JWKS discovery and refresh.
- Do not use Keycloak development mode for production workloads.

## 5. Consequences

### Positive

- Authentication follows a standardized protocol.
- Passwords and MFA remain the responsibility of the identity provider.
- Applications can verify user identity without sharing private signing keys.
- Token validation is centralized and reusable.
- Identity verification and business authorization remain separate.
- Automated tests can verify important security failure scenarios.

### Costs and risks

- Keycloak becomes a critical authentication dependency.
- Incorrect issuer or audience configuration may cause authentication failures.
- Misconfigured audiences can result in tokens being accepted by unintended services.
- Token expiry and key rotation require correct operational handling.
- Token validity does not prove current tenant membership.
- Immediate identity-provider session revocation may require additional mechanisms beyond offline JWT verification.
- Authentication alone does not protect tenant-owned resources.

## 6. Verification and acceptance evidence

Verification must cover:

- The local Keycloak service starts successfully.
- OIDC discovery metadata is accessible.
- The trusted JWKS endpoint is available.
- Correctly signed tokens with expected claims are accepted.
- Invalid signatures are rejected.
- Tokens with an incorrect issuer are rejected.
- Tokens with an incorrect audience are rejected.
- Expired tokens are rejected.
- Missing or invalid subject claims are rejected.
- Unsupported signing algorithms are rejected.
- Successful authentication returns a verified identity without granting tenant permissions.

Verification must include automated tests and local identity provider integration checks.

Record actual results, execution date, Git revision, Node.js version, pnpm version, acceptance criteria, and known limitations in:

`docs/evidence/auth/e4-s1-validation.md`

E4-S1 must not be marked DONE until required checks have passed.

## 7. Revisit criteria

Reconsider this decision if:

- An enterprise customer requires integration with an existing identity provider.
- Regulatory requirements mandate a different authentication architecture.
- Federation or multi-provider authentication becomes necessary.
- Security requirements require stronger session revocation guarantees.
- Identity provider availability becomes a significant operational concern.
- Production workloads require additional token exchange or service identity mechanisms.

A replacement decision must be documented in a new ADR rather than silently modifying the historical decision.

## 8. Traceability

- **Epic:** E4 — Authentication & Authorization
- **Story:** E4-S1 — OIDC Authentication
- **Backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **Implementation:** `packages/auth/`
- **Identity provider:** `infrastructure/keycloak/`
- **Verification:** `docs/evidence/auth/e4-s1-validation.md`
- **Previous ADR:** `docs/adr/004-postgresql-transactional-persistence.md`
- **Next story:** E4-S2 — Tenant RBAC

This decision establishes the authentication foundation while keeping tenant membership and business authorization outside the identity verification boundary.
