# 05 — Roadmap and Delivery Plan

## Delivery philosophy

The project should be delivered in progressive, testable slices.
Each phase should end with a usable checkpoint and documented evidence.

## Phase 0 — Discovery and planning

### Goals

- align on scope
- confirm business rules
- agree on non-functional requirements
- define architectural approach

### Deliverables

- project charter
- product requirements
- epics and task backlog
- initial ADR list

## Phase 1 — Foundation

### Goals

- prepare repository structure and tooling
- make local development reproducible

### Deliverables

- monorepo structure
- workspace tooling
- local database and identity provider
- initial docs structure

## Phase 2 — Core domain and persistence

### Goals

- define contracts and data model
- persist jobs and related metadata

### Deliverables

- shared contracts
- initial migrations
- repositories / persistence layer
- idempotency groundwork

## Phase 3 — Identity and API

### Goals

- secure the platform
- expose job management endpoints

### Deliverables

- OIDC integration
- RBAC and tenant checks
- create/list/details/retry/cancel APIs
- auth and integration tests

## Phase 4 — Worker and reliability

### Goals

- execute jobs asynchronously and safely
- recover from failure conditions

### Deliverables

- worker loop
- lease/heartbeat logic
- retries and recovery flow
- reliability tests

## Phase 5 — Web dashboard

### Goals

- provide operator-facing experience
- surface useful operational actions

### Deliverables

- authenticated Next.js dashboard
- jobs list and details views
- create/retry/cancel actions
- UI role-based behavior

## Phase 6 — Notifications and integrations

### Goals

- notify external systems reliably

### Deliverables

- durable outbox
- dispatcher runtime
- signed webhook delivery

## Phase 7 — AI-assisted analysis

### Goals

- provide tenant-safe AI assistance

### Deliverables

- embeddings / retrieval flow
- AI assistant endpoint
- source attribution and refusal behavior
- evaluation checklist

## Phase 8 — Production readiness

### Goals

- validate quality, security, and performance
- document operational workflows

### Deliverables

- security test coverage
- performance/load reports
- CI/CD documentation
- runbooks and release checklist

## Phase 9 — Kubernetes Orchestration

### Goals

- Introduce Kubernetes without rewriting application logic.
- Establish declarative infrastructure configuration.
- Validate independent workload management and recovery.
- Evaluate scaling and resource allocation.
- Prepare a controlled staging-to-production deployment process.

### Deliverables

- ADR-012: Kubernetes orchestration decision
- Local K3d deployment
- Kubernetes base manifests
- Customize environment overlays
- Database migration Jobs
- Resource requests, limits, and health probes
- Kubernetes CI validation
- Autoscaling evaluation
- Security and reliability test evidence
- Deployment and rollback procedures

### Exit criteria

Kubernetes workloads are verifiably functional, staging security checks pass, recovery behavior has been tested, and operational evidence is documented.

## Suggested milestone cadence

- Milestone 1: Foundation complete
- Milestone 2: Secure API and persistence complete
- Milestone 3: Worker reliability complete
- Milestone 4: Operator dashboard complete
- Milestone 5: AI and operational hardening complete
- Milestone 6: Kubernetes deployment and operational validation complete
