import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createAppsScriptNotifier, notificationPayload, signNotification } from "../netlify/functions/lib/apps-script-notifier.mjs";

const record = {
  inquiryId: "11111111-1111-4111-8111-111111111111",
  submittedAt: "2026-11-20T18:30:00.000Z",
  product: {
    dashboardProductId: "332188eb-35d9-4486-a022-010f7ebde880", sku: "VOC-OT-008",
    title: "Wooden Christmas Ornament – Bells", advertisedPrice: "10.00",
    slug: "bells-christmas-ornament-voc-ot-008",
    canonicalUrl: "https://valleyoakcustoms.com/products/bells-christmas-ornament-voc-ot-008",
    quantityAtSubmission: 2,
  },
  customer: { name: "Taylor Example", email: "taylor@example.invalid" },
  fulfillment: { choice: "Local pickup", shippingZip: "" },
  message: "Customer did not include an additional message.",
};
const secret = "phase69-synthetic-secret-at-least-32-characters";
const endpoint = "https://script.google.com/macros/s/synthetic-deployment-id/exec";

test("signed envelopes cover the timestamp and exact canonical payload", () => {
  const payload = notificationPayload(record);
  const envelope = signNotification({ timestamp: "2026-11-20T18:31:00.000Z", payload, secret });
  const expected = createHmac("sha256", secret).update(`${envelope.timestamp}.${envelope.payload}`).digest("hex");
  assert.equal(envelope.signature, expected);
  assert.deepEqual(JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")), payload);
  assert.doesNotMatch(JSON.stringify(envelope), new RegExp(secret));
});

test("the notifier retries a transient failure within its fixed bound", async () => {
  const requests = [];
  const notifier = createAppsScriptNotifier({
    endpoint, secret, maxAttempts: 2,
    clock: () => new Date("2026-11-20T18:31:00.000Z"),
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      if (requests.length === 1) throw new Error("synthetic network failure");
      return Response.json({ ok: true, inquiryId: record.inquiryId, duplicate: false });
    },
  });
  assert.equal((await notifier.send(record)).ok, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].payload, requests[1].payload);
});

test("the notifier stops after the configured attempts and validates configuration", async () => {
  let calls = 0;
  const notifier = createAppsScriptNotifier({
    endpoint, secret, maxAttempts: 2,
    fetchImpl: async () => { calls += 1; return new Response("no", { status: 503 }); },
  });
  await assert.rejects(notifier.send(record), /rejected/);
  assert.equal(calls, 2);
  assert.throws(() => createAppsScriptNotifier({ endpoint: "http://invalid", secret }), /endpoint/);
  assert.throws(() => createAppsScriptNotifier({ endpoint, secret: "short" }), /secret/);
});
