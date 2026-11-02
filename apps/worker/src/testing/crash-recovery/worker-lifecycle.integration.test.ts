import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Pool } from "pg";

import {
  startWorkerProcess,
  type StartedWorkerProcess,
} from "./worker-process.js";

function getTestDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for worker integration tests",
    );
  }

  return databaseUrl;
}

const databaseUrl = getTestDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
});

const activeProcesses = new Set<StartedWorkerProcess>();

after(async () => {
  await Promise.allSettled([...activeProcesses].map((worker) => worker.kill()));

  await pool.end();
});

async function assertTestDatabase(): Promise<void> {
  const result = await pool.query<{ database: string }>(
    `SELECT current_database() AS database`,
  );

  assert.equal(
    result.rows[0]?.database,
    "lab_test",
    "Worker integration tests must use lab_test",
  );
}

async function launchWorker(): Promise<StartedWorkerProcess> {
  const worker = startWorkerProcess({
    databaseUrl,
  });

  activeProcesses.add(worker);

  try {
    await worker.waitForStart();
    return worker;
  } catch (error) {
    await worker.kill();
    activeProcesses.delete(worker);
    throw error;
  }
}

async function terminateWorker(worker: StartedWorkerProcess): Promise<void> {
  try {
    await worker.kill();
  } finally {
    activeProcesses.delete(worker);
  }
}

test(
  "worker can restart after unexpected process termination",
  { timeout: 30_000 },
  async () => {
    await assertTestDatabase();

    const firstWorker = await launchWorker();

    assert.ok(firstWorker.process.pid);
    assert.equal(firstWorker.process.exitCode, null);

    await terminateWorker(firstWorker);

    assert.notEqual(firstWorker.process.exitCode, null);

    const secondWorker = await launchWorker();

    assert.ok(secondWorker.process.pid);
    assert.equal(secondWorker.process.exitCode, null);

    assert.notEqual(secondWorker.process.pid, firstWorker.process.pid);

    await terminateWorker(secondWorker);
  },
);
