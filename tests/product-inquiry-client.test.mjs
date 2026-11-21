import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const inquiryId = "11111111-1111-4111-8111-111111111111";
const product = {
  slug: "bells-christmas-ornament-voc-ot-008", productId: "332188eb-35d9-4486-a022-010f7ebde880",
  title: "Wooden Christmas Ornament – Bells", price: "10.00", sku: "VOC-OT-008", quantity: 2,
};

async function browser({ local = false, reply, hold, quantity = product.quantity } = {}) {
  class Field {
    value = "";
    disabled = false;
    required = false;
    hidden = true;
    textContent = "";
    href = "";
    listeners = {};
    classList = { add() {}, remove() {} };
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const values = new Map([
    ["website", ""], ["customer_name", "Taylor Example"], ["email", "taylor@example.invalid"],
    ["fulfillment_interest", "Local pickup"], ["shipping_zip", ""], ["questions", ""],
    ["sku", "FORGED"], ["displayed_price", "0.01"],
  ]);
  const button = new Field();
  button.disabled = true;
  const elements = Object.fromEntries([
    "#product-inquiry-success", "#product-inquiry-status", "#product-inquiry-reference",
    "#inquiry-product-display", "#inquiry-price-display", "#inquiry-product-link",
    "#inquiry-shipping-zip-field", "#local-form-note",
  ].map(name => [name, new Field()]));
  class HTMLFormElement extends Field {
    action = "/api/product-inquiry";
    elements = { fulfillment_interest: new Field(), shipping_zip: new Field() };
    hidden = false;
    querySelector() { return button; }
  }
  const form = new HTMLFormElement();
  form.elements.fulfillment_interest.value = "Local pickup";
  const posts = [];
  const fetch = async (path, init) => {
    if (path === "/product-inquiry-catalog.json") return Response.json([{ ...product, quantity }]);
    posts.push({ path, ...init });
    if (hold) await hold;
    const body = JSON.parse(init.body);
    return reply ? reply(body) : Response.json({ accepted: true, inquiryId, notification: "sent" }, { status: 201 });
  };
  class FormData { get(key) { return values.get(key) ?? null; } }
  const crypto = { subtle: webcrypto.subtle, randomUUID: () => inquiryId };
  vm.runInNewContext(source, {
    HTMLFormElement, FormData, URLSearchParams, fetch, crypto, TextEncoder, Uint8Array, Response, JSON, String,
    window: { location: { search: `?slug=${product.slug}`, hostname: local ? "127.0.0.1" : "preview.example.invalid" } },
    document: { querySelector: name => name === "#product-inquiry-form" ? form : elements[name] ?? null, querySelectorAll: () => [] },
  });
  for (let attempt = 0; attempt < 50 && button.disabled; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(button.disabled, false, "catalog loading did not enable the Product Inquiry form");
  return { form, posts, elements, submit: () => form.listeners.submit({ preventDefault() {} }) };
}

test("the client sends one minimal JSON request and displays the durable reference", async () => {
  let release;
  const page = await browser({ hold: new Promise(resolve => { release = resolve; }) });
  const first = page.submit();
  await page.submit();
  assert.equal(page.posts.length, 1);
  assert.equal(page.posts[0].path, "/api/product-inquiry");
  assert.equal(page.posts[0].headers["Content-Type"], "application/json");
  const body = JSON.parse(page.posts[0].body);
  assert.deepEqual(Object.keys(body).sort(), [
    "catalogRevision", "customerName", "email", "fulfillment", "message",
    "productId", "shippingZip", "submissionId", "website",
  ]);
  assert.equal(body.productId, product.productId);
  assert.match(body.catalogRevision, /^[0-9a-f]{64}$/);
  assert.equal(body.sku, undefined);
  assert.equal(body.price, undefined);
  release();
  await first;
  assert.equal(page.elements["#product-inquiry-success"].hidden, false);
  assert.equal(page.elements["#product-inquiry-reference"].textContent, `Inquiry reference: ${inquiryId}`);
});

test("stale catalog and generic failures remain customer-safe", async () => {
  const stale = await browser({ reply: body => Response.json({ accepted: false, code: "stale_catalog" }, { status: 409 }) });
  await stale.submit();
  assert.match(stale.elements["#product-inquiry-status"].textContent, /product changed/i);
  assert.equal(stale.elements["#product-inquiry-success"].hidden, true);

  const failure = await browser({ reply: body => Response.json({ accepted: false, code: "storage_unavailable" }, { status: 503 }) });
  await failure.submit();
  assert.match(failure.elements["#product-inquiry-status"].textContent, /couldn’t confirm/i);
  assert.doesNotMatch(failure.elements["#product-inquiry-status"].textContent, /stack|path|blob/i);
});

test("a sold-out product still opens a usable inquiry form", async () => {
  const page = await browser({ quantity: 0 });
  assert.equal(page.elements["#inquiry-product-display"].textContent, product.title);
  await page.submit();
  assert.equal(JSON.parse(page.posts[0].body).productId, product.productId);
});

test("loopback previews never submit customer information", async () => {
  const page = await browser({ local: true });
  await page.submit();
  assert.equal(page.posts.length, 0);
  assert.match(page.elements["#product-inquiry-status"].textContent, /Local preview/);
});
