# E5-S2 — Job Listing and Details API Validation Evidence

## Metadata

- Date: 2026-10-27
- Epic: E5 — Job Management API
- Story: E5-S2 — Job Listing and Details
- Branch: `feat/e5-s2-job-query-api`
- Git revision: `eb3a70f`
- Node version: `v24.15.0`
- pnpm version: `10.18.3`

## Verification Results

| Command                                        | Status |
| ---------------------------------------------- | ------ |
| `pnpm --filter @lab/contracts build`           | PASS   |
| `pnpm --filter @lab/contracts typecheck`       | PASS   |
| `pnpm --filter @lab/database build`            | PASS   |
| `pnpm --filter @lab/database typecheck`        | PASS   |
| `pnpm --filter @lab/database test:integration` | PASS   |
| `pnpm --filter api build`                      | PASS   |
| `pnpm --filter api typecheck`                  | PASS   |
| `pnpm --filter api test`                       | PASS   |
| `pnpm lint`                                    | PASS   |
| `pnpm format:check`                            | PASS   |
| `pnpm regression`                              | PASS   |
| `git diff --check`                             | PASS   |

The final validation was performed after addressing TypeScript strict optional property handling, repository timestamp type consistency, ESLint diagnostics, and Prettier formatting issues.

The regression command covers the existing build, typecheck, unit test, and PostgreSQL integration test workflows across the monorepo.

## Acceptance Criteria

### AC1 — Job listing HTTP endpoint is implemented

**Status: PASS**

The API provides:

`GET /v1/tenants/:tenantId/jobs`

The endpoint is implemented in the existing Fastify Jobs module and delegates data retrieval to the `listJobs()` repository operation.

The implementation provides:

- Authenticated HTTP access.
- Tenant-scoped job retrieval.
- Optional filtering.
- Cursor-based pagination.
- A configurable result limit.
- A consistent JSON response containing `jobs` and `nextCursor`.

An empty result returns HTTP `200 OK` with an empty `jobs` array and `nextCursor: null`.

The endpoint is registered through the existing Fastify Jobs plugin and receives its dependencies through the application composition root.

### AC2 — Jobs can be filtered by status, type, and creation date

**Status: PASS**

The listing endpoint supports the following query parameters:

| Parameter     | Description                            |
| ------------- | -------------------------------------- |
| `status`      | Filters by job status                  |
| `type`        | Filters by job type                    |
| `createdFrom` | Inclusive lower creation date boundary |
| `createdTo`   | Inclusive upper creation date boundary |
| `limit`       | Maximum number of jobs returned        |
| `cursor`      | Pagination continuation token          |

Supported job statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

Supported job types:

- `report`
- `import`
- `notification`

Query parameters are validated using `JobListQuerySchema` from `@lab/contracts`.

Validation includes:

- Supported status and type values.
- ISO 8601 date-time values with timezone information.
- Valid date range ordering.
- Pagination limits from 1 to 100.
- Default pagination limit of 20.
- Rejection of unsupported query properties.

PostgreSQL filtering uses parameterized SQL queries rather than interpolating user-provided values.

Database integration tests verify filtering by type, status, and creation date.

### AC3 — Cursor-based pagination is implemented

**Status: PASS**

Job listing uses keyset pagination rather than offset-based pagination.

Jobs are ordered by:

```sql
ORDER BY created_at DESC, id DESC
```

The repository uses the last job from the previous page to identify the continuation position.

The pagination condition uses:

```sql
(created_at, id) < ($createdAt, $id)
```

The combination of `created_at` and `id` provides a deterministic ordering key.

The repository retrieves one additional row beyond the requested limit to determine whether another page exists.

The API returns:

- An opaque Base64URL-encoded `nextCursor` when more jobs are available.
- `nextCursor: null` when pagination has reached the end.

Cursor payloads contain:

- Schema version.
- Tenant identifier.
- Last job identifier.
- Last job creation timestamp.
- Applied filters.
- Pagination limit.

Cursor processing is implemented separately from PostgreSQL persistence.

The implementation includes:

- `JobListCursorSchema` runtime validation.
- Cursor encoding and decoding utilities.
- Rejection of malformed Base64URL values.
- Rejection of unsupported cursor versions.
- Tenant-context verification.
- Filter consistency verification.
- Pagination limit consistency verification.

PostgreSQL creation timestamps are serialized with six fractional digits to preserve microsecond precision rather than truncating them through JavaScript `Date.toISOString()`.

Unit tests cover cursor serialization, decoding, invalid payloads, tenant mismatches, filter changes, and pagination limit changes.

**Verification boundary:** A dedicated integration test for multiple rows differing only at the microsecond level was not separately recorded in this evidence.

### AC4 — Tenant boundaries are enforced

**Status: PASS**

