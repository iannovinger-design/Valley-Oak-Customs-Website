import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { notificationPayload, signNotification } from "../netlify/functions/lib/apps-script-notifier.mjs";

const source = await readFile(new URL("../apps-script/product-inquiry-notifier/Code.gs", import.meta.url), "utf8");
const secret = "phase69-synthetic-secret-at-least-32-characters";
const recipient = "owner@example.invalid";
const record = {
  inquiryId: "11111111-1111-4111-8111-111111111111",
  submittedAt: new Date().toISOString(),
  product: {
    dashboardProductId: "332188eb-35d9-4486-a022-010f7ebde880", sku: "VOC-OT-008",
    title: "Wooden Christmas Ornament – Bells", advertisedPrice: "10.00",
    slug: "bells-christmas-ornament-voc-ot-008",
    canonicalUrl: "https://valleyoakcustoms.com/products/bells-christmas-ornament-voc-ot-008",
    quantityAtSubmission: 2,
  },
  customer: { name: "Taylor Example", email: "taylor@example.invalid" },
  fulfillment: { choice: "Shipping — request a quote", shippingZip: "72007" },
  message: "Customer did not include an additional message.",
};

function appsScript({ mailFails = 0, lockAvailable = true, propertyWriteFails = false } = {}) {
  const values = new Map([
    ["VOC_INQUIRY_HMAC_SECRET", secret],
    ["VOC_INQUIRY_RECIPIENT", recipient],
  ]);
  const messages = [];
  let remainingFailures = mailFails;
  const propertyStore = {
    getProperty(key) { return values.get(key) ?? null; },
    setProperty(key, value) {
      if (propertyWriteFails && key.startsWith("sent:")) throw new Error("synthetic property failure");
      values.set(key, value);
    },
  };
  const lock = {
    held: false,
    tryLock() { this.held = lockAvailable; return lockAvailable; },
    hasLock() { return this.held; },
    releaseLock() { this.held = false; },
  };
  const context = vm.createContext({
    console: { error() {} }, Date, JSON, isFinite,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) { return { text, setMimeType() { return this; }, getContent() { return this.text; } }; },
    },
    PropertiesService: { getScriptProperties() { return propertyStore; } },
    LockService: { getScriptLock() { return lock; } },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      computeHmacSha256Signature(value, key) {
        return [...createHmac("sha256", key).update(value, "utf8").digest()].map(byte => byte > 127 ? byte - 256 : byte);
      },
      base64DecodeWebSafe(value) { return [...Buffer.from(value, "base64url")]; },
      newBlob(bytes) { return { getDataAsString() { return Buffer.from(bytes).toString("utf8"); } }; },
    },
    MailApp: { sendEmail(message) {
      if (remainingFailures-- > 0) throw new Error("synthetic Gmail failure");
      messages.push(structuredClone(message));
    } },
  });
  vm.runInContext(source, context);
  return {
    messages, values,
    send(envelope) {
      const output = context.doPost({ postData: { contents: JSON.stringify(envelope) } });
      return JSON.parse(output.getContent());
    },
  };
}

function envelope(timestamp = new Date().toISOString()) {
  return signNotification({ timestamp, payload: notificationPayload(record), secret });
}

test("Apps Script verifies, locks, sends the useful message and suppresses replay", () => {
  const script = appsScript();
  const first = script.send(envelope());
  assert.deepEqual(first, { ok: true, inquiryId: record.inquiryId, duplicate: false });
  assert.equal(script.messages.length, 1);
  const mail = script.messages[0];
  assert.equal(mail.to, recipient);
  assert.equal(mail.replyTo, record.customer.email);
  assert.equal(mail.subject, "New Product Inquiry — VOC-OT-008");
  for (const value of [record.inquiryId, record.product.title, record.product.dashboardProductId, "$10.00", "72007", record.message]) {
    assert.match(mail.body, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const replay = script.send(envelope());
  assert.deepEqual(replay, { ok: true, inquiryId: record.inquiryId, duplicate: true });
  assert.equal(script.messages.length, 1);
});

test("invalid HMAC, expired requests and lock contention send nothing", () => {
  const invalid = appsScript();
  const bad = envelope(); bad.signature = "0".repeat(64);
  assert.equal(invalid.send(bad).code, "invalid_signature");
  assert.equal(invalid.messages.length, 0);

  const expired = appsScript();
  assert.equal(expired.send(envelope(new Date(Date.now() - 600_000).toISOString())).code, "expired_request");
  assert.equal(expired.messages.length, 0);

  const busy = appsScript({ lockAvailable: false });
  assert.equal(busy.send(envelope()).code, "busy");
  assert.equal(busy.messages.length, 0);
});

test("a failed Gmail call is observable and can be retried safely", () => {
  const script = appsScript({ mailFails: 1 });
  assert.equal(script.send(envelope()).code, "delivery_failed");
  assert.equal(script.messages.length, 0);
  assert.equal(script.send(envelope()).ok, true);
  assert.equal(script.messages.length, 1);
});

test("the documented send-before-ledger gap can produce a recognizable duplicate", () => {
  const script = appsScript({ propertyWriteFails: true });
  assert.equal(script.send(envelope()).code, "delivery_failed");
  assert.equal(script.send(envelope()).code, "delivery_failed");
  assert.equal(script.messages.length, 2);
  assert.match(script.messages[0].body, new RegExp(record.inquiryId));
  assert.match(script.messages[1].body, new RegExp(record.inquiryId));
});
