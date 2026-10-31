# ADR-009 — Job Query API, Cursor Pagination, and Audit Access

| Field                 | Value                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Accepted for E5-S2 implementation                                                                                                                                                                                                                                                        |
| Date                  | 2026-10-26                                                                                                                                                                                                                                                                               |
| Epic                  | E5 — Job Management API                                                                                                                                                                                                                                                                  |
| User story            | E5-S2 — List and Inspect Jobs                                                                                                                                                                                                                                                            |
| Scope                 | Authenticated tenant-scoped job retrieval, filtering, cursor pagination, job details, and authorized audit history                                                                                                                                                                       |
| Related ADRs          | ADR-002 — Shared Contracts and Runtime Validation; ADR-004 — PostgreSQL Transactional Persistence; ADR-005 — OIDC Authentication and Identity Boundaries; ADR-006 — Tenant RBAC; ADR-007 — HTTP API Architecture and Idempotent Job Creation; ADR-008 — Platform-Wide Audit Architecture |
| Verification evidence | `docs/evidence/api/e5-s2-validation.md`                                                                                                                                                                                                                                                  |

## 1. Context and Problem

The Enterprise Job Platform currently supports authenticated and authorized job creation through the HTTP API.

Previous implementation work established:

- Fastify 5 with TypeScript as the standalone HTTP API.
- OIDC access token verification using Keycloak.
- PostgreSQL-backed tenant membership verification.
- Centralized tenant-scoped role-based authorization.
- Shared Zod contracts for job payload validation.
- Transactional and idempotent job creation.
- Transactional business audit events for `job.created`.
- Dependency injection for isolated HTTP testing.
- PostgreSQL integration tests for persistence behavior.

However, the platform does not yet expose endpoints for listing or inspecting existing jobs.

E5-S2 introduces the ability for authenticated users to retrieve jobs belonging to organizations in which they have the required permissions.

The API must support filtering, pagination, detailed job inspection, and authorized access to audit history.

These capabilities introduce additional design requirements.

Job queries must remain efficient as the number of stored jobs increases.

Concurrent job creation must not make pagination unnecessarily unstable.

Tenant identifiers supplied through HTTP requests must never grant access independently of verified membership.

Users who can inspect a job must not automatically receive access to privileged audit information.

Job details must also distinguish existing attempt counters from a complete execution attempt history, which is not currently persisted.

The implementation must reuse existing architectural boundaries without introducing unnecessary infrastructure or modifying previously applied database migrations.

## 2. Decision Drivers

The job query architecture must:

- Reuse the established Fastify HTTP API architecture.
- Enforce authentication before accessing protected resources.
- Enforce current tenant membership and permissions.
- Prevent cross-tenant data disclosure.
- Provide deterministic job ordering.
- Support bounded, efficient pagination.
- Validate all filtering and pagination inputs.
- Avoid exposing internal persistence fields unnecessarily.
- Respect separate job-reading and audit-reading permissions.
- Provide consistent HTTP response contracts.
- Return safe responses for inaccessible resources.
- Support isolated HTTP tests and real PostgreSQL integration tests.
- Reuse existing job and audit persistence structures.
- Avoid unnecessary schema changes.
- Remain compatible with future worker processing and job state transitions.
- Preserve existing E5-S1 and E5-S1A behavior.

## 3. Alternatives Considered

### 3.1 Pagination strategy

| Alternative                 | Advantages                                                                                          | Trade-offs                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Offset-based pagination     | Simple implementation and direct page navigation                                                    | Large offsets become increasingly expensive; concurrent inserts can shift page boundaries |
| **Cursor-based pagination** | Efficient continuation through ordered records; stable traversal relative to inserted newer records | Requires an opaque cursor contract and deterministic ordering                             |
| Unbounded result sets       | Simplest initial implementation                                                                     | Uncontrolled memory, network, and database costs                                          |

**Decision:** Use cursor-based pagination with a bounded page size and deterministic ordering.

### 3.2 Query implementation

| Alternative                                   | Advantages                                                                 | Trade-offs                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| SQL queries directly inside Fastify handlers  | Minimal initial code                                                       | Couples HTTP routes to persistence and complicates isolated testing |
| Generic ORM abstraction                       | Reusable query construction                                                | Additional dependency and abstraction overhead                      |
| **Dedicated PostgreSQL repository functions** | Consistent with existing architecture; explicit SQL and tenant constraints | Requires maintaining query contracts and mapping database rows      |

