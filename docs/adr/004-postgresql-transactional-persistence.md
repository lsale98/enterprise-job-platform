# ADR-004 — PostgreSQL as the Transactional Persistence Boundary

| Field                 | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| Status                | Accepted for E3-S1 implementation                           |
| Date                  | 2026-10-20                                                  |
| Epic                  | E3 — Persistence and Data Model                             |
| User story            | E3-S1 — Database Schema                                     |
| Scope                 | `packages/database/`                                        |
| Related ADRs          | ADR-001 — Monorepo Architecture; ADR-002 — Shared Contracts |
| Verification evidence | `docs/evidence/database/e3-s1-validation.md`                |

## 1. Context

The Enterprise Job Platform requires durable storage for jobs, organizations, identities, memberships, audit events, and related business records.

In-memory storage is insufficient because application restarts or process failures would result in data loss. Additionally, multiple API and worker instances must access consistent shared data.

The database must enforce relationships and business invariants independently of application-level validation.

E3-S1 establishes the database schema, versioned migrations, transactional database access, and local development seed data.

Implementation of idempotency persistence behavior belongs to E3-S2. HTTP request handling and distributed worker recovery belong to later stories.

## 2. Decision drivers

- Persist business data across application restarts.
- Enforce relational integrity through primary keys and foreign keys.
- Support multi-tenant data organization.
- Prevent invalid database states through constraints.
- Provide transactional guarantees for related operations.
- Maintain a versioned and reproducible schema.
- Support efficient queries through appropriate indexes.
- Enable safe and repeatable database migrations.
- Keep database infrastructure independent of HTTP and UI frameworks.
- Support future job processing, notification outbox, and AI/RAG workloads.

## 3. Alternatives considered

| Alternative                                                 | Advantages                                                                                                 | Trade-offs                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| In-memory storage                                           | Simple implementation and fast access                                                                      | No durability or consistency across processes                                           |
| Document database                                           | Flexible schemas and document-oriented storage                                                             | Relational constraints and transactional workflows require additional consideration     |
| PostgreSQL with an external message broker                  | Independent messaging infrastructure and scaling options                                                   | Increased operational complexity and distributed consistency challenges                 |
| **PostgreSQL with transactions and relational constraints** | Strong integrity guarantees, durable storage, mature tooling, JSONB support, and transactional consistency | Requires schema management, connection management, indexing, and operational monitoring |

## 4. Decision

Use **PostgreSQL as the authoritative transactional data store** for the Enterprise Job Platform.

Implement a reusable `@lab/database` workspace package under `packages/database/`.

The following architectural rules apply.

### 4.1 Relational data model

Define database tables for:

- Tenants
- Identities
- Memberships
- Jobs
- Imported records
- Notification outbox
- Audit events
- Knowledge documents

Use explicit primary keys, foreign keys, and appropriate data types.

### 4.2 Multi-tenant data model

Tenant-owned business records must contain a `tenant_id` referencing the owning organization.

Queries accessing tenant-owned data must explicitly enforce tenant boundaries.

Foreign keys alone do not provide complete tenant isolation. Authorization and tenant-scoped access controls will be implemented and verified in subsequent stories.

### 4.3 Database constraints

Enforce critical invariants at the database level through:

- `PRIMARY KEY`
- `FOREIGN KEY`
- `UNIQUE`
- `NOT NULL`
- `CHECK`

The `jobs` table includes a unique constraint on `(tenant_id, idempotency_key)`.

This constraint establishes the database foundation for idempotency. The application-level behavior for repeated requests will be implemented and tested in E3-S2.

### 4.4 Transactional operations

Provide a reusable transaction helper that:

1. Acquires a database connection.
2. Begins a transaction.
3. Executes related operations.
4. Commits when all operations succeed.
5. Rolls back when an operation fails.
6. Releases the connection.

Transactions must not silently leave partial changes after an error.

### 4.5 Versioned migrations

Store SQL migrations under `packages/database/migrations/`.

Each migration must:

- Have a unique, ordered filename.
- Be tracked in the `schema_migrations` table.
- Execute in a controlled transaction when supported.
- Avoid duplicate application.
- Preserve historical migration files after they have been applied.

The migration runner uses PostgreSQL advisory transaction locks to coordinate concurrent migration execution.

