# E6-S1 — Global Multi-Tenant Worker Processing Validation Evidence

## Metadata

- Date: 2026-11-01
- Epic: E6 — Background Job Processing and Reliability
- Story: E6-S1 — Global Worker Processing
- Branch: `feat/e6-s1-worker-processing`
- Git revision: `be4721a`
- ADR: ADR-011 — Global Multi-Tenant Worker Processing and Lease Recovery
- Node version: v24.15.0
- pnpm version: 10.18.3
- Database: PostgreSQL in Docker, port 5432
- Development database: `lab`
- Integration database: `lab_test`

## Verification Results

| Command / Verification                             | Status |
| -------------------------------------------------- | ------ |
| `pnpm build`                                       | PASS   |
| `pnpm typecheck`                                   | PASS   |
| `pnpm lint`                                        | PASS   |
| `pnpm format:check`                                | PASS   |
| `pnpm test`                                        | PASS   |
| `pnpm --filter worker test`                        | PASS   |
| `pnpm --filter @lab/database build`                | PASS   |
| `pnpm --filter @lab/database test:integration`     | PASS   |
| `pnpm test:integration`                            | PASS   |
| `pnpm regression`                                  | PASS   |
| PostgreSQL global job claiming                     | PASS   |
| Concurrent worker claim protection                 | PASS   |
| Heartbeat and lease renewal                        | PASS   |
| Lease ownership and stale attempt protection       | PASS   |
| Job completion and failure persistence             | PASS   |
| Expired lease recovery                             | PASS   |
| Exhausted execution attempt recovery               | PASS   |
| Transactional audit persistence                    | PASS   |
| Integration test database isolation                | PASS   |
| Protection against development database cleanup    | PASS   |
| Tenant A and Tenant B report processing            | PASS   |
| Global worker execution without `WORKER_TENANT_ID` | PASS   |

## Acceptance Criteria

### AC1 — Global worker processes jobs across multiple tenants

**Status: PASS**

A dedicated worker application was implemented at:

`apps/worker/`

The worker uses a shared PostgreSQL-backed job queue and is not configured for a specific tenant.

The global claim operation is implemented at:

`packages/database/src/repositories/job/commands/claim-job.ts`

`ClaimJobParams` accepts the worker identifier and lease duration, without requiring a tenant identifier.

The claim operation returns the actual tenant context of the selected job.

The worker was validated using report jobs associated with two different tenants.

The same worker infrastructure processed jobs without requiring separate worker instances or tenant-specific configuration.

### AC2 — Concurrent workers cannot claim the same job

**Status: PASS**

The claim operation uses PostgreSQL:

`SELECT ... FOR UPDATE SKIP LOCKED`

An eligible job is selected and transitioned to `running` atomically.

The operation increments the execution attempt counter and assigns a new lease token.

The integration test `concurrent workers cannot claim the same job` completed successfully.

Concurrent workers therefore cannot successfully acquire the same job in the same execution attempt.

### AC3 — Worker concurrency is bounded

**Status: PASS**

The worker supports configurable execution concurrency through:

`WORKER_CONCURRENCY`

The configured value controls the maximum number of simultaneously active jobs within one worker process.

The runtime uses independent asynchronous processing slots.

The worker unit tests verify that execution concurrency does not exceed the configured limit.

Multiple worker processes can share the same PostgreSQL queue, with the database coordinating job ownership.

The concurrency setting applies per process, not as a platform-wide limit.

### AC4 — Lease ownership and heartbeat renewal are enforced

**Status: PASS**

Each successful claim generates a unique lease token.

The token identifies a specific execution attempt and is persisted in `jobs.lease_owner`.

The heartbeat implementation is located at:

`packages/database/src/repositories/job/commands/heartbeat-job.ts`

Heartbeat renewal requires a matching tenant, job, lease token, attempt number, and active lease.

The processing orchestrator prevents overlapping heartbeat operations and handles confirmed lease loss through cooperative cancellation.

Integration tests verified successful heartbeat renewal and rejection of stale execution ownership.

### AC5 — Successful job execution persists results

**Status: PASS**

The worker implements a report executor at:

`apps/worker/src/processing/executors/report.executor.ts`

The executor validates persisted inputs using shared contracts and calculates:

- Count.
- Sum.
- Average.

Successful execution is persisted using:

`packages/database/src/repositories/job/commands/complete-job.ts`

The operation transitions the job to `completed`, persists the execution result, and clears lease metadata.

A `job.completed` audit event is persisted within the same PostgreSQL transaction.

The report processing lifecycle was validated through the existing Fastify API and global worker.

### AC6 — Failed executions preserve lifecycle consistency

**Status: PASS**

The failure operation is implemented at:

`packages/database/src/repositories/job/commands/fail-job.ts`

When execution fails, the operation verifies the active lease and attempt before modifying job state.

The operation:

1. Transitions the job to `failed`.
2. Persists a bounded failure description.
3. Clears lease ownership and expiration.
4. Inserts a `job.failed` audit event.

The failure transition and audit insertion execute within the same PostgreSQL transaction.

Existing retry functionality from E5-S3 remains compatible with the worker execution lifecycle.

### AC7 — Stale workers cannot commit results

**Status: PASS**

