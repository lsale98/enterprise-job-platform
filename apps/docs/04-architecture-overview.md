# 04 — Architecture Overview

## Architectural style

The initial system is designed as a **modular monolith** inside a monorepo.

This approach is selected to keep complexity manageable while preserving clear boundaries between domains and runtime concerns.

## Detailed architecture documents

- [System context and trust boundaries](architecture/01-system-context.md)
- [Components and data flows](architecture/02-components-and-data-flow.md)
- [Identity and tenant isolation](architecture/03-identity-authorization-and-tenancy.md)
- [Job state and reliability](architecture/04-job-lifecycle-and-recovery.md)
- [Data and AI boundaries](architecture/05-data-and-ai-boundaries.md)
- [Architecture decision register](architecture/06-decision-register.md)

## High-level components

### Web Application

A Next.js application used by authenticated users to view and operate jobs.

### HTTP API

A backend service exposing job, auth-context, and operational endpoints.

### Worker

A background process responsible for executing queued jobs and updating job state.

### PostgreSQL

The primary database for tenants, users, jobs, attempts, audit records, idempotency records, and RAG-related metadata.

### Identity Provider

An OIDC-compatible provider (for example Keycloak) used for authentication.

### AI Subsystem

A tenant-scoped retrieval and generation flow using stored embeddings and a local or approved model runtime.

## Main architectural decisions

- monorepo for coordinated development
- modular monolith instead of microservices for initial release
- PostgreSQL-backed queue instead of external queue infrastructure in the first version
- OIDC authentication instead of custom auth implementation
- role-based and tenant-based authorization enforced by the backend
- durable outbox for outbound notifications
- tenant-scoped retrieval for AI functionality

## Suggested repository structure

```text
repo-root/
├── apps/
│   ├── api/
│   ├── worker/
│   ├── dispatcher/
│   ├── web/
│   └── docs/
├── packages/
│   ├── contracts/
│   ├── engine/
│   └── database/
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   ├── performance/
│   └── reliability/
├── docs/
│   ├── adr/
│   ├── evidence/
│   └── runbooks/
└── infrastructure/
```

## Data boundaries

All tenant-sensitive access must flow through server-side authorization.
The web layer never decides access on its own.

## Operational boundaries

- web handles presentation and user interactions
- API enforces auth, validation, and business rules
- worker executes asynchronous jobs
- database provides consistency and persistence
