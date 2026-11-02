import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { resolve } from "node:path";
import { test } from "node:test";

import { signWebhook, verifyWebhook } from "../signing.js";
import { sendPinnedRequest } from "../transport/send-webhook.js";

test("delivers a signed webhook over real HTTPS", async () => {
  const fixtureDir = resolve(
    process.cwd(),
    "test-fixtures/webhook-tls-fixtures",
  );

  const [key, cert] = await Promise.all([
    readFile(resolve(fixtureDir, "webhook-test.key.pem"), "utf8"),
    readFile(resolve(fixtureDir, "webhook-test.cert.pem"), "utf8"),
  ]);

  const secret = "integration-secret-with-at-least-32-characters";
  const eventId = "event-123";
  const timestamp = Math.floor(Date.now() / 1000);

  const body = JSON.stringify({
    id: eventId,
    type: "job.completed",
    data: { jobId: "job-123" },
  });

  const received: string[] = [];

  const server = createServer({ key, cert }, (request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];

      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }

      const incomingBody = Buffer.concat(chunks).toString("utf8");
      const signature = String(request.headers["x-webhook-signature"] ?? "");

      const incomingTimestamp = Number(request.headers["x-webhook-timestamp"]);

      assert.equal(request.method, "POST");
      assert.equal(request.url, "/events");
      assert.equal(request.headers["x-webhook-id"], eventId);
      assert.equal(incomingBody, body);

      assert.equal(
        verifyWebhook({
          secret,
          timestamp: incomingTimestamp,
          body: incomingBody,
          signature,
        }),
        true,
      );

      received.push(incomingBody);
      response.writeHead(204);
      response.end();
    })().catch(() => {
      response.writeHead(400);
      response.end();
    });
  });

  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveListen);
    });

    const address = server.address();

    assert.ok(address && typeof address !== "string");

    const result = await sendPinnedRequest(
      new URL(`https://hooks.example.com:${address.port}/events`),
      { address: "127.0.0.1", family: 4 },
      body,
      {
        "X-Webhook-Id": eventId,
        "X-Webhook-Timestamp": String(timestamp),
        "X-Webhook-Signature": signWebhook({
          secret,
          timestamp,
          body,
        }),
      },
      5000,
      16384,
      cert,
    );

    assert.deepEqual(result, {
      kind: "delivered",
      statusCode: 204,
    });

    assert.deepEqual(received, [body]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
    });
  }
});
