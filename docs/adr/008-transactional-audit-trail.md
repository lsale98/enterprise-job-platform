# ADR-008 — Platform-Wide Audit Architecture

| Field                 | Value                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Accepted for E5-S1A implementation                                                                                                 |
| Date                  | 2026-10-23                                                                                                                         |
| Epic                  | E5 — Job Management API                                                                                                            |
| User story            | E5-S1A — Transactional Job Creation Audit Trail                                                                                    |
| Scope                 | Platform-wide audit architecture; initial implementation of `job.created`                                                          |
| Related ADRs          | ADR-004 — PostgreSQL Transactional Persistence; ADR-006 — Tenant RBAC; ADR-007 — HTTP API Architecture and Idempotent Job Creation |
| Verification evidence | `docs/evidence/database/e5-s1a-validation.md`                                                                                      |

## 1. Context and problem

The Enterprise Job Platform requires durable, trustworthy records of important business operations and security-relevant activities.

These records support operational accountability, incident investigation, authorized history inspection, and future compliance requirements.

E5-S1 implements authenticated, authorized, and idempotent job creation. However, its original acceptance criteria also require a corresponding audit record.

The current implementation does not persist that record.

Migration `001_init.sql` already defines an `audit_events` table containing:

- `id`
- `tenant_id`
- `actor`
- `action`
- `resource_id`
- `created_at`

The table supports basic tenant-scoped business audit records, but does not yet cover all future platform-wide security audit requirements.

The platform therefore needs a shared audit architecture that can support multiple domains without requiring each module to implement unrelated audit mechanisms.

## 2. Decision drivers

- Support business and security audit events through a coherent architecture.
- Preserve atomicity between business state changes and their required audit records.
- Allow security-relevant failures to be recorded independently of rolled-back business transactions.
- Maintain correct behavior for idempotent and concurrent operations.
- Associate events with trustworthy actor and tenant contexts.
- Support future platform-level events without requiring a tenant.
- Avoid storing access tokens, credentials, or unnecessary sensitive payloads.
- Keep audit persistence independent of HTTP frameworks.
- Support authorized, tenant-isolated audit history queries.
- Preserve existing applied database migrations.
- Avoid introducing unnecessary infrastructure before concrete requirements justify it.
- Provide verifiable behavior through PostgreSQL integration tests.

## 3. Alternatives considered

| Alternative                                                                                          | Advantages                                                       | Trade-offs                                                                  |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Application logs only                                                                                | Minimal implementation                                           | Insufficient structured and durable business history                        |
| Independent audit logic in every module                                                              | Local implementation simplicity                                  | Duplication, inconsistent event semantics and security policies             |
| Dedicated external audit service immediately                                                         | Independent infrastructure and scaling                           | Additional operational complexity and distributed consistency challenges    |
| PostgreSQL triggers for every audited operation                                                      | Database-level enforcement                                       | Business semantics become less explicit and difficult to coordinate         |
| **Shared audit contracts and PostgreSQL persistence with operation-specific transaction boundaries** | Reusable, explicit, transactionally consistent business auditing | Requires discipline around event taxonomy, persistence and failure handling |

## 4. Decision

Adopt a platform-wide audit architecture supporting two logical categories:

1. Business Audit Events.
2. Security Audit Events.

Both categories share consistent event semantics and architectural conventions, while allowing different transaction and reliability policies.

This ADR establishes the overall architecture.

E5-S1A implements only the transactional business audit event `job.created`.

### 4.1 Business Audit Events

Business audit events represent meaningful domain operations.

Examples:

- `job.created`
- `job.cancelled`
- `job.retried`
- `membership.role_changed`
- `membership.revoked`
- `document.deleted`

These examples do not imply that the corresponding operations are already implemented.

When an audit event is required for a successful database state change, it must be committed atomically with that change.

If the required audit insert fails, the business transaction must roll back.

An unsuccessful operation must not produce a success audit event.

### 4.2 Security Audit Events

Security audit events represent security-relevant activities and attempts, including operations that may be rejected.

Potential examples:

- `authorization.denied`
- `job.creation_conflict`
- `auth.login_failed`
- `platform_admin.access_granted`

The precise event taxonomy and recording policy will be defined in a dedicated backlog story.

Security events describing failed operations must not depend on a business transaction that is subsequently rolled back.

