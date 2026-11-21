import assert from "node:assert/strict";
import test from "node:test";
import { createAppsScriptNotifier } from "../netlify/functions/lib/apps-script-notifier.mjs";
import { catalogRevision, createProductInquiryHandler, productInquiryLimits } from "../netlify/functions/lib/product-inquiry-core.mjs";
import { createMemoryInquiryStore } from "./helpers/memory-inquiry-store.mjs";

const product = {
  slug: "bells-christmas-ornament-voc-ot-008",
  productId: "332188eb-35d9-4486-a022-010f7ebde880",
  sku: "VOC-OT-008",
  title: "Wooden Christmas Ornament – Bells",
  price: "10.00",
  quantity: 2,
};
const products = [product];
const id = "11111111-1111-4111-8111-111111111111";
const origin = "https://preview.example.invalid";
const valid = {
  submissionId: id,
  productId: product.productId,
  catalogRevision: catalogRevision(products),
  customerName: "Taylor Example",
  email: "taylor@example.invalid",
  fulfillment: "Shipping — request a quote",
  shippingZip: "72007",
  message: "",
  website: "",
};
const request = (body = valid, options = {}) => new Request(origin + "/api/product-inquiry", {
  method: options.method ?? "POST",
  headers: {
    origin: options.origin ?? origin,
    "content-type": options.type ?? "application/json",
    ...(options.headers ?? {}),
  },
  body: (options.method ?? "POST") === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
});
const quiet = { error() {} };

function fixture({ store = createMemoryInquiryStore(), notifier, maxNotificationAttempts } = {}) {
  const sent = [];
  const transport = notifier ?? { async send(record) { sent.push(structuredClone(record)); } };
  const handler = createProductInquiryHandler({
    products,
    store,
    notifier: transport,
    maxNotificationAttempts,
    clock: () => new Date("2026-11-20T18:30:00.000Z"),
    logger: quiet,
  });
  return { handler, store, sent };
}

test("a valid Bells inquiry stores canonical catalog data before notification", async () => {
  const f = fixture();
  const response = await f.handler(request());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.deepEqual(result, {
    accepted: true, inquiryId: id, duplicate: false, notification: "sent", message: "Your inquiry was received.",
  });
  assert.equal(f.store.inquiries.size, 1);
  assert.equal(f.sent.length, 1);
  const stored = f.store.inquiries.get(id);
  assert.equal(stored.product.dashboardProductId, product.productId);
  assert.equal(stored.product.sku, "VOC-OT-008");
  assert.equal(stored.product.title, product.title);
  assert.equal(stored.product.advertisedPrice, "10.00");
  assert.equal(stored.product.canonicalUrl, "https://valleyoakcustoms.com/products/bells-christmas-ornament-voc-ot-008");
  assert.equal(stored.fulfillment.shippingZip, "72007");
  assert.equal(stored.message, "Customer did not include an additional message.");
  assert.equal(stored.submittedAt, "2026-11-20T18:30:00.000Z");
  assert.equal(f.store.notifications.get(id).status, "sent");
});

test("unknown, stale, forged and invalid submissions never reach storage", async () => {
  for (const [name, body, expectedStatus, expectedCode] of [
    ["unknown product", { ...valid, productId: "unknown-product" }, 400, "unknown_product"],
    ["stale catalog", { ...valid, catalogRevision: "0".repeat(64) }, 409, "stale_catalog"],
    ["forged price", { ...valid, displayedPrice: "0.01" }, 400, "invalid_request"],
    ["forged SKU", { ...valid, sku: "FORGED" }, 400, "invalid_request"],
    ["invalid email", { ...valid, email: "invalid" }, 400, "invalid_customer_details"],
    ["missing ZIP", { ...valid, shippingZip: "" }, 400, "invalid_customer_details"],
    ["honeypot", { ...valid, website: "filled" }, 400, "invalid_request"],
    ["long message", { ...valid, message: "x".repeat(2001) }, 400, "invalid_customer_details"],
  ]) {
    const f = fixture();
    const response = await f.handler(request(body));
    assert.equal(response.status, expectedStatus, name);
    assert.equal((await response.json()).code, expectedCode, name);
    assert.equal(f.store.inquiries.size, 0, name);
    assert.equal(f.sent.length, 0, name);
  }
});

