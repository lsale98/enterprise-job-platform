# ADR-013 — Transactional Webhook Outbox and Reliable Delivery

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Status                | Accepted for E7-S1 implementation                                  |
| Date                  | 2026-11-02                                                         |
| Epic                  | E7 — Notifications and Webhook Delivery                            |
| User story            | E7-S1 — Transactional Webhook Outbox                               |
| Scope                 | `packages/database/`, `apps/worker/`                               |
| Related ADR           | ADR-011 — Global Multi-Tenant Worker Processing and Lease Recovery |
| Verification evidence | `docs/evidence/webhooks/e7-s1-validation.md`                       |

## 1. Context

The Enterprise Job Platform executes background jobs asynchronously. Job completion and failure are persisted in PostgreSQL.

External systems need reliable notification when relevant job lifecycle events occur.

Sending an HTTP webhook directly inside job execution creates a dual-write problem. A database transaction may succeed while the HTTP request fails, or an HTTP request may succeed before the database transaction rolls back.

A reliable delivery mechanism must preserve committed events, support retries, isolate tenants, and authenticate outgoing requests.

E7-S1 introduces a PostgreSQL transactional outbox and an independently scheduled webhook dispatcher.

Browser notifications and dashboard state updates belong to E8 and are not delivered directly through external webhooks.

## 2. Decision drivers

- Persist webhook events atomically with their originating job state transitions.
- Prevent network requests from blocking job completion transactions.
- Support safe concurrent dispatchers.
- Retry transient delivery failures with bounded attempts.
- Persist delivery attempts and errors.
- Sign outbound requests using HMAC-SHA256.
- Preserve stable event identifiers across retries.
- Isolate webhook destinations and events by tenant.
- Protect against SSRF and accidental secret disclosure.
- Reuse the existing PostgreSQL infrastructure and TypeScript modules.
- Provide deterministic unit and integration tests.

## 3. Alternatives considered

| Alternative                          | Advantages                                                            | Trade-offs                                                                       |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Direct HTTP delivery from the worker | Minimal implementation                                                | Network failure can interrupt execution; database and HTTP writes are not atomic |
| In-memory event queue                | Low overhead                                                          | Events disappear after process termination                                       |
| External message broker              | Dedicated delivery infrastructure and scaling options                 | Additional services, operations, and transaction coordination                    |
| **PostgreSQL transactional outbox**  | Durable events, transactional consistency, reuse of existing database | Requires dispatch scheduling, retry management, and cleanup                      |

## 4. Decision

Use PostgreSQL as the authoritative webhook event outbox.

1. **Atomic persistence:** Successful or failed job transitions insert the corresponding outbox event in the same transaction. A rollback must remove both changes.

2. **Delivery separation:** Webhook HTTP requests execute outside job state transactions. The dispatcher is responsible for delivery, not the report executor.

3. **Stable identity:** Every event has a stable identifier used across all delivery attempts. Receivers are expected to deduplicate by event identifier.

4. **Concurrent claims:** Dispatchers use PostgreSQL atomic claiming and ownership leases to avoid simultaneous ownership of the same delivery attempt.

5. **Bounded retries:** Retryable failures use capped exponential backoff and a finite attempt budget. Exhausted deliveries enter a terminal failure state.

6. **HTTP semantics:** Successful 2xx responses confirm delivery. Non-success responses follow an explicit retry policy. Request timeouts are mandatory.

7. **HMAC authentication:** Outgoing messages include an HMAC-SHA256 signature over a canonical representation containing a timestamp and the exact transmitted payload bytes.

8. **Secret isolation:** Signing secrets are never included in webhook payloads, application logs, API responses, or evidence files. Secrets must be stored and accessed through an explicitly authorized configuration boundary.

9. **Tenant isolation:** Destinations, delivery records, and event payloads retain the originating tenant. A dispatcher must not deliver one tenant's event to another tenant's destination.

10. **Endpoint security:** Destination validation must mitigate SSRF, including private network access, loopback addresses, metadata endpoints, unsafe redirects, and DNS resolution changes.

11. **At-least-once delivery:** Delivery may be repeated after process interruption. Exactly-once delivery is not promised; receivers must handle duplicate event identifiers.

12. **Separation of responsibilities:** SQL state transitions belong in `packages/database`; delivery scheduling, HTTP transport, and cryptographic signing belong in dedicated modules under `apps/worker`.

13. **Schema compatibility:** Existing notification and outbox tables must be reviewed before adding migrations. No unrelated notification flow may be silently repurposed.

## 5. Consequences

### Positive

- Committed lifecycle events remain durable.
- HTTP failures do not roll back completed job execution.
- Worker and webhook dispatch responsibilities remain independent.
- Delivery attempts can be inspected and retried.
- HMAC signatures allow receivers to authenticate requests.
- PostgreSQL coordinates concurrent dispatchers.
- Tenant boundaries can be tested at persistence and delivery layers.

### Costs and risks

- Additional PostgreSQL writes and scheduled queries are required.
- A dispatcher must be deployed and monitored.
- At-least-once delivery can produce duplicate HTTP requests.
- External receivers require event deduplication.
- Outbox records require retention and cleanup policies.
- Webhook secrets require rotation and secure storage.
- Untrusted destinations create SSRF and data-exfiltration risks.
- PostgreSQL outages also interrupt event dispatch.

## 6. Verification and acceptance evidence

From the repository root:

```powershell
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
pnpm regression
```

Tests must cover, at minimum:

- A completed job and its outbox event commit atomically.
- Transaction rollback leaves neither a completion event nor an inconsistent job transition.
- A failed job creates the appropriate event atomically.
- Webhook requests are signed deterministically.
- Invalid signatures and modified payloads are rejected.
- Timestamp validation prevents acceptance outside the configured replay window.
- A stable event identifier is reused during retries.
- Concurrent dispatchers do not claim the same active delivery.
- Transient failures are retried within the configured attempt budget.
- Exhausted deliveries transition to terminal failure.
- Tenant destinations and events remain isolated.
- Unsafe destinations are rejected before outbound HTTP requests.
- Existing worker and database regression checks remain successful.

Record actual test results, Git revision, environment versions, acceptance criterion statuses, and known limitations in:

`docs/evidence/webhooks/e7-s1-validation.md`

Do not mark any check as passed before executing it successfully.

## 7. Revisit criteria

Reconsider this decision if measured delivery throughput, queue contention, latency, or operational requirements justify a dedicated broker.

Revisit the signing protocol if interoperable webhook standards or secret rotation requirements change.

Revisit retry policies when external destinations introduce rate limits, long outages, or contractual delivery deadlines.

Significant changes must be documented in a new ADR rather than rewriting this decision silently.

## 8. Traceability

- Epic: E7 — Notifications and Webhook Delivery
- Story: E7-S1 — Transactional Webhook Outbox
- Backlog: `docs/backlog/02-user-stories-and-tasks.md`
- Database schema: `packages/database/migrations/`
- Job lifecycle persistence: `packages/database/src/repositories/job/commands/`
- Worker application: `apps/worker/`
- Webhook signing: `apps/worker/src/webhooks/`
- Evidence: `docs/evidence/webhooks/e7-s1-validation.md`
- Previous story: E6-S2 — Worker Crash Recovery
- Previous decision: ADR-012 — Worker Crash Recovery and Deterministic Failure Injection
