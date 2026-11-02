# ADR-011 — Global Multi-Tenant Worker Processing and Lease Recovery

| Field          | Value                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                                               |
| Date           | 2026-11-01                                                                                                             |
| Epic           | E6 — Background Job Processing and Reliability                                                                         |
| Story          | E6-S1 — Global Worker Processing                                                                                       |
| Scope          | Global job claiming, bounded concurrency, execution, heartbeat, lease fencing, crash recovery, and transactional audit |
| Related ADRs   | ADR-003, ADR-004, ADR-008, ADR-010                                                                                     |
| Implementation | `apps/worker/`, `packages/database/src/repositories/job/`                                                              |
| Validation     | Worker unit tests, database integration tests, multi-tenant API-to-worker execution, and monorepo regression           |
| Evidence       | `docs/evidence/worker/e6-s1-validation.md` — to be recorded after implementation commit                                |

## 1. Context

The Enterprise Job Platform supports authenticated, tenant-scoped job management through its Fastify API.

Existing functionality includes:

- Idempotent job creation.
- Tenant-scoped job listing and details.
- Job retry and cancellation.
- Runtime input validation.
- PostgreSQL persistence.
- Keycloak authentication and role-based authorization.
- Transactional business audit events.

Jobs are created through the API and stored in PostgreSQL without requiring the HTTP request to wait for execution.

A separate worker is responsible for performing background processing.

The initial design considered a worker bound to a specific tenant through `WORKER_TENANT_ID`.

That approach would require tenant-specific worker configuration and deployment, increasing operational complexity as the number of tenants grows.

The platform instead requires a shared worker architecture capable of processing jobs belonging to different tenants.

The worker must preserve tenant isolation while supporting concurrent execution, lease ownership, recovery, and horizontal scaling.

## 2. Decision Drivers

The solution must:

1. Support global background processing across multiple tenants.
2. Avoid tenant-specific worker instances.
3. Preserve tenant identity during job execution.
4. Prevent multiple workers from claiming the same job concurrently.
5. Support configurable, bounded execution concurrency.
6. Prevent stale execution attempts from modifying job state.
7. Recover jobs abandoned after worker failures.
8. Enforce maximum execution attempts.
9. Preserve transactional audit guarantees.
10. Keep business executors independent of worker orchestration.
11. Support dependency injection and isolated unit testing.
12. Reuse PostgreSQL without introducing unnecessary queue infrastructure.
13. Support repeatable integration tests against isolated test data.

## 3. Alternatives Considered

### 3.1 One Worker per Tenant

Each worker process would receive a tenant ID and process jobs belonging only to that tenant.

**Advantages**

- Simple tenant-specific scheduling.
- Direct tenant-to-worker mapping.

**Disadvantages**

- Additional deployments and configuration for every tenant.
- Inefficient resource allocation for tenants with low workloads.
- Increased operational complexity.
- Difficult capacity management as tenant counts grow.

**Decision:** Rejected.

### 3.2 External Message Broker

Use a dedicated queue infrastructure such as Redis with BullMQ or another message broker.

**Advantages**

- Specialized queue management.
- Additional scheduling capabilities.
- Independent messaging infrastructure.

**Disadvantages**

- Additional deployment and operational requirements.
- Additional persistence and consistency boundaries.
- Premature complexity for the current workload.

**Decision:** Deferred until measurable requirements justify it.

### 3.3 Global PostgreSQL-Backed Worker

Worker processes share a PostgreSQL-backed job queue and claim eligible jobs globally.

**Advantages**

- Reuses existing PostgreSQL infrastructure.
- Supports multiple tenants through shared workers.
- Supports transactional state transitions.
- Provides row-level locking and concurrency coordination.
- Can be scaled through multiple worker processes.

**Disadvantages**

- PostgreSQL handles both transactional persistence and queue coordination.
- Requires careful lease and recovery implementation.
- Polling adds database traffic.
- Tenant fairness is not guaranteed automatically.

**Decision:** Accepted.

## 4. Architectural Decision

Implement a dedicated Node.js worker application in:

`apps/worker`

The worker operates globally across the platform.

The worker does not require or accept `WORKER_TENANT_ID`.

Worker processes receive operational configuration only:

- `DATABASE_URL`
- `WORKER_CONCURRENCY`
- `WORKER_POLL_MS`
- `WORKER_LEASE_SECONDS`
- `WORKER_HEARTBEAT_MS`