Their persistence therefore requires an independent transaction or a reliable delivery mechanism.

A security audit event must not incorrectly imply that a rejected business operation succeeded.

Security audit persistence and failure handling are outside the E5-S1A implementation scope.

### 4.3 Shared audit architecture

Audit responsibilities are separated into:

**Event contracts**

Define event categories, action names, required context, and payload validation.

**Audit persistence**

Provides reusable database operations for inserting and querying audit records.

**Domain integration**

Individual business modules determine which events to emit and at which transaction boundary.

**Audit access policy**

Controls which identities may inspect audit history and which tenant or platform resources they can access.

Initially, audit persistence belongs in `packages/database/`.

A separate `@lab/audit` package is not required for E5-S1A.

The architecture may be revisited when additional domain policies, event processing, or external integrations make a dedicated package justified.

### 4.4 Transaction ownership

Business repositories retain ownership of their business transactions.

Audit insertion functions may accept an existing PostgreSQL transaction client.

For example:

`insertAuditEvent(client, event)`

Such functions must not commit or roll back the caller's transaction.

This allows audit persistence to participate in the same atomic operation as job creation, cancellation, membership changes, or other future domain operations.

### 4.5 E5-S1A — Transactional job creation

The existing `createJobIdempotently()` operation remains responsible for coordinating job creation.

For a new job:

1. Begin the PostgreSQL transaction.
2. Apply existing idempotency behavior.
3. Insert the new job.
4. Insert the associated `job.created` event.
5. Commit both records together.

If job insertion fails, the operation must not persist a `job.created` event.

If audit insertion fails, the job insertion must roll back.

An unexpected error must not produce a partially committed operation.

### 4.6 Audit event contents

The initial `job.created` event contains:

| Field         | Source                         |
| ------------- | ------------------------------ |
| `tenant_id`   | Authorized tenant context      |
| `actor`       | Verified authenticated subject |
| `action`      | Constant `job.created`         |
| `resource_id` | Newly created job ID           |
| `created_at`  | PostgreSQL-generated timestamp |

Actor and tenant identifiers must not originate from untrusted request body fields.

Audit records must not contain Bearer tokens, passwords, client secrets, full JWTs or unnecessary job payloads.

### 4.7 Idempotency and concurrent requests

**New creation**

One new job produces one `job.created` event.

**Identical replay**

The existing job is returned without an additional creation event.

**Idempotency conflict**

The request is rejected using the existing `409 Conflict` behavior.

No new job or `job.created` event is persisted.

The conflict may be recorded in structured application logs. Future durable security-audit handling requires a separate policy.

**Concurrent identical requests**

Existing database-backed idempotency guarantees remain in effect.

Exactly one successful creation must result in exactly one corresponding `job.created` event.

Concurrent replays must not produce additional creation events.

### 4.8 Tenant-scoped and platform-scoped events

Most business operations belong to a tenant.

The existing `audit_events.tenant_id` column is non-nullable and remains appropriate for the initial `job.created` implementation.

Future security and platform administration operations may occur without an established tenant.

The audit architecture must support such contexts when those features are implemented.

The current implementation must not manufacture artificial tenant identifiers to work around the database constraint.

A future story will evaluate the required schema changes and authorization policies for platform-scoped events.

### 4.9 Audit storage

PostgreSQL remains the initial authoritative audit storage system.

The existing `audit_events` table is reused for E5-S1A without modifying `001_init.sql`.

Future migrations may introduce:

- Event categories and outcomes.
- Structured and appropriately redacted metadata.
- Nullable tenant context or another model for platform-wide events.
- Additional indexes.
- Retention or archival support.
- Stronger integrity protections.

Such changes must be justified by concrete requirements.

The current PostgreSQL table is not considered tamper-proof or tamper-evident merely because events are stored durably.

### 4.10 Audit events versus application logs

Business and security audit records must not be confused with operational application logs.

**Audit records** provide structured, durable evidence of defined activities.

**Application logs** support diagnostics, monitoring, performance analysis and error investigation.

Pino remains the application's structured logging mechanism.

Application logs may record a failed idempotency request, but do not automatically satisfy requirements for durable security auditing.

### 4.11 Audit access and isolation

Future audit retrieval must enforce authorization at the API boundary and tenant isolation at the database query boundary.

