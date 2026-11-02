# E6-S2 — Worker Crash Recovery Validation Evidence

## Metadata

- Date: 2026-11-02
- Epic: E6 — Background Job Processing and Reliability
- Story: E6-S2 — Worker Crash Recovery
- Branch: `feat/e6-s2-crash-recovery`
- Git revision: `060fdc4`
- GitHub Actions run: https://github.com/lsale98/enterprise-job-platform/actions/runs/41466167146/job/125347520406?pr=16
- Node version: v24.15.0 (local); Node.js 24 (CI)
- pnpm version: 10.18.3

## Verification Results

| Command / Verification                  | Status          |
| --------------------------------------- | --------------- |
| `pnpm format:check`                     | PASS            |
| `pnpm lint`                             | PASS            |
| `pnpm build`                            | PASS            |
| `pnpm typecheck`                        | PASS            |
| `pnpm test`                             | PASS            |
| `pnpm --filter worker test`             | PASS            |
| `pnpm --filter worker test:integration` | PASS — 2 tests  |
| `pnpm test:integration`                 | PASS            |
| `pnpm regression`                       | PASS            |
| PostgreSQL integration tests            | PASS — 48 tests |
| Authentication integration tests        | PASS — 4 tests  |
| Worker process integration tests        | PASS — 2 tests  |
| Worker restart after forced termination | PASS            |
| Job recovery after worker crash         | PASS            |
| Expired lease reclamation               | PASS            |
| Stale execution ownership rejection     | PASS            |
| Recovered report result persistence     | PASS            |
| Recovery audit persistence              | PASS            |
| Sequential integration test execution   | PASS            |
| GitHub Actions CI Quality Gates         | PASS            |
| Linux CI compatibility                  | PASS            |

## Acceptance Criteria

### AC1 — Interrupted jobs become recoverable

**Status: PASS**

A process-level crash recovery integration test was implemented at:

`apps/worker/src/testing/crash-recovery/crash-recovery.integration.test.ts`

The test creates a report job in the isolated PostgreSQL `lab_test` database.

Worker A claims the queued job using the existing PostgreSQL repository implementation.

The persisted job transitions from `queued` to `running`, with execution attempt `1` and an active lease ownership token.

Worker A is then forcibly terminated before processing can complete.

The test verifies that the job remains in the `running` state and retains its original execution attempt and lease ownership.

The abandoned lease is explicitly expired through a test-only database operation.

Worker B is started using the normal production worker entry point.

Worker B successfully reclaims the expired job and completes its execution.

The test verifies that the execution attempt counter increases from `1` to `2`.

The complete recovery scenario passed locally and in GitHub Actions.

### AC2 — Stale workers cannot commit results

**Status: PASS**

The crash recovery test records the original lease ownership token assigned to Worker A.

After the lease expires, the test attempts to complete the job using the original token.

The existing `completeJob()` repository operation returns:

`lease_lost`

After Worker B successfully completes the recovered job, the test repeats the stale completion attempt using Worker A's original ownership token.

The second attempt is also rejected.

The persisted job remains `completed` with the correct result.

Existing PostgreSQL integration tests additionally verify rejection of:

- Incorrect lease ownership tokens.
- Stale execution attempts.
- Expired execution leases.
- Concurrent completion attempts.

The existing ownership fencing implementation was reused without introducing a parallel recovery mechanism.

### AC3 — Recovery respects attempt limits

**Status: PASS**

The recovered job initially has:

- Status: `running`.
- Execution attempt: `1`.
- Maximum attempts: `3`.

After Worker B reclaims the abandoned execution, the persisted attempt counter increases to `2`.

The job subsequently completes successfully.

Existing database integration tests verify that expired jobs with exhausted execution attempts transition to terminal `failed` status.

The existing `recoverExhaustedJobs()` repository operation remains responsible for terminal recovery.

No new retry counter or duplicated recovery state was introduced.

### AC4 — Concurrent recovery is safe

**Status: PASS**

Existing PostgreSQL integration tests verify that two concurrent worker claims cannot successfully acquire the same job.

The implementation relies on PostgreSQL atomic job claiming using `FOR UPDATE SKIP LOCKED`.

Recovered executions receive a new lease ownership token.

The process-level crash recovery test confirms that the original execution token is no longer authorized after recovery.

Existing database tests cover concurrent claiming and completion behavior.

The E6-S1 atomic claim and ownership fencing architecture remains unchanged.

### AC5 — Recovery preserves tenant isolation

**Status: PASS**

The crash recovery integration test creates an isolated tenant and associates a report job with that tenant.

The test verifies that tenant ownership is preserved during:

1. Initial job creation.
2. Worker A's execution claim.
3. Unexpected worker termination.
4. Lease expiration.
5. Worker B's recovery.
6. Successful job completion.

The recovered report produces the expected persisted result:

```json
{
  "count": 3,
  "sum": 6,
  "average": 2
}
```

The test verifies that audit data exists for the test tenant after recovery.

Existing database integration tests additionally validate global worker claiming across multiple tenants and tenant-scoped job operations.

