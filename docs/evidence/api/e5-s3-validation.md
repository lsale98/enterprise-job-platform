# E5-S3 — Job Retry and Cancellation API Validation Evidence

## Metadata

- Date: 2026-10-31
- Epic: E5 — Job Management API
- Story: E5-S3 — Job Retry and Cancellation
- Branch: `feat/e5-s3-job-retry-cancellation`
- Git revision: `b2351d6`
- Node version: `v24.15.0`
- pnpm version: `10.18.3`
- Related ADRs:
  - ADR-003 — Bounded Concurrency, Retry, and Cooperative Cancellation
  - ADR-007 — HTTP API Architecture and Idempotent Job Creation
  - ADR-008 — Transactional Audit Trail
  - ADR-009 — Job Query Pagination and Audit Access
  - ADR-010 — Job Retry and Cancellation Lifecycle

## Verification Results

| Command                                        | Status |
| ---------------------------------------------- | ------ |
| `pnpm --filter @lab/database build`            | PASS   |
| `pnpm --filter @lab/database typecheck`        | PASS   |
| `pnpm --filter @lab/database test:integration` | PASS   |
| `pnpm --filter api build`                      | PASS   |
| `pnpm --filter api typecheck`                  | PASS   |
| `pnpm --filter api test`                       | PASS   |
| `pnpm build`                                   | PASS   |
| `pnpm typecheck`                               | PASS   |
| `pnpm lint`                                    | PASS   |
| `pnpm format:check`                            | PASS   |
| `pnpm test`                                    | PASS   |
| `pnpm test:integration`                        | PASS   |
| `pnpm regression`                              | PASS   |

All final reported validation checks completed successfully.

The validation covers TypeScript compilation, static analysis, formatting, API tests, PostgreSQL integration tests, and the existing monorepo regression suite.

The implementation was validated locally against the existing development and testing infrastructure.

## Acceptance Criteria

### AC1 — Job Retry HTTP endpoint is implemented

**Status: PASS**

The API provides:

`POST /v1/tenants/:tenantId/jobs/:jobId/retry`

The endpoint allows an authorized tenant member to request a retry of an eligible failed job.

The implementation provides:

- JWT Bearer authentication.
- Tenant-scoped authorization.
- Route parameter validation using Zod.
- Job state validation.
- Remaining attempt budget validation.
- PostgreSQL-backed state transitions.
- Transactional audit event persistence.
- Consistent HTTP responses.

The Fastify handler delegates persistence to the `retryJob()` command through the existing dependency injection architecture.

The HTTP layer does not execute SQL queries directly.

A successful retry returns `200 OK` with the updated job representation.

### AC2 — Retry operations enforce valid job lifecycle transitions

**Status: PASS**

Retry is permitted only when:

- The job belongs to the requested tenant.
- The requester has the required permission.
- The job status is `failed`.
- The current attempt count is lower than `maxAttempts`.

The valid state transition is:

`failed → queued`

The following retry requests are rejected:

- Retrying a queued job.
- Retrying a running job.
- Retrying a completed job.
- Retrying a cancelled job.
- Retrying a failed job that has exhausted its execution attempt budget.

Invalid transitions return `409 Conflict`.

Rejected retry operations do not modify the job state and do not create a successful `job.retried` audit event.

PostgreSQL integration tests verify successful retry, invalid transitions, and attempt budget enforcement.

### AC3 — Successful retry preserves job identity and scheduling consistency

**Status: PASS**

A successful retry updates the existing job rather than creating a new job record.

The operation preserves:

- Job ID.
- Tenant ID.
- Original creator.
- Job type.
- Original input.
- Existing execution attempt count.
- Maximum allowed attempts.
- Original creation timestamp.

The operation updates:

- `status` to `queued`.
- `result` to `NULL`.
- `error` to `NULL`.
- `lease_owner` to `NULL`.
- `lease_until` to `NULL`.
- `available_at` to the current database time.
- `updated_at` to the current database time.

The attempt counter is intentionally preserved.

Retrying a failed job does not reset the execution attempt budget or bypass the configured maximum number of attempts.

The operation does not execute the job directly. It makes the job eligible for future worker processing.