Audit history for a job must not expose records belonging to another tenant.

Cross-tenant resource inspection must not reveal the existence of inaccessible resources.

Security audit records may require stricter permissions than ordinary business history.

Dedicated audit administration and security-event access policies will be defined when those features are implemented.

### 4.12 Security audit delivery and failure behavior

A failed business transaction may roll back its business audit event.

A security event describing that failed attempt must use an independent persistence boundary if durable recording is required.

The architecture must distinguish between:

- Successfully persisted security events.
- Events that could not be persisted.
- Events that are intentionally excluded by audit policy.

A future security audit implementation must explicitly define reliability expectations and behavior when audit storage is unavailable.

This ADR does not guarantee delivery of security events before such a mechanism is implemented and tested.

## 5. Consequences and trade-offs

### Benefits

- One coherent audit architecture for multiple platform domains.
- Transactionally consistent business history.
- Separation of successful business changes from security-relevant attempts.
- Reusable PostgreSQL persistence.
- No new infrastructure required for E5-S1A.
- Compatibility with the existing job idempotency design.
- A clear foundation for E5-S2, E5-S3 and future security requirements.

### Costs and risks

- Additional database writes are required for audited business operations.
- Required audit persistence failures can prevent business operations from committing.
- The existing schema cannot represent every future security-event context.
- Security audit reliability is not implemented in E5-S1A.
- Audit data may grow significantly and require retention policies.
- Database administrators may still modify records unless stronger protections are introduced.
- Additional security event categories may require more restrictive access policies.
- Shared audit abstractions must remain focused to avoid unnecessary coupling between domains.

## 6. Verification and acceptance evidence

E5-S1A must verify the initial business audit implementation.

### AC1 — Successful creation produces an audit event

A new job produces exactly one `job.created` event containing the correct tenant, actor, action, job ID and timestamp.

### AC2 — Job creation and audit persistence are atomic

Both records commit together.

If audit insertion fails, neither the new job nor its creation audit event remains committed.

### AC3 — Idempotent replay does not duplicate audit records

Repeating an identical request returns the existing job without inserting another `job.created` event.

### AC4 — Idempotency conflicts do not create success events

A conflicting request is rejected and does not create another job or `job.created` event.

### AC5 — Concurrent creation preserves consistency

Concurrent identical requests result in one created job and exactly one corresponding creation audit event.

### AC6 — Existing behavior remains compatible

Existing database, authentication and API build, typecheck and automated tests must remain successful.

### AC7 — Tenant and actor context are correct

The persisted event identifies the authorized tenant and authenticated actor associated with the created job.

Verification results must be recorded in:

`docs/evidence/database/e5-s1a-validation.md`

The evidence must include actual command results, test counts, execution date, implementation Git revision, runtime versions, acceptance criteria status and known limitations.

Acceptance criteria must not be marked PASS until corresponding tests have been executed.

## 7. Revisit criteria

Reconsider the audit architecture if:

- Security audit requirements require guaranteed delivery under infrastructure failures.
- Regulations require tamper-evident or externally retained evidence.
- Platform-wide events require a new tenant-context model.
- Event volume requires partitioning, archival or dedicated storage.
- Multiple independent services require distributed event coordination.
- Audit write latency materially affects business operation performance.
- Fine-grained access and retention policies become necessary.
- External security monitoring or SIEM integration becomes a requirement.

Significant replacement decisions must be recorded in new ADRs rather than silently rewriting this historical decision.

## 8. Traceability

- **Epic:** E5 — Job Management API
- **Current story:** E5-S1A — Transactional Job Creation Audit Trail
- **Backlog:** `apps/docs/backlog/02-user-stories-and-tasks.md`
- **Schema:** `packages/database/migrations/001_init.sql`
- **Job persistence:** `packages/database/src/repositories/job/job.repository.ts`
- **Evidence:** `docs/evidence/database/e5-s1a-validation.md`
- **Related story:** E5-S1 — Create Job API
- **Next story:** E5-S2 — List and Inspect Jobs
- **Future business audit:** E5-S3 — Retry and Cancel Jobs
- **Future security audit:** Dedicated backlog story, identifier pending backlog review

This ADR establishes the platform-wide audit architecture while limiting E5-S1A implementation to transactionally consistent `job.created` events.
