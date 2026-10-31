# ADR-010 — Job Retry and Cancellation Lifecycle

| Field                 | Value                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Status                | Accepted for E5-S3 implementation                                                              |
| Date                  | 2026-10-31                                                                                     |
| Epic                  | E5 — Job Management API                                                                        |
| User story            | E5-S3 — Job Retry and Cancellation                                                             |
| Scope                 | Tenant-scoped job lifecycle commands, state transitions, authorization, concurrency, and audit |
| Related ADRs          | ADR-003, ADR-004, ADR-006, ADR-007, ADR-008, ADR-009                                           |
| Verification evidence | `docs/evidence/api/e5-s3-validation.md`                                                        |

## 1. Context

The Enterprise Job Platform currently supports authenticated, tenant-scoped job creation, listing, and details retrieval.

The existing database schema represents job lifecycle state using:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

Jobs also contain execution counters, scheduling fields, lease metadata, results, and errors.

However, clients currently cannot explicitly retry failed jobs or cancel queued jobs through the HTTP API.

E5-S3 introduces these operations while preserving the existing database consistency, authorization, and audit guarantees.

The implementation must account for concurrent requests and future worker execution.

HTTP-level cancellation must not be confused with cancellation of an already-running asynchronous operation.

## 2. Decision Drivers

The implementation must:

- Enforce authentication and tenant-scoped authorization.
- Define deterministic job state transitions.
- Prevent unauthorized cross-tenant operations.
- Enforce the execution attempt budget.
- Prevent concurrent commands from corrupting job state.
- Preserve job identity and existing request data.
- Record successful state transitions in transactional audit history.
- Return predictable HTTP responses for invalid transitions.
- Support PostgreSQL integration testing without mocking database behavior.
- Preserve compatibility with future worker lease management.
- Avoid introducing unnecessary queues or infrastructure.

## 3. Alternatives Considered

| Alternative                                | Advantages                                        | Trade-offs                                                      |
| ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| Create a new job for each retry            | Keeps previous job records immutable              | Introduces new identifiers, lineage, and idempotency complexity |
| Update existing job on retry               | Preserves identity and simplifies client tracking | Requires explicit transition and attempt-budget rules           |
| Cancel queued and running jobs immediately | Simple API semantics                              | Cannot guarantee interruption of an already-running worker      |
| Cancel queued jobs only                    | Safe without worker coordination                  | Running-job cancellation remains unsupported                    |
| Read state, then update separately         | Simple implementation                             | Vulnerable to concurrent state changes                          |
| Atomic conditional SQL update              | Reliable state transitions                        | Requires careful transaction and conflict handling              |

## 4. Decision

### 4.1 API Endpoints

Implement:

`POST /v1/tenants/:tenantId/jobs/:jobId/retry`

`POST /v1/tenants/:tenantId/jobs/:jobId/cancel`

Both operations require a valid access token and tenant-scoped authorization.

The existing `jobs:cancel` permission will authorize lifecycle management commands in E5-S3.

The permission name is retained for compatibility. A dedicated `jobs:retry` permission may be introduced in a future authorization revision if different roles need independent retry and cancellation rights.

### 4.2 Retry Semantics

Retry is allowed only when:

- The job belongs to the requested tenant.
- The caller has the required permission.
- The current status is `failed`.
- `attempts < max_attempts`.

A successful retry:

- Preserves the existing job ID.
- Preserves tenant ownership, creator, type, and input.
- Changes status from `failed` to `queued`.
- Clears the previous error and result.
- Clears lease ownership and expiration.
- Sets `available_at` to the current database time.
- Updates `updated_at`.
- Preserves the existing attempt counter.
- Creates a `job.retried` audit event in the same transaction.

Retry does not independently execute the job. A future worker is responsible for claiming and processing queued jobs.

Jobs that have exhausted their attempt budget cannot be retried through this endpoint.

### 4.3 Cancellation Semantics

Cancellation is allowed only for a job currently in `queued` state.

A successful cancellation:

- Changes status from `queued` to `cancelled`.
- Preserves job identity and original input.
- Updates `updated_at`.
- Creates a `job.cancelled` audit event in the same transaction.

Cancelling a `running`, `completed`, `failed`, or already `cancelled` job produces a state conflict.

Running-job cancellation is deferred until the worker supports coordinated cancellation and appropriate lease fencing.

### 4.4 State Transition Matrix

| Current state | Retry                               | Cancel      |
| ------------- | ----------------------------------- | ----------- |
| `queued`      | Reject                              | `cancelled` |
| `running`     | Reject                              | Reject      |
| `completed`   | Reject                              | Reject      |
| `failed`      | `queued`, if attempt budget remains | Reject      |
| `cancelled`   | Reject                              | Reject      |

Rejected transitions do not modify the job or create a business audit event.

### 4.5 Concurrency Control

State-changing commands must execute within PostgreSQL transactions.

Implement conditional updates that enforce:

- The requested tenant ID.
- The requested job ID.
- The required current status.
- Any required attempt-budget constraints.

