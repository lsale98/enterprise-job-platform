# 02 — Product Requirements

## Product vision

Provide a dependable enterprise platform for processing asynchronous work and operating it safely.

## User roles

### 1. Platform Admin
Responsible for platform-wide setup, organization provisioning, access governance, and operational oversight.

### 2. Tenant Admin
Responsible for managing users and operational settings within a single organization.

### 3. Operator
Responsible for creating jobs, viewing results, canceling jobs, and retrying failures when permitted.

### 4. Viewer
Responsible for read-only visibility into jobs and system outputs.

## Core use cases

### Job submission
Authorized users submit a job with a type and payload.

### Job processing
Workers pick up queued jobs, execute them, track attempts, and produce outcomes.

### Monitoring
Users monitor queued, running, succeeded, failed, canceled, or retried jobs.

### Recovery
Operators retry failed jobs or cancel jobs where appropriate.

### Notifications
External systems are notified using reliable outbound delivery patterns.

### Audit and review
Actions are logged for security and operational traceability.

### AI assistance
Authorized users can ask AI-powered questions about documentation and job failures without crossing tenant boundaries.

## Functional requirements

### FR-001 — Authentication
The system must support enterprise authentication using OIDC/OAuth2-based login.

### FR-002 — Role-based authorization
The system must enforce RBAC and organization membership for all protected actions.

### FR-003 — Multi-tenancy
The system must isolate data by tenant.

### FR-004 — Create job
Authorized users must be able to create a job of a supported type.

### FR-005 — Idempotent job creation
Repeated create requests with the same idempotency key and same payload must not create duplicates.

### FR-006 — Conflict detection
Repeated create requests with the same idempotency key but different payload must return a conflict.

### FR-007 — Job state lifecycle
The system must track state transitions such as queued, running, succeeded, failed, canceled, and retrying.

### FR-008 — Background execution
A worker must execute queued jobs asynchronously.

### FR-009 — Retry policy
Retryable failures must support bounded retries with backoff.

### FR-010 — Recovery after failure
Jobs left in an in-progress state due to worker failure must be recoverable.

### FR-011 — Job listing and filtering
Users must be able to list and filter jobs visible to them.

### FR-012 — Job details
Users must be able to inspect job inputs, outputs, errors, attempts, and audit history according to permissions.

### FR-013 — Audit trail
Security-relevant and business-relevant actions must be recorded.

### FR-014 — Notification delivery
Completed workflows may create outbound notifications delivered with a durable outbox pattern.

### FR-015 — Dashboard
The web application must provide a practical operational dashboard.

### FR-016 — AI retrieval
Authorized users may query documentation and historical failure context through a tenant-scoped RAG flow.

### FR-017 — Source attribution
AI responses must reference the sources used.

### FR-018 — Safe refusal
If the AI assistant does not have enough relevant evidence, it must say so rather than guessing.
