# 06 — Delivery and Release Checklists

## Feature Definition of Ready

A feature is ready for implementation when:

- business intent is understood
- acceptance criteria are written
- dependencies are known
- security implications are considered
- test approach is identified

## Feature Definition of Done

A feature is done when:

- implementation is complete
- automated tests exist where appropriate
- acceptance criteria are met
- security and failure scenarios were considered
- documentation was updated
- code review is complete

## Security checklist

- authentication enforced where required
- authorization enforced server-side
- tenant isolation verified
- secrets not committed
- audit implications considered
- input validation in place

## Reliability checklist

- failure scenarios considered
- retries bounded
- recovery path documented
- observability signals available

## Performance checklist

- relevant endpoints included in load test plan
- p95/p99 goals or baseline observations documented
- CPU and memory impact considered

## Release checklist

- migrations reviewed
- environment variables confirmed
- rollback steps documented
- smoke test plan prepared
- backup / restore assumptions reviewed
- deployment owner identified

## Post-release verification

- authentication works
- critical endpoints healthy
- worker processes jobs
- UI can list jobs
- logs and metrics available
- no obvious permission regression
