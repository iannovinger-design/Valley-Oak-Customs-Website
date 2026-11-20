import assert from "node:assert/strict";
import test from "node:test";
import { createInquiryEdge, config } from "../netlify/edge-functions/product-inquiry.js";

const product = {
  slug: "bells-ornament", title: "Wooden Christmas Ornament – Bells", sku: "VOC-OT-008",
  productId: "synthetic-test-product-id", price: "10.00",
};
const other = { slug: "older-item", title: "Older item", sku: "TEST-02", productId: null, price: "20.00" };
const origin = "https://review.example.invalid";
const path = "/product-inquiry-submit.html";
const valid = {
  "form-name": "product-inquiry", "bot-field": "", product_slug: product.slug, expected_price: "10.00",
  customer_name: "Taylor Example", email: "taylor@example.invalid", fulfillment_interest: "Shipping — request a quote",
  shipping_zip: "72007", questions: "",
};
const fixtures = { site: { id: "test-site" }, deploy: { context: "deploy-preview" }, user: { id: "reviewer" } };
const request = (body = valid, { route = path, from = origin, type = "application/x-www-form-urlencoded" } = {}) =>
  new Request(origin + route, {
    method: "POST", headers: { origin: from, "content-type": type },
    body: typeof body === "string" ? body : new URLSearchParams(body).toString(),
  });

function receiver(downstream = () => new Response("Mock capture", { status: 200 })) {
  const captures = [];
  const context = { ...fixtures, next: async forward => {
    assert.equal(forward.method, "POST");
    assert.equal(new URL(forward.url).pathname, path);
    assert.equal(forward.headers.get("content-type"), "application/x-www-form-urlencoded");
    assert.equal(forward.headers.get("content-length"), null);
    captures.push(await forward.text());
    return downstream();
  } };
  return { captures, context };
}

function testHandler() {
  return createInquiryEdge({ products: [product, other], enabled: () => true });
}

test("Bells forwards exactly one canonical native form body with a blank-message note", async () => {
  const { captures, context } = receiver();
  const result = await testHandler()(request(), context);
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("X-VOC-Inquiry-Forwarded"), "1");
  assert.equal(captures.length, 1);
  const form = new URLSearchParams(captures[0]);
  assert.deepEqual(Object.fromEntries(form), {
    "form-name": "product-inquiry", "bot-field": "", product_slug: product.slug,
    product_name: product.title, sku: "VOC-OT-008", displayed_price: "10.00",
    product_page: "https://valleyoakcustoms.com/products/bells-ornament",
    customer_name: "Taylor Example", email: "taylor@example.invalid",
    fulfillment_interest: "Shipping — request a quote",
    questions: "Customer did not include an additional message.",
    product_id: "synthetic-test-product-id", shipping_zip: "72007",
  });
  assert.equal(form.getAll("sku").length, 1);
  assert.equal(form.getAll("displayed_price").length, 1);
});

test("pickup and undecided delivery need no ZIP; old catalog entries omit a missing permanent ID", async () => {
  const { captures, context } = receiver();
  const handle = testHandler();
  const { shipping_zip, ...base } = valid;
  for (const delivery of ["Local pickup", "Not sure yet"]) {
    const response = await handle(request({ ...base, fulfillment_interest: delivery,
      product_slug: other.slug, expected_price: other.price, questions: " Check pickup options. " }), context);
    assert.equal(response.status, 204);
    const body = new URLSearchParams(captures.at(-1));
    assert.equal(body.get("questions"), "Check pickup options.");
    assert.equal(body.has("shipping_zip"), false);
    assert.equal(body.has("product_id"), false);
  }
});

test("invalid customer details and forged, stale, or ambiguous product fields never reach capture", async () => {
  const { captures, context } = receiver();
  const handle = testHandler();
  for (const [updates, status] of [
    [{ customer_name: "" }, 400], [{ email: "not-an-email" }, 400], [{ shipping_zip: "" }, 400],
    [{ shipping_zip: "wrong" }, 400], [{ sku: "FORGED" }, 400], [{ displayed_price: "0.01" }, 400],
    [{ product_name: "FORGED" }, 400], [{ product_id: "FORGED" }, 400], [{ product_page: "https://bad.invalid" }, 400],
    [{ expected_price: "0.01" }, 409], [{ product_slug: "unknown" }, 400], [{ "bot-field": "filled" }, 400],
    [{ questions: "z".repeat(2001) }, 400],
  ]) assert.equal((await handle(request({ ...valid, ...updates }), context)).status, status);
  assert.equal((await handle(request(new URLSearchParams(valid) + "&product_slug=another-item"), context)).status, 400);
  assert.equal((await handle(request(new URLSearchParams(valid) + "&form-name=quote-request"), context)).status, 400);
  assert.equal((await handle(request(new URLSearchParams(valid) + "&questions=" + "x".repeat(13000)), context)).status, 400);
  assert.equal((await handle(request(valid, { from: "https://another.example.invalid" }), context)).status, 403);
  assert.equal((await handle(request(valid, { type: "application/json" }), context)).status, 415);
  assert.equal(captures.length, 0);
});

test("the guarded route fails closed by default and disallows alternate inquiry page POSTs", async () => {
  const { captures, context } = receiver();
  assert.equal((await createInquiryEdge({ products: [product] })(request(), context)).status, 403);
  for (const route of ["/product-inquiry", "/product-inquiry.html", path + "?form-name=quote-request"]) {
    assert.equal((await testHandler()(request(valid, { route }), context)).status, 404);
  }
  for (const [route, form] of [["/", "quote-request"], ["/monograms", "monogram-quote"]]) {
    const incoming = request({ "form-name": form }, { route });
    assert.equal(await testHandler()(incoming, context), undefined);
    assert.equal(incoming.bodyUsed, false);
    assert.ok(!config.path.includes(route));
  }
  assert.equal(captures.length, 0);
});

test("default enablement requires the exact test site, a preview deploy and a signed-in reviewer", async () => {
  const { captures, context } = receiver();
  const previous = globalThis.Netlify;
  globalThis.Netlify = { env: { get: () => fixtures.site.id } };
  try {
    const handle = createInquiryEdge({ products: [product] });
    assert.equal((await handle(request(), { ...context, site: { id: "different" } })).status, 403);
    assert.equal((await handle(request(), { ...context, deploy: { context: "production" } })).status, 403);
    assert.equal((await handle(request(), { ...context, user: undefined })).status, 403);
    assert.equal((await handle(request(), context)).status, 204);
    assert.equal(captures.length, 1);
  } finally {
    if (previous) globalThis.Netlify = previous;
    else delete globalThis.Netlify;
  }
});

test("a rejected downstream response is never reported as forwarded", async () => {
  const handle = testHandler();
  for (const response of [() => new Response("rate limited", { status: 429 }), () => { throw new Error("mock timeout"); }]) {
    const { captures, context } = receiver(response);
    const result = await handle(request(), context);
    assert.equal(result.status, 502);
    assert.equal(result.headers.get("X-VOC-Inquiry-Forwarded"), null);
    assert.equal(captures.length, 1);
  }
});
