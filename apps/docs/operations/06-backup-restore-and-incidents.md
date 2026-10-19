# Operations 06 — Backup, Restore, Incident Response and Runbooks

**Status:** Draft operational procedures; exercises required before production approval  
**Related backlog:** Epics 6, 7, 12

## Critical recovery goals

The team must agree on these objectives before production:

- **RPO (Recovery Point Objective):** Maximum tolerable data loss.
- **RTO (Recovery Time Objective):** Maximum tolerable recovery time.
- **Job recovery target:** Time to resume processing after worker failure.
- **Webhook delivery target:** Time to detect and restore failed delivery.

Numbers should be signed off by product and operations owners; no default production promise is made here.

## Backup strategy

- Schedule PostgreSQL backups using an approved mechanism.
- Encrypt data at rest and in transit, including backup artifacts.
- Keep backups outside the failure domain of the primary database.
- Define retention, access controls and deletion policy.
- Capture a record of schema version and deployment SHA alongside the backup.
- Do not place database dumps, credentials or private documents in public Git history.

## Restore exercise

1. Select a documented backup artifact and its schema version.
2. Provision a fresh, isolated recovery environment.
3. Restore the database using the approved restore procedure.
4. Verify row integrity for tenants, memberships, jobs, outbox and audit records.
5. Start the matching compatible application revision.
6. Validate authorized reads, job handling and outbox safety.
7. Record elapsed time, data correctness, failures and open issues.
8. Compare observed performance to agreed RPO/RTO.

A successful backup command alone is **not evidence of recoverability**. Only an actual restore and verification exercise demonstrates the intended recovery process.

## Incident runbook — Suspected tenant data exposure

- **Severity:** Critical until investigated.
- **Contain:** Disable affected paths, revoke exposed credentials/sessions if indicated, restrict access.
- **Preserve:** Retain security-relevant logs and timeline, while protecting sensitive data.
- **Investigate:** Identify identity subject, tenant scope, data accessed, root cause and duration.
- **Escalate:** Follow the organization's legal, security and notification procedures.
- **Recover:** Fix authorization boundary, add regression tests and independently verify.
- **Review:** Publish an appropriate internal postmortem with corrective actions.

## Incident runbook — Worker backlog not draining

1. Inspect job queue depth and oldest runnable job age.
2. Verify worker process health and database connectivity.
3. Check active leases, expired leases, retry attempts and DB locks.
4. Determine whether jobs are CPU-heavy, I/O-bound or blocked on an external dependency.
5. Restore processing without deleting evidence or blindly resetting job states.
6. Confirm jobs complete and queue age trends toward baseline.
7. Record the recovery command/procedure, duration and next action.

## Incident runbook — Webhook receiver outage

1. Check pending/dead outbox counts and delivery ages.
2. Inspect HTTP status, timeouts and receiver availability.
3. Avoid disabling idempotency or discarding pending delivery records.
4. Restore connectivity and allow bounded retries or a reviewed operator replay.
5. Confirm the receiver deduplicates repeated deliveries.
6. Review escalation and downstream notification requirements.

## Post-incident review template

```text
Incident ID / severity:
Start / detection / mitigation / resolution times:
Affected tenants or features (redacted if public):
Customer impact:
Timeline:
Contributing factors / root cause:
What worked / what failed:
Data integrity and recovery checks:
Follow-up tasks and owners:
Verification of permanent corrective actions:
```

## Public versus internal documentation

Public documentation may describe methods and redacted outcomes. Private operations repositories or approved security systems should hold actual production IP addresses, credentials, complete incident traces and sensitive vulnerability details.