### AC4 — Job Cancellation HTTP endpoint is implemented

**Status: PASS**

The API provides:

`POST /v1/tenants/:tenantId/jobs/:jobId/cancel`

The endpoint allows authorized users to cancel jobs that have not started execution.

The implementation provides:

- JWT Bearer authentication.
- Tenant-scoped authorization.
- Route parameter validation.
- State transition validation.
- PostgreSQL-backed cancellation.
- Transactional audit persistence.
- Consistent HTTP responses.

The Fastify handler delegates state changes to `cancelJob()` through the application dependency injection layer.

A successful cancellation returns `200 OK` with the updated job status.

### AC5 — Cancellation is restricted to queued jobs

**Status: PASS**

Cancellation is allowed only for jobs in the `queued` state.

The valid state transition is:

`queued → cancelled`

The implementation rejects cancellation when the job is:

- `running`
- `completed`
- `failed`
- Already `cancelled`

Invalid cancellation attempts return `409 Conflict`.

Repeated cancellation requests are not considered successful idempotent replays.

A successful cancellation updates the existing job record without changing the original input or ownership.

Cancellation of running jobs is intentionally unsupported because the current platform does not yet implement worker-coordinated cancellation and execution fencing.

PostgreSQL integration tests verify successful cancellation and rejection of incompatible states.

### AC6 — Retry and cancellation enforce authentication and RBAC

**Status: PASS**

Both lifecycle endpoints require valid Keycloak JWT access tokens.

The existing Fastify authentication plugin verifies Bearer tokens and makes the authenticated identity available through `request.identity`.

Both operations use the existing tenant authorizer.

For E5-S3, the required permission is:

`jobs:cancel`

The permission is reused for lifecycle management commands according to ADR-010.

The existing roles provide the following access:

- `viewer` — cannot retry or cancel jobs.
- `operator` — can retry and cancel eligible jobs.
- `admin` — can retry and cancel eligible jobs.

The API derives the actor identity from the authenticated request.

Clients cannot supply an arbitrary actor through request parameters.

The HTTP layer returns:

- `401 Unauthorized` when authentication is missing or invalid.
- `403 Forbidden` when tenant authorization fails.

Database commands are not invoked when authentication or authorization fails.

Automated Fastify tests verify authentication failures, authorization failures, and successful command execution through injected dependencies.

### AC7 — Tenant isolation is enforced for lifecycle commands

**Status: PASS**

Both database commands explicitly scope job access to the requested tenant.

Job selection uses:

```sql
WHERE tenant_id = $1
  AND id = $2
FOR UPDATE
```

A job that belongs to a different tenant is not accessible through the command.

The repository returns `not_found` for:

- A nonexistent job identifier.
- A job identifier belonging to another tenant.

The HTTP layer maps this result to `404 Not Found`.

The implementation does not expose the existence or state of jobs belonging to unauthorized tenants.

Tenant membership authorization is performed before command execution.

PostgreSQL integration tests verify cross-tenant isolation for lifecycle operations.

### AC8 — Concurrent lifecycle commands are transactionally safe

**Status: PASS**

Retry and cancellation use explicit PostgreSQL transactions.

The implementation uses:

`SELECT ... FOR UPDATE`

to acquire a row-level lock before evaluating the current job state.

The update operation additionally enforces the required status and, for retry, the remaining attempt budget.

For retry:

```sql
WHERE tenant_id = $1
  AND id = $2
  AND status = 'failed'
  AND attempts < max_attempts
```

For cancellation:

```sql
WHERE tenant_id = $1
  AND id = $2
  AND status = 'queued'
```

Concurrent requests cannot both complete the same state transition successfully.

A second request observes the updated state after the first transaction commits and receives a conflict result when the transition is no longer valid.

PostgreSQL integration tests verify that:

- Two concurrent retry requests produce one successful transition.
- Two concurrent cancellation requests produce one successful transition.
- Only one corresponding business audit event is persisted.

These guarantees are enforced through PostgreSQL transactions rather than application-level in-memory locks.

### AC9 — Successful lifecycle transitions are recorded in audit history

**Status: DONE**

E5-S3 extends the existing transactional audit architecture.

Successful retry operations create:

`job.retried`

Successful cancellation
