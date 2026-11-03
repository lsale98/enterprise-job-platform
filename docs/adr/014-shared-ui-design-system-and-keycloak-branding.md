# ADR-014 — Shared UI Design System and Keycloak Branding

| Field                 | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Status                | Proposed — pending implementation review                |
| Date                  | 2026-11-03                                              |
| Epic                  | E8 — Operator Web Application                           |
| User story            | E8-S1 — Secure Operator Dashboard                       |
| Scope                 | `packages/ui/`, `apps/web/`, `infrastructure/keycloak/` |
| Related ADRs          | ADR-001, ADR-005, ADR-006                               |
| Verification evidence | `docs/evidence/ui/e8-s1-ui-foundation-validation.md`    |

## 1. Context and Problem

Enterprise Job Platform requires an authenticated operator-facing
web application.

The original E8 backlog defines two user stories:

- E8-S1 — Secure Operator Dashboard.
- E8-S2 — Job Management UI.

The operator dashboard must provide a consistent interface while
preserving established authentication and authorization boundaries.

The platform uses:

- Next.js and React for the operator application.
- Keycloak as the OpenID Connect identity provider.
- Fastify as the business API.
- PostgreSQL-backed tenant membership and authorization.
- TypeScript and pnpm workspaces.

The user-facing login interface must match the platform's visual
identity without transferring authentication responsibility to
the Next.js application.

A shared design system is required to avoid duplicating visual
decisions across the web application and the Keycloak login theme.

The solution must not couple Keycloak to React, Next.js, or
application-specific UI components.

## 2. Decision Drivers

The solution must:

1. Establish consistent visual design tokens.
2. Support reusable, type-safe React components.
3. Use Tailwind CSS v4.
4. Provide explicit component variants.
5. Support accessible interaction patterns.
6. Keep the design system independent of business logic.
7. Preserve Keycloak as the authentication authority.
8. Avoid duplicating authentication forms in Next.js.
9. Support independent testing of UI components.
10. Integrate with the existing pnpm/Turborepo architecture.
11. Keep generated assets out of source control.
12. Support future theme customization.
13. Preserve server-side authorization and tenant isolation.

## 3. Alternatives Considered

### 3.1 Shared UI architecture

| Alternative                         | Advantages                          | Trade-offs                                       |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Components inside `apps/web`        | Simple initial setup                | Limited reuse and increased application coupling |
| Separate external design system     | Independent releases                | Unnecessary operational complexity               |
| **Workspace package `packages/ui`** | Shared components, types and tokens | Requires package build and dependency management |

**Decision:** Use `@lab/ui` as a private pnpm workspace package.

### 3.2 Styling strategy

| Alternative         | Advantages                                      | Trade-offs                                            |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| CSS Modules         | Explicit style isolation                        | More component-specific CSS                           |
| CSS-in-JS           | Dynamic styling APIs                            | Additional runtime and rendering considerations       |
| **Tailwind CSS v4** | Utility-first styling and CSS theme integration | Requires controlled class generation and distribution |

**Decision:** Use Tailwind CSS v4.

### 3.3 Component variants

| Alternative                  | Advantages                 | Trade-offs                    |
| ---------------------------- | -------------------------- | ----------------------------- |
| Manual variant maps          | No additional dependency   | Repetitive variant logic      |
| Custom variant engine        | Full control               | Maintenance and testing costs |
| **Class Variance Authority** | Typed declarative variants | Adds a small dependency       |

**Decision:** Use CVA for component variants.

### 3.4 Keycloak branding

| Alternative                     | Advantages                                    | Trade-offs                                           |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Custom Next.js credential form  | Full React control                            | Duplicates authentication responsibilities           |
| Default Keycloak theme          | Minimal maintenance                           | Does not match the application brand                 |
| **Custom Keycloak login theme** | Branded login with Keycloak-owned credentials | Requires theme maintenance and compatibility testing |

**Decision:** Use a custom Keycloak-hosted login theme.

## 4. Decision

### 4.1 Shared UI package

Create `packages/ui` with package name `@lab/ui`.

The package owns:

- Shared design tokens.
- Tailwind theme definitions.
- Reusable React components.
- Component variant definitions.
- Class name composition utilities.
- Component-level tests.
- CSS distribution.

The package must not own:

- Authentication sessions.
- Tenant membership.
- Authorization policies.
- API request orchestration.
- Database access.
- Job lifecycle business rules.