**Decision:** Extend the existing PostgreSQL repository layer.

### 3.3 Audit history access

| Alternative                                                              | Advantages                                           | Trade-offs                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Return audit history to every user with `jobs:read`                      | Simple response contract                             | Weakens the existing `audit:read` permission boundary                  |
| Create a separate audit endpoint immediately                             | Clear resource separation                            | Adds an endpoint not explicitly required by E5-S2                      |
| **Include audit history in job details only when separately authorized** | Satisfies current requirements while preserving RBAC | Requires an additional authorization decision and conditional response |

**Decision:** Use separate authorization for job details and audit history.

### 3.4 Attempt representation

| Alternative                                      | Advantages                                                 | Trade-offs                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Introduce a new `job_attempts` table immediately | Supports complete execution history                        | Requires additional migration and attempt lifecycle semantics before worker processing is implemented |
| **Expose existing attempt counters**             | Reuses persisted data without inventing historical records | Does not provide individual attempt timestamps or errors                                              |

**Decision:** Expose existing attempt counters in E5-S2. Defer individual attempt history until its persistence and lifecycle requirements are defined.

## 4. Decision

Extend the existing Job Management API with authenticated, tenant-scoped list and details endpoints.

Use shared Zod contracts, explicit PostgreSQL repository queries, dependency injection, and existing RBAC policies.

### 4.1 HTTP endpoints

Introduce:

```http
GET /v1/tenants/:tenantId/jobs
GET /v1/tenants/:tenantId/jobs/:jobId
```

Both endpoints require a valid bearer access token.

Both endpoints require current tenant membership and the `jobs:read` permission.

The `tenantId` path parameter identifies the requested tenant but does not independently grant access.

The API must derive the authenticated subject from the verified access token.

Client-supplied identity or role values must never be trusted for authorization.

### 4.2 Job listing endpoint

Expose:

```http
GET /v1/tenants/:tenantId/jobs
```

Supported query parameters:

| Parameter     | Type               | Description                         |
| ------------- | ------------------ | ----------------------------------- |
| `status`      | JobStatus          | Filter by job state                 |
| `type`        | JobType            | Filter by job type                  |
| `createdFrom` | ISO 8601 timestamp | Inclusive lower creation-time bound |
| `createdTo`   | ISO 8601 timestamp | Inclusive upper creation-time bound |
| `limit`       | Integer            | Maximum number of jobs returned     |
| `cursor`      | String             | Opaque continuation cursor          |

Example:

```http
GET /v1/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/jobs?status=queued&type=report&limit=20
```

The endpoint must support combining the defined filters.

Unsupported query parameters and invalid filter values must be rejected rather than silently ignored.

The date filters apply to `jobs.created_at`.

Both date bounds must include an explicit timezone offset or UTC designator.

When both date bounds are provided, `createdFrom` must not be later than `createdTo`.

Date filtering uses the stored PostgreSQL timestamp values.

### 4.3 Pagination contract

Use cursor-based pagination.

Default page size:

```text
20
```

Maximum page size:

```text
100
```

Allowed page sizes are positive integers between 1 and 100.

Job results are ordered by:

```sql
ORDER BY created_at DESC, id DESC
```

The `id` field acts as a deterministic tie-breaker when multiple jobs have the same creation timestamp.

The first request does not require a cursor.

Subsequent requests use the `nextCursor` returned by the previous page.

Example response:

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tenantId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "type": "report",
      "status": "queued",
      "attempts": 0,
      "maxAttempts": 3,
      "createdAt": "2026-10-26T10:00:00.000Z",
      "updatedAt": "2026-10-26T10:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

The listing endpoint returns a bounded job summary.

It must not expose internal request fingerprints, idempotency keys, lease ownership details, or full audit records.

A page containing fewer than the requested number of jobs does not imply an error.

An empty result set returns:

```json
{
  "jobs": [],
  "nextCursor": null
}
```

### 4.4 Cursor representation

The cursor is an opaque client-facing continuation token.