### AC6 — Worker restart resumes processing

**Status: PASS**

A dedicated worker lifecycle integration test was implemented at:

`apps/worker/src/testing/crash-recovery/worker-lifecycle.integration.test.ts`

The test:

1. Starts a real worker process.
2. Verifies successful startup.
3. Forces unexpected process termination.
4. Confirms that the process terminated.
5. Starts a replacement worker process.
6. Verifies that the replacement worker starts successfully.

The test supports the different termination behaviors used by Windows and Linux.

On Linux, a process terminated with `SIGKILL` may report a null numeric exit code and a non-null signal code.

The lifecycle assertion was corrected to recognize either termination representation.

The corrected test passed locally and in GitHub Actions.

The separate job-level recovery test confirms that a restarted worker can also reclaim and complete previously interrupted work.

### AC7 — Failure injection is automated

**Status: PASS**

Deterministic failure-injection infrastructure was introduced under:

`apps/worker/src/testing/crash-recovery/`

The implementation consists of:

- `crash-worker.ts` — a test-only worker that performs a real PostgreSQL claim and deliberately blocks execution after claiming.
- `worker-process.ts` — starts, observes, and forcibly terminates worker subprocesses.
- `job-state.ts` — reads persisted PostgreSQL execution state and supports controlled lease expiration.
- `worker-lifecycle.integration.test.ts` — verifies process termination and restart.
- `crash-recovery.integration.test.ts` — verifies complete job recovery and ownership fencing.

The failure-injection worker reuses the existing worker runtime and PostgreSQL claim implementation.

No test-only behavior was introduced into the production `main.ts` entry point.

The test waits for a successful claim before terminating Worker A.

It verifies actual PostgreSQL state rather than relying exclusively on log output.

Lease expiration is controlled through an isolated test database operation to avoid unnecessary timing delays.

Both automated process-level integration tests passed locally and in the GitHub-hosted Linux environment.

### AC8 — Existing behavior remains compatible

**Status: PASS**

The existing monorepo quality checks completed successfully.

The validation included:

- Repository formatting.
- ESLint validation.
- Monorepo build.
- TypeScript typechecking.
- Unit tests.
- PostgreSQL integration tests.
- Authentication integration tests.
- Worker process integration tests.
- Existing regression checks.

The database integration suite passed all 48 tests.

The authentication integration suite passed all 4 tests.

The worker process integration suite passed both tests.

During development, parallel integration test execution exposed interference between independent suites sharing the global `lab_test` job queue.

Some existing database tests reset the shared job queue before execution.

The root `test:integration` command was updated to execute integration suites sequentially:

1. Authentication integration tests.
2. Database integration tests.
3. Worker crash recovery integration tests.

Worker unit tests and database-dependent integration tests were also separated into dedicated package scripts.

These changes resolved the observed test interference.

The existing GitHub Actions workflow already executes the root `pnpm test:integration` command, so no additional worker-specific workflow step was required.

The GitHub Actions CI Quality Gates workflow completed successfully for PR #16.

The successful run confirms that the E6-S2 tests execute correctly on the GitHub-hosted Linux environment.

## Known Limitations

- The process-level recovery test manually expires the lease to achieve deterministic execution; it does not measure real-world recovery latency.
- The process-level crash scenario currently covers `report` jobs.
- `import` and `notification` executors remain outside the current worker implementation.
- At-least-once execution can result in repeated processing attempts.
- Exactly-once external side effects are not guaranteed.
- Lease ownership fencing protects authoritative database state but cannot reverse external side effects already performed before a crash.
- Integration test suites share the `lab_test` PostgreSQL database and currently require sequential execution.
- Independent test databases or schemas would be necessary to safely parallelize these integration suites.
- PostgreSQL availability remains necessary for job recovery.
- The worker does not currently enforce a bounded graceful shutdown deadline.
- Production-scale load, soak, and infrastructure failure testing remain future work.
- Successful recovery under PostgreSQL outages and network partitions has not been separately validated.

## Final Result

**E6-S2 Status: VALIDATED WITH KNOWN LIMITATIONS**

Worker crash recovery and process restart have been implemented and successfully validated through automated integration tests.

The tests use real worker processes and a PostgreSQL test database.

The recovery scenario demonstrates that a job interrupted during execution remains persisted, becomes eligible for reclamation after lease expiration, and can be completed by another worker.

Recovered executions receive new ownership, execution attempts remain bounded, and stale ownership tokens cannot modify authoritative job results.

The recovered report completes successfully with the expected persisted result and associated tenant audit data.

The full local quality, integration, and regression checks passed.

Integration test execution was made sequential to prevent interference between suites sharing the same PostgreSQL job queue.

GitHub Actions CI Quality Gates also completed successfully for PR #16, confirming execution compatibility with the Linux CI environment.

All E6-S2 acceptance criteria have been validated within the documented scope.

Remaining limitations concern recovery latency measurement, external side-effect guarantees, shared test database isolation, bounded shutdown, and production-scale resilience testing.
