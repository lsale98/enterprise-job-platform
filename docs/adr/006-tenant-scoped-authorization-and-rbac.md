# ADR-006 — Tenant-Scoped Authorization and Role-Based Access Control

| Field                 | Value                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Accepted for E4-S2 implementation                                                                                                                                                   |
| Date                  | 2026-10-22                                                                                                                                                                          |
| Epic                  | E4 — Identity and Access Management                                                                                                                                                 |
| User story            | E4-S2 — Tenant RBAC                                                                                                                                                                 |
| Scope                 | Tenant membership verification, RBAC policies, and authorization boundaries                                                                                                         |
| Related ADRs          | ADR-002 — Shared TypeScript Contracts and Runtime Validation; ADR-004 — PostgreSQL as the Transactional Persistence Boundary; ADR-005 — OIDC Authentication and Identity Boundaries |
| Verification evidence | `docs/evidence/auth/e4-s2-validation.md`                                                                                                                                            |

## 1. Context

The Enterprise Job Platform supports multiple organizations, each containing users with different roles and permissions.

E4-S1 established authentication through Keycloak and implemented cryptographic verification of OIDC access tokens.

However, a successfully authenticated user must not automatically receive access to every organization or resource in the platform.

For example:

- Alice is an administrator of Acme.
- Bob is a viewer in Acme.
- Carol is an administrator of Contoso.

Although all three users may be successfully authenticated, their permissions and organizational boundaries differ.

The platform must enforce authorization on the server using the user's current organization membership and assigned role.

Authorization must remain effective even when a previously authenticated user loses organization membership.

## 2. Decision Drivers

The authorization architecture must:

- Enforce organization-specific access control.
- Support the existing `viewer`, `operator`, and `admin` roles.
- Reuse centralized permission definitions.
- Verify tenant membership using authoritative PostgreSQL records.
- Prevent privilege escalation through client-controlled identifiers.
- Prevent cross-tenant resource access.
- Reflect membership removal and role changes without requiring users to log in again.
- Deny access when membership information is missing or invalid.
- Keep authentication separate from authorization.
- Support reusable policy enforcement across application services.
- Provide automated verification for both allowed and denied operations.

## 3. Alternatives Considered

| Alternative                                                            | Advantages                                                                             | Trade-offs                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Client-side permission checks                                          | Simple user interface integration                                                      | Cannot protect server-side resources or prevent manipulated requests          |
| Authorization based exclusively on JWT role claims                     | Fewer database queries                                                                 | Roles may become stale and membership revocation is not immediately reflected |
| Application-level in-memory permission cache                           | Reduced database access                                                                | Requires reliable invalidation and introduces stale authorization risks       |
| **PostgreSQL-backed tenant membership with centralized RBAC policies** | Current membership validation, explicit tenant boundaries, consistent permission model | Requires database access and disciplined authorization enforcement            |

## 4. Decision

Use PostgreSQL-backed tenant membership verification combined with centralized role-based access control.

Authentication and authorization remain separate responsibilities.

### 4.1 Authenticated identity

The identity is established through the trusted authentication boundary implemented in E4-S1.

Authorization accepts a verified user subject and must not use an unverified client-supplied subject as proof of identity.

Authentication confirms who the user is.

Authorization determines which tenant the user may access and which operations they may perform.

### 4.2 Authoritative membership storage

The PostgreSQL `memberships` table is the authoritative source for organization membership and assigned roles.

Membership records associate:

- `tenant_id`
- `subject`
- `role`

Authorization must resolve membership using both the authenticated subject and the requested tenant identifier.

A valid tenant identifier alone does not grant access.

### 4.3 Role-based access control

Use the existing role and permission definitions from `@lab/contracts`.

The initial role matrix is:

| Permission       | Viewer  | Operator | Admin   |
| ---------------- | ------- | -------- | ------- |
| `jobs:read`      | Allowed | Allowed  | Allowed |
| `jobs:create`    | Denied  | Allowed  | Allowed |
| `jobs:cancel`    | Denied  | Allowed  | Allowed |
| `members:manage` | Denied  | Denied   | Allowed |
| `audit:read`     | Denied  | Denied   | Allowed |

Unknown roles and permissions must not grant access.

Permissions represent permitted operations within an authorized tenant, not global access across the platform.

### 4.4 Authorization policy

A request may proceed only when all applicable conditions are satisfied:

1. The identity was successfully authenticated.
2. The requested tenant identifier is valid.
3. The authenticated user has an active membership in that tenant.
4. The membership contains a recognized role.
5. The assigned role grants the required permission.
6. Any requested resource belongs to the authorized tenant.

If a required condition fails, authorization must deny access.

### 4.5 Tenant isolation

All queries involving tenant-owned resources must enforce the authorized tenant boundary.

Resource identifiers alone must never be treated as proof of ownership.

For example, a job lookup must include the authorized tenant:

```sql
SELECT *
FROM jobs
WHERE id = $1
  AND tenant_id = $2;
```

The `tenant_id` parameter must originate from successfully resolved authorization context.

A user authenticated in Contoso must not be able to retrieve Acme resources by providing a valid Acme job identifier.

### 4.6 Membership revocation

Membership and role assignments must be resolved from PostgreSQL when making authorization decisions.

E4-S2 will not introduce a cross-request permission cache.

Removing a membership or changing a user's role must affect subsequent authorization checks.

An already completed authorization decision is not retroactively cancelled; operations requiring stronger atomicity must enforce their membership invariant within the relevant database transaction.

