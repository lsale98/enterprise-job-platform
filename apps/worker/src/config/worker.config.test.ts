import assert from "node:assert/strict";
import { test } from "node:test";

import { loadWorkerConfig } from "./worker.config.js";

const env = {
  DATABASE_URL: "postgresql://localhost:5433/test",
};

test("loads default configuration", () => {
  const config = loadWorkerConfig(env);

  assert.equal(config.concurrency, 4);
  assert.equal(config.pollMs, 1000);
  assert.equal(config.leaseSeconds, 60);
  assert.equal(config.heartbeatMs, 10000);
});

test("does not require or expose tenant ID", () => {
  const config = loadWorkerConfig(env);

  assert.equal(Object.hasOwn(config, "tenantId"), false);
});

test("rejects concurrency outside limits", () => {
  assert.throws(() =>
    loadWorkerConfig({
      ...env,
      WORKER_CONCURRENCY: "0",
    }),
  );

  assert.throws(() =>
    loadWorkerConfig({
      ...env,
      WORKER_CONCURRENCY: "33",
    }),
  );
});

test("rejects unsafe heartbeat interval", () => {
  assert.throws(() =>
    loadWorkerConfig({
      ...env,
      WORKER_LEASE_SECONDS: "10",
      WORKER_HEARTBEAT_MS: "6000",
    }),
  );
});

test("loads custom configuration", () => {
  const config = loadWorkerConfig({
    ...env,
    WORKER_CONCURRENCY: "8",
    WORKER_POLL_MS: "500",
    WORKER_LEASE_SECONDS: "120",
    WORKER_HEARTBEAT_MS: "15000",
  });

  assert.equal(config.concurrency, 8);
  assert.equal(config.pollMs, 500);
  assert.equal(config.leaseSeconds, 120);
  assert.equal(config.heartbeatMs, 15000);
});