Schema changes introduced after a migration has been deployed must be implemented through new migration files.

### 4.6 Indexing

Create indexes based on expected access patterns, including:

- Tenant-scoped job listing.
- Available job lookup.
- Tenant-scoped audit history.
- Tenant-scoped knowledge document retrieval.

Indexing decisions must eventually be validated using query plans and representative workloads.

### 4.7 Connection management

Use the PostgreSQL connection pool provided by the `pg` package.

The initial pool configuration is suitable for local development and must be reviewed against measured workload, database connection limits, and deployment topology before production use.

### 4.8 Local development seed

Provide deterministic local seed data for test organizations and users.

Seed operations must not be executed against production databases.

### 4.9 PostgreSQL extensions

Enable required PostgreSQL extensions through versioned migrations.

The initial schema supports `pgcrypto` and `pgvector`.

Vector storage is prepared for a future AI/RAG story. This decision does not imply that vector retrieval has already been implemented or validated.

## 5. Consequences

### Positive

- Business data survives application process restarts.
- Relational constraints protect critical data invariants.
- Transactions support atomic multi-step operations.
- A shared schema provides consistent persistence across services.
- Versioned migrations make schema evolution traceable.
- PostgreSQL supports relational data, JSONB, and future vector workloads.
- Database-level uniqueness provides a foundation for idempotent operations.

### Costs and risks

- PostgreSQL becomes a critical shared infrastructure dependency.
- Database performance depends on query design and indexing.
- Connection pools must be configured appropriately.
- Schema changes require migration planning and compatibility checks.
- Tenant identifiers and foreign keys alone do not guarantee tenant isolation.
- Long-running transactions can increase lock contention.
- Database backups, restoration, monitoring, and production migration procedures must be addressed in operational stories.

## 6. Verification and acceptance evidence

Run the following commands from the repository root after configuring the local PostgreSQL environment.

```powershell
docker compose up -d postgres

pnpm install

pnpm --filter @lab/database build
pnpm --filter @lab/database typecheck

pnpm --filter @lab/database migrate
pnpm --filter @lab/database seed
```

### Required verification

- Database package builds successfully.
- TypeScript type checking passes.
- SQL migrations complete without errors.
- Re-running migrations does not apply previously recorded migrations again.
- Required tables exist.
- Primary and foreign key constraints exist.
- Check constraints reject invalid values.
- Unique constraints reject conflicting records.
- Transaction rollback prevents partial writes.
- Local seed creates the expected organizations and identities.
- Required indexes exist.
- The schema migration history accurately records applied files.

### Database inspection

```powershell
docker compose exec postgres psql -U lab -d lab -c "SELECT filename FROM schema_migrations ORDER BY filename;"

docker compose exec postgres psql -U lab -d lab -c "SELECT name FROM tenants;"

docker compose exec postgres psql -U lab -d lab -c "\d jobs"
```

Verification results must reflect actual execution.

Record the execution date, Git revision, Node.js version, pnpm version, verification statuses, acceptance criteria, and known limitations in:

`docs/evidence/database/e3-s1-validation.md`

E3-S1 must not be marked as DONE until all required acceptance checks have passed.

## 7. Revisit criteria

Reconsider this decision when:

- Measured database contention becomes unacceptable.
- Connection limits become a significant bottleneck.
- Job processing throughput exceeds the selected storage architecture.
- Multi-tenant isolation requirements demand stronger database-level enforcement.
- Regulatory requirements require physical data separation.
- Schema migration complexity prevents safe independent service releases.
- Database availability or recovery requirements exceed the current hosting architecture.

Architectural changes must be documented through a new ADR rather than silently rewriting this accepted decision.

## 8. Traceability

- **Epic:** E3 — PostgreSQL Persistence
- **Story:** E3-S1 — Database Schema
- **Backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **Learning material:** `apps/docs/03-POSTGRESQL.md`
- **Implementation:** `packages/database/`
- **Migrations:** `packages/database/migrations/`
- **Verification evidence:** `docs/evidence/database/e3-s1-validation.md`
- **Previous ADR:** `docs/adr/003-bounded-concurrency-and-retry.md`
- **Next story:** E3-S2 — Idempotency Persistence

This decision establishes the durable relational foundation for subsequent authentication, API, worker, outbox, and AI/RAG functionality.
