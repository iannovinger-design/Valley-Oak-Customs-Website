import assert from "node:assert/strict";
import test from "node:test";
import {
  PREVIEW_STORE, PRODUCTION_STORE, createNetlifyBlobInquiryStore, selectBlobStore,
} from "../netlify/functions/lib/netlify-blob-inquiry-store.mjs";

class FakeBlobStore {
  entries = new Map();
  sequence = 0;
  getCalls = [];
  constructor({ hideReads = false } = {}) {
    this.hideReads = hideReads;
  }
  async setJSON(key, value, options = {}) {
    const current = this.entries.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
    if (options.onlyIfMatch && !current) return { modified: false };
    const etag = `etag-${++this.sequence}`;
    this.entries.set(key, { data: structuredClone(value), etag, metadata: structuredClone(options.metadata ?? {}) });
    return { modified: true, etag };
  }
  async get(key, options = {}) {
    this.getCalls.push({ method: "get", key, options: structuredClone(options) });
    if (this.hideReads) return null;
    return structuredClone(this.entries.get(key)?.data ?? null);
  }
  async getWithMetadata(key, options = {}) {
    this.getCalls.push({ method: "getWithMetadata", key, options: structuredClone(options) });
    if (this.hideReads) return null;
    const value = this.entries.get(key);
    return value ? structuredClone(value) : null;
  }
}

const record = {
  schemaVersion: 1,
  inquiryId: "11111111-1111-4111-8111-111111111111",
  submittedAt: "2026-11-20T18:30:00.000Z",
  catalogRevision: "a".repeat(64),
  product: { dashboardProductId: "product-1", sku: "VOC-OT-008" },
  requestHash: "b".repeat(64),
};

test("generated Blob namespaces remain within Netlify's store-name limit", () => {
  const deployId = "6b008b2e0992330e671a785b";
  const previewNamespace = `deploy:${deployId}:${PREVIEW_STORE}`;
  const productionNamespace = `site:${PRODUCTION_STORE}`;

  assert.equal(PREVIEW_STORE, "verified-inquiries-preview");
  assert.notEqual(PREVIEW_STORE, "verified-product-inquiries-preview");
  assert.equal(previewNamespace.length, 58);
  assert.ok(previewNamespace.length < 64);
  assert.equal(productionNamespace.length, 31);
  assert.ok(productionNamespace.length < 64);
});

test("production and previews select different Blob store ownership", () => {
  const calls = [];
  const sdk = {
    getStore(options) { calls.push(["site", options]); return "site-store"; },
    getDeployStore(options) { calls.push(["deploy", options]); return "deploy-store"; },
  };
  assert.equal(selectBlobStore({ deploy: { context: "production" } }, sdk).store, "site-store");
  assert.equal(selectBlobStore({ deploy: { context: "deploy-preview" } }, sdk).store, "deploy-store");
  assert.equal(selectBlobStore({ deploy: { context: "branch-deploy" } }, sdk).store, "deploy-store");
  assert.deepEqual(calls, [
    ["site", { name: PRODUCTION_STORE, consistency: "strong" }],
    ["deploy", { name: PREVIEW_STORE, consistency: "strong" }],
    ["deploy", { name: PREVIEW_STORE, consistency: "strong" }],
  ]);
  assert.throws(() => selectBlobStore({ deploy: { context: "unknown" } }, sdk), /disabled/);
});

test("conditional writes suppress exact duplicates and reject UUID reuse", async () => {
  const blob = new FakeBlobStore();
  const store = createNetlifyBlobInquiryStore(blob);
  assert.equal((await store.createInquiry(record)).kind, "created");
  assert.equal((await store.createInquiry(record)).kind, "duplicate");
  assert.equal((await store.createInquiry({ ...record, requestHash: "c".repeat(64) })).kind, "conflict");
  assert.equal([...blob.entries.keys()].filter(key => key.startsWith("inquiries/")).length, 1);
  assert.deepEqual(await store.getInquiry(record.inquiryId), record);
  assert.ok(blob.getCalls.every(call => call.options.consistency === "strong" && call.options.type === "json"));
});

test("a successful conditional write is not accepted until exact strong read-back succeeds", async () => {
  const blob = new FakeBlobStore({ hideReads: true });
  const store = createNetlifyBlobInquiryStore(blob);
  await assert.rejects(store.createInquiry(record), /not readable from the expected store/);
  assert.equal(blob.entries.has(`inquiries/${record.inquiryId}.json`), true);
  assert.deepEqual(blob.getCalls, [{
    method: "get",
    key: `inquiries/${record.inquiryId}.json`,
    options: { type: "json", consistency: "strong" },
  }]);
});

test("concurrent notification claims have one winner and never mutate the inquiry", async () => {
  const blob = new FakeBlobStore();
  const store = createNetlifyBlobInquiryStore(blob);
  const now = new Date("2026-11-20T18:30:00.000Z");
  await store.createInquiry(record);
  const inquiryBefore = JSON.stringify(await blob.get(`inquiries/${record.inquiryId}.json`));
  await store.ensureNotification(record.inquiryId, now);
  const claims = await Promise.all([
    store.claimNotification(record.inquiryId, now, 3),
    store.claimNotification(record.inquiryId, now, 3),
  ]);
  assert.equal(claims.filter(item => item.claimed).length, 1);
  const winner = claims.find(item => item.claimed);
  assert.equal(await store.finishNotification(record.inquiryId, winner.token, "sent", now), true);
  assert.equal((await store.claimNotification(record.inquiryId, now, 3)).status, "sent");
  assert.equal(JSON.stringify(await blob.get(`inquiries/${record.inquiryId}.json`)), inquiryBefore);
  const status = await blob.get(`notification-status/${record.inquiryId}.json`);
  assert.equal(status.status, "sent");
  assert.equal(status.attempts, 1);
  assert.deepEqual(await store.getNotification(record.inquiryId), status);
});

test("failed claims are bounded and stale sending claims can recover", async () => {
  const blob = new FakeBlobStore();
  const store = createNetlifyBlobInquiryStore(blob);
  const start = new Date("2026-11-20T18:30:00.000Z");
  await store.createInquiry(record);
  await store.ensureNotification(record.inquiryId, start);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const time = new Date(start.getTime() + attempt * 301_000);
    const claim = await store.claimNotification(record.inquiryId, time, 3);
    assert.equal(claim.claimed, true);
    await store.finishNotification(record.inquiryId, claim.token, "failed", time, "delivery_failed");
  }
  const exhausted = await store.claimNotification(record.inquiryId, new Date(start.getTime() + 1_000_000), 3);
  assert.deepEqual(exhausted, { claimed: false, status: "failed" });
});