The initial implementation will use a versioned Base64URL-encoded JSON payload.

The decoded payload contains:

- Cursor version.
- Last returned job creation timestamp.
- Last returned job identifier.
- Authorized tenant identifier.
- Normalized filter values.
- Page size.

The exact serialized format is an implementation detail.

Clients must not construct or modify cursors.

The API must validate decoded cursor data using a shared runtime schema.

Invalid, malformed, unsupported, or context-mismatched cursors must return `400 Bad Request`.

A cursor must not be reusable with a different tenant, filter combination, or page size.

Cursor validation must not replace authentication or authorization.

The server must perform current authorization on every page request.

The cursor is not a security credential and must not grant access by itself.

For the descending order, continuation uses the previous page's final `(created_at, id)` tuple.

Conceptually:

```sql
WHERE tenant_id = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT $4
```

The actual query must additionally apply validated filters.

The repository should fetch one additional row to determine whether another page exists.

The extra row must not appear in the public response.

Cursor pagination does not guarantee a fully immutable snapshot while jobs are being added or deleted.

For E5-S2, the ordering uses immutable job creation fields rather than mutable status or update timestamps.

### 4.5 Filtering and query performance

Filters are applied inside PostgreSQL.

Filtering must not be implemented by fetching all tenant jobs into application memory.

All user-controlled values must be passed as query parameters.

SQL string concatenation must not introduce untrusted values into executable SQL fragments.

Queries must always include the authorized tenant identifier.

Existing indexes include:

```sql
CREATE INDEX idx_jobs_tenant_created
ON jobs (tenant_id, created_at DESC);
```

The existing index will be reused initially.

The query also orders by `id DESC` for deterministic pagination.

E5-S2 does not automatically introduce a new index.

If query analysis demonstrates that a composite index including `id` or additional filtering columns is necessary, it must be introduced through a new versioned migration.

Previously applied migrations must not be modified.

Query performance should be evaluated using representative test data and PostgreSQL execution plans when justified.

### 4.6 Job details endpoint

Expose:

```http
GET /v1/tenants/:tenantId/jobs/:jobId
```

The endpoint returns a job belonging to the authorized tenant.

The `jobId` path parameter must be a valid UUID.

The response uses a public job representation based on the existing shared contracts.

Example:

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tenantId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "type": "report",
    "status": "queued",
    "attempts": 0,
    "maxAttempts": 3,
    "input": {
      "type": "report",
      "numbers": [1, 2, 3]
    },
    "result": null,
    "error": null,
    "createdAt": "2026-10-26T10:00:00.000Z",
    "updatedAt": "2026-10-26T10:00:00.000Z"
  }
}
```

The final response schema must be defined and validated through `@lab/contracts`.

Database timestamps must be serialized consistently as ISO 8601 strings.

The public response must not expose:

- Request fingerprints.
- Idempotency keys.
- Internal lease ownership information.
- Database connection details.
- Internal SQL errors.
- Authentication credentials.

### 4.7 Attempts and execution history

The existing `jobs` table contains:

```sql
attempts integer NOT NULL DEFAULT 0,
max_attempts integer NOT NULL DEFAULT 3
```

E5-S2 exposes these existing fields.

`attempts` represents the persisted attempt count.

`maxAttempts` represents the configured maximum attempt count.

These fields do not constitute a complete execution attempt history.

The current database does not contain a dedicated `job_attempts` table.

The API must not fabricate individual execution records, timestamps, durations, or failure reasons.

The details response satisfies the current attempt-count representation while explicitly documenting the absence of per-attempt history.

A complete attempt timeline requires a future persistence design, likely associated with worker execution and recovery requirements.

### 4.8 Authentication and tenant authorization

Reuse the existing authentication and authorization infrastructure.

Authentication is performed through the Fastify authentication plugin.

Authorization uses:

```text
jobs:read
```

The authorization process must verify:

1. The access token is valid.
2. The subject is derived from the verified token.
3. The requested tenant identifier is valid.
4. The subject has current membership in that tenant.
5. The membership role grants `jobs:read`.

The existing tenant roles are:

| Role         | `jobs:read` |
| ------------ | ----------- |
| Viewer       | Allowed     |
| Operator     | Allowed     |
| Tenant Admin | Allowed     |

The existing `admin` role means Tenant Admin.

A tenant administrator has no automatic privileges in other tenants.

Platform-level administration is a separate future capability.

E5-S2 does not introduce a Platform Admin role or bypass tenant authorization.

### 4.9 Tenant isolation in PostgreSQL

Every job query must include the authorized tenant identifier.

A job must never be selected solely by its globally unique identifier.

Correct:

```sql
SELECT ...
FROM jobs
WHERE tenant_id = $1
  AND id = $2;
