# ADR-015 — Keycloak Persistence and Environment Isolation

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Status       | Accepted for local implementation    |
| Date         | 2026-11-05                           |
| Epic         | E8 — Operator Web Application        |
| Story        | E8-S1 — Secure Operator Dashboard    |
| Scope        | Keycloak, PostgreSQL, Docker Compose |
| Related ADRs | ADR-005, ADR-014                     |

## 1. Context

Keycloak initially used an embedded H2 database.

Recreating its container could destroy users, credentials, MFA
configuration, and realm settings.

Enterprise Job Platform requires persistent identity storage and
isolated local, test, development, and production environments.

## 2. Decision

Use PostgreSQL as the Keycloak persistence backend.

- Run Keycloak PostgreSQL separately from EJP business PostgreSQL.
- Persist local identity data using a Docker named volume.
- Keep Keycloak database ports inaccessible from the host.
- Use health checks before starting Keycloak.
- Keep realm bootstrap configuration version-controlled.
- Keep credentials and database backups outside Git.
- Use independent databases and secrets for each environment.
- Use disposable infrastructure for automated tests.
- Never import development users into production.

Keycloak exclusively manages its database schema and migrations.

## 3. Alternatives

| Alternative                    | Decision                              |
| ------------------------------ | ------------------------------------- |
| Container-local H2             | Rejected: data loss during recreation |
| Persistent H2 volume           | Rejected: development-only database   |
| Shared EJP PostgreSQL database | Rejected: lifecycle coupling          |
| Dedicated PostgreSQL database  | Accepted: independent persistence     |

## 4. Migration

Existing H2 data was exported using the Keycloak CLI and imported
into PostgreSQL.

Existing user identifiers were preserved.

The original H2 backup is retained outside the repository.

## 5. Verification

The following checks were performed:

- Realm import completed successfully (exit code 0).
- Keycloak started with PostgreSQL.
- OIDC discovery endpoint responded successfully.
- Keycloak container recreation preserved configuration.
- PostgreSQL container recreation preserved data.
- Existing users and custom login theme remained available.
- Repository formatting validation passed.
- Git whitespace validation passed.

## 6. Consequences

### Benefits

- Identity data survives container recreation.
- Database lifecycle is independent of Keycloak containers.
- EJP business data remains isolated.
- Environment-specific deployment is supported.

### Trade-offs

- Additional database infrastructure.
- Backup and recovery procedures are required.
- Database availability becomes a Keycloak dependency.

## 7. Known Limitations

- Local Keycloak still runs in development mode.
- Automated backup and restore remain unimplemented.
- Separate test infrastructure is not yet verified.
- Development and production deployment are deferred to E12.
- Database persistence does not guarantee session continuity.
- H2-to-PostgreSQL migration verification was performed locally.

## 8. Result

Local Keycloak PostgreSQL persistence verified.

E8-S1 remains in progress.
