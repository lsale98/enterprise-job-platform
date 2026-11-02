# ADR-012 — Worker Crash Recovery and Deterministic Failure Injection

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Status                | Accepted for E6-S2 implementation                                  |
| Date                  | 2026-11-02                                                         |
| Epic                  | E6 — Background Job Processing and Reliability                     |
| User story            | E6-S2 — Worker Crash Recovery                                      |
| Scope                 | `apps/worker/`, `packages/database/`                               |
| Related ADR           | ADR-011 — Global Multi-Tenant Worker Processing and Lease Recovery |
| Verification evidence | `docs/evidence/worker/e6-s2-validation.md`                         |

## 1. Context

E6-S1 established a dedicated global worker that processes background jobs across multiple tenants using PostgreSQL as the authoritative queue and execution state store.

The existing implementation includes atomic job claiming, bounded concurrency, execution leases, heartbeat renewal, unique ownership tokens, attempt tracking, stale-worker protection, and recovery of exhausted jobs.

These mechanisms provide the foundation for reliable processing but do not, by themselves, prove that the system behaves correctly when a worker terminates unexpectedly.

A worker may crash after claiming a job but before persisting its result. The job remains in the `running` state until its lease expires. Another worker must then be able to reclaim it without manual database intervention.

Recovery introduces additional concurrency risks. A previous worker may resume after its lease expires, while a different worker has already claimed the same job. Both executions may have performed work, but only the current lease owner may persist authoritative job state.

E6-S2 validates and strengthens the recovery guarantees introduced in E6-S1. The existing PostgreSQL queue architecture remains unchanged.

## 2. Decision drivers

- Recover interrupted jobs without manual database updates.
- Prevent jobs from remaining permanently unclaimable after worker crashes.
- Preserve atomic claiming across independent worker processes.
- Reject completion, failure, or heartbeat operations from stale execution attempts.
- Respect the configured maximum execution attempts.
- Transition exhausted jobs to terminal failure.
- Preserve tenant ownership and transactional audit consistency.
- Support recovery after unexpected process termination and subsequent restart.
- Verify recovery through deterministic automated tests.
- Avoid duplicating existing E6-S1 repository operations and shared types.
- Keep database state transitions separate from worker lifecycle orchestration.
- Explicitly document at-least-once execution and external side-effect risks.

## 3. Alternatives considered

| Alternative                                              | Advantages                                                                                    | Trade-offs                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| In-memory recovery tracking                              | Simple process-local bookkeeping                                                              | Recovery state disappears when the worker crashes; cannot coordinate independent workers                     |
| Dedicated recovery service with a separate queue         | Independent recovery scheduling and potential broker-specific features                        | Adds infrastructure, duplicates existing PostgreSQL queue responsibilities, increases operational complexity |
| **Extend and verify existing PostgreSQL lease recovery** | Reuses atomic claims, ownership fencing, persisted attempts, and existing worker architecture | Requires careful concurrency handling, deterministic tests, and explicit at-least-once semantics             |
| Manual recovery through administrative database updates  | No additional application-level recovery code                                                 | Operationally fragile, slow, difficult to audit, and unsuitable for unattended processing                    |

## 4. Decision

Retain the PostgreSQL lease-based execution model introduced by ADR-011 and validate its behavior under worker crashes, lease expiration, concurrent recovery, and process restarts.

The following rules apply:

1. **Authoritative state:** PostgreSQL remains the source of truth for job status, attempts, lease ownership, lease expiration, results, and audit events. In-memory worker state must not determine durable recovery eligibility.

2. **Lease expiration:** A `running` job with an expired lease becomes eligible for another claim when attempts remain. Recovery must not require the original worker to release its lease.

3. **Atomic reclamation:** Existing claim operations must coordinate concurrent workers through PostgreSQL row locking and conditional updates. Recovery must not introduce a separate in-memory ownership mechanism.

4. **Ownership fencing:** Every heartbeat, completion, and failure operation must verify the active execution ownership. Reclaimed jobs receive new ownership tokens. Previous attempts must not mutate authoritative job state.

5. **Bounded attempts:** Recovery must honor the persisted attempt budget. An expired execution with exhausted attempts must transition to terminal failure rather than repeatedly restarting.

6. **Worker restart:** A newly started worker must be able to discover and process eligible queued or expired jobs without administrative intervention.

7. **Tenant isolation:** Reclamation must preserve the original `tenant_id`. Persisted results and audit events must remain associated with the correct job and tenant.

8. **Transactional consistency:** Recovery-related state transitions and required audit persistence must retain their existing transaction guarantees. Partial updates must not leave inconsistent authoritative state.

