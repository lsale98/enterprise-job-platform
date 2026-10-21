# E3-S2 — Idempotency Persistence Validation Evidence

## Metadata

- Date: 2026-10-21
- Epic: E3 — Persistence and Data Model
- Story: E3-S2 — Idempotency Persistence
- Branch: feat/e3-s2-idempotency-persistence
- Git revision: 34eb96a
- Node version: v24.15.0
- pnpm version: 10.18.3

## Verification Results

| Command                                        | Status |
| ---------------------------------------------- | ------ |
| `pnpm --filter @lab/contracts build`           | PASS   |
| `pnpm --filter @lab/database build`            | PASS   |
| `pnpm --filter @lab/database typecheck`        | PASS   |
| `pnpm --filter @lab/database test:integration` | PASS   |

## Acceptance Criteria

### AC1 — New jobs are persisted successfully

**Status: PASS**

The `createJobIdempotently()` repository function successfully persists validated job payloads in PostgreSQL.

New jobs are created with the expected initial status and associated tenant and identity information.

### AC2 — Repeated requests return the existing job

**Status: PASS**

Requests with the same tenant, idempotency key, actor, and payload return the previously persisted job without creating a duplicate.

### AC3 — Conflicting requests are rejected

**Status: PASS**

Reusing an idempotency key with a different payload or actor produces an `IdempotencyConflictError`.

The original persisted job remains unchanged.

### AC4 — Idempotency keys are tenant-scoped

**Status: PASS**

Different tenants can independently create jobs using the same idempotency key.

The database uniqueness constraint applies to `(tenant_id, idempotency_key)`.

### AC5 — Concurrent requests do not create duplicate jobs

**Status: PASS**

Integration tests verify that eight concurrent requests with identical parameters result in exactly one newly created job and seven idempotent replays.

All requests resolve to the same persisted job ID.

### AC6 — Integration tests validate real PostgreSQL behavior

**Status: PASS**

All six PostgreSQL integration tests passed, covering job creation, idempotent replay, conflicting payloads, different actors, tenant-scoped uniqueness, and concurrent creation.

## Known Limitations

- HTTP endpoint integration and mapping `IdempotencyConflictError` to HTTP 409 are outside E3-S2.
- Authentication, authorization, and tenant membership enforcement belong to subsequent stories.
- Idempotency guarantees depend on PostgreSQL availability and the configured unique constraint.
- Worker execution, job leasing, and crash recovery are not implemented in this story.
- External side-effect idempotency requires additional safeguards.
- Integration tests require a running PostgreSQL database with development seed data.

## Final Result

**E3-S2 Status: DONE**