test("a Dashboard catalog item with no available quantity is rejected without code changes", async () => {
  const soldOutProducts = [{ ...product, quantity: 0 }];
  const store = createMemoryInquiryStore();
  const handler = createProductInquiryHandler({
    products: soldOutProducts,
    store,
    notifier: { async send() { throw new Error("notification must not run"); } },
    clock: () => new Date("2026-11-20T18:30:00.000Z"),
    logger: quiet,
  });
  const response = await handler(request({
    ...valid,
    catalogRevision: catalogRevision(soldOutProducts),
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "product_unavailable");
  assert.equal(store.inquiries.size, 0);
});

test("request method, origin, encoding and body-size boundaries fail closed", async () => {
  const f = fixture();
  assert.equal((await f.handler(request(valid, { method: "GET" }))).status, 405);
  assert.equal((await f.handler(request(valid, { origin: "https://other.invalid" }))).status, 403);
  assert.equal((await f.handler(request(valid, { type: "text/plain" }))).status, 415);
  assert.equal((await f.handler(request(valid, { headers: { "content-encoding": "gzip" } }))).status, 415);
  const oversized = "{" + " ".repeat(productInquiryLimits.maxBodyBytes) + "}";
  const tooLarge = await f.handler(request(oversized));
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).code, "request_too_large");
  assert.equal(f.store.inquiries.size, 0);
});

test("duplicate and concurrent requests create one inquiry and one notification", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.handler(request()), f.handler(request())]);
  assert.deepEqual([first.status, second.status].sort(), [201, 202]);
  assert.equal(f.store.inquiries.size, 1);
  assert.equal(f.sent.length, 1);
  const replay = await f.handler(request());
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).duplicate, true);
  assert.equal(f.sent.length, 1);
  const conflict = await f.handler(request({ ...valid, customerName: "Different Person" }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "submission_conflict");
});

test("storage and notification failures preserve truthful customer outcomes", async () => {
  const brokenStore = createMemoryInquiryStore({ failCreate: true });
  const noStore = fixture({ store: brokenStore });
  const failedStoreResponse = await noStore.handler(request());
  assert.equal(failedStoreResponse.status, 503);
  assert.equal((await failedStoreResponse.json()).accepted, false);
  assert.equal(noStore.sent.length, 0);

  let failNotification = true;
  const store = createMemoryInquiryStore();
  const calls = [];
  const f = fixture({ store, notifier: { async send(record) {
    calls.push(record.inquiryId);
    if (failNotification) throw new Error("synthetic mail failure");
  } } });
  const accepted = await f.handler(request());
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).notification, "failed");
  assert.equal(store.inquiries.size, 1);
  assert.equal(store.notifications.get(id).status, "failed");

  failNotification = false;
  const retry = await f.handler(request());
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).notification, "sent");
  assert.equal(store.inquiries.size, 1);
  assert.equal(calls.length, 2);
});

test("notification-status failure never removes the canonical inquiry", async () => {
  const store = createMemoryInquiryStore({ failStatus: true });
  const f = fixture({ store });
  const response = await f.handler(request());
  assert.equal(response.status, 202);
  assert.equal((await response.json()).notification, "unknown");
  assert.equal(store.inquiries.size, 1);
  assert.equal(f.sent.length, 0);
});

test("a single-attempt inquiry stores ambiguous delivery and never resends on UUID replay", async () => {
  let calls = 0;
  const notifier = createAppsScriptNotifier({
    endpoint: "https://script.google.com/macros/s/synthetic/exec",
    secret: "synthetic-test-secret-at-least-32-characters",
    maxAttempts: 1,
    fetchImpl: async () => {
      calls += 1;
      throw new DOMException("Synthetic timeout", "TimeoutError");
    },
  });
  const f = fixture({ notifier, maxNotificationAttempts: 1 });
  for (const duplicate of [false, true]) {
    const response = await f.handler(request());
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      accepted: true, inquiryId: id, duplicate, notification: "unknown", message: "Your inquiry was received.",
    });
  }
  assert.equal(calls, 1);
  assert.equal(f.store.inquiries.size, 1);
  assert.equal(f.store.notifications.get(id).status, "unknown");
  assert.equal(f.store.notifications.get(id).lastErrorCode, "delivery_unconfirmed");
  assert.equal(f.store.notifications.get(id).attempts, 1);
  assert.equal(f.store.notifications.get(id).sentAt, null);
});

test("a positive notifier acknowledgement cannot publish sent without a confirmed status update", async () => {
  for (const finish of [async () => false, async () => { throw new Error("Synthetic write timeout"); }]) {
    const store = createMemoryInquiryStore();
    const writes = [];
    store.finishNotification = async (inquiryId, token, outcome) => {
      writes.push({ inquiryId, token, outcome });
      return finish();
    };
    const f = fixture({ store, maxNotificationAttempts: 1 });
    for (let replay = 0; replay < 2; replay += 1) {
      const response = await f.handler(request());
      assert.equal(response.status, 202);
      assert.equal((await response.json()).notification, replay === 0 ? "unknown" : "pending");
    }
    assert.deepEqual(writes, [{ inquiryId: id, token: "claim-1", outcome: "sent" }]);
    assert.equal(f.sent.length, 1);
    assert.equal(store.inquiries.size, 1);
    assert.equal(store.notifications.get(id).status, "sending");
  }
});
