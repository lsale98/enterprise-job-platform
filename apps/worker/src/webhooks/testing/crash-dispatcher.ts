import { Pool } from "pg";

import {
  claimWebhookDelivery,
  completeWebhookDelivery,
} from "@lab/database/webhook-repository";

async function main(): Promise<void> {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });

  const mode = process.env.WEBHOOK_TEST_MODE;

  try {
    const database = await pool.query<{ name: string }>(
      "SELECT current_database() AS name",
    );

    if (database.rows[0]?.name !== "lab_test") {
      throw new Error("Only lab_test is permitted");
    }

    const delivery = await claimWebhookDelivery(pool, {
      workerId: `test-dispatcher-${process.pid}`,
      leaseSeconds: 60,
    });

    if (!delivery) {
      throw new Error("No pending webhook delivery");
    }

    if (delivery.id !== process.env.WEBHOOK_TEST_EVENT_ID) {
      throw new Error("Unexpected webhook delivery claimed");
    }

    if (mode === "crash") {
      process.send?.({
        kind: "claimed",
        leaseOwner: delivery.leaseOwner,
        attempt: delivery.attempt,
      });

      // The parent forcefully terminates this process.
      await new Promise<void>(() => {});
      return;
    }

    if (mode === "recover") {
      // This process-level test uses a controlled successful
      // delivery result, not an external HTTP request.
      const result = await completeWebhookDelivery(pool, {
        id: delivery.id,
        leaseOwner: delivery.leaseOwner,
        attempt: delivery.attempt,
      });

      if (result.kind !== "updated") {
        throw new Error("Recovered delivery could not complete");
      }

      process.send?.({ kind: "completed" });
      return;
    }

    throw new Error("Invalid test mode");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