Concurrent requests must not create multiple successful state transitions.

Only the transaction that successfully changes the job state may insert the corresponding business audit record.

The implementation must distinguish a missing job from an existing job in an invalid state without exposing records belonging to other tenants.

### 4.6 Transactional Audit

Reuse the existing shared `insertAuditEvent()` command, which receives the active PostgreSQL transaction client.

Record:

- `job.retried` following a successful retry.
- `job.cancelled` following a successful cancellation.

Both events must commit or roll back with the corresponding job state change.

Failed authorization, missing jobs, and rejected state transitions must not produce successful business-operation audit events.

Security audit records for denied requests are outside the current implementation.

### 4.7 HTTP Response Semantics

| Scenario                          | HTTP status                 |
| --------------------------------- | --------------------------- |
| Successful retry                  | `200 OK`                    |
| Successful cancellation           | `200 OK`                    |
| Missing or invalid authentication | `401 Unauthorized`          |
| Insufficient permission           | `403 Forbidden`             |
| Invalid route parameters          | `400 Bad Request`           |
| Nonexistent or inaccessible job   | `404 Not Found`             |
| Invalid lifecycle transition      | `409 Conflict`              |
| Unexpected internal failure       | `500 Internal Server Error` |

Successful responses return the updated job state.

Repeated operations are not treated as successful idempotent replays. A subsequent command against an incompatible state returns `409 Conflict`.

### 4.8 Architecture and Module Boundaries

Database commands belong under:

`packages/database/src/repositories/job/commands/`

HTTP command handlers belong under:

`apps/api/src/modules/jobs/commands/`

Shared request and response contracts belong in:

`packages/contracts/src/jobs/`

Fastify handlers do not execute persistence SQL directly.

Database commands do not depend on Fastify or HTTP-specific types.

### 4.9 Database Migrations

No new migration is initially required.

The existing `jobs` and `audit_events` tables contain the required fields.

Historical migrations must not be modified.

Any additional index or schema constraint identified during implementation must be introduced through a new numbered migration.

## 5. Consequences

### Positive

- Clear job lifecycle behavior.
- Atomic PostgreSQL transitions.
- Predictable retry attempt limits.
- Transactional business audit records.
- Preserved job identifiers.
- Strong tenant isolation.
- Compatibility with the future worker architecture.

### Trade-offs

- A failed job with exhausted attempts cannot be retried without a separately designed attempt-budget reset operation.
- Running jobs cannot currently be cancelled.
- Retry and cancellation do not provide idempotent replay semantics.
- The existing `jobs:cancel` permission governs both commands until permission granularity is revisited.
- A successful retry queues work but does not guarantee its immediate execution.

## 6. Verification Requirements

### Contracts

Verify:

- Valid job identifiers.
- Invalid route parameters.
- Defined lifecycle command response structures.

### PostgreSQL Integration Tests

Verify:

- Successful failed-to-queued retry.
- Retry rejection when the attempt budget is exhausted.
- Retry rejection for incompatible states.
- Successful queued-to-cancelled transition.
- Cancellation rejection for incompatible states.
- Missing-job behavior.
- Cross-tenant isolation.
- Concurrent retry and cancellation requests.
- Exactly one audit record for each successful transition.
- Transaction rollback when audit persistence fails.
- Preservation of original job input and identity.

### Fastify HTTP Tests

Verify:

- Successful retry and cancellation.
- Missing and invalid authentication.
- Missing tenant permissions.
- Invalid job identifiers.
- Nonexistent jobs.
- Invalid transitions.
- Correct repository dependency invocation.
- Safe handling of unexpected failures.
- No persistence calls after authorization failure.

### Regression

Run the complete existing build, typecheck, lint, formatting, unit, and PostgreSQL integration test suites.

The implementation must not regress E5-S1 job creation or E5-S2 job retrieval.

Verification evidence must record actual command results, test counts, implementation revision, limitations, and acceptance criteria status.

## 7. Revisit Criteria

Reconsider this decision when:

- Worker-supported running-job cancellation becomes available.
- Lease fencing and recovery introduce additional lifecycle states.
- Operational requirements demand manual retry after budget exhaustion.
- Retry and cancellation require separate role permissions.
- API clients require explicit idempotency keys for lifecycle commands.
- Job execution attempts become separately persisted records.
- Performance testing identifies database contention under high concurrency.

Significant changes require a new ADR or an explicitly documented revision, rather than silently changing established lifecycle semantics.

## 8. Traceability

- Epic: E5 — Job Management API
- Story: E5-S3 — Job Retry and Cancellation
- Previous story: E5-S2 — Job Listing and Details
- Database schema: `packages/database/migrations/001_init.sql`
- Database commands: `packages/database/src/repositories/job/commands/`
- API commands: `apps/api/src/modules/jobs/commands/`
- Shared contracts: `packages/contracts/src/jobs/`
- Evidence: `docs/evidence/api/e5-s3-validation.md`
- Future worker processing: E6