### 4.2 Design tokens

Use CSS custom properties with the `--ejp-` prefix.

Token categories include:

- Brand colors.
- Foreground and background colors.
- Semantic status colors.
- Typography.
- Border radius.
- Spacing.

Tailwind theme values reference the shared CSS variables.

Initial values are provisional until the platform's
visual identity is approved.

Changes to token semantics should be reviewed to avoid
breaking existing component behavior.

### 4.3 Tailwind CSS distribution

The UI package uses Tailwind CSS v4 and its CLI during
the package build.

The package produces a compiled CSS entry point:

`dist/styles/ui.css`

The package also distributes source-defined design tokens
and theme styles through its build outputs.

The initial package build runs:

1. TypeScript compilation.
2. Static CSS asset copying.
3. Tailwind CSS generation.

Applications consuming the compiled UI stylesheet must avoid
loading duplicate Tailwind preflight and conflicting base
stylesheets.

The compiled stylesheet includes utility classes discovered
in the UI package.

Application-specific Tailwind utility generation is a separate
integration concern.

Before introducing application-level Tailwind compilation,
the integration must establish:

- One consistent Tailwind version.
- A deliberate preflight ownership strategy.
- Correct scanning of shared UI components.
- Predictable CSS import ordering.
- No conflicting theme definitions.

The CSS distribution approach must be revisited if
independent application and library compilation creates
unacceptable duplication or missing utility classes.

### 4.4 React component architecture

Components use React 19 and TypeScript.

React is declared as a peer dependency.

Components must:

- Support native HTML attributes where appropriate.
- Preserve native browser semantics.
- Forward refs where appropriate.
- Provide accessible names and keyboard behavior.
- Support disabled and pending states where relevant.
- Avoid embedding API authorization logic.
- Use explicit, typed public interfaces.

### 4.5 Component variants

Use Class Variance Authority for variant definitions.

Use `clsx` and `tailwind-merge` through a shared `cn()`
utility for conditional and conflicting class names.

Avoid introducing additional variant systems without
an explicit architectural reason.

Variant names should remain consistent where components
share the same semantic intent.

### 4.6 Keycloak responsibility

Keycloak remains responsible for:

- Credential collection and validation.
- Authentication.
- Login failure handling.
- Identity provider session management.
- MFA and required actions.
- OIDC authorization flows.
- Token issuance.
- User provisioning through administrative workflows.

Self-service user registration is disabled for the
initial operator application.

Next.js must not implement a parallel password login
or persist user credentials.

The web application initiates the OIDC authorization flow
and manages its own application session.

### 4.7 Keycloak theme architecture

The custom login theme lives under:

`infrastructure/keycloak/`

Keycloak does not import or execute React components.

The theme uses Keycloak-supported templates and CSS.

It must share the approved semantic design values with
the operator application.

The theme asset synchronization approach must be
documented and verified before the theme is considered complete.

Manual duplication of design tokens is acceptable only
as an explicitly temporary development step.

Theme compatibility must be tested against the configured
Keycloak version.

Required actions, authentication errors, and MFA flows
must remain functional even when the initial visual scope
focuses on the login screen.

### 4.8 Authentication and authorization boundaries

Authentication follows ADR-005.

Tenant membership and authorization follow ADR-006.

The web application may hide unavailable UI actions for
usability, but this must never be considered an
authorization boundary.

The Fastify API remains responsible for enforcing:

- Valid access tokens.
- Current tenant membership.
- Required operation permissions.
- Tenant-owned resource access.
- Input validation.
- Job lifecycle constraints.

Client-selected tenant identifiers must never grant
access on their own.

### 4.9 UI testing strategy

UI tests are organized by responsibility.

Canonical testing directories:

`packages/ui/tests/unit/`

`packages/ui/tests/components/`

`packages/ui/tests/setup/`

Unit tests cover:

- Class name composition.
- CVA variant generation.
- Pure helper functions.

Component tests cover:

- Rendering.
- Native HTML behavior.
- User interaction.
- Disabled and loading states.
- Accessibility attributes.
- Keyboard interaction.
- Ref forwarding.

Use Vitest, React Testing Library, user-event,
jest-dom, and jsdom.

Browser-dependent visual behavior requires separate
browser-level verification.

