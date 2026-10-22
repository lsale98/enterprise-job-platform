# E4-S2 — Tenant RBAC Validation Evidence

## Metadata

- Date: 2026-10-22
- Epic: E4 — Identity and Access Management
- Story: E4-S2 — Tenant RBAC
- Branch: feat/e4-s2-tenant-rbac
- Git revision: bf1984b
- Node version: v24.15.0
- pnpm version: 10.18.3

## Verification Results

| Command                                    | Status |
| ------------------------------------------ | ------ |
| `pnpm --filter @lab/contracts build`       | PASS   |
| `pnpm --filter @lab/database build`        | PASS   |
| `pnpm --filter @lab/auth build`            | PASS   |
| `pnpm --filter @lab/auth typecheck`        | PASS   |
| `pnpm --filter @lab/auth test`             | PASS   |
| `pnpm --filter @lab/auth test:integration` | PASS   |

## Acceptance Criteria

### AC1 — Tenant membership is verified using PostgreSQL

**Status: PASS**

The `@lab/database` package implements `findMembership(subject, tenantId)`.

Membership is retrieved from PostgreSQL using parameterized queries and both the authenticated subject and requested tenant identifier.

Missing memberships are rejected.

### AC2 — Tenant roles and permissions are enforced

**Status: PASS**

The authorization system supports three roles:

- `viewer`
- `operator`
- `admin`

The `@lab/contracts` package defines the supported permissions and role-permission mappings.

The `@lab/auth` package validates membership roles and checks the requested permission before granting access.

Automated tests confirm that users cannot perform actions outside their assigned permissions.

### AC3 — Cross-tenant access is rejected

**Status: PASS**

Authorization requires membership corresponding to the requested subject and tenant.

Automated unit tests reject membership records belonging to another tenant or subject.

PostgreSQL integration tests confirm that Carol, an administrator in Contoso, cannot use that membership to access Acme resources.

### AC4 — Membership changes take effect on subsequent checks

**Status: PASS**

The authorizer retrieves current membership information for every authorization decision.

A PostgreSQL integration test confirms:

- A viewer cannot create jobs.
- Promoting the viewer to operator allows job creation on the next check.
- Revoking membership denies access on the next check.

No cross-request authorization cache is used.

### AC5 — Invalid authorization data is rejected

**Status: PASS**

Automated tests confirm rejection of:

- Empty subjects
- Invalid tenant identifiers
- Unsupported permissions
- Missing tenant memberships
- Unknown membership roles
- Membership records with mismatched subjects
- Membership records with mismatched tenants

Authorization follows a deny-by-default policy.

### AC6 — Database failures do not grant access

**Status: PASS**

A unit test simulates a membership repository failure.

The authorization operation propagates the error instead of returning a successful authorization result.

Repository failures cannot cause an authorization decision of `allowed: true`.

### AC7 — Authorization is separated from authentication

**Status: PASS**

E4-S1 provides cryptographic verification of OIDC access tokens.

E4-S2 implements tenant membership and permission evaluation through `createAuthorizer()`.

The authorizer uses dependency injection to separate authorization policy from database access.

The caller is responsible for supplying an authenticated subject obtained through the trusted authentication boundary.

### AC8 — PostgreSQL integration is verified

**Status: PASS**

Four integration tests passed against local PostgreSQL.

The tests validate:

- Alice's administrative permissions in Acme.
- Bob's viewer permissions in Acme.
- Carol's isolation between Contoso and Acme.
- Role changes and membership revocation using isolated test records.

Temporary records are cleaned up after the role-change and revocation test.

## Known Limitations

- HTTP API authorization middleware is not implemented in E4-S2.
- HTTP `401`, `403`, and `404` response handling will be integrated in the API layer.
- Resource-level tenant isolation must also be enforced in future tenant-scoped database queries.
- The authorizer assumes that callers supply a previously verified identity.
- Tenant context must be established and validated by the consuming API.
- Integration tests validate local PostgreSQL behavior, not production infrastructure.
- Immediate revocation is verified at the next authorization check, not for operations that have already been authorized and started.
- Production deployment and end-to-end HTTP authorization testing are outside E4-S2.

## Final Result

**E4-S2 Status: DONE**

Tenant-scoped role-based authorization is implemented and verified through 25 unit tests and 4 PostgreSQL integration tests.

The implementation enforces tenant membership, role permissions, subject and tenant isolation, and database-backed role changes and membership revocation.

The `@lab/auth` package exposes `createAuthorizer()` for integration with the application's future HTTP API authorization boundary.
