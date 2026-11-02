# Enterprise Job Platform — Project Context

## Project Purpose

Enterprise Job Platform is a production-oriented engineering
laboratory focused on enterprise software architecture,
distributed processing, security, reliability, and testing.

## Architecture

### Monorepo

- Turborepo
- pnpm workspaces
- TypeScript

### Applications

- `apps/api` — Fastify backend
- `apps/web` — Next.js frontend
- `apps/worker` — Background job processing and webhook delivery

### Shared Packages

- `packages/auth`
- `packages/contracts`
- `packages/database`
- `packages/engine`

### Infrastructure

- PostgreSQL
- Keycloak under root `infrastructure/`
- Docker

### Webhook Architecture

The webhook dispatcher is part of the worker application.

There is no separate dispatcher application.

Important locations:

- `apps/worker/src/webhooks/`
- `apps/worker/src/webhooks/main.ts`
- `apps/worker/src/webhooks/runtime/`
- `apps/worker/src/webhooks/transport/`
- `apps/worker/src/webhooks/testing/`
- `packages/database/src/repositories/webhook/commands/`

## Engineering Principles

- Production-oriented code
- TypeScript strictness
- Runtime boundary validation
- Tenant isolation
- Explicit error handling
- Idempotency and retry safety
- Lease-based ownership
- Crash recovery
- Security validation
- Automated testing
- Architecture Decision Records
- Reproducible evidence

## Git Workflow

- `main` — primary branch
- `develop` — integration branch
- Feature branches originate from `develop`
- Pull requests target `develop`
- Squash merges are preferred
- Required CI checks must pass before merge

## Documentation Conventions

Documentation and Git messages are written in English.

Engineering explanations are written in Serbian.

### Evidence Template

Evidence follows the E9-S0A convention:

1. Metadata
2. Verification Results
3. Acceptance Criteria (AC1, AC2, ...)
4. Known Limitations
5. Final Result

Only executed and verified checks are marked PASS.

### Pull Request Template

1. Summary
2. Changes
3. Acceptance Criteria
4. Verification
5. Documentation
6. Known Limitations
7. Related Work

## Source of Truth

Use sources in this order:

1. Current repository source code
2. Original backlog and acceptance criteria
3. Accepted ADRs
4. Verified evidence
5. Git commits and pull requests
6. Project context documents
7. Historical conversations

When sources conflict, inspect the repository before
making implementation or architectural claims.

## Project Tracking

See `IMPLEMENTATION_STATUS.md` for the current milestone,
Git state, validation results, and next development task.

Update project tracking whenever a story is completed,
a major architectural decision changes, or a PR is merged.
