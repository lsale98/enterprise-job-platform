# ADR-003 — Bounded Concurrency, Retry, and Cooperative Cancellation

| Field                 | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| Status                | Accepted for E2-S2 implementation                            |
| Date                  | 2026-10-20                                                   |
| Epic                  | E2 — Shared Contracts and Core Engine                        |
| User story            | E2-S2 — Core Processing Engine                               |
| Scope                 | `packages/engine/`                                           |
| Related ADR           | ADR-002 — Shared TypeScript Contracts and Runtime Validation |
| Verification evidence | `docs/evidence/engine/e2-s2-validation.md`                   |

## 1. Context

The Enterprise Job Platform must execute independent asynchronous operations without starting an unbounded number of simultaneous I/O requests. Some operations can fail transiently, while others should not be repeated. A caller must also be able to request cancellation.

Using `Promise.all(items.map(task))` immediately starts all tasks and does not enforce a concurrency limit. Executing tasks sequentially avoids this risk but unnecessarily reduces throughput for independent I/O operations. Retrying every failure can amplify outages or repeat irreversible side effects.

E2-S2 introduces a small, framework-independent processing engine. The HTTP API, database-backed worker, durable lease management, and distributed recovery are outside this story.

## 2. Decision drivers

- Enforce a validated upper bound on concurrently active asynchronous operations.
- Preserve input-to-output ordering, regardless of task completion order.
- Support a finite retry budget with exponential backoff and a configurable retry predicate.
- Support cooperative cancellation through `AbortSignal`.
- Keep the module reusable from the future API and worker without depending on their frameworks.
- Make behavior verifiable through deterministic and negative unit tests.
- Do not mistake cancellation, retries, or successful in-memory computation for durable job processing.

## 3. Alternatives considered

| Alternative                             | Advantages                                                            | Trade-offs                                           |
| --------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Sequential `for...of` + `await`         | Simple; one active operation at a time                                | Underutilizes independent I/O capacity               |
| `Promise.all(items.map(task))`          | Concise; fine for small, bounded inputs                               | Can start too many tasks; no concurrency control     |
| **Bounded asynchronous worker loop**    | Explicit limit; ordered results; small dependency-free implementation | Requires explicit failure and cancellation semantics |
| External queue / distributed job runner | Durability and horizontal worker scheduling                           | Out of scope until persistence and worker epics      |

## 4. Decision

Implement the reusable `@lab/engine` package under `packages/engine/` with the following rules:

1. **Bounded concurrency:** `mapConcurrent(items, limit, task, signal?)` validates that `limit` is a positive safe integer, schedules no more than `limit` simultaneous asynchronous tasks, and writes each result at its original input index.
2. **Failure behavior:** rejection of one scheduled task rejects the aggregate promise. Already-running tasks are **not** forcibly stopped by `Promise.all`; cooperative cancellation must be implemented and tested separately where required.
3. **Cancellation:** callers may supply `AbortSignal`. The scheduler checks it before scheduling the next item. A task already in progress can only be interrupted if the task itself supports cancellation. Cancellation is not equivalent to rolling back completed side effects.
4. **Retry:** `withRetry` enforces a finite `maxAttempts`, uses capped exponential backoff between attempts, and accepts a `retryable` predicate to distinguish transient from permanent failures.
5. **Retry safety:** retry must not be applied indiscriminately to operations that can create duplicate external side effects. Durable idempotency belongs to later persistence/API stories.
6. **Type safety:** job inputs depend on `@lab/contracts`. Type mappings and exhaustive handling prevent missing job types from silently falling through.
7. **Caching:** a bounded in-memory LRU/TTL cache may store non-authoritative derived data, never durable job status. It remains local to a process and is not shared between instances.

This decision applies to asynchronous in-process orchestration, not CPU-parallel execution or a distributed task queue.

## 5. Consequences

### Positive

- Controlled I/O concurrency reduces resource exhaustion risk.
- Results stay aligned to the original input order.
- Retry policies are explicit and testable.
- Cancellation can prevent additional work from being scheduled.
- The engine can be reused by multiple applications in the monorepo.

### Costs and risks

- A custom scheduler requires careful edge-case testing.
- Aggregate failure does not automatically terminate active tasks.
- Exponential retry may increase latency and load during outages.
- An in-memory cache is not durable or globally coherent.
- The engine does not by itself provide durable job guarantees, crash recovery, or tenant-level fairness.

## 6. Verification and acceptance evidence

From the repository root, after `pnpm install`:

```powershell
pnpm --filter @lab/contracts build
pnpm --filter @lab/engine build
pnpm --filter @lab/engine typecheck
pnpm --filter @lab/engine test
```

Tests must cover, at minimum:

- The observed peak number of active tasks never exceeds the configured limit.
- Results preserve input order even when tasks finish out of order.
- Invalid concurrency limits are rejected.
- Transient failures are retried within the configured maximum attempts.
- Permanent failures or exhausted attempts reject without further retries.
- Cancellation stops scheduling subsequent work, subject to cooperative task support.
- A deterministic job execution result is produced for the supported test payload.
- LRU eviction and TTL expiration behave as specified.

Record actual test counts, command outputs, Git revision, tool versions, and known limitations in `docs/evidence/engine/e2-s2-validation.md`. Do not label a check as passed until it has been executed successfully.

## 7. Revisit criteria

Reconsider this decision if production measurements reveal the need for fairness, task priorities, per-tenant quotas, shared rate limiting, CPU parallelism, a more sophisticated cancellation policy, or distributed orchestration. A replacement should be documented in a new ADR rather than rewriting historical decisions.

## 8. Traceability

- Epic: E2 — Shared Contracts and Core Engine
- Story: E2-S2 — Core Processing Engine
- Backlog: `docs/backlog/02-user-stories-and-tasks.md`
- Code: `packages/engine/`
- Shared dependency: `packages/contracts/` (E2-S1)
- Evidence: `docs/evidence/engine/e2-s2-validation.md`
- Prior decision: `docs/adr/002-shared-contracts-runtime-validation.md`