Each worker uses the shared PostgreSQL job repository.

The architecture separates:

- Worker configuration.
- Dependency composition.
- Polling and concurrency management.
- Job processing orchestration.
- Business executors.
- Database lifecycle operations.

## 5. Global Job Claiming

Job claiming is implemented by:

`claimJob(pool, params)`

The operation accepts:

- `workerId`
- `leaseSeconds`

It does not accept `tenantId`.

The PostgreSQL claim query selects eligible jobs across all tenants.

A job may be claimed when:

- Its type has an implemented executor.
- It has remaining execution attempts.
- It is `queued` and available for execution.

Alternatively, an already running job may be reclaimed when:

- Its lease has expired.
- It has remaining execution attempts.

The implementation uses:

`SELECT ... FOR UPDATE SKIP LOCKED`

The selection and update happen atomically within the SQL statement.

The claim operation:

1. Selects an eligible job.
2. Locks the selected row.
3. Sets its status to `running`.
4. Increments its execution attempt counter.
5. Generates and assigns a new lease token.
6. Sets the lease expiration.
7. Returns the job with its actual tenant identifier and validated execution context.

The operation must prevent two concurrent claims from acquiring the same job in the same execution attempt.

## 6. Tenant Isolation

Global processing does not imply globally shared business data.

Every job belongs to a tenant through `tenant_id`.

The claimed job includes `tenantId`, which is preserved throughout processing.

All subsequent lifecycle operations use:

- `tenantId`
- `jobId`
- `leaseOwner`
- `attempt`

The Fastify API remains responsible for authenticating users and enforcing tenant-scoped access.

The worker is an internal execution service. It processes previously authorized and persisted jobs without requiring a user access token for each background execution.

Business executors must scope access to tenant-owned resources using the tenant identity attached to the claimed job.

No worker may interpret global queue access as permission to expose or combine tenant-owned business data.

## 7. Worker Concurrency

The worker uses a configurable number of asynchronous processing slots.

`WORKER_CONCURRENCY=4` permits up to four simultaneously active jobs within one worker process.

Multiple worker processes may be deployed against the same database.

For example, three workers configured with concurrency four provide a maximum of twelve active job executions, subject to infrastructure limits.

PostgreSQL coordinates job ownership across processes.

Concurrency slots independently claim and process jobs.

The worker must not introduce unbounded task execution.

Concurrency does not guarantee parallel execution of CPU-intensive JavaScript code. CPU-heavy operations may later require worker threads, subprocesses, or dedicated compute services.

## 8. Lease Ownership and Fencing

Each successful claim generates a new unique lease token.

The token is persisted in `jobs.lease_owner`.

The token identifies one execution attempt, not the worker process permanently.

Completion, failure, and heartbeat operations must verify:

- The correct tenant.
- The correct job.
- The current lease token.
- The current execution attempt.
- The `running` status.
- An unexpired lease.

A worker that has lost its lease may no longer modify the persisted job state.

If an expired job is reclaimed, the new execution receives a new lease token and incremented attempt counter.

This prevents the previous execution attempt from committing its result.

Lease fencing protects PostgreSQL state transitions.

It does not guarantee that external operations, such as sending emails or calling third-party APIs, are executed exactly once.

Those operations require separate idempotency guarantees.

## 9. Heartbeat

Active jobs extend their leases through:

`heartbeatJob()`

The worker periodically invokes heartbeat while processing is active.

Heartbeat succeeds only if the current execution retains valid lease ownership.

If the lease is lost, the worker must not intentionally commit its execution result.

The processing orchestrator uses an `AbortController` to signal cancellation to cooperative executors.

Only one heartbeat operation may be in flight for an execution.

The heartbeat interval must be less than half the configured lease duration.

A heartbeat error must not be interpreted as confirmation that the worker still owns the job.

## 10. Job Completion

Successful execution is persisted through:

`completeJob()`

The command must:

1. Validate active lease ownership.
2. Persist the result.
3. Transition the job to `completed`.
4. Clear `lease_owner` and `lease_until`.
5. Insert a `job.completed` audit event.

The job update and audit insertion happen in the same PostgreSQL transaction.

If lease ownership is invalid, the command returns `lease_lost` without completing the job.

If audit insertion fails, the state transition must roll back.

## 11. Job Failure