9. **Deterministic failure injection:** Automated integration tests must construct controlled interrupted-execution scenarios and verify persisted recovery outcomes. Tests must not depend exclusively on unreliable manual termination timing.

10. **Process-level validation:** In addition to repository integration tests, the worker lifecycle must be checked for unexpected termination and restart behavior. Repository tests alone do not demonstrate process recovery.

11. **At-least-once execution:** Recovered jobs may execute more than once. Ownership fencing protects database state but does not undo external side effects. Future external executors must implement appropriate idempotency or reconciliation.

12. **Responsibility boundaries:** Database recovery operations remain in `packages/database`. Worker polling, execution coordination, heartbeat scheduling, and shutdown remain in `apps/worker`. Existing contracts and types must be reused.

E6-S2 must extend existing implementations only where the verification exposes missing behavior. It must not create a second job queue or duplicate the E6-S1 recovery mechanisms.

## 5. Consequences

### Positive

- Interrupted jobs can be recovered without manual intervention.
- Worker crashes do not permanently reserve jobs.
- Ownership fencing protects authoritative execution results.
- Concurrent workers can safely coordinate through PostgreSQL.
- Execution attempts remain bounded.
- Recovery preserves existing tenant isolation.
- Deterministic integration tests provide repeatable regression coverage.
- Existing worker and database abstractions remain reusable.
- No additional message broker is required.

### Costs and risks

- Recovery is delayed until the previous lease expires.
- Short lease durations can cause unnecessary retries and ownership contention.
- Long lease durations increase recovery latency.
- At-least-once execution permits duplicate processing.
- Database ownership fencing cannot reverse external side effects.
- PostgreSQL availability remains necessary for recovery.
- Repeated worker crashes may exhaust the retry budget.
- Long-running operations must maintain heartbeats correctly.
- Process termination may interrupt operations that do not support cooperative cancellation.
- Future executors require individual idempotency assessments.

## 6. Verification and acceptance evidence

From the repository root, after building the required workspace packages:

```powershell
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter worker test
pnpm --filter @lab/database test:integration
pnpm test:integration
pnpm regression
```

Tests must cover, at minimum:

- A job interrupted during execution remains persisted in `running` until recovery becomes eligible.
- An expired execution with remaining attempts can be reclaimed.
- Reclamation assigns a new execution ownership token.
- The previous execution cannot successfully complete the reclaimed job.
- The previous execution cannot successfully fail the reclaimed job.
- A stale heartbeat cannot extend an execution lease after ownership changes.
- Two concurrent claims cannot successfully acquire the same job attempt.
- Attempt counters increase consistently during reclamation.
- Jobs with exhausted attempts transition to terminal failure.
- Recovery preserves tenant identity and audit consistency.
- Restarting a worker resumes processing eligible jobs without manual database updates.
- Existing E6-S1 processing behavior remains compatible.
- Existing API, database, worker, and regression tests remain successful.
- The GitHub Actions CI Quality Gates workflow completes successfully.

Deterministic PostgreSQL integration tests must verify persisted state rather than relying exclusively on mocked repository behavior.

A separate process-level failure test must establish whether restarting the worker restores processing after unexpected termination.

Record actual test counts, command outputs, implementation Git revision, Node.js and pnpm versions, acceptance criterion statuses, and known limitations in:

`docs/evidence/worker/e6-s2-validation.md`

Do not mark a check as passed until it has been executed successfully.

## 7. Revisit criteria

Reconsider this decision if production measurements reveal unacceptable recovery latency, PostgreSQL queue contention, recurring heartbeat failures, excessive retry amplification, distributed scheduling unfairness, or the need for dedicated dead-letter processing.

A dedicated message broker may be justified when operational requirements exceed the suitability of PostgreSQL lease-based execution.

Additional coordination may be necessary when side-effecting executors require stronger delivery or deduplication guarantees.

A replacement architecture must be documented through a new ADR rather than silently rewriting ADR-011 or ADR-012.

## 8. Traceability

- Epic: E6 — Background Job Processing and Reliability
- Story: E6-S2 — Worker Crash Recovery
- Backlog: `docs/backlog/02-user-stories-and-tasks.md`
- Worker application: `apps/worker/`
- Database package: `packages/database/`
- Job repositories: `packages/database/src/repositories/job/`
- Shared contracts: `packages/contracts/`
- Evidence: `docs/evidence/worker/e6-s2-validation.md`
- Prior decision: `docs/adr/011-global-multi-tenant-worker-processing-and-lease-recovery.md`
- Previous story: E6-S1 — Global Multi-Tenant Worker Processing
