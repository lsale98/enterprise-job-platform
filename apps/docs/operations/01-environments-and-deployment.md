# Operations 01 — Environments and Deployment Strategy

**Status:** Proposed operational plan  
**Related backlog:** Epic 12  
**Deployment readiness:** Not verified; environment-specific validation required

## Environment matrix

| Concern | Local development | Staging | Production |
| --- | --- | --- | --- |
| Purpose | Fast feedback / feature work | Integrated release verification | Live authorized business use |
| Identity | Dedicated development OIDC realm | Separate test realm | Approved corporate identity configuration |
| Database | Local PostgreSQL container | Isolated test database | Managed or operationally supported database |
| Secrets | Local, uncommitted environment variables | Secret manager / protected variables | Secret manager with controlled access/rotation |
| External webhooks | Controlled test receiver | Sandbox destinations | Approved HTTPS destinations |
| AI inputs | Synthetic documents | Non-sensitive, approved test fixtures | Only authorized data under a documented policy |
| Monitoring | Console and basic metrics | Metrics/logs/traces plus alerts validation | Monitored SLOs and incident ownership |

**Important:** Production must never reuse local Keycloak credentials, example secrets or development URLs.

## Deployment units

The initial runtime deployment units are:

1. `web` — Next.js application and server-side backend-for-frontend operations.
2. `api` — Fastify HTTP API with database connectivity.
3. `worker` — Job acquisition, execution and lease/heartbeat processing.
4. `dispatcher` — Outbox delivery and retry processing.
5. PostgreSQL — Persistent database, preferably managed or backed by a defined operations plan.
6. OIDC identity provider — Managed or securely operated, with controlled client configuration.
7. Optional local AI model runtime — Sized separately from latency-critical services.

Running processes can share source packages without being forced to scale together.

## Public and private network boundaries

- Only the intended web entrypoint should be publicly accessible by default.
- API exposure is an explicit deployment decision; it must not be opened simply for convenience.
- PostgreSQL and internal service ports must not be public.
- Only approved systems may access administrative identity endpoints.
- Outbound webhook destinations must use HTTPS in staging/production and should be allowlisted when possible.
- Apply TLS, origin controls, secure cookies, network restrictions and rate limits according to threat model.

## Deployment sequence

1. Review release manifest, config changes and database migrations.
2. Confirm backups and a tested recovery point.
3. Apply backward-compatible schema changes with appropriate locking considerations.
4. Deploy API and worker/dispatcher versions compatible with the current schema.
5. Deploy web application.
6. Run authenticated and unauthenticated smoke tests.
7. Validate job submission, worker processing, outbox delivery and logs.
8. Monitor error rate, latency, queue backlog and DB health after rollout.
9. Record deployment version and evidence.

## Infrastructure sizing

Do not select VM/container sizes using guessed requests-per-second numbers. Establish representative workloads (job sizes, concurrent operators, webhook failure rates and AI usage), measure CPU/RAM/DB utilization and choose capacity with failure headroom. See [Performance and capacity](05-performance-and-capacity.md).

## Rollback considerations

Application rollback is only safe if schema migrations remain compatible. Prefer expand–migrate–contract database changes. Do not assume a destructive migration can be reversed without restoring data. See [Release management](02-ci-cd-and-release-management.md) and [Backup and recovery](06-backup-restore-and-incidents.md).

## Exit criteria

A production release cannot be approved until deployment, recovery, secrets management, observability, identity configuration and essential security tests are verified in an appropriate environment.