```

Incorrect:

```sql
SELECT ...
FROM jobs
WHERE id = $1;
```

For job details:

- A job belonging to the authorized tenant may be returned.
- A nonexistent job returns `404 Not Found`.
- A job belonging to another tenant also returns `404 Not Found`.

The API must not disclose whether a foreign tenant owns the requested job.

If a user lacks membership or the required permission in the requested tenant, the existing authorization policy returns `403 Forbidden`.

Repository queries must not execute before the required authorization decision succeeds.

Unexpected authorization failures must fail closed.

### 4.10 Audit history authorization

Job details may include business audit history only when the requester has the additional permission:

```text
audit:read
```

Existing permissions:

| Role         | `jobs:read` | `audit:read` |
| ------------ | ----------- | ------------ |
| Viewer       | Allowed     | Denied       |
| Operator     | Allowed     | Denied       |
| Tenant Admin | Allowed     | Allowed      |

Access to job details must not automatically grant access to audit history.

The API must evaluate `audit:read` separately.

For authorized audit readers, the details response may include:

```json
{
  "auditEvents": [
    {
      "id": "1",
      "action": "job.created",
      "actor": "11111111-1111-4111-8111-111111111111",
      "resourceId": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-10-26T10:00:00.000Z"
    }
  ]
}
```

The `auditEvents` property is included within the complete job details response; this fragment illustrates that optional field.

For users without `audit:read`, the `auditEvents` field is omitted.

It must not be populated with unauthorized data.

Audit retrieval must use the authorized tenant and requested job identifier.

Conceptually:

```sql
SELECT ...
FROM audit_events
WHERE tenant_id = $1
  AND resource_id = $2
