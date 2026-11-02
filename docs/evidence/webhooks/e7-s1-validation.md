# E7-S1 — Reliable Webhook Outbox Validation Evidence

## Metadata

- Date: 2026-11-02
- Epic: E7 — Notifications and Outbox
- Story: E7-S1 — Reliable Webhook Outbox
- Branch: `feat/e7-s1-webhook-outbox`
- Git revision: `d7bfda8`
- Node version: v24.15.0
- pnpm version: 10.18.3

## Verification Results

| Command / Verification                  | Status                               |
| --------------------------------------- | ------------------------------------ |
| `pnpm --filter worker test:integration` | PASS — 8 tests passed, 0 failed      |
| Worker crash recovery                   | PASS — stale ownership rejected      |
| Worker process restart                  | PASS                                 |
| HTTP 200 PostgreSQL webhook delivery    | PASS                                 |
| HTTP 503 retry scheduling               | PASS — event identifier preserved    |
| HTTP 400 terminal failure               | PASS — no retry                      |
| Expired dispatcher lease recovery       | PASS                                 |
| Signed HTTPS webhook delivery           | PASS                                 |
| Dispatcher process crash recovery       | PASS                                 |
| DNS lookup callback regression          | PASS — HTTPS integration test passed |
| `pnpm --filter worker build`            | Not independently verified           |
| `pnpm --filter worker typecheck`        | Not independently verified           |
| GitHub Actions CI                       | Not yet verified                     |

## Acceptance Criteria

### AC1 — Webhook events are persisted in PostgreSQL

**Status: PASS**

Webhook delivery uses a PostgreSQL-backed transactional outbox.

Webhook records maintain tenant and job associations, delivery status, attempt counts, retry information and failure details.

The PostgreSQL-backed integration tests confirm successful delivery and persisted delivery state transitions.

### AC2 — Webhook delivery is decoupled from job execution

**Status: PASS**

Webhook delivery is handled by a dedicated worker dispatcher.

Job execution and webhook dispatching are separate operations.

The dispatcher processes persisted events independently of the original job execution lifecycle.

### AC3 — HTTP responses are classified correctly

**Status: PASS**

The integration tests confirm the expected HTTP delivery behavior:

- HTTP 200 completes webhook delivery successfully.
- HTTP 503 schedules a retry.
- HTTP 400 produces a terminal failure without retry.

The transport distinguishes successful, retryable and non-retryable HTTP responses.

### AC4 — Webhook identifiers remain stable across retries

**Status: PASS**

The HTTP 503 integration test verifies that retry scheduling preserves the original webhook event identifier.

Retries operate on the same logical event rather than generating a new event identity.

This supports consumer-side deduplication under at-least-once delivery semantics.

### AC5 — Dispatcher lease ownership supports crash recovery

**Status: PASS**

The integration tests validate expired dispatcher lease recovery and process crash recovery.

A replacement dispatcher can continue eligible webhook delivery after the original dispatcher process terminates unexpectedly.

Lease-based ownership provides coordination between dispatcher processes.

### AC6 — Signed HTTPS webhook delivery is functional

**Status: PASS**

The HTTPS integration test verifies successful delivery of a signed webhook over a real TLS connection.

The receiver returns HTTP 204 and the transport classifies the response as delivered.

The test uses locally configured TLS certificates without globally disabling certificate verification.

### AC7 — DNS pinning handles Node.js lookup callback formats

**Status: PASS**

The HTTPS integration test initially failed with:

```text
ERR_INVALID_IP_ADDRESS
Invalid IP address: undefined
```

The failure originated from the custom DNS lookup callback in the webhook transport.

The callback returned a single IP address even when Node.js requested an array of resolved addresses using `all: true`.

The implementation was corrected to support both lookup response formats:

```typescript
lookup: (_hostname, options, callback) => {
  const resolved = {
    address: address.address,
    family: address.family,
  };

  if (
    typeof options === "object" &&
    options.all === true
  ) {
    callback(null, [resolved]);
    return;
  }

  callback(null, resolved.address, resolved.family);
},
```

After the correction, the signed HTTPS integration test passed.

The complete worker integration suite also passed successfully.

The correction preserves DNS pinning without disabling TLS certificate verification.

### AC8 — Webhook transport retains security protections

**Status: PASS — implementation reviewed**

The webhook transport maintains the following protections:

- Destination URL validation.
- DNS resolution and resolved-address validation.
- DNS pinning to the validated destination address.
- TLS hostname verification.
- TLS certificate verification.
- No automatic HTTP redirect following.
- Request timeout enforcement.
- Response size limits.
- HMAC-based webhook signing.

The `sendWebhook()` production API does not expose test-specific TLS certificate configuration.

The `sendPinnedRequest()` transport supports an optional trusted certificate for HTTPS integration testing.

This criterion confirms the implemented controls and successful HTTPS integration behavior; it does not represent a complete security audit.

### AC9 — Worker crash recovery rejects stale ownership

**Status: PASS**

The worker crash recovery integration test verifies that a job can be recovered after unexpected worker termination.

The test also validates rejection of stale ownership.

A separate integration test confirms that the worker process can restart after unexpected termination.

Both scenarios passed successfully.

### AC10 — Integration tests validate reliable webhook delivery

**Status: PASS**

The following command completed successfully:

```powershell
pnpm --filter worker test:integration
```

Results:

```text
tests 8
pass 8
fail 0
cancelled 0
skipped 0
```

Verified scenarios:

1. Worker crash recovery and stale ownership rejection.
2. Worker restart after unexpected termination.
3. HTTP 200 PostgreSQL webhook delivery.
4. HTTP 503 retry scheduling with stable event identifier.
5. HTTP 400 terminal failure without retry.
6. Expired dispatcher lease recovery.
7. Signed HTTPS webhook delivery.
8. Dispatcher process crash recovery.

The integration suite validates PostgreSQL persistence, HTTP behavior, HTTPS transport and process recovery.

### AC11 — Validation evidence is documented

**Status: PASS**

This document records the E7-S1 implementation scope, executed integration tests, DNS lookup regression, acceptance criteria and known limitations.

The verification results are based on the successful local integration test execution.

Build, typechecking and CI results are not marked as successful without separately confirmed execution evidence.

## Known Limitations

- Webhook delivery follows at-least-once semantics; exactly-once delivery is not guaranteed.
- Consumers must deduplicate repeated webhook events using the stable event identifier.
- Local integration tests do not replace production load testing.
- Full security and penetration testing remain separate verification activities.
- Operational monitoring and alerting require additional production validation.
- GitHub Actions CI results must be verified separately before merge.
- Build and typechecking results have not been independently recorded in this evidence document.
- Integration validation was performed in the local development environment.

## Final Result

**E7-S1 Integration Validation Status: VALIDATED**

The reliable webhook outbox implementation passes all eight worker integration tests.

PostgreSQL-backed webhook delivery, HTTP retry classification, terminal failure handling, expired lease recovery, signed HTTPS delivery and dispatcher crash recovery have been validated.

The DNS lookup callback regression was resolved without disabling TLS verification or DNS pinning.

**Integration tests: 8 PASS, 0 FAIL.**

Final PR approval and merge remain dependent on required CI checks and any outstanding repository quality gates.
