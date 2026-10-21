# ADR-004 — PostgreSQL as the Transactional Persistence Boundary

| Field                 | Value                                        |
| --------------------- | -------------------------------------------- |
| Status                | Accepted for E3-S1 implementation            |
| Date                  | 2026-10-20                                   |
| Epic                  | E3 — Persistence and Data Model              |
| User story            | E3-S1 — Database Schema                      |
| Scope                 | `packages/database/`, schema and migrations  |
| Related ADRs          | ADR-001, ADR-002, ADR-003                    |
| Verification evidence | `docs/evidence/database/e3-s1-validation.md` |

## 1. Context

The Enterprise Job Platform requires durable storage for tenants, identities, memberships, jobs, imported records, notification records, audit events, and knowledge documents.

In-memory storage cannot guarantee persistence across process restarts or consistency between independently running services.

The database must enforce critical relationships and business invariants independently of application-level validation.

E3-S1 establishes the relational schema, versioned migrations, transactional database access, and local development seed data.

Idempotent job creation, HTTP request handling, distributed worker recovery, and notification delivery are outside the scope of this story.

## 2. Decision drivers

- Persist domain data across application restarts.
- Enforce relational integrity through database constraints.
- Support tenant-scoped business data.
- Provide atomic transactions for related changes.
- Maintain an ordered and reproducible migration history.
- Support efficient access through indexes.
- Keep persistence independent of the HTTP and UI frameworks.
- Prepare the database for future worker, outbox, and AI/RAG functionality.
- Make schema correctness verifiable through automated SQL checks.

## 3. Alternatives considered

| Alternative                                                 | Advantages                                                 | Trade-offs                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| In-memory storage                                           | Simple and fast for local execution                        | No durable or shared transactional state                             |
| Document database                                           | Flexible document structures                               | Relational invariants require additional design                      |
| Separate broker and database                                | Independent message-processing infrastructure              | Increased operational complexity and consistency challenges          |
| **PostgreSQL with relational constraints and transactions** | ACID transactions, strong integrity, JSONB, mature tooling | Requires migrations, connection management, indexing, and monitoring |

## 4. Decision

Use PostgreSQL as the authoritative transactional database for the Enterprise Job Platform.

### 4.1 Database package

Create `@lab/database` under `packages/database/`.

The package provides connection pooling, parameterized queries, transaction handling, migrations, and development seed functionality.

### 4.2 Schema ownership

Store ordered SQL migrations in `packages/database/migrations/`.

Once a migration has been applied to a persistent environment, its contents must remain unchanged. Future schema modifications require a new migration.

### 4.3 Relational integrity

Use primary keys, foreign keys, unique constraints, non-null constraints, and check constraints to protect persisted data.

Tenant-owned business tables include a tenant identifier.

Tenant identifiers and foreign keys alone do not guarantee tenant isolation. Authorization and tenant-scoped query enforcement belong to subsequent stories.

### 4.4 Job persistence

Persist job identity, ownership, type, input, status, result, retry metadata, and timestamps.

Use JSONB for structured job payloads while enforcing lifecycle values through relational constraints.

Define a unique constraint on `(tenant_id, idempotency_key)` as the persistence foundation for E3-S2.

The constraint does not by itself implement idempotent HTTP request semantics.

### 4.5 Transactions

Related database operations must execute within an explicit transaction where atomicity is required.

The transaction helper begins a transaction, commits on success, rolls back on failure, and releases the database connection.

### 4.6 Migrations

Use a `schema_migrations` table to record applied migration filenames.

Use PostgreSQL advisory transaction locks to coordinate migration execution.

Running migrations again must not reapply previously recorded changes.

### 4.7 Indexing

Create indexes for expected access patterns, including tenant-scoped job listings, available job lookups, audit events, and knowledge documents.

Production indexing decisions must be reviewed against representative query plans and measured workloads.

### 4.8 Development seed

Provide deterministic local tenants, identities, and memberships for development verification.

The seed script must not be executed against production data.

### 4.9 PostgreSQL extensions

Enable `pgcrypto` and `pgvector` in the initial schema.

Vector storage prepares the database for a later AI/RAG story; this decision does not implement retrieval or embeddings.

## 5. Consequences

### Positive

- Durable relational storage across process restarts.
- Database-enforced integrity constraints.
- Atomic multi-step persistence operations.
- A consistent database foundation for API and worker services.
- Traceable database evolution through migrations.
- Support for JSONB and future vector workloads.

### Costs and risks

- PostgreSQL is a critical shared infrastructure dependency.
- Long-running transactions can introduce lock contention.
- Connection pools require capacity planning.
- Schema changes require deployment compatibility checks.
- Tenant isolation must be enforced beyond basic foreign keys.
- Database backups and restoration procedures are required for production.
- Job and outbox tables do not automatically provide distributed execution guarantees.

## 6. Verification and acceptance evidence

The following checks are required:

- The database package builds successfully.
- Type checking passes.
- The initial migration applies successfully.
- Re-running the migration does not duplicate its execution.
- Required database tables and indexes exist.
- Foreign key, check, and unique constraints reject invalid records.
- An explicit transaction rollback discards uncommitted changes.
- Seed data creates the expected tenants and memberships.
- Restarting the application process does not erase persisted data.

Store actual verification results in `docs/evidence/database/e3-s1-validation.md`.

The Evidence document must contain the execution date, Git revision, tool versions, command statuses, acceptance criteria, and known limitations.

E3-S1 must not be marked DONE until the required checks have passed.

## 7. Revisit criteria

Reconsider the architecture if measured database contention, connection saturation, deployment requirements, recovery objectives, tenancy requirements, or job throughput exceed the current design.

A replacement decision must be documented in a new ADR rather than silently rewriting the historical decision.

## 8. Traceability

- **Epic:** E3 — Persistence and Data Model
- **Story:** E3-S1 — Database Schema
- **Backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **Implementation:** `packages/database/`
- **Migrations:** `packages/database/migrations/`
- **Verification:** `docs/evidence/database/e3-s1-validation.md`
- **Previous decision:** `docs/adr/003-bounded-concurrency-and-retry.md`
- **Following story:** E3-S2 — Idempotency Persistence
