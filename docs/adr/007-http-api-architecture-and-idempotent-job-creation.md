# ADR-007 — HTTP API Architecture and Idempotent Job Creation

| Field                 | Value                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Accepted for E5-S1 implementation                                                                                                                                                                                                                        |
| Date                  | 2026-10-22                                                                                                                                                                                                                                               |
| Epic                  | E5 — Job Management API                                                                                                                                                                                                                                  |
| User story            | E5-S1 — Create Job API                                                                                                                                                                                                                                   |
| Scope                 | HTTP API foundation, authenticated tenant-scoped job creation, request validation, and idempotency                                                                                                                                                       |
| Related ADRs          | ADR-002 — Shared TypeScript Contracts and Runtime Validation; ADR-004 — PostgreSQL as the Transactional Persistence Boundary; ADR-005 — OIDC Authentication and Identity Boundaries; ADR-006 — Tenant-Scoped Authorization and Role-Based Access Control |
| Verification evidence | `docs/evidence/api/e5-s1-validation.md`                                                                                                                                                                                                                  |

## 1. Context

The Enterprise Job Platform already provides reusable authentication, authorization, contract validation, and persistence capabilities.

Previous implementation work established:

- OIDC authentication using Keycloak and JWT access token verification.
- PostgreSQL-backed tenant membership verification.
- Centralized role-based access control.
- Runtime job request validation using Zod.
- Transactional, idempotent job creation in PostgreSQL.

However, the platform does not yet expose these capabilities through a public HTTP API.

E5-S1 introduces the first protected job creation endpoint.

The API must connect the existing components without duplicating security policies, persistence logic, or request validation rules.

A valid access token alone must not grant job creation permissions. The authenticated user must also hold an appropriate role within the requested tenant.

Repeated HTTP requests must not accidentally create duplicate jobs.

## 2. Decision Drivers

The HTTP API architecture must:

- Provide a standalone, independently deployable backend application.
- Reuse existing authentication and authorization packages.
- Enforce tenant-scoped job creation permissions.
- Prevent client-controlled identity or role escalation.
- Validate job payloads using centralized contracts.
- Preserve PostgreSQL transactional and idempotency guarantees.
- Return consistent HTTP status codes and safe error responses.
- Support automated HTTP tests without opening network ports.
- Support dependency injection for isolated testing.
- Separate HTTP responsibilities from domain and persistence logic.
- Avoid introducing unnecessary infrastructure or abstractions.
- Establish a foundation for future job retrieval, listing, and cancellation endpoints.

## 3. Alternatives Considered

| Alternative                   | Advantages                                                                                                    | Trade-offs                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Express with TypeScript       | Mature ecosystem, flexible middleware, broad adoption                                                         | Requires additional architectural and validation conventions                                 |
| Next.js Route Handlers        | Convenient integration with a Next.js application                                                             | Couples the backend API to a frontend framework that is not currently present                |
| Custom Node.js HTTP server    | Minimal external dependencies                                                                                 | Requires manual routing, lifecycle handling, validation integration, and test infrastructure |
| **Fastify 5 with TypeScript** | Structured routing, lifecycle hooks, dependency injection support, error handling, and HTTP injection testing | Introduces a framework dependency and requires consistent plugin and application conventions |

## 4. Decision

Use Fastify 5 with TypeScript to implement a standalone HTTP API application.

The API will compose existing workspace packages and expose a secure, tenant-scoped job creation endpoint.

### 4.1 Application boundary

Create a new workspace application:

`apps/api`

The initial structure will be:

```text
apps/api/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── plugins/
│   │   └── authentication.ts
│   └── modules/
│       └── jobs/
│           ├── jobs.routes.ts
│           ├── jobs.controller.ts
│           └── jobs.service.ts
├── package.json
└── tsconfig.json
```

`app.ts` constructs and configures the Fastify instance.

`server.ts` loads runtime configuration and starts the HTTP server.

Job routes and request handling remain isolated within the jobs module.

Additional layers must not be introduced solely for structural symmetry when existing package APIs already provide the required functionality.

### 4.2 HTTP endpoint

Expose:

`POST /v1/tenants/:tenantId/jobs`

Required request headers:

- `Authorization: Bearer <access_token>`
- `Idempotency-Key: <key>`
- `Content-Type: application/json`

The request body must conform to the existing `CreateJobSchema` from `@lab/contracts`.

Supported job types:

- `report`
- `import`
- `notification`

The tenant identifier identifies the requested tenant but does not independently grant access.

### 4.3 Authentication boundary

Reuse `createAccessTokenVerifier()` from `@lab/auth`.

The API must verify the access token before permitting protected operations.

The existing verifier validates:

