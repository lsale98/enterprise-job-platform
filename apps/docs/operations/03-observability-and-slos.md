# Operations 03 — Observability, Service Levels and Alerting

**Status:** Proposed instrumentation and SLO plan  
**Related backlog:** Epics 6, 11, 12

## Objectives

The operating team must be able to answer:

- Is the service available to authorized users?
- Are jobs waiting, executing, failing or becoming stuck?
- Are outbound notifications reaching their receivers?
- Is a specific failure caused by the API, database, worker, identity provider or AI model?
- What changed between healthy and degraded behavior?

## Core telemetry

| Layer | Signals | Example reason to alert |
| --- | --- | --- |
| Web | Page errors, user-visible failure rate, server render timings | Operators cannot complete key workflow |
| API | HTTP response counts by class, p50/p95/p99 latency, saturation | Error rate grows or latency violates SLO |
| PostgreSQL | Active connections, slow queries, lock waits, storage, replication/backup health | Slow or unavailable persistence |
| Worker | Queue depth, oldest waiting job, lease expiration, attempts, job duration | Backlog grows or jobs stop completing |
| Dispatcher | Pending/dead outbox messages, delivery age, retry volume | Notifications cannot be delivered |
| Auth | Login failures, token validation errors, forbidden access trends | Identity outage or abuse spike |
| AI | Retrieval timing, inference duration, evidence abstention rate, model version | AI quality or latency degrades |
| Runtime | CPU%, RSS/heap, GC pauses, event loop delay, restarts | Resource exhaustion / memory leak |

## Structured logs

Recommended common fields:

- timestamp
- service and environment
- severity
- request ID / correlation ID
- job ID where relevant
- tenant identifier where permitted and appropriately protected
- event name and error classification
- build version / commit SHA

Never log raw authorization tokens, passwords, session cookies, unredacted sensitive job payloads or complete private AI documents.

## Example SLO proposal (not yet adopted)

| Service journey | Candidate SLI | Candidate objective |
| --- | --- | --- |
| Job submission | Valid authenticated requests that receive expected response | Agree after staging baseline |
| Job completion | Eligible jobs completed within job-type deadline | Define per job type |
| Job queue | Age of oldest runnable queued job | Define from business urgency |
| Dashboard | Successful authorized job list requests | Agree after load baseline |
| Notification delivery | Messages delivered within defined retry window | Negotiate per receiver contract |

**No numerical targets are declared as achieved here.** Define thresholds with the Product Owner and SRE based on business requirements and representative measurements.

## Health checks

- **Liveness:** Can this process respond / make progress?
- **Readiness:** Can this service safely receive relevant traffic, including mandatory dependencies?
- **Functional smoke:** Can an authorized user submit and observe a completed job?

A simple `/health/live` response does not prove database, auth, tenant checks or worker reliability.

## Alert response model

- Severity 1: Critical business workflows unavailable or suspected cross-tenant data exposure.
- Severity 2: Sustained errors, large queue backlog or broken notification delivery.
- Severity 3: Recoverable degradation, intermittent latency, noncritical alert.

Each alert should link to a runbook, owner, dashboard/query and escalation policy. See [Incidents and recovery](06-backup-restore-and-incidents.md).
