# Operations 02 — CI/CD and Release Management

**Status:** Target delivery workflow  
**Related backlog:** Epics 1, 9, 12

## Goals

- Catch regressions before merge.
- Build reproducibly from a lockfile.
- Deploy safely without exposing secrets.
- Provide traceability from change to release and rollback.

## Pull request checks

| Stage | Required check | Failure policy |
| --- | --- | --- |
| Dependencies | Frozen lockfile install | Block merge |
| Code style | Lint / formatting checks | Block merge |
| Type safety | TypeScript checks across relevant workspaces | Block merge |
| Unit | Engine, contracts and policy behavior | Block merge |
| Integration | API and PostgreSQL behavior; isolated test dependencies | Block merge when configured |
| Security | Audit/scanning and tenant/auth negative tests | Block merge on agreed severity/policy |
| Build | Web/API/worker/dispatcher build | Block merge |
| E2E | Critical browser flows in authenticated staging/test environment | Required before release |

Performance soak tests may run on a scheduled or dedicated pipeline because they are long-running. Critical load regression thresholds should be agreed before enforcing them as gates.

## Environment separation

- Feature branches run automated checks.
- Staging is deployed from a reviewed integration point or release candidate.
- Production requires explicit approval and a known artifact/commit.
- Production secrets are never copied into pull-request jobs from untrusted branches.

## Release record

Every release must record:

- version identifier / Git commit SHA
- build artifact digest or equivalent identifier
- dependency lockfile revision
- migration list
- configuration changes (without secret values)
- pre-release evidence
- approver and operator
- smoke-test results
- rollback reference

## Deployment controls

1. Confirm dependency scan and integration tests.
2. Confirm migrations are compatible with the previously deployed version.
3. Deploy in a documented order.
4. Perform readiness/health checks.
5. Verify an authorized job submission completes.
6. Verify tenant boundary and negative-authentication smoke tests.
7. Observe error rate, latency and backlog before closing deployment.

## Rollback plan

- Restore the previous application artifacts if safe with the current schema.
- Stop dispatchers/workers before an unsafe rollback that could process messages incompatibly.
- If data has been irreversibly transformed, use a documented recovery/migration-forward procedure rather than promising a simple rollback.
- Record which version/commit was restored and why.

## Required evidence

Keep CI output, security scan outcomes and deployment verification attached to the release in the chosen workflow. Redact passwords, tokens, customer information and other sensitive data before publishing evidence in a public repository.

## Open decisions

Build runner, container registry, deployment provider, approval gates, artifact signing and runtime secret store require environment-specific decisions. They are not implicitly solved by this document.