Both Job Query repository operations enforce tenant scoping directly in PostgreSQL queries.

Job listing requires:

```sql
WHERE tenant_id = $1
```

Job details require:

```sql
WHERE tenant_id = $1
  AND id = $2
```

The tenant identifier is supplied through the authenticated and authorized API request context.

The repository does not perform unrestricted job lookups followed by in-memory tenant filtering.

For job details:

- A job belonging to the requested tenant can be returned.
- An unknown job returns `null`.
- A job belonging to another tenant also returns `null`.

The HTTP layer maps missing or inaccessible job records to `404 Not Found`, after authorization for the requested tenant.

PostgreSQL integration tests verify that one tenant cannot retrieve jobs belonging to another tenant.

### AC5 — Job listing and details enforce `jobs:read` authorization

**Status: PASS**

Both GET endpoints require authenticated requests.

The Fastify authentication plugin verifies Bearer access tokens and exposes the authenticated identity through `request.identity`.

Before accessing job data, the API invokes the existing tenant authorizer with the `jobs:read` permission.

The existing role model supports:

- `viewer` — can read jobs.
- `operator` — can read jobs.
- `admin` — can read jobs.

The HTTP layer returns:

- `401 Unauthorized` for requests without valid authentication.
- `403 Forbidden` when the requester lacks tenant access or the required permission.

Repository access is not performed when authorization fails.

HTTP tests use injected authentication and authorization dependencies to verify transport-layer behavior independently of Keycloak and PostgreSQL.

The existing Keycloak JWT verification and membership authorization implementations remain unchanged.

### AC6 — Job details HTTP endpoint is implemented

**Status: PASS**

The API provides:

`GET /v1/tenants/:tenantId/jobs/:jobId`

The endpoint retrieves a single job using `getJobById()`.

Returned job information includes:

- Job ID.
- Tenant ID.
- Job type.
- Job status.
- Original input payload.
- Result, when available.
- Error information, when available.
- Attempt counter.
- Maximum allowed attempts.
- Creation timestamp.
- Last update timestamp.

The repository returns `null` when no matching tenant-scoped job exists.

The API validates route parameters and returns `400 Bad Request` for malformed identifiers.

The public details response excludes internal persistence metadata such as idempotency request hashes and lease ownership fields.

PostgreSQL integration tests cover successful retrieval, nonexistent jobs, tenant isolation, and exclusion of internal fields.

### AC7 — Job audit history is available with `audit:read`

**Status: PASS**

The job details endpoint supports conditional inclusion of audit history.

The authorization flow is:

1. Authenticate the caller.
2. Authorize `jobs:read`.
3. Retrieve the tenant-scoped job.
4. Independently authorize `audit:read`.
5. Retrieve audit history only when audit authorization succeeds.

Users with `jobs:read` but without `audit:read` can still retrieve job details.

When audit access is denied, the response does not include the `auditEvents` field.

When audit access is granted, the API retrieves events using `listJobAuditEvents()`.

The repository queries the existing `audit_events` table and joins against the `jobs` table to enforce tenant association.

Audit events include:

- Event ID.
- Tenant ID.
- Actor.
- Action.
- Resource ID.
- Creation timestamp.

Events are ordered chronologically using:

```sql
ORDER BY ae.created_at ASC, ae.id ASC
```

The event identifier is represented as a string to avoid precision loss from PostgreSQL `bigint` values.

PostgreSQL integration tests verify:

- Retrieval of events associated with a job.
- Isolation between tenants.
- Empty results for nonexistent jobs.
- Pagination limit enforcement.
- Deterministic chronological ordering.

Audit history currently returns a maximum of 100 events per request.

### AC8 — Query parameters and pagination cursors are validated

**Status: PASS**

The implementation introduces dedicated contracts for job query validation.

The contracts include:

- `JobListQuerySchema`
- `JobListCursorSchema`
- `JobListQuery`
- `JobListCursor`

Schemas are implemented using Zod and exported through `@lab/contracts`.

The API rejects invalid listing parameters before invoking the database repository.

Malformed, incompatible, or invalid pagination cursors are rejected with HTTP `400 Bad Request`.

The cursor implementation checks the current tenant, active filters, and requested page size against the decoded cursor payload.

The implementation also retains strict TypeScript handling of optional fields through `exactOptionalPropertyTypes`.

Unit and HTTP tests cover representative valid and invalid input scenarios.

### AC9 — Database repositories are modular and independently testable

**Status: PASS**

The database layer was reorganized by domain and responsibility.

Job persistence separates:

- Commands for state-changing operations.
- Queries for data retrieval.
- Shared query types.
- Stable public repository exports.

The Job domain includes dedicated operations for:

- Idempotent job creation.
- Listing jobs.
- Retrieving individual jobs.

The Audit domain separates:

- Transactional audit event insertion.
- Tenant-scoped audit event retrieval.
- Shared audit query types.
- Public repository exports.

The existing `createJobIdempotently()` behavior was preserved during the restructuring.

Database access continues to use explicitly injected PostgreSQL connections and pools.

Repository exports are exposed through stable package entry points, preventing application modules from depending on internal file paths.

The existing API dependency injection architecture was extended with:

- `listJobs`
- `getJobById`
- `listJobAuditEvents`

The Jobs module receives only the dependencies needed for its functionality.

### AC10 — PostgreSQL integration tests validate persistence and isolation

**Status: PASS**

PostgreSQL integration tests execute against a real database rather than mocked SQL responses.

The test coverage includes:

- Tenant-scoped job listing.
- Job filtering.
- Pagination continuation.
- Pagination ordering.
- Job detail retrieval.
- Cross-tenant isolation.
- Audit event insertion.
- Audit transaction commit and rollback.
- Audit event retrieval.
- Audit event limits and ordering.

Audit command tests verify PostgreSQL foreign key enforcement and transactional rollback behavior.

Audit query tests use dedicated test tenants and jobs, together with an existing identity from the test database.

The integration test setup and cleanup logic was corrected after initial foreign key failures involving tenant and identity references.

The final PostgreSQL integration test command completed successfully.

### AC11 — Existing Job Creation API remains functional

**Status: PASS**

E5-S2 extends the Jobs module without changing the intended behavior of the existing E5-S1 job creation endpoint:

`POST /v1/tenants/:tenantId/jobs`

The implementation retains:

- Authenticated job creation.
- `jobs:create` authorization.
- Zod payload validation.
- Idempotency key handling.
- Idempotent replay.
- Conflict responses.
- Transactional `job.created` audit persistence.

The existing Jobs API tests and PostgreSQL integration tests continue to run as part of the regression suite.

No database schema migration was required for the initial E5-S2 implementation.

### AC12 — Application errors are handled safely

**Status: PASS**

The GET endpoints return appropriate HTTP statuses for supported error conditions.

| Condition                               | HTTP status                 |
| --------------------------------------- | --------------------------- |
| Successful job listing                  | `200 OK`                    |
| Successful job details retrieval        | `200 OK`                    |
| Missing or invalid authentication       | `401 Unauthorized`          |
| Insufficient tenant permission          | `403 Forbidden`             |
| Invalid parameters or pagination cursor | `400 Bad Request`           |
| Nonexistent or inaccessible job         | `404 Not Found`             |
| Unexpected internal failure             | `500 Internal Server Error` |

Unexpected errors are handled through the existing centralized Fastify error handling mechanism.

Internal database error messages are not intentionally included in public API responses.

The existing API error-handling tests continue to pass.

## Known Limitations

- Validation was performed in the local development and test environment, not production infrastructure.
- API HTTP tests use injected authentication, authorization, and repository dependencies. Real PostgreSQL behavior is verified separately by integration tests.
- No new manual end-to-end Postman validation against live Keycloak and PostgreSQL was recorded specifically for E5-S2.
- Audit history currently returns a maximum of 100 events and does not expose an independent pagination cursor.
- The current audit schema has no explicit `resource_type` column. Job audit queries rely on the established association between `resource_id` and job identifiers.
- Individual job execution attempts are not stored as separate history records. The details endpoint exposes `attempts` and `maxAttempts`, but not a per-attempt timeline.
- Pagination cursors are Base64URL encoded, not cryptographically signed. Their contents are validated, and API authorization is repeated for every request.
- The cursor-based pagination design does not provide a fixed snapshot of the dataset across multiple requests. Concurrent insertions or updates can affect the results visible during pagination.
- Dedicated testing of microsecond-level timestamp collisions was not separately documented, although PostgreSQL timestamps are preserved with microsecond precision in the query responses.
- Some integration test fixtures still depend on an existing identity in the test database. Fully self-contained identity fixture creation is a future test infrastructure improvement.
- Production deployment, load testing, index performance benchmarking, and distributed operational monitoring are outside E5-S2.

## Final Result

**E5-S2 Status: DONE**

**Validation: VALIDATED WITH KNOWN LIMITATIONS**

The Job Listing and Details API is implemented and the final reported build, typecheck, lint, formatting, unit test, integration test, and full regression checks passed.

The implementation provides two authenticated, tenant-scoped Fastify GET endpoints with validated filters, cursor-based pagination, PostgreSQL retrieval, role-based authorization, conditional audit history, and safe HTTP error handling.

Database commands and queries are organized into responsibility-specific modules, and the existing E5-S1 job creation functionality remains covered by regression testing.

The implementation follows ADR-007, ADR-008, and ADR-009. The remaining limitations are documented above and do not require expanding E5-S2 into job lifecycle operations, worker processing, or production infrastructure work.
