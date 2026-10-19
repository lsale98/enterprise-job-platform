# Architecture 06 — Architecture Decision Register

**Document status:** Proposed decision register  
**Purpose:** Explain the major design choices, their alternatives and the point at which review is needed.

This register is **public project documentation**. Full Architecture Decision Records (ADRs) should live in `docs/adr/` as implementation proceeds. Do not mark an unreviewed decision as production-approved.

| ID | Decision topic | Baseline choice | Alternative worth reviewing | Review trigger |
| --- | --- | --- | --- | --- |
| ADR-001 | Repository and runtime boundaries | pnpm/Turborepo modular monorepo; separate deployable processes | Multiple repositories / microservices | Independent team release needs |
| ADR-002 | Controlled concurrency | Bounded concurrent I/O and explicit retries | Unbounded Promise concurrency | Resource exhaustion / throughput limits |
| ADR-003 | Transaction boundary | PostgreSQL transactions and constraints | Application-only consistency | New cross-service consistency needs |
| ADR-004 | Identity and tenancy | OIDC provider + API RBAC and current membership checks | Custom authentication / claim-only authorization | New compliance or federation requirements |
| ADR-005 | HTTP idempotency | Tenant-scoped uniqueness and request fingerprint | Redis-only dedup | New retention / latency requirement |
| ADR-006 | Job delivery semantics | PostgreSQL queue, lease and at-least-once processing | External broker / managed queue | Database queue saturation |
| ADR-007 | External notifications | Transactional outbox with signed webhooks | Direct send inside transaction | Delivery or integration requirements change |
| ADR-008 | Web rendering boundary | Next.js App Router / server-first data access | Client-only SPA + polling | Rich real-time interaction requirements |
| ADR-009 | Tenant-scoped AI retrieval | Tenant-filtered pgvector retrieval and local model | Hosted AI / keyword-only search | Quality, cost, data residency, SLO |
| ADR-010 | Capacity validation | Profile and measure before sizing | Guess-based VM sizing | Representative benchmark contradicts plan |
| ADR-011 | Deployment model | Separate web/API/worker/dispatcher runtimes and managed production dependencies where appropriate | Single process, Kubernetes, fully managed platform | Reliability, cost or team scale requirements |

## Review process

1. Identify the architectural problem and the decision owner.
2. Explain business and non-functional constraints.
3. Record credible alternatives and trade-offs.
4. Choose a baseline before implementing the affected feature.
5. Record evidence and consequences after testing.
6. Mark decisions as `Proposed`, `Accepted`, `Deprecated` or `Superseded` as appropriate.

## Relationships

- [System context](01-system-context.md)
- [Component and data flows](02-components-and-data-flow.md)
- [Identity and tenancy](03-identity-authorization-and-tenancy.md)
- [Job reliability](04-job-lifecycle-and-recovery.md)
- [AI and data boundaries](05-data-and-ai-boundaries.md)
- [Project roadmap](../05-roadmap.md)

This register should not contain private tutorials or complete application source code.
