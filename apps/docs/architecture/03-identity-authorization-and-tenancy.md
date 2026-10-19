# Architecture 03 — Identity, Authorization and Tenant Isolation

**Document status:** Design baseline; production identity configuration requires dedicated review  
**Related backlog:** Epic 4, Epic 9

## Distinct concepts

- **Authentication:** Establishes *who* the user is through OIDC.
- **Authorization:** Establishes *what* the user may do.
- **Tenant isolation:** Establishes *whose resources* the user may operate on.

Successful login does **not** imply membership in every tenant.

## Authentication architecture

The web application uses an OIDC provider (Keycloak in the development environment). The browser participates in the login redirect flow; the web server maintains the application session and makes server-side API calls. The API receives a short-lived verifiable internal identity assertion and checks its signature, issuer/audience and expiration where applicable. It then loads the user's current application membership from PostgreSQL.

**Why not trust browser-provided role claims?** A user may retain an old token after an administrator revokes access. Current database membership provides the application's permission decision at request time.

## Initial roles and permissions

| Operation | Viewer | Operator | Tenant Admin |
| --- | :---: | :---: | :---: |
| View own-tenant jobs | Yes | Yes | Yes |
| Create jobs | No | Yes | Yes |
| Cancel eligible jobs | No | Yes | Yes |
| Manage tenant membership | No | No | Yes |
| View audit trail | No | No | Yes |

The initial design uses the roles `viewer`, `operator`, `admin` and permission keys such as `jobs:read`, `jobs:create`, `jobs:cancel`, `members:manage`, `audit:read`. A global platform administrator is a **separate future design** and must not be assumed equivalent to tenant `admin`.

## Authorization invariant

For every tenant-owned operation, both conditions must hold:

1. The authenticated subject has an active membership in the requested tenant with the required permission.
2. The requested resource belongs to that same tenant.

Examples:

- An operator in tenant A cannot cancel a job owned by tenant B.
- A tenant A administrator cannot modify tenant B memberships.
- A tenant query parameter never grants access on its own.
- AI retrieval must not search outside the authorized tenant, even when the user knows another document identifier.

## Session and token handling

- Use secure, HttpOnly, appropriate SameSite cookies for browser sessions.
- Ensure CSRF protection for browser mutations; verify framework-level protections and origin policy.
- Rotate and manage secrets with a secure secrets system outside local development.
- Define token expiration, sign-out, revocation and incident response semantics.
- Do not log session cookies, tokens, authorization headers or secrets.
- MFA policy is enforced by the identity provider, not handwritten into the job API.
- Scope internal tokens to intended use; a generic signing secret is not sufficient without claim validation.

## Required threat scenarios

| Scenario | Expected system behavior |
| --- | --- |
| Missing or invalid authentication | `401 Unauthorized` |
| Authenticated user lacks permission | `403 Forbidden` |
| Authenticated tenant A user requests tenant B data | Denied; no data disclosure |
| Role revoked during an active session | Next authorized action uses the updated membership |
| Manipulated tenant ID | Server checks membership and resource ownership |
| Expired or tampered internal assertion | Rejected by API |
| Unauthorized AI document access | No cross-tenant document retrieval |

Tests must assert these properties on actual API/database paths, not only in client components. See [Security verification](../operations/04-security-verification.md).