jsdom component tests do not demonstrate that generated
Tailwind CSS renders correctly in an actual browser.

## 5. Implementation Boundaries

### Completed foundation work reported locally

The initial implementation includes:

- `@lab/ui` workspace package.
- React and TypeScript configuration.
- Tailwind CSS v4 CLI build.
- Shared CSS design tokens.
- CVA component variant configuration.
- `cn()` helper.
- Button component.
- Button unit and component tests.

These items require reproducible validation evidence
before they are treated as formally verified project work.

### E8-S1 remaining work

- Initialize the Next.js operator application.
- Integrate Tailwind and shared UI assets.
- Implement the Keycloak-hosted login theme.
- Implement OIDC authentication and application sessions.
- Implement the authenticated application layout.
- Enforce authentication for protected routes.
- Implement server-side API access patterns.
- Add current user context.
- Add authorized tenant context.
- Test authentication and tenant boundaries.

### E8-S2 remaining work

- Implement the jobs table.
- Implement filters and cursor pagination.
- Implement job detail views.
- Implement job creation.
- Implement retry and cancellation actions.
- Reflect server-authorized role capabilities.
- Display authorized audit data.
- Handle pending, conflict and error states.
- Add relevant integration and E2E tests.

## 6. Verification Requirements

### UI foundation

Verify:

- UI package TypeScript build.
- UI package TypeScript typecheck.
- Test TypeScript typecheck.
- Unit and component test execution.
- Tailwind CSS output generation.
- CSS asset distribution.
- ESLint compliance.
- Prettier compliance.

### Authentication integration

Verify:

- Successful OIDC login.
- Rejection of unauthenticated access.
- Correct application session behavior.
- Token expiry and refresh handling.
- Safe logout.
- Protection against invalid session states.
- Backend authorization enforcement.

### Tenant isolation

Verify:

- Access to an authorized tenant.
- Rejection of unauthorized tenant access.
- Rejection of cross-tenant job access.
- Role revocation behavior.
- Audit permission boundaries.

### Keycloak theme

Verify:

- Login page rendering.
- Incorrect credential feedback.
- Authentication error display.
- Required action compatibility.
- Responsive layout.
- Keyboard and accessibility behavior.
- Compatibility with the configured Keycloak version.

## 7. Consequences

### Positive

- Consistent platform visual identity.
- Reusable and independently testable React components.
- Clear separation of UI and business logic.
- Keycloak remains the authentication authority.
- Backend authorization cannot be bypassed through UI state.
- Component behavior can be tested before application integration.

### Costs and limitations

- Shared UI introduces an additional build dependency.
- Tailwind stylesheet distribution requires integration discipline.
- Keycloak theme templates must track supported provider changes.
- Design token synchronization requires explicit maintenance.
- Component-level tests do not replace browser E2E testing.
- Shared UI does not by itself satisfy E8-S1 acceptance criteria.

## 8. Revisit Criteria

Reconsider this decision if:

- Multiple consuming applications require incompatible styling.
- Tailwind compilation introduces duplicate or conflicting CSS.
- Design token synchronization becomes unreliable.
- React package compatibility requirements diverge.
- Keycloak theme upgrades repeatedly break supported flows.
- Accessibility testing identifies architectural limitations.
- Component complexity requires additional composition patterns.

Significant changes require a new ADR or an explicit
superseding decision.

## 9. Traceability

### Original backlog

- `apps/docs/backlog/01-epics-and-features.md`
- `apps/docs/backlog/02-user-stories-and-tasks.md`

### Product requirements

- FR-001 — Authentication.
- FR-002 — Role-based authorization.
- FR-003 — Multi-tenancy.
- FR-011 — Job listing and filtering.
- FR-012 — Job details.
- FR-015 — Dashboard.

### Non-functional requirements

- Security.
- Maintainability.
- Reproducible local development.
- Automated testing.
- Clear module boundaries.

### Evidence

- `docs/evidence/ui/e8-s1-ui-foundation-validation.md`

The shared UI foundation is a supporting dependency
of E8-S1.

It does not independently complete E8-S1 or E8-S2.

## 10. Decision Status

**Proposed**

The ADR documents the architecture implemented so far
and the agreed direction for E8.

Acceptance requires review of actual package exports,
generated CSS, test results, and integration boundaries.

The original E8-S1 and E8-S2 acceptance criteria
remain unchanged.
