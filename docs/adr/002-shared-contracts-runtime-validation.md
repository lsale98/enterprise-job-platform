# ADR-002 — Shared TypeScript Contracts and Runtime Validation

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| **Status**         | Accepted — for the Enterprise Job Platform implementation              |
| **Date**           | 2026-10-20                                                             |
| **Decision owner** | Aleksandar Lakatos                                                     |
| **Epic**           | E2 — Shared Contracts and Core Engine                                  |
| **User story**     | E2-S1 — Shared Contracts                                               |
| **Scope**          | `packages/contracts/`; does not include the processing engine in E2-S2 |

## 1. Context and problem

The Enterprise Job Processing Platform has several independently runnable consumers of the same business data: a Fastify API, a background worker, and a Next.js web application. They must agree on the structure of job creation requests, stored jobs, and API responses.

If each application defines its own interfaces, their definitions can drift. A successful TypeScript build does not prove that values received from HTTP, the database, or another runtime actually match those interfaces: TypeScript types are removed during compilation.

For example, a request may claim to be a `report` job but contain a `notification` payload, or provide an empty array where a report requires at least one finite number. Such inputs must be rejected **before** they enter business logic.

**User story:** As an engineer, I want shared contracts so that API and UI agree on data shapes.

**Acceptance criteria:**

- **AC1:** Shared job payload and response contracts exist.
- **AC2:** Invalid payloads are rejected at runtime boundaries.

## 2. Requirements and constraints

- Define job types and supported input payloads in one reusable workspace package.
- Define job status and the shared job response shape.
- Derive TypeScript types from runtime schemas, rather than maintaining equivalent types independently.
- Validate untrusted values at the boundary with `parse` or `safeParse`.
- Make payload validation dependent on the `type` discriminant (`report`, `import`, or `notification`).
- Keep schemas independent of Fastify, Next.js, database clients, and UI frameworks.
- Support the existing `pnpm` workspace, strict TypeScript configuration, and compiled ESM package exports.
- Ensure the package emits JavaScript and declarations to paths that match its `package.json` entry points and test scripts.
- Keep E2-S2 concurrency, retry, and cancellation logic outside this decision.

## 3. Alternatives considered

| Option                                                | Benefits                                                                                                          | Limitations and costs                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Separate TypeScript interfaces in each app            | No shared package required                                                                                        | Contract drift, duplicated maintenance, no runtime validation                                                   |
| Shared TypeScript types only                          | Strong compile-time feedback across the monorepo                                                                  | Incoming JSON still contains untrusted values; types disappear at runtime                                       |
| JSON Schema with Ajv and generated TypeScript types   | Standards-based schemas, fast validation, interoperability                                                        | Additional generation/tooling workflow and possible schema/type drift if poorly configured                      |
| **Shared Zod schemas with inferred TypeScript types** | Single declaration for runtime validation and inferred types; concise discriminated unions; straightforward tests | Adds a runtime dependency and schema parsing overhead; requires deliberate compatibility and version management |

## 4. Decision

Create a reusable pnpm workspace package named **`@lab/contracts`** at `packages/contracts/`.

1. Define `JobTypeSchema`, `JobInputSchema`, `JobStatusSchema`, `JobSchema`, and `CreateJobSchema` with Zod.
2. Use a discriminated union on the `type` field to make each job payload shape explicit.
3. Derive `JobType`, `JobInput`, `JobStatus`, and `Job` using `z.infer`, preventing separately maintained runtime and compile-time definitions.
4. Export role and permission definitions from the shared contract package. These definitions describe possible roles and permissions; **the API must still enforce authorization against trusted server-side identity and organization membership** in later stories.
5. Validate untrusted values using `safeParse` or `parse` at runtime boundaries. A TypeScript annotation alone must never be treated as input validation.
6. Publish the package **within the monorepo only** through its `package.json` entry points; consumers declare an explicit `"@lab/contracts": "workspace:*"` dependency.
7. Use ESM output compiled by `tsc` with `rootDir: "./src"` and `outDir: "./dist"` inside `packages/contracts/tsconfig.json`. The package's `main`, `types`, exports, and `node --test dist/index.test.js` script must resolve to files produced by the build.
8. Keep the shared contract implementation framework-agnostic. HTTP route integration, database persistence, and Next.js consumption are delivered in later epics.