ORDER BY created_at ASC, id ASC;
```

The repository must ensure that the referenced job belongs to the authorized tenant.

The current business audit implementation records `job.created`.

Future business events, such as `job.cancelled` and `job.retried`, may be included once implemented.

The API must not imply that these future events already exist.

Platform-wide security audit access remains outside E5-S2.

Since the current schema and test scope contain no separately defined maximum audit history size, the implementation must use a bounded retrieval policy before treating audit history as suitable for arbitrary production-scale growth. A dedicated paginated audit endpoint remains a possible future extension.

### 4.11 HTTP response and error behavior

| Condition                                | HTTP status                 |
| ---------------------------------------- | --------------------------- |
| Authorized job listing                   | `200 OK`                    |
| Authorized job details                   | `200 OK`                    |
| Empty listing                            | `200 OK`                    |
| Invalid query filters or cursor          | `400 Bad Request`           |
| Invalid tenant or job identifier         | `400 Bad Request`           |
| Missing or invalid authentication        | `401 Unauthorized`          |
| Missing tenant membership                | `403 Forbidden`             |
| Insufficient `jobs:read` permission      | `403 Forbidden`             |
| Job not found within authorized tenant   | `404 Not Found`             |
| Unexpected internal failure              | `500 Internal Server Error` |
| Identifiable temporary dependency outage | `503 Service Unavailable`   |

Error responses must follow existing API conventions.

Internal database errors, access tokens, SQL statements, and stack traces must not be returned to clients.

Audit authorization failures must not prevent an otherwise authorized user from viewing ordinary job details when audit information can be safely omitted.

Unexpected audit authorization failures must fail closed and must never expose audit records.

### 4.12 Separation of responsibilities

The implementation preserves existing package boundaries.

**HTTP API — `apps/api`**

Responsible for:

- Route registration.
- Authentication invocation.
- Request validation.
- Authorization orchestration.
- HTTP response codes.
- Response serialization.
- Dependency injection.

**Authorization — `@lab/auth`**

Responsible for:

- Evaluating current tenant membership.
- Evaluating `jobs:read` and `audit:read`.
- Returning trusted authorized context.

**Contracts — `@lab/contracts`**

Responsible for:

- Job filter schemas.
- Pagination schemas.
- Public list and details response schemas.
- Job status and type validation.
- Cursor payload validation.

**Persistence — `@lab/database`**

Responsible for:

- Tenant-scoped job listing.
- Tenant-scoped job details lookup.
- SQL filtering and pagination.
- Tenant-scoped business audit retrieval.
- Database-to-domain mapping.

The HTTP layer must not construct arbitrary SQL.

The persistence layer must not decide HTTP status codes.

No new controller or service abstraction is required solely to preserve structural symmetry.

### 4.13 Database changes

The current schema provides the primary data required for E5-S2:

- `jobs`
- `audit_events`
- Existing tenant relationships.
- Existing creation timestamps.
- Existing job attempt counters.
- Existing tenant-related indexes.

No new migration is initially required.

The implementation must not modify `001_init.sql`.

If a missing index or schema field is discovered during implementation, introduce a new numbered migration after documenting the need.

A dedicated execution attempt history table is outside the initial E5-S2 implementation.

### 4.14 Testing architecture

Use both isolated HTTP tests and PostgreSQL integration tests.

**HTTP tests**

Use Fastify `inject()` with injected dependencies.

Verify:

- Authentication requirements.
- Tenant authorization.
- Role-based permissions.
- Input validation.
- Filter parsing.
- Cursor validation.
- Response contracts.
- Error mapping.
- Conditional audit history access.

These tests must not require Keycloak or a running PostgreSQL database.

**PostgreSQL integration tests**

Use a real PostgreSQL database.

Verify:

- Tenant-scoped listing.
- Filtering by status and type.
- Date-range filtering.
- Stable ordering.
- Cursor continuation.
- Pagination boundaries.
- Empty result sets.
- Tenant-scoped details.
- Cross-tenant resource isolation.
- Tenant-scoped audit history.
- Correct attempt counters.
- Invalid or mismatched cursor handling at the appropriate boundary.

Test data must include multiple tenants and jobs with different timestamps, statuses and types.

The tests must not rely on records left behind by previous test executions.

The existing regression suite must remain passing.

## 5. Consequences and Trade-offs

### Benefits

- Provides secure job inspection capabilities.
- Preserves existing HTTP and persistence architecture.
- Uses established RBAC permissions.
- Enforces tenant isolation at both API and database boundaries.
- Supports efficient bounded pagination.
- Provides deterministic ordering.
- Separates job inspection from privileged audit access.
- Reuses existing persistence structures.
- Avoids premature schema and infrastructure changes.
- Establishes a reusable pattern for future tenant-scoped query endpoints.
- Supports automated verification at multiple architectural boundaries.

### Costs and risks

- Cursor pagination requires encoding, decoding, validation and version management.
- Clients cannot jump directly to arbitrary numbered pages.
- Cursor continuation does not provide a database snapshot across requests.
- Incorrect SQL conditions may introduce cross-tenant disclosure risks.
- Additional authorization checks increase database access.
- Audit history may grow and require dedicated pagination.
- Existing attempt counters do not provide detailed execution history.
- The existing pagination index may require optimization under larger workloads.
- Multiple filtering combinations may require query-plan analysis.
- Changes to the public response contract may affect future clients.
- Incorrect dependency composition could bypass expected authorization behavior.

## 6. Verification and Acceptance Evidence

E5-S2 must verify the following acceptance criteria before the story is considered validated.

### AC1 — Authorized job listing is operational

- The authenticated GET list endpoint is registered.
- Users with `jobs:read` can list jobs in an authorized tenant.
- Users without the required access are rejected.
- An empty result set returns a valid empty response.
- Returned job summaries conform to the public contract.

### AC2 — Filtering behaves correctly

- Jobs can be filtered by status.
- Jobs can be filtered by type.
- Jobs can be filtered by creation date range.
- Supported filters can be combined.
- Invalid status and type values are rejected.
- Invalid date ranges are rejected.
- Unknown query parameters are rejected.

### AC3 — Pagination is deterministic and bounded

- Results are ordered by `created_at DESC, id DESC`.
- Default page size is 20.
- Maximum page size is 100.
- Invalid limits are rejected.
- Cursor continuation does not repeat previously returned records under an unchanged dataset.
- Equal creation timestamps are handled correctly.
- Invalid cursors are rejected.
- Cursors cannot be reused across mismatched tenants or filters.
- Each request independently enforces authorization.

### AC4 — Tenant boundaries are enforced

- Every PostgreSQL job query includes a tenant constraint.
- Tenant A cannot list tenant B jobs.
- Tenant A cannot inspect tenant B job details.
- Cross-tenant job identifiers do not disclose resource existence.
- Missing membership and insufficient permissions fail closed.

### AC5 — Job details return correct information

- Authorized job details can be retrieved.
- Invalid job identifiers are rejected.
- Missing jobs return `404`.
- The response conforms to the shared contract.
- Existing `attempts` and `maxAttempts` values are returned correctly.
- Individual execution attempts are not fabricated.
- Internal persistence fields are not unintentionally exposed.

### AC6 — Audit history is separately authorized

- Users with `jobs:read` can inspect ordinary job details.
- Audit history requires `audit:read`.
- Tenant Admin can access business audit history for authorized tenant jobs.
- Viewer and Operator cannot access audit history through job details.
- Audit history is omitted for users without `audit:read`.
- Audit queries are restricted by tenant and job identifier.
- Cross-tenant audit records cannot be disclosed.
- Existing `job.created` records are returned correctly.

### AC7 — Automated tests verify actual behavior

- Fastify HTTP tests cover success and failure scenarios.
- PostgreSQL integration tests verify actual query behavior.
- Authorization tests cover positive and negative cases.
- Cursor and filtering edge cases are tested.
- Existing E5-S1 and E5-S1A tests remain passing.
- Full repository formatting and lint checks pass.
- The complete regression suite passes.
- GitHub Actions quality gates pass.

### AC8 — Validation evidence is documented

Record actual validation results in:

`docs/evidence/api/e5-s2-validation.md`

The evidence must contain:

- Execution date.
- Implementation Git revision.
- Node.js and pnpm versions.
- Executed verification commands.
- Actual test results and counts where available.
- Acceptance criteria status.
- Known limitations.
- Final validation result.

Do not mark acceptance criteria as PASS until their corresponding verification has been executed successfully.

## 7. Revisit Criteria

Reconsider this decision if:

- Product requirements demand direct page-number navigation.
- Cursor pagination becomes unsuitable for required user workflows.
- Job query volume requires additional indexes or query optimization.
- Large audit histories require independent pagination.
- Worker execution introduces detailed per-attempt records.
- Job filtering expands to complex search or aggregation.
- Cross-tenant platform administration requires additional access policies.
- Audit access requires field-level or event-category authorization.
- Stronger consistency guarantees are required across paginated requests.
- Public API compatibility requirements change.
- Query performance or tenant isolation measurements justify a different persistence approach.

Any significant replacement decision must be documented through a new ADR rather than silently rewriting this historical decision.

## 8. Traceability

- **Epic:** E5 — Job Management API
- **Story:** E5-S2 — List and Inspect Jobs
- **Backlog:** `apps/docs/backlog/02-user-stories-and-tasks.md`
- **Previous API ADR:** `docs/adr/007-http-api-architecture-and-idempotent-job-creation.md`
- **Audit ADR:** `docs/adr/008-transactional-audit-trail.md`
- **Authentication and authorization:** `packages/auth/`
- **Shared contracts:** `packages/contracts/src/jobs/`
- **Job persistence:** `packages/database/src/repositories/job/`
- **Audit persistence:** `packages/database/src/repositories/audit/`
- **HTTP API:** `apps/api/src/modules/jobs/`
- **Validation evidence:** `docs/evidence/api/e5-s2-validation.md`
- **Previous story:** E5-S1A — Transactional Job Creation Audit Trail
- **Next story:** E5-S3 — Retry and Cancel Jobs
- **Related future capability:** Platform Administration and Tenant Onboarding

This decision establishes the architecture for authenticated, tenant-scoped job listing and inspection while preserving existing authorization boundaries, database integrity, and audit access restrictions.
