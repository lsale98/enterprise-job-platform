# ADR-001 — Modular monorepo and runtime boundaries

| Field              | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Status**         | Accepted — laboratory decision, production deployment requires appropriate verification |
| **Date**           | 2026-10-19                                                                              |
| **Decision Owner** | Aleksandar Lakatos                                                                      |
| **ADR ID**         | ADR-001                                                                                 |

## 1. Context and problem

The same small team develops the API, two independently running background processes, Next.js web and common TypeScript contracts. We want one version of the contract, but different runtime limits.

**Business/Technical Scenario:** The API adds a new field to the Job DTO. In separate repositories, the web team may be late with changing the contract; in our repository, the contract and both consumers can be changed with one pull request.

## 2. Decision requirements and criteria

- API, web, worker and dispatcher share the same versioned TypeScript contract.
- Different processes can be started and scaled independently.
- Local builds and tests must have a reproducible dependency graph.

## 3. Considered alternatives

| Option                                 | Gain                                                                 | Price and risk                                                   |
| -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| More Git Repositories                  | Independent ownership and release cycle                              | Synchronization of API contracts and cross-repo changes          |
| One undifferentiated process           | Simple Local Boot                                                    | Independent scaling and failure isolation are more difficult     |
| **Turborepo + pnpm, modular monolith** | Common types, one PR can change API and consumer; separate processes | Clear APIs between packages and dependency controls are required |

No alternative is universally best. The choice should be seen in terms of requirements, number of teams, available budget, operational skills and guarantees that we can actually test.

## 4. Decision

**We accept the following approach:** one Git repo, pnpm workspaces and Turborepo for the build graph. We share `contracts`, `engine` and `database`, `api`, `worker`, `dispatcher` and `web` remain separate runtime processes. This does not mean that each module must directly access all other modules.

We do the implementation according to this contract. If the specific code shows that the contract cannot be fulfilled, we do not hide the discrepancy: we correct the implementation or write a new decision that replaces this one.

## 5. Consequences and compromises

### Positive consequences

- Changing the contract can go through one PR with the corresponding checks.
- pnpm workspace resolves internal packages, Turborepo orchestrates build, typecheck and test.
- Separate processes have independent restart/release and resource profiles.

### Negative consequences, risks and obligations

- Module independence is not automatic, we must avoid circular dependencies and unauthorized import through layers.
- The build graph and shared libraries become the responsibility of the team.
- Monorepo does not remove the need for API compatibility when deploy is not atomic.

## 6. Verification of the decision

After the implementation of the corresponding task, we perform the following specific checks:

1. Run `pnpm install` in root after creating the root manifest files.
2. Once you have added the shared packages, run `pnpm build`, `pnpm typecheck` and `pnpm test`.
3. Check that the apps have explicit dependencies on packages and that the build does not depend on the manual order of the commands.

**Proof is not the same as intent.** Until the tests are executed, their status is `NOT RUN`, not `PASS`. In `docs/evidence/adr-001/` save the date, git SHA, command, dependency versions, environment, expected and actual behavior, and note what could not be checked.

## 7. When we review a decision

- Different teams require independent release processes without mutual blockages.
- Separate regulatory boundaries require independent repositories or deploy.
- Measured build/deploy complexity becomes greater than using a shared repository.

When a new decision replaces this one, mark the old ADR as `Superseded by ADR-NNN', and let the new one explain the reasons and the migration plan. It does not erase the historical context.

## 8. References and association with the code

**Lesson:** `apps/docs/01-REPO-I-SETUP.md`. **Relevant files:**

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/contracts/package.json`

**Sources:**

- https://turborepo.com/docs
- https://pnpm.io/workspaces
