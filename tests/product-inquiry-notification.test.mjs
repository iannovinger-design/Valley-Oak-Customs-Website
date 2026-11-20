import test from "node:test";
import assert from "node:assert/strict";
import { createInquiryHandler } from "../netlify/functions/product-inquiry.mjs";

const product = { slug: "bells-ornament", title: "Wooden Christmas Ornament – Bells", sku: "VOC-OT-008",
  productId: "synthetic-test-product-id", price: "10.00", quantity: 2 };
const origin = "https://example.invalid";
const data = { slug: product.slug, displayedPrice: "10.00", customer_name: "Taylor Example", email: "taylor@example.invalid",
  fulfillment_interest: "Shipping — request a quote", shipping_zip: "72007", questions: "Can you ship one ornament?" };
const request = (input, caller = origin) => new Request(origin + "/api/product-inquiry", {
  method: "POST", headers: { origin: caller, "Content-Type": "application/json" }, body: JSON.stringify(input)
});

test("owner email uses catalog identity and price, ignoring client identity claims", async () => {
  const sent = [];
  const handle = createInquiryHandler({ products: [product], send: async payload => sent.push(payload) });
  const response = await handle(request({ ...data, sku: "FAKE", productId: "FAKE", product_name: "FAKE", price: "0.01" }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  const [mail] = sent;
  assert.equal(mail.subject, "New Product Inquiry — VOC-OT-008");
  assert.equal(mail.replyTo, data.email);
  for (const value of [product.title, product.sku, product.productId, "$10.00", "/products/bells-ornament", "2 available",
    data.customer_name, data.email, "Delivery: Shipping", "ZIP code: 72007", data.questions]) assert.ok(mail.text.includes(value), value);
  assert.doesNotMatch(mail.text, /FAKE|0\.01|snapshot|\.db/i);
});

test("bad slugs, stale prices, spam, wrong origins, or shipping without ZIP cannot notify the owner", async () => {
  let calls = 0;
  const handle = createInquiryHandler({ products: [product], send: async () => calls++ });
  for (const [overrides, status, caller] of [
    [{ slug: "unknown", sku: product.sku }, 400], [{ displayedPrice: "0.01" }, 409], [{ shipping_zip: "" }, 400],
    [{ "bot-field": "spam" }, 400], [{ email: "x@example.invalid\r\nBcc: x@y.org" }, 400],
    [{ customer_name: undefined }, 400], [{ customer_name: "  " }, 400],
    [{ email: undefined }, 400], [{ email: "not-an-email" }, 400],
    [{ questions: "x".repeat(2001) }, 400], [{ questions: "a\u0000b" }, 400], [{ questions: { text: "hi" } }, 400],
    [{}, 403, "https://outside.invalid"]
  ]) assert.equal((await handle(request({ ...data, ...overrides }, caller))).status, status);
  assert.equal(calls, 0);
});

test("blank, omitted, and whitespace messages still notify for pickup, shipping, and undecided delivery", async () => {
  const sent = [];
  const handle = createInquiryHandler({ products: [product], send: async mail => sent.push(mail) });
  for (const [delivery, questions, zip, expectedDelivery] of [
    ["Local pickup", "", undefined, "Local pickup"],
    ["Not sure yet", " \n\t ", undefined, "Not sure yet"],
    ["Shipping — request a quote", undefined, "72007-1234", "Shipping"],
  ]) {
    const response = await handle(request({ ...data, fulfillment_interest: delivery, shipping_zip: zip, questions }));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    const mail = sent.at(-1);
    assert.equal(mail.subject, "New Product Inquiry — VOC-OT-008");
    assert.equal(mail.replyTo, data.email);
    assert.ok(mail.text.includes(product.productId));
    assert.ok(mail.text.includes("Advertised price: $10.00"));
    assert.ok(mail.text.includes("Delivery: " + expectedDelivery));
    assert.match(mail.text, /Message:\nCustomer did not include an additional message\.$/);
    if (zip) assert.ok(mail.text.includes("ZIP code: " + zip));
    else assert.doesNotMatch(mail.text, /ZIP code/);
  }
  assert.equal(sent.length, 3);
});

test("pickup omits submitted ZIP and provider failures never report success", async () => {
  const handle = createInquiryHandler({ products: [{ ...product, quantity: 0 }], send: async mail => {
    assert.match(mail.text, /Sold out at website update/);
    assert.match(mail.text, /Delivery: Local pickup/);
    assert.doesNotMatch(mail.text, /ZIP code/);
    throw Error("mail provider unavailable");
  } });
  assert.equal((await handle(request({ ...data, fulfillment_interest: "Local pickup" }))).status, 502);
});