- Digital signature using trusted signing keys.
- Expected issuer.
- Expected API audience.
- Token expiration.
- Issued-at and not-before constraints.
- Required subject.
- Supported signing algorithm.
- Keycloak access token type.

The API must use the subject returned by successful verification.

Client-supplied subject identifiers must never be accepted as proof of identity.

Missing, malformed, or invalid bearer tokens result in `401 Unauthorized`.

### 4.4 Tenant authorization boundary

Reuse `createAuthorizer()` from `@lab/auth`.

Connect the authorizer to `findMembership()` from `@lab/database`.

Job creation requires:

`jobs:create`

The authorization process must establish:

1. The requester has a verified identity.
2. The requested tenant identifier is valid.
3. The authenticated subject has a current membership in that tenant.
4. The membership role is recognized.
5. The role grants the `jobs:create` permission.

The authorized subject and tenant identifier must be passed to the persistence operation.

Missing membership or insufficient permission results in `403 Forbidden`.

Unexpected membership repository errors must never grant authorization.

### 4.5 Request validation

Reuse `CreateJobSchema` from `@lab/contracts`.

The API must validate the job type and its corresponding payload.

The existing discriminated union supports three request structures:

- Report jobs containing a bounded array of numbers.
- Import jobs containing bounded records with external identifiers and values.
- Notification jobs containing a subject and message.

The API must also validate:

- Tenant identifier format.
- Presence and format of the idempotency key.
- Required authentication headers.
- Supported request content type.

Invalid application-level request data results in `400 Bad Request`, except where more specific HTTP protocol errors are appropriate.

Validation must not duplicate or weaken existing domain constraints.

### 4.6 Idempotent persistence

Reuse `createJobIdempotently()` from `@lab/database`.

The API must not reimplement:

- Request fingerprint generation.
- Canonical request serialization.
- Database transaction management.
- Job insertion.
- Idempotency conflict resolution.

The repository currently scopes idempotency keys by tenant.

When a matching existing job is found, the repository also verifies the request fingerprint and creator identity.

The API will interpret repository outcomes:

- `created` — a new job was inserted.
- `replayed` — an equivalent request previously created the job.

An `IdempotencyConflictError` represents reuse of the same key for a conflicting request.

Idempotency is scoped to the authorized tenant and must not allow a user to obtain a job through another user's idempotency key.

### 4.7 HTTP response contract

| Condition                                                  | Intended status             |
| ---------------------------------------------------------- | --------------------------- |
| New job successfully created                               | `201 Created`               |
| Equivalent idempotent request replayed                     | `200 OK`                    |
| Invalid job payload, tenant identifier, or idempotency key | `400 Bad Request`           |
| Missing or invalid authentication                          | `401 Unauthorized`          |
| Missing tenant membership or insufficient permission       | `403 Forbidden`             |
| Conflicting idempotency key reuse                          | `409 Conflict`              |
| Unexpected internal error                                  | `500 Internal Server Error` |
| Identifiable temporary dependency outage                   | `503 Service Unavailable`   |

Successful responses will expose a consistent public job representation.

The representation must include sufficient information to identify the created or previously existing job and its initial or current status.

Internal database fields that are not part of the public contract must not be exposed unnecessarily.

Error responses must not expose access tokens, credentials, SQL statements, stack traces, or internal database details.

### 4.8 Separation of responsibilities

The implementation establishes the following boundaries.

**HTTP API — `apps/api`**

Handles routing, headers, HTTP validation, dependency composition, status codes, and response serialization.

**Authentication and authorization — `@lab/auth`**

Verifies access tokens and evaluates tenant-scoped access policies.

**Runtime contracts — `@lab/contracts`**

Defines and validates supported job payloads and permissions.

**Persistence — `@lab/database`**

Performs transactional job creation and enforces idempotency through PostgreSQL.

**Job processing — `@lab/engine`**

Remains responsible for execution-related functionality and is not integrated into the creation endpoint in E5-S1.

### 4.9 Testing architecture

Use Fastify's `inject()` API to test HTTP behavior without starting a network listener.

The API application must support injecting or replacing external dependencies during tests.

Isolated HTTP tests must not require a running Keycloak server or PostgreSQL instance.

Production dependency composition must use the actual authentication, authorization, and persistence implementations.

Integration testing must verify the boundary between the API and the existing packages where appropriate.

### 4.10 Database and infrastructure changes

The existing `jobs` table and job repository provide the required persistence foundation.

No new database migration is planned solely for the E5-S1 HTTP integration.

Any discovered schema incompatibility must be resolved through a new versioned migration rather than modifying an already applied migration.

E5-S1 does not introduce Redis, a distributed queue, a worker deployment, or background job execution.

