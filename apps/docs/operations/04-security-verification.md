# Operations 04 — Security Verification Plan

**Status:** Planned test matrix; execution evidence required  
**Related backlog:** Epics 4, 5, 9, 10, 12

## Test boundaries

Run active security checks only against environments owned by the team or explicitly authorized for testing. Avoid destructive or high-volume tests against production unless scoped and approved.

## Authentication and session tests

| ID      | Scenario                                               | Expected result                                 |
| ------- | ------------------------------------------------------ | ----------------------------------------------- |
| SEC-001 | Missing credentials on protected route                 | `401`                                           |
| SEC-002 | Invalid/expired/tampered internal identity assertion   | Rejected                                        |
| SEC-003 | Logout or revoked session followed by protected action | No access under defined session policy          |
| SEC-004 | Session cookie security properties                     | HttpOnly, Secure in HTTPS, appropriate SameSite |
| SEC-005 | CSRF attempt against browser mutation                  | Rejected or protected by verified defense       |
| SEC-006 | OIDC issuer/audience/redirect validation               | No acceptance of unintended identities          |

## Authorization and tenancy tests

| ID      | Scenario                                              | Expected result                             |
| ------- | ----------------------------------------------------- | ------------------------------------------- |
| SEC-007 | Viewer attempts to create/cancel job                  | `403`                                       |
| SEC-008 | Tenant A member requests tenant B job by known ID     | No data disclosure                          |
| SEC-009 | Tenant A admin modifies tenant B membership           | Denied                                      |
| SEC-010 | Role is revoked while login session remains valid     | Next protected action reflects current role |
| SEC-011 | Forged tenant identifier in URL/body/header           | Membership + ownership enforced             |
| SEC-012 | AI question/retrieval requests foreign tenant content | Retrieval contains no foreign documents     |

## Input, API and supply-chain tests

| ID      | Scenario                                            | Expected result                                             |
| ------- | --------------------------------------------------- | ----------------------------------------------------------- |
| SEC-013 | Invalid JSON and schema violations                  | Structured client error                                     |
| SEC-014 | Excessively large request body                      | Rejected within configured limit                            |
| SEC-015 | Duplicate idempotency key with conflicting payload  | `409`                                                       |
| SEC-016 | SQL-injection-like input on filter/search endpoints | Parameterized queries; no code execution                    |
| SEC-017 | Excess request rate                                 | Consistent throttling response when policy applies          |
| SEC-018 | Known vulnerable direct/transitive dependency       | Reported and triaged against severity policy                |
| SEC-019 | Secret accidentally introduced into repository      | Detected by secret scanning; removed/rotated                |
| SEC-020 | Invalid webhook signature/replay                    | Receiver rejects invalid signature and deduplicates repeats |

## AI-specific threat checks

- Context from another tenant never appears in retrieval.
- Retrieved text that impersonates system instructions does not become privileged policy.
- Unsupported answers abstain rather than fabricating sources.
- Citations point only to authorized, retrieved sources.
- Prompt and response logs do not leak sensitive inputs.

## Evidence format

For each check record:

```text
Test ID:
Commit SHA:
Date / environment:
Preconditions / fixture:
Command or test runner:
Expected outcome:
Actual outcome:
Evidence location:
Result: PASS / FAIL / BLOCKED / NOT RUN
Issue link if failed:
```

Do not publish raw tokens, real client data or internal vulnerability proof-of-concept details in a public repository. Where necessary, publish redacted summaries and retain sensitive evidence in protected storage.

## Release gate

The project is **not security verified** until required automated tests run and findings are triaged. A checklist with no recorded test outcomes is a plan, not a passing audit.