Executor failures are persisted through:

`failJob()`

The command must:

1. Validate active lease ownership.
2. Store a bounded error description.
3. Transition the job to `failed`.
4. Clear lease metadata.
5. Insert a `job.failed` audit event.

The failure transition and audit insertion are transactional.

An explicit executor failure is not automatically retried by the worker.

Retrying failed jobs remains governed by the existing E5-S3 retry lifecycle.

## 12. Execution Attempt Budget

The `attempts` column records the number of started execution attempts.

The counter increments when a job is claimed.

The `max_attempts` column defines the permitted execution budget.

Jobs must not be reclaimed when their attempt budget is exhausted.

The existing E5-S3 retry API remains compatible with this model.

Retries must not reset execution attempt counters.

The system distinguishes between:

- Explicit executor failures.
- Running jobs abandoned because a worker terminated or lost its lease.

These scenarios follow different recovery paths.

## 13. Crash Recovery

The worker must recover running jobs whose leases have expired.

### 13.1 Recoverable Jobs

An expired running job with remaining attempts becomes eligible for a new global claim.

The claim operation assigns:

- A new lease token.
- A new lease expiration.
- An incremented attempt number.

The previous execution attempt is fenced out.

### 13.2 Exhausted Jobs

An expired running job with no remaining attempts is handled by:

`recoverExhaustedJobs()`

The operation:

1. Selects expired jobs with exhausted attempt budgets.
2. Acquires row-level locks.
3. Transitions them to `failed`.
4. Clears lease metadata.
5. Records `job.failed` audit events.
6. Commits the recovery changes transactionally.

Recovery operates globally across all tenants.

Multiple recovery processes may run concurrently using PostgreSQL row locking.

## 14. Business Executor Architecture

The worker separates execution orchestration from business logic.

Execution dispatch is implemented through:

`executeJob()`

The initial supported executor is:

`report`

The report executor:

- Validates persisted input using shared Zod contracts.
- Calculates count, sum, and average.
- Returns the result for persistence by the processing orchestrator.

The platform also defines job types:

- `import`
- `notification`

However, the current worker does not implement their real business executors.

Therefore, the global claim query selects only implemented job types.

Unsupported jobs must not be falsely marked as completed.

New executors require explicit implementation and integration testing.

## 15. Dependency Injection and Composition

The worker follows dependency injection principles.

The runtime depends on contracts for:

- Claiming jobs.
- Processing jobs.
- Recovering exhausted jobs.

The processing orchestrator depends on contracts for:

- Executing business logic.
- Sending heartbeats.
- Completing jobs.
- Failing jobs.

Concrete database implementations are connected in:

`apps/worker/src/composition/create-worker.ts`

A shared PostgreSQL connection pool is created for the worker process.

Unit tests may replace dependencies with controlled test implementations.

SQL lifecycle operations remain owned by `@lab/database`.

Existing shared types must be reused rather than duplicated in the worker.

## 16. Application Structure

```text
apps/worker/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts
    ├── config/
    │   ├── worker.config.ts
    │   └── worker.config.test.ts
    ├── composition/
    │   └── create-worker.ts
    ├── runtime/
    │   ├── run-worker.ts
    │   └── run-worker.test.ts
    └── processing/
        ├── processing.types.ts
        ├── process-job.ts
        ├── process-job.test.ts
        └── executors/
            ├── execute-job.ts
            ├── report.executor.ts
            └── report.executor.test.ts
```

Database lifecycle commands:

```text
packages/database/src/repositories/job/
├── job.repository.ts
└── commands/
    ├── claim-job.ts
    ├── heartbeat-job.ts
    ├── complete-job.ts
    ├── fail-job.ts
    └── recover-exhausted-jobs.ts
```

Test infrastructure:

```text
packages/database/src/
├── test-support/
│   └── reset-job-queue.ts
└── repositories/job/
    ├── job-execution.repository.integration.test.ts
    └── job-worker.repository.integration.test.ts
```

## 17. Graceful Shutdown

The worker responds to `SIGINT` and `SIGTERM`.

Shutdown:

1. Stops initiating new polling iterations.
2. Stops acquiring additional jobs where possible.
3. Allows already claimed jobs to finish.
4. Keeps their lease management active while processing continues.
5. Closes PostgreSQL connections when processing has stopped.

If the process is forcibly terminated, unfinished jobs remain in PostgreSQL.

