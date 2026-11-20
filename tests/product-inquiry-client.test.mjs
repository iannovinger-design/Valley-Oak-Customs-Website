import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

async function browser({ local = false, accept, hold } = {}) {
  class Field {
    value = "";
    disabled = false;
    hidden = true;
    listeners = {};
    classList = { add() {}, remove() {} };
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const fields = new Map([
    ["bot-field", ""], ["customer_name", "Taylor Example"], ["email", "taylor@example.invalid"],
    ["fulfillment_interest", "Local pickup"], ["questions", ""], ["sku", "forged"], ["displayed_price", "0.01"],
  ]);
  const button = new Field();
  const elements = Object.fromEntries([
    "#product-inquiry-success", "#product-inquiry-status", "#inquiry-product-display", "#inquiry-price-display",
    "#inquiry-product-link", "#inquiry-shipping-zip-field", "#local-form-note",
  ].map(name => [name, new Field()]));
  class HTMLFormElement extends Field {
    action = "/product-inquiry-submit.html";
    elements = { fulfillment_interest: new Field(), shipping_zip: new Field() };
    hidden = false;
    querySelector() { return button; }
  }
  const form = new HTMLFormElement();
  form.elements.fulfillment_interest.value = "Local pickup";
  const posts = [];
  const fetch = async (path, init) => {
    if (path === "/product-inquiry-catalog.json") return Response.json([
      { slug: "bells", title: "Wooden Christmas Ornament – Bells", price: "10.00", sku: "VOC-OT-008" },
    ]);
    posts.push({ path, ...init });
    if (hold) await hold;
    return accept ?? new Response(null, { status: 204, headers: { "X-VOC-Inquiry-Forwarded": "1" } });
  };
  class FormData { has(key) { return fields.has(key); } get(key) { return fields.get(key); } }
  vm.runInNewContext(source, {
    HTMLFormElement, FormData, URLSearchParams, fetch,
    window: { location: { search: "?slug=bells&sku=incorrect", hostname: local ? "127.0.0.1" : "preview.example.invalid" } },
    document: { querySelector: name => name === "#product-inquiry-form" ? form : elements[name] ?? null, querySelectorAll: () => [] },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { form, posts, elements, submit: () => form.listeners.submit({ preventDefault() {} }) };
}

test("an in-flight inquiry is sent once and client code excludes the authority fields", async () => {
  let release;
  const page = await browser({ hold: new Promise(resolve => { release = resolve; }) });
  const first = page.submit();
  await page.submit();
  assert.equal(page.posts.length, 1);
  assert.equal(page.posts[0].path, "/product-inquiry-submit.html");
  assert.equal(page.posts[0].redirect, "error");
  assert.deepEqual(Object.fromEntries(page.posts[0].body), {
    "form-name": "product-inquiry", product_slug: "bells", expected_price: "10.00",
    "bot-field": "", customer_name: "Taylor Example", email: "taylor@example.invalid",
    fulfillment_interest: "Local pickup", questions: "",
  });
  assert.equal(page.elements["#product-inquiry-success"].hidden, true);
  release();
  await first;
  assert.equal(page.elements["#product-inquiry-success"].hidden, false);
});

test("plain static success is insufficient and the loopback preview never posts", async () => {
  const staticPage = await browser({ accept: new Response("Static response") });
  await staticPage.submit();
  assert.equal(staticPage.elements["#product-inquiry-success"].hidden, true);
  assert.match(staticPage.elements["#product-inquiry-status"].textContent, /couldn’t confirm/);
  const localPage = await browser({ local: true });
  await localPage.submit();
  assert.equal(localPage.posts.length, 0);
  assert.match(localPage.elements["#product-inquiry-status"].textContent, /Local preview/);
});
