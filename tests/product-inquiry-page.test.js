import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), "utf8");
}

function executeInquiry(script, search, hostname = "deploy-preview-21--dynamic-fox-921683.netlify.app") {
  class Element {
    constructor() { this.textContent = ""; this.value = ""; this.disabled = false; this.hidden = true; this.href = ""; this.listeners = {}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  class HTMLFormElement extends Element { querySelector() { return elements.button; } }
  class HTMLInputElement extends Element {}
  class HTMLButtonElement extends Element {}
  class HTMLTextAreaElement extends Element {}
  class HTMLAnchorElement extends Element {}
  const elements = { form: new HTMLFormElement(), button: new HTMLButtonElement(), product: new Element(), sku: new Element(), price: new Element(), productInput: new HTMLInputElement(), skuInput: new HTMLInputElement(), priceInput: new HTMLInputElement(), link: new HTMLAnchorElement(), localNote: new Element(), status: new Element() };
  const selectors = new Map([["#product-inquiry-form", elements.form], ["#inquiry-product-display", elements.product], ["#inquiry-sku-display", elements.sku], ["#inquiry-price-display", elements.price], ["#inquiry-product-name", elements.productInput], ["#inquiry-product-sku", elements.skuInput], ["#inquiry-product-price", elements.priceInput], ["#inquiry-product-link", elements.link], ["#local-form-note", elements.localNote], ["#product-inquiry-status", elements.status]]);
  vm.runInNewContext(script, { URLSearchParams, window: { location: { search, hostname } }, document: { querySelector: selector => selectors.get(selector) ?? null, querySelectorAll: () => [] }, HTMLFormElement, HTMLInputElement, HTMLButtonElement, HTMLTextAreaElement, HTMLAnchorElement, FormData: class {} });
  return elements;
}

test("Cameo uses honest unknown wording and an exact validated product slug", async () => {
  const html = await source("products/1955-chevy-cameo.html");
  assert.equal((html.match(/Contact us for details/g) || []).length, 3);
  assert.doesNotMatch(html, /Ask to confirm/);
  assert.match(html, /<dt>Dimensions<\/dt>[\s\S]*Contact us for details/);
  assert.match(html, /<dt>Finish<\/dt>[\s\S]*Contact us for details/);
  assert.match(html, /<dt>Availability<\/dt>[\s\S]*Contact us for details/);
  assert.match(html, /href="\/product-inquiry\?product=1955\+Chevy\+Cameo&amp;sku=VOC-TS-015&amp;price=30\.00&amp;slug=1955-chevy-cameo"/);
});

test("Product Inquiry is statically discoverable by Netlify and separate from Quote Request", async () => {
  const [inquiry, homepage, config] = await Promise.all([source("product-inquiry.html"), source("index.html"), source("netlify.toml")]);
  assert.match(inquiry, /<form[^>]+name="product-inquiry"[^>]+method="POST"[^>]+data-netlify="true"/);
  assert.match(inquiry, /name="form-name" value="product-inquiry"/);
  assert.match(inquiry, /name="product_name"/); assert.match(inquiry, /name="sku"/); assert.match(inquiry, /name="displayed_price"/);
  assert.match(inquiry, /name="customer_name"[^>]*required/); assert.match(inquiry, /type="email"[^>]*required/);
  assert.match(inquiry, /class="menu-toggle"[^>]*aria-controls="site-nav"/);
  assert.match(homepage, /<form[^>]+name="quote-request"/); assert.doesNotMatch(homepage, /name="product-inquiry"/);
  assert.match(config, /from = "\/product-inquiry"[\s\S]*to = "\/product-inquiry\.html"/);
});

test("valid inquiry prefill returns to the exact product page without unsafe HTML", async () => {
  const script = await source("script.js");
  const title = `<img src=x onerror=alert(1)>`;
  const elements = executeInquiry(script, `?product=${encodeURIComponent(title)}&sku=VOC-TS-015&price=30.00&slug=1955-chevy-cameo`);
  assert.equal(elements.product.textContent, title); assert.equal(elements.productInput.value, title);
  assert.equal(elements.sku.textContent, "VOC-TS-015"); assert.equal(elements.price.textContent, "$30.00");
  assert.equal(elements.link.href, "/products/1955-chevy-cameo"); assert.equal(elements.link.textContent, "Back to Product");
  assert.doesNotMatch(script, /innerHTML/);
});

test("invalid, missing, and malicious return references use the Available Now fallback", async () => {
  const script = await source("script.js");
  for (const slug of ["", "../admin", "https://evil.example/steal", "1955 Chevy Cameo"]) {
    const elements = executeInquiry(script, `?product=Cameo&sku=VOC-TS-015&price=30.00&slug=${encodeURIComponent(slug)}`);
    assert.equal(elements.link.href, "/#available"); assert.equal(elements.link.textContent, "Back to Available Now");
  }
});

test("local preview submission is intercepted while hosted submission remains native Netlify behavior", async () => {
  const script = await source("script.js");
  const query = "?product=1955+Chevy+Cameo&sku=VOC-TS-015&price=30.00&slug=1955-chevy-cameo";
  const local = executeInquiry(script, query, "127.0.0.1"); let prevented = false; local.form.listeners.submit({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(local.localNote.hidden, false); assert.match(local.status.textContent, /no customer information was sent/);
  const hosted = executeInquiry(script, query); prevented = false; hosted.form.listeners.submit({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false); assert.equal(hosted.localNote.hidden, true);
});

test("approved responsive layout is preserved without synthetic or private local content", async () => {
  const [css, product, inquiry, script] = await Promise.all([source("styles.css"), source("products/1955-chevy-cameo.html"), source("product-inquiry.html"), source("script.js")]);
  assert.match(css, /\.physical-product-copy h1[^}]*font-size:\s*clamp\(2rem,[^,]+,\s*2\.75rem\)/s);
  assert.match(css, /\.physical-product-layout[^}]*grid-template-columns:\s*minmax\(0,/s);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*\.physical-product-layout, \.product-inquiry-layout[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/); assert.match(css, /\.product-inquiry-form input,[^{]+\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
  const combined = `${product}\n${inquiry}\n${script}`;
  assert.doesNotMatch(combined, /SAMPLE-READY|LOCAL TEST|C:\\Dev\\|VOC-Dashboard-Owner-Preview-Data/i);
  assert.doesNotMatch(combined, /api[_-]?key|password|access[_-]?token|refresh[_-]?token/i);
});

test("no generated sample product page or asset is present", async () => {
  const productFiles = await readdir(new URL("products/", root));
  const assetFiles = await readdir(new URL("assets/products/", root));
  assert.deepEqual(productFiles, ["1955-chevy-cameo.html"]);
  assert.ok(assetFiles.every(name => !/sample|local-test/i.test(name)));
});