Their leases eventually expire and recovery rules apply.

The current implementation does not enforce a bounded shutdown deadline.

A production deployment must define appropriate termination grace periods and forced-shutdown behavior.

## 18. Integration Test Strategy

Global job claiming requires deterministic test conditions.

Tests must not assume that a newly created job will be selected while unrelated eligible jobs exist.

A dedicated PostgreSQL test database is used:

`lab_test`

The development database remains:

`lab`

Both databases run on the existing Docker PostgreSQL service.

Integration tests must use:

`TEST_DATABASE_URL`

Development services continue using:

`DATABASE_URL`

A shared integration-test helper resets job-related test data only when the connected database is the explicitly permitted test database.

It must reject attempts to reset the development database.

The integration-test runner executes test files sequentially to prevent independent suites from concurrently changing the shared global queue.

Within individual test cases, concurrent database operations remain supported for locking and race-condition validation.

The test environment must not have an independently running worker connected to the same test queue.

This arrangement provides repeatable local testing without requiring manual deletion of job records through pgAdmin.

The current reset strategy assumes an exclusively owned test database. Parallel CI execution requires stronger isolation, such as separate databases per independent test process.

## 19. Verification

E6-S1 validation covers:

- Worker application build.
- TypeScript type checking.
- ESLint and formatting checks.
- Worker unit tests.
- Global job claiming.
- Concurrent claim safety.
- Heartbeat renewal.
- Completion and failure persistence.
- Lease fencing.
- Execution attempt validation.
- Expired lease recovery.
- Exhausted attempt recovery.
- Transactional audit behavior.
- Tenant isolation.
- Compatibility with E5-S3 retry.
- Existing database integration regression.
- Processing report jobs for two tenants through the existing API and the same global worker.

The integration-test configuration was corrected so tests consistently use the dedicated `lab_test` database instead of the development `lab` database.

The user-validated integration run completed successfully after this correction.

Detailed command results, test counts, and the implementation Git revision belong in the E6-S1 evidence document.

## 20. Consequences

### Positive

- One worker deployment supports all tenants.
- No tenant-specific worker configuration is required.
- Worker processes can scale horizontally.
- PostgreSQL coordinates concurrent claims.
- Tenant context is preserved.
- Stale workers cannot commit invalid database transitions.
- Expired jobs can be recovered.
- Exhausted attempts reach terminal failure.
- Lifecycle audit events remain transactionally consistent.
- Worker components support dependency injection and isolated testing.
- Integration tests no longer require manual queue cleanup.

### Trade-offs

- PostgreSQL is responsible for both job persistence and queue coordination.
- Polling creates additional database activity.
- Shared worker capacity may be dominated by one tenant.
- Lease-based execution provides at-least-once processing, not exactly-once side effects.
- Long-running tasks require reliable heartbeat management.
- Test database ownership must remain exclusive during queue reset operations.
- Current executors cover only part of the defined job contract.

## 21. Known Limitations

The following capabilities are not part of the accepted E6-S1 implementation:

- Per-tenant concurrency limits.
- Guaranteed fair-share scheduling.
- Job priorities.
- Real import processing.
- Real notification delivery.
- Transactional outbox dispatch.
- Exactly-once external side effects.
- Production worker metrics and distributed tracing.
- Bounded shutdown deadlines.
- Production load and stress validation.

These require separate implementation and verification.

## 22. Revisit Criteria

Revisit this ADR when:

- PostgreSQL queue contention becomes a measurable limitation.
- The platform requires guaranteed processing capacity per tenant.
- CPU-intensive workloads require process or thread isolation.
- High-volume delayed scheduling becomes a significant requirement.
- Dedicated messaging infrastructure provides measurable operational benefits.
- Tenant-specific resource quotas become necessary.
- External integrations require stronger delivery and deduplication guarantees.

Future changes must be recorded through a new ADR or a clearly documented amendment.

## 23. Outcome

**Accepted: Global PostgreSQL-backed background worker with bounded concurrency, tenant-scoped execution context, atomic claiming, unique lease tokens, heartbeat renewal, fencing, crash recovery, and transactional lifecycle auditing.**

The worker is shared across the platform and does not require `WORKER_TENANT_ID`.

The implementation establishes reusable background processing infrastructure for subsequent business functionality without coupling worker deployment to individual tenants.
