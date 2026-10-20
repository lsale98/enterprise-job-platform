# Backlog — 01 Epics and Features

## Epic 1 — Project Foundation

### Features

- repository setup
- monorepo tooling
- code quality tooling
- local infrastructure bootstrap
- engineering documentation structure

## Epic 2 — Shared Contracts and Core Engine

### Features

- shared TypeScript contracts
- concurrency utilities
- retry and cancellation logic
- validation boundaries
- reusable domain primitives

## Epic 3 — Persistence and Data Model

### Features

- database schema design
- migrations
- repositories / data access layer
- audit model
- idempotency persistence

## Epic 4 — Identity and Access Management

### Features

- OIDC integration
- session handling
- organization model
- RBAC model
- server-side authorization policies

## Epic 5 — Job Management API

### Features

- create job endpoint
- list/filter jobs endpoint
- job details endpoint
- cancel job endpoint
- retry job endpoint
- health and readiness endpoints

## Epic 6 — Background Processing and Reliability

### Features

- queue polling
- lease acquisition
- heartbeat updates
- retry orchestration
- recovery of stuck jobs
- worker observability

## Epic 7 — Notifications and Outbox

### Features

- outbox table
- dispatcher service
- signed webhook delivery
- retryable delivery attempts
- delivery evidence

## Epic 8 — Operator Web Application

### Features

- login flow
- tenant-aware navigation
- jobs table
- filters and details views
- create/retry/cancel actions
- audit visibility

## Epic 9 — Security and Quality Assurance

### Features

- auth tests
- authorization tests
- tenant isolation tests
- dependency scanning
- integration and e2e tests
- security evidence capture

## Epic 10 — AI-Assisted Analysis

### Features

- document ingestion metadata
- embeddings storage
- tenant-scoped retrieval
- AI assistant endpoint
- source attribution
- evaluation scenarios

## Epic 11 — Performance and Load Validation

### Features

- CPU and memory profiling
- API load tests
- stress tests
- spike tests
- soak tests
- capacity notes

## Epic 12 — Deployment and Operations

### Features

- Dockerization
- CI pipeline
- deployment workflow
- environment configuration
- backup / restore
- runbooks
- rollback checklist
- Kubernetes orchestration as an optional deployment target
- K3d-based local Kubernetes environment
- Kubernetes Deployments and internal Services
- Kustomize overlays for local, staging, and production
- Kubernetes database migration Jobs
- Container health probes and resource management
- Horizontal Pod Autoscaler evaluation
- Kubernetes security and secrets management
- Rolling updates, rollback, and failure recovery testing