## 5. Consequences

### Positive

- Establishes a reusable backend HTTP API foundation.
- Keeps authentication and authorization outside controller-specific business logic.
- Preserves existing PostgreSQL transaction and idempotency behavior.
- Reduces duplicated validation and persistence code.
- Enforces job creation permissions within the requested tenant.
- Supports isolated HTTP testing through dependency injection.
- Allows the API to be deployed independently of future frontend applications.
- Provides a consistent structure for subsequent job management endpoints.

### Costs and Risks

- Introduces Fastify and its supporting dependencies.
- Requires a maintained application configuration and startup lifecycle.
- Incorrect middleware ordering could weaken authentication or authorization enforcement.
- Authorization checks and job insertion occur across separate logical boundaries, creating a potential race if membership is revoked between the two operations.
- Database unavailability can prevent authorization or job creation.
- Incorrect error mapping could expose internal implementation details.
- A successful idempotent replay still requires authorization before returning the existing job.
- Unit tests with injected dependencies do not independently establish production integration correctness.
- Additional production protections, including rate limiting, monitoring, and deployment hardening, remain necessary.

## 6. Verification and Acceptance Evidence

Verification must cover the following acceptance criteria.

### AC1 — HTTP API foundation is operational

- The API application builds and typechecks successfully.
- The Fastify application can be constructed without starting a network listener.
- The HTTP server starts with valid configuration.
- The Create Job route is registered.

### AC2 — Authentication is enforced

- Requests with valid access tokens reach the authorization boundary.
- Missing bearer tokens are rejected.
- Invalid or expired tokens are rejected.
- The authenticated subject comes from the verified token, not client-controlled request data.

### AC3 — Tenant authorization is enforced

- Authorized tenant operators and administrators can create jobs.
- Tenant viewers cannot create jobs.
- Users without tenant membership are rejected.
- A valid membership in another tenant does not grant access.
- Authorization repository failures do not allow job creation.

### AC4 — Job request validation is enforced

- Valid report, import, and notification payloads are accepted.
- Unsupported job types are rejected.
- Invalid type-specific payloads are rejected.
- Invalid tenant identifiers are rejected.
- Missing or malformed idempotency keys are rejected.

### AC5 — Idempotent creation behaves correctly

- A valid new request creates one job.
- Retrying an equivalent request with the same tenant and key returns the existing job.
- Conflicting requests using the same key are rejected.
- Different tenants do not share the same idempotency namespace.
- Job ownership is derived from the authenticated subject.

### AC6 — HTTP responses are consistent and safe

- New jobs return `201 Created`.
- Equivalent replays return `200 OK`.
- Authentication failures return `401 Unauthorized`.
- Authorization failures return `403 Forbidden`.
- Invalid requests return `400 Bad Request`.
- Idempotency conflicts return `409 Conflict`.
- Unexpected failures do not expose internal details or grant access.

### AC7 — Automated tests verify the API boundary

- HTTP tests exercise successful and rejected requests.
- Fastify injection tests run without requiring an open network port.
- Dependency injection supports isolated tests.
- Relevant integration tests verify composition with existing packages.
- Existing authentication, authorization, and database tests remain passing.

Record the actual test results, execution date, implementation Git revision, runtime versions, acceptance criteria status, and known limitations in:

`docs/evidence/api/e5-s1-validation.md`

Do not mark acceptance criteria as PASS until the corresponding verification has been completed.

## 7. Revisit Criteria

Reconsider this decision if:

- API requirements exceed the suitability of the selected HTTP framework.
- The platform introduces additional external API protocols.
- Multi-service deployment requires a dedicated API gateway.
- API throughput or latency measurements justify architectural changes.
- Authorization and job creation require stronger transactional consistency.
- Public API versioning requirements change.
- A distributed workflow requires asynchronous job submission semantics.
- Additional application modules justify introducing shared API infrastructure.
- Production security requirements demand more advanced request lifecycle controls.

Architectural changes that supersede this decision must be documented through a new ADR.

## 8. Traceability

- **Epic:** E5 — Job Management API
- **Story:** E5-S1 — Create Job API
- **Backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **API application:** `apps/api/`
- **Authentication and authorization:** `packages/auth/`
- **Job contracts:** `packages/contracts/`
- **Job persistence:** `packages/database/`
- **Verification evidence:** `docs/evidence/api/e5-s1-validation.md`
- **Related authentication ADR:** ADR-005 — OIDC Authentication and Identity Boundaries
- **Related authorization ADR:** ADR-006 — Tenant-Scoped Authorization and Role-Based Access Control

This decision establishes the HTTP API foundation for authenticated, tenant-scoped, and idempotent job creation.
