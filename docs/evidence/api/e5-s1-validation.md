# E5-S1 — Create Job API Validation Evidence

## Metadata

- Date: 2026-10-23
- Epic: E5 — Job Management API
- Story: E5-S1 — Create Job API
- Branch: feat/e5-s1-create-job-api
- Git revision: 7de71d8
- Node version: v24.15.0
- pnpm version: 10.18.3

## Verification Results

| Command                                        | Status |
| ---------------------------------------------- | ------ |
| `pnpm --filter @lab/database build`            | PASS   |
| `pnpm --filter @lab/database typecheck`        | PASS   |
| `pnpm --filter @lab/database test:integration` | PASS   |
| `pnpm --filter @lab/auth build`                | PASS   |
| `pnpm --filter @lab/auth typecheck`            | PASS   |
| `pnpm --filter @lab/auth test`                 | PASS   |
| `pnpm --filter @lab/auth test:integration`     | PASS   |
| `pnpm --filter api build`                      | PASS   |
| `pnpm --filter api typecheck`                  | PASS   |
| `pnpm --filter api test`                       | PASS   |

## Acceptance Criteria

### AC1 — Fastify HTTP API is implemented

**Status: PASS**

A standalone Fastify application is implemented in `apps/api`.

The application provides:

- Environment configuration and validation using Zod.
- Dependency injection through an application composition root.
- Structured request logging using Fastify and Pino.
- Graceful shutdown and PostgreSQL connection pool cleanup.
- A public `GET /health` endpoint.
- Centralized HTTP error handling.

The API starts successfully in the local development environment.

### AC2 — Requests are authenticated using Keycloak JWT access tokens

**Status: PASS**

The API integrates the existing `createAccessTokenVerifier()` from `@lab/auth`.

The authentication plugin validates Bearer tokens and makes the verified identity available through `request.identity`.

Automated HTTP tests confirm:

- Missing Bearer tokens return `401 Unauthorized`.
- Malformed authorization headers return `401 Unauthorized`.
- Invalid access tokens return `401 Unauthorized`.
- Valid tokens provide the authenticated subject to protected routes.

The `/health` endpoint remains publicly accessible.

### AC3 — Tenant authorization enforces `jobs:create`

**Status: PASS**

Job creation requires the `jobs:create` permission.

The API uses the existing `createAuthorizer()` from `@lab/auth` to verify tenant membership and role permissions.

The supported roles are:

- `viewer` — cannot create jobs.
- `operator` — can create jobs.
- `admin` — can create jobs.

An automated HTTP test confirms that authorization failure returns `403 Forbidden`.

The API derives the job creator from the verified authentication and authorization context rather than accepting a caller-supplied identity.

### AC4 — Job creation requests are validated

**Status: PASS**

The endpoint validates job input using `CreateJobSchema` from `@lab/contracts`.

The `Idempotency-Key` header is required and validated before job creation.

Automated HTTP tests confirm:

- Invalid job payloads return `400 Bad Request`.
- Invalid idempotency keys return `400 Bad Request`.
- Invalid requests do not invoke job persistence.

The endpoint uses the tenant identifier from the validated authorization context.

### AC5 — New jobs are persisted in PostgreSQL

**Status: PASS**

The API exposes:

`POST /v1/tenants/:tenantId/jobs`

The Jobs module delegates persistence to `createJobIdempotently()` through an injected dependency.

A manual end-to-end test was performed using:

- Local Fastify API.
- Local Keycloak.
- PostgreSQL.
- Postman with OAuth 2.0 Authorization Code and PKCE.

Test subject: `11111111-1111-4111-8111-111111111111`

Test tenant: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`

Test role: `operator`

The first request with `Idempotency-Key: postman_test_002` returned `201 Created`.

### AC6 — Identical requests are idempotent

**Status: PASS**

Repeating the same request with the same tenant, authenticated subject, idempotency key, and payload returned `200 OK`.

The response represents an idempotent replay rather than a new job creation.

PostgreSQL integration tests additionally verify:

- Repeated requests return an existing job.
- Concurrent identical requests result in exactly one job.
- The same idempotency key can be used independently across tenants.

The manual replay test returned the expected HTTP status. Job ID equality was not separately recorded during that manual run.

### AC7 — Conflicting idempotency requests are rejected

**Status: PASS**

Reusing an existing idempotency key with a different request payload results in an `IdempotencyConflictError`.

The HTTP layer maps this error to `409 Conflict`.

A manual Postman test confirmed:

- The original payload returned `201 Created`.
- Replaying the identical payload returned `200 OK`.
- Changing the payload while retaining the same key returned `409 Conflict`.

Database integration tests also verify conflicts involving different payloads and authenticated actors.

### AC8 — Internal errors are handled safely

**Status: PASS**

A centralized Fastify error handler prevents unexpected internal error messages from being exposed to API clients.

Unexpected persistence errors return `500 Internal Server Error` with a generic response message.

The original errors remain available through application logging.

An automated HTTP test confirms that an internal database failure message is not returned to the client.

### AC9 — Database dependencies are explicitly managed

**Status: PASS**

The global PostgreSQL pool was replaced with explicit dependency construction through `createDatabasePool()`.

The refactor includes:

- Explicit PostgreSQL pool injection into repositories.
- Transaction execution using an injected pool.
- Database configuration validation during application startup.
- Connection pool cleanup during graceful shutdown.
- Dependency injection between authorization logic and the membership repository.

The existing database and authorization tests continue to pass following the refactor.

## Known Limitations

- The API has been validated in a local development environment, not production infrastructure.
- JWT cryptographic verification is implemented in `@lab/auth`; the API HTTP tests use an injected verifier to isolate transport behavior.
- HTTP authorization tests use injected dependencies, while PostgreSQL membership behavior is covered separately by integration tests.
- The live Postman validation confirmed `201`, `200`, and `409` responses, but did not independently record matching job IDs for the first request and replay.
- Job processing and background worker execution are outside E5-S1.
- Job listing, retrieval, cancellation, and additional job lifecycle operations are outside E5-S1.
- Production deployment, load testing, and distributed operational monitoring are outside this validation.
- Validation of concurrency at the HTTP transport level was not performed; concurrent idempotency behavior was verified through PostgreSQL integration tests.

## Final Result

**E5-S1 Status: DONE**

The Create Job API is implemented and validated through 24 automated API tests, 6 PostgreSQL job repository integration tests, and existing authentication and authorization test suites.

Manual end-to-end testing confirmed authenticated job creation with `201 Created`, idempotent replay with `200 OK`, and conflicting request rejection with `409 Conflict`.

The implementation provides a Fastify HTTP API with Keycloak authentication, tenant-scoped RBAC authorization, validated job creation, PostgreSQL persistence, explicit dependency injection, and centralized error handling.