Completion, failure, and heartbeat operations validate execution ownership before modifying persisted state.

The validation includes:

- Tenant identifier.
- Job identifier.
- Lease owner token.
- Execution attempt.
- Current job status.
- Lease expiration.

A stale execution attempt cannot complete a job after losing its lease.

Integration tests cover stale lease owners, stale attempts, and expired leases.

The lease-fencing mechanism protects PostgreSQL state transitions against outdated workers.

### AC8 — Expired jobs can be recovered

**Status: PASS**

The worker supports reclaiming abandoned running jobs after their leases expire.

Jobs with remaining execution attempts become eligible for a new claim.

A reclaimed job receives a new lease token, a new lease expiration, and an incremented execution attempt counter.

The integration test `expired jobs are reclaimed with a new lease` completed successfully.

Expired jobs with exhausted execution attempts are handled by:

`packages/database/src/repositories/job/commands/recover-exhausted-jobs.ts`

The recovery operation transitions exhausted jobs to terminal `failed` and records transactional audit events.

The integration test `exhausted jobs become failed after lease expiry` completed successfully.

### AC9 — Tenant isolation is preserved

**Status: PASS**

The existing Keycloak authentication and tenant-scoped RBAC mechanisms remain responsible for API authorization.

The worker operates globally but preserves the tenant identifier associated with each claimed job.

Subsequent persistence operations remain tenant-scoped.

The existing Keycloak test user `alice@example.test` was granted membership in a second tenant through the PostgreSQL membership model.

Authenticated API requests were submitted for two different tenants.

Report job processing was successfully validated for both tenants.

This confirms that global worker execution does not require globally shared user permissions or tenant-specific worker deployments.

### AC10 — Integration tests are deterministic and isolated

**Status: PASS**

The original integration tests assumed that `claimJob()` would return the job created by the current test.

After introducing global claiming, unrelated queued jobs could be selected, causing test failures.

To resolve this, integration testing was isolated using a dedicated PostgreSQL database:

`lab_test`

The development database remains:

`lab`

Integration tests use `TEST_DATABASE_URL`, while development services use `DATABASE_URL`.

A shared test helper was introduced at:

`packages/database/src/test-support/reset-job-queue.ts`

The helper validates the connected database before resetting job-related test data.

It refuses destructive cleanup when the connected database is not `lab_test`.

This protection was verified when the initial test configuration incorrectly connected to `lab`.

The integration runner was also updated to use:

`--test-concurrency=1`

This prevents independent test files from competing for the same global test queue.

After correcting the integration database connections, the complete integration test suite passed.

No manual queue cleanup is required before subsequent local test runs.

### AC11 — Existing functionality remains compatible

**Status: PASS**

The full regression suite was executed successfully.

The following existing functionality remains covered:

- Authenticated API operations.
- Tenant-scoped authorization.
- Idempotent job creation.
- Job listing and details.
- Retry and cancellation.
- Transactional audit events.
- PostgreSQL repository operations.
- Shared contract validation.
- Existing unit and integration tests.

The global worker implementation did not require restoring tenant-specific claim parameters or changing the existing E5-S3 retry and cancellation semantics.

### AC12 — Complete quality validation passes

**Status: PASS**

The following monorepo verification commands completed successfully:

```powershell
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:integration
pnpm regression
```

Worker-specific unit tests and database integration tests also completed successfully.

The complete validation confirms that the implementation builds, passes static checks, executes its automated tests, and remains compatible with previously implemented functionality.

## Known Limitations

- Only the `report` executor is implemented.
- The `import` and `notification` executors remain unimplemented.
- Per-tenant concurrency quotas are not implemented.
- Fair-share scheduling between tenants is not guaranteed.
- Worker concurrency is configured per process rather than globally.
- PostgreSQL polling introduces additional database activity.
- Lease-based recovery provides at-least-once execution semantics.
- Exactly-once external side effects are not guaranteed.
- External operations will require explicit idempotency mechanisms.
- A bounded shutdown deadline is not implemented.
- CPU-intensive execution may require additional process or thread isolation.
- Production load and stress testing have not been performed.
- Dedicated worker metrics, distributed tracing, and alerting are not implemented.
- The current integration test reset strategy requires exclusive use of `lab_test`.
- Parallel CI execution against a shared test database requires stronger isolation.
- The current E6-S1 tests do not establish complete production reliability under infrastructure failures.

## Final Result

**E6-S1 Status: VALIDATED WITH KNOWN LIMITATIONS**

The global multi-tenant worker has been implemented and validated.

The worker processes jobs from different tenants without requiring `WORKER_TENANT_ID`.

PostgreSQL provides atomic job claiming, execution ownership, lease fencing, and recovery coordination.

Heartbeat renewal, completion, failure handling, exhausted-attempt recovery, and transactional audit persistence are implemented and covered by automated tests.

The integration test infrastructure was corrected to use an isolated PostgreSQL database and deterministic test execution.

The worker was also validated through the existing authenticated Fastify API using report jobs from two different tenants.

All build, typecheck, formatting, linting, unit, integration, and regression checks passed.

The implementation consists of two separate commits: the main worker implementation and the integration test infrastructure addition.

The remaining limitations relate to additional business executors, tenant fairness, external side-effect idempotency, observability, and production-scale reliability testing.