### 4.7 Failure behavior

Authorization follows a fail-closed policy.

The intended HTTP semantics are:

| Condition                                               | Intended status    |
| ------------------------------------------------------- | ------------------ |
| Missing or invalid authentication                       | `401 Unauthorized` |
| Authenticated user without tenant membership            | `403 Forbidden`    |
| Authenticated tenant member without required permission | `403 Forbidden`    |
| Resource not found within the authorized tenant         | `404 Not Found`    |
| Resource belonging to another tenant                    | `404 Not Found`    |

Actual HTTP response mapping will be integrated with the API. E4-S2 establishes and tests the underlying authorization decisions.

Unexpected database failures must not be interpreted as successful authorization or as evidence that the user has permission.

### 4.8 Separation of responsibilities

The architecture separates three boundaries:

**Authentication — `@lab/auth`**

Verifies tokens and establishes a trusted identity.

**Membership persistence — `@lab/database`**

Reads authoritative membership records from PostgreSQL.

**Authorization policies — `@lab/auth`**

Evaluates tenant membership and role-based permissions using the membership data.

The authorization policy must be reusable independently of Fastify or Next.js.

HTTP middleware and resource-specific integration will consume this policy in later API stories.

### 4.9 Database and schema changes

The existing `tenants`, `identities`, and `memberships` tables provide the necessary persistence foundation.

No new database migration is required solely to implement E4-S2.

Any future schema changes must use additional versioned migrations rather than modifying previously applied migrations.

## 5. Consequences

### Positive

- Authorization is enforced through server-side policies.
- Users can have different roles across organizations.
- Membership and permission decisions use authoritative PostgreSQL data.
- Permission changes can take effect on subsequent requests.
- Client-side manipulation cannot independently grant access.
- Shared permission definitions prevent inconsistent role matrices.
- Authorization logic can be reused across API operations.
- Tenant-scoped resource access reduces cross-organization data exposure risks.

### Costs and Risks

- Membership verification introduces additional database queries.
- PostgreSQL availability becomes necessary for authorization decisions.
- Every resource operation must consistently enforce tenant boundaries.
- Application-level filtering requires careful implementation and regression testing.
- Authorization checks and subsequent writes may experience race conditions if membership changes between operations.
- The initial implementation does not provide PostgreSQL Row-Level Security as an independent enforcement layer.
- Future caching optimizations will require explicit revocation and consistency guarantees.
- Correct policy helpers do not automatically guarantee that every future HTTP route invokes them.

## 6. Verification and Acceptance Evidence

Verification must cover the following acceptance criteria.

### AC1 — Roles and permissions are enforced

- Viewer permissions are restricted to supported read operations.
- Operator permissions allow job reading, creation, and cancellation.
- Admin permissions include member management and audit access.
- Unsupported roles or permissions cannot grant access.

### AC2 — Tenant membership is required

- Alice can access Acme according to her assigned role.
- Bob has viewer permissions within Acme.
- Carol can access Contoso according to her assigned role.
- Carol cannot acquire Acme permissions using an Acme tenant identifier.
- Unknown tenant memberships are denied.

### AC3 — Membership and role changes take effect

- Removing a membership causes the next authorization check to deny access.
- Changing a membership role changes the available permissions on subsequent checks.
- Previously verified authentication does not override current membership state.

### AC4 — Tenant-owned resources remain isolated

- Resource lookups use the authorized tenant identifier.
- Resources belonging to a different tenant are not returned.
- Valid resource IDs from another tenant cannot bypass tenant isolation.

### AC5 — Unauthorized access is handled consistently

- Missing authentication results in the intended unauthorized decision.
- Missing membership and insufficient permissions produce forbidden decisions.
- Cross-tenant resource lookups produce not-found decisions to avoid exposing resource existence.

### AC6 — Automated tests verify authorization behavior

Unit and PostgreSQL integration tests must cover positive and negative authorization scenarios.

Tests must verify the actual authorization behavior and must not rely solely on UI restrictions or mocked authentication claims.

Successful package-level tests must not be presented as complete HTTP API security verification before HTTP integration has been implemented.

Record the actual test results, execution date, implementation Git revision, runtime versions, acceptance criteria status, and known limitations in:

`docs/evidence/auth/e4-s2-validation.md`

Do not mark acceptance criteria as PASS until the corresponding verification has been completed.

## 7. Revisit Criteria

Reconsider this decision if:

- Tenant membership grows beyond the current relational model.
- Complex resource-specific policies require attribute-based access control.
- Regulatory requirements justify additional database-level enforcement.
- PostgreSQL Row-Level Security becomes necessary.
- Authorization database queries become a measurable performance bottleneck.
- Distributed permission caching becomes necessary.
- The platform introduces hierarchical organizations or delegated administration.
- Resource-level policies require stronger transaction isolation.

Any change to the accepted authorization model must be recorded through a new ADR.

## 8. Traceability

- **Epic:** E4 — Identity and Access Management
- **Story:** E4-S2 — Tenant RBAC
- **Backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **Authentication foundation:** `packages/auth/`
- **Membership persistence:** `packages/database/`
- **Permission contracts:** `packages/contracts/`
- **Verification evidence:** `docs/evidence/auth/e4-s2-validation.md`
- **Previous ADR:** ADR-005 — OIDC Authentication and Identity Boundaries
- **Next epic:** E5 — Job Management API

This decision establishes the tenant-scoped authorization foundation for subsequent API and application functionality.
