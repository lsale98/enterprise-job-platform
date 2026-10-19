# Operations 05 — Performance, Load Testing and Capacity Planning

**Status:** Planned measurement framework; benchmark data not yet established  
**Related backlog:** Epic 11, Epic 12

## Why measure

The platform combines latency-sensitive HTTP requests with background work, database contention, outbound delivery and optional AI inference. These workloads need separate capacity measurements; a fast health endpoint is not representative of real use.

## Workload profiles

| Profile | Primary path | Core metrics |
| --- | --- | --- |
| Read | Authorized job listing / job detail | RPS, p95/p99, DB query time |
| Write | Job creation with validation + idempotency | Throughput, p95/p99, conflict rate |
| Processing | Worker executes `report` / `import` workloads | Jobs/min, CPU/RSS, retry rate |
| Delivery | Outbox dispatcher with slow/failing receiver | Pending age, retry count, delivery throughput |
| AI | Retrieval + embedding/model inference | p95, quality, model CPU/GPU/RAM |

## Test types

1. **Baseline:** Low concurrency, known fixtures; establish reference latency and resources.
2. **Load:** Expected concurrency and mix of read/write requests.
3. **Stress:** Increase traffic beyond expected load until the limiting resource is identified.
4. **Spike:** Introduce a sudden short-lived burst; inspect recovery and backlog.
5. **Soak:** Sustain load long enough to observe leaks, queue drift, exhausted connections or growing memory.
6. **Failure injection:** Restart worker, delay database, slow receiver, or disconnect a required dependency in a controlled environment.

## Minimum test report

```text
Test identifier / scenario:
Commit and container image digest:
Environment and machine/container limits:
Database size and fixture distribution:
Concurrency / arrival rate / duration:
Requests: total / passed / rejected:
RPS and p50/p95/p99 latency:
Worker throughput and queue age:
CPU, RSS/heap, GC and event loop delay:
PostgreSQL CPU, connection count, slow queries / locks:
Observed bottleneck:
Artifacts (profiles / k6 output / dashboards):
Decision / next action:
```

## Profiling strategy

- Node.js CPU profiling to identify CPU-bound hot paths.
- RSS and heap comparisons at baseline and sustained load; investigate trends rather than a single high value.
- Event loop delay to identify blocking synchronous work.
- PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` where safe for expensive queries.
- React Profiler and browser performance tools for client interactions and large tables.
- Separate AI performance from core job submission so inference saturation does not mask API capacity.

## Capacity decision process

1. Define target workload and peak business demand.
2. Measure baseline on a documented environment.
3. Identify first saturated dependency (CPU, memory, DB, I/O or external receiver).
4. Fix avoidable bottlenecks before increasing capacity.
5. Repeat tests after architectural or indexing changes.
6. Choose vertical/horizontal scaling policy with headroom and failure tolerance.
7. Record monthly cost assumptions and remeasure as usage changes.

## Exit criteria

Capacity is not approved without representative measurements, documented limits, repeatable test commands and evidence of acceptable behavior during failure/recovery. No unmeasured RPS, uptime or memory claims should be placed in the public README.