**Canonical implementation files:**

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    └── index.test.ts
```

**Build-path invariant:** `pnpm --filter @lab/contracts build` must generate `packages/contracts/dist/index.js`, `packages/contracts/dist/index.d.ts`, and `packages/contracts/dist/index.test.js` before executing the current test script.

## 5. Consequences and trade-offs

**Positive consequences**

- API, worker, and web applications can import one shared description of jobs.
- Invalid inputs are rejected at runtime rather than relying on erased TypeScript types.
- Discriminated unions make invalid combinations of job kinds and payload shapes easier to detect.
- Changes to the schema become visible to downstream packages during type checking and testing.
- The package remains independent of transport and presentation concerns.

**Negative consequences and limitations**

- Every consumer of the shared package must maintain a compatible version of the schema and dependency graph.
- Schema changes may break callers; introducing a new job kind requires coordinated changes across workers and the API.
- Zod incurs runtime parsing cost, which should be measured if validation becomes a bottleneck.
- A shared package can create unnecessary coupling if it expands into unrelated business domains. Keep its public surface focused.
- Zod's default object behavior and the chosen constraints are part of the actual contract; they should be tested and documented. Current `createdAt`/`updatedAt` fields are strings, **not** validated ISO timestamps, and `JobSchema` does not yet guarantee that `type` matches `input.type`. Those stronger invariants can be proposed and implemented through a future story with corresponding tests.
- Shared role definitions are **not** a substitute for authentication, RBAC policy evaluation, or tenant isolation.

## 6. Verification and evidence

### AC1 — Shared payload and response contracts

Verify that `packages/contracts/src/index.ts` exports `CreateJobSchema`, `JobInputSchema`, `JobSchema`, their inferred types, and the supported job statuses.

### AC2 — Invalid payloads rejected at runtime

The tests in `packages/contracts/src/index.test.ts` must cover:

- valid `report`, `import`, and `notification` payloads;
- empty report arrays, `NaN`, invalid import records, and empty notification fields;
- unknown job types and mismatched discriminated-union payloads;
- valid job response and responses with invalid UUIDs, statuses, or payloads.

### Reproducible verification commands

Run from the repository root:

```powershell
pnpm --filter @lab/contracts build
pnpm --filter @lab/contracts typecheck
Test-Path packages/contracts/dist/index.test.js
pnpm --filter @lab/contracts test
```

**Expected:** build and typecheck succeed, `Test-Path` returns `True`, and the test runner reports zero failed tests. The result must be recorded only after execution.

Store actual evidence in `docs/evidence/contracts/e2-s1-validation.md`, including the date, Git SHA, Node and pnpm versions, commands, test counts, and any unresolved failures. **Do not claim E2-S1 has passed testing until the commands above succeed.**

### Scope boundaries

A successful E2-S1 package test validates the reusable schemas; it does **not** prove that future HTTP routes already invoke them. API request-boundary integration tests belong to E5, and web consumption checks belong to E8.

## 7. Revisit criteria

Reassess this decision if:

- external clients require a language-neutral OpenAPI/JSON Schema contract as the primary source of truth;
- runtime validation overhead becomes material under measured production-like load;
- independent deployment and versioning of services makes lockstep shared-package evolution impractical;
- domain growth requires splitting contracts into smaller packages;
- stricter input/output invariants or backward compatibility requirements necessitate schema versioning.

If a replacement architecture is selected, create a new ADR and mark this one as superseded rather than silently rewriting the historical decision.

## 8. References and traceability

- **Epic:** E2 — Shared Contracts and Core Engine
- **Story:** E2-S1 — Shared Contracts
- **Public backlog:** `docs/backlog/02-user-stories-and-tasks.md`
- **Implementation:** `packages/contracts/src/index.ts`
- **Tests:** `packages/contracts/src/index.test.ts`
- **Build configuration:** `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- **Verification evidence:** `docs/evidence/contracts/e2-s1-validation.md`
- **Related future story:** E2-S2 — Core Engine (concurrency, retry, and cancellation)
- [Zod documentation](https://zod.dev/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [pnpm workspaces](https://pnpm.io/workspaces)
