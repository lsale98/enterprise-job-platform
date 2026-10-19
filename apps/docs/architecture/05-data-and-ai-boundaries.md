# Architecture 05 — Data Ownership, Consistency and AI Boundaries

**Document status:** Design baseline  
**Related backlog:** Epics 3, 9, 10

## Primary persistence

PostgreSQL is the system of record for job processing and tenancy. Important logical entities are:

| Entity | Main purpose | Tenant-owned? |
| --- | --- | --- |
| `tenants` | Organization identity | N/A |
| `identities` | Mapping from external identity subject to local record | Shared identity; linked through membership |
| `memberships` | Subject-to-tenant role assignment | Yes |
| `jobs` | Job input, state, attempts, scheduling and result | Yes |
| `imported_records` | Idempotently imported business records | Yes |
| `notification_outbox` | Durable webhook delivery record | Yes |
| `audit_events` | Traceability of sensitive/business actions | Yes |
| `knowledge_documents` | Documents/embeddings used in AI retrieval | Yes |

## Consistency strategy

- Transactions guard related state changes (for example, a job completion and notification outbox creation).
- Unique constraints enforce idempotency and other invariants under concurrency.
- Foreign keys preserve ownership and referential integrity.
- Query parameters are never a substitute for authorization checks.
- Tenant-scoped SQL is mandatory on read and write paths; PostgreSQL Row-Level Security may be assessed as an additional defense layer.

## Tenant-scoped retrieval

The AI assistant is an optional operational tool. A user asks a question; the server verifies the current tenant membership, then retrieves documents restricted to that tenant. Relevant fragments are passed to a local model. The final answer includes supported source references or acknowledges insufficient evidence.

**Security requirements**

1. Never rely on model instructions to enforce tenant isolation.
2. Do not pass documents from an unauthorized tenant into model context.
3. Treat retrieved documents as untrusted text; a document saying "ignore prior rules" is still data.
4. Treat model output as untrusted and unsuitable for access-control decisions.
5. Do not claim that RAG eliminates hallucinations.
6. Validate citations against documents actually retrieved and authorized.
7. Define retention and sensitivity policy before using real customer data.

## Evaluation plan

| Evaluation dimension | Example check |
| --- | --- |
| Retrieval relevance | Known answer appears in top retrieved sources |
| Tenant isolation | Identical query cannot leak neighboring tenant documents |
| Citation correctness | Every cited source was retrieved and belongs to tenant |
| Abstention | Unsupported questions result in an insufficient-evidence response |
| Prompt injection | Embedded commands do not override trusted application instructions |
| Performance | AI request latency and resource use recorded by model version |

## AI trade-offs

The laboratory design considers PostgreSQL/pgvector plus a local model runtime to minimize external data disclosure. Hosted models may be appropriate later if contractual, privacy, data-residency and capacity requirements permit. This choice must be reviewed with actual client data classifications, performance targets and cost measurements.

## Validation status

This document specifies design and test expectations. Evaluation artifacts, benchmark numbers and successful security-test claims should only be published after those checks have run against the relevant code revision.
