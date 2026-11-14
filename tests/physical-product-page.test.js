import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const productPageUrl = new URL("products/1955-chevy-cameo.html", root);

test("1955 Chevy Cameo page contains only confirmed product facts", async () => {
  const html = await readFile(productPageUrl, "utf8");
  assert.match(html, /1955 Chevy Cameo/);
  assert.match(html, /VOC-TS-015/);
  assert.match(html, /16-gauge steel/);
  assert.match(html, /\$30\.00/);
  assert.doesNotMatch(html, /\b\d+(?:\.\d+)?\s*(?:inches|inch|in\.)\b/i);
  assert.doesNotMatch(html, /turnaround|ships in|free shipping|flat-rate shipping/i);
  assert.doesNotMatch(html, /Buy Now|checkout|Stripe/i);
});

test("product metadata is canonical, parseable, and avoids unapproved claims", async () => {
  const html = await readFile(productPageUrl, "utf8");
  assert.match(html, /rel="canonical" href="https:\/\/valleyoakcustoms\.com\/products\/1955-chevy-cameo"/);
  assert.match(html, /property="og:type" content="product"/);
  assert.match(html, /property="og:url" content="https:\/\/valleyoakcustoms\.com\/products\/1955-chevy-cameo"/);
  assert.doesNotMatch(html, /property="og:image"/);
  assert.doesNotMatch(html, /schema\.org\/(?:InStock|OutOfStock|PreOrder|BackOrder)/);
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block);
  const data = JSON.parse(block[1]);
  assert.equal(data["@type"], "Product");
  assert.equal(data.name, "1955 Chevy Cameo");
  assert.equal(data.sku, "VOC-TS-015");
  assert.equal(data.material, "16-gauge steel");
  assert.equal(data.offers.price, "30.00");
  assert.equal(data.offers.priceCurrency, "USD");
  assert.equal(data.image, undefined);
  assert.equal(data.offers.availability, undefined);
});

test("photo remains explicitly blocked until owner approval", async () => {
  const html = await readFile(productPageUrl, "utf8");
  const homepage = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /data-photo-status="awaiting-owner-approval"/);
  assert.match(homepage, /data-photo-status="awaiting-owner-approval"/);
  assert.doesNotMatch(html, /cffaa03a665f4c048631a9addc43d9c0/);
});

test("homepage, clean route, sitemap, and inquiry context include the product", async () => {
  const [homepage, config, sitemap, script] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify.toml", root), "utf8"),
    readFile(new URL("sitemap.xml", root), "utf8"),
    readFile(new URL("script.js", root), "utf8"),
  ]);
  assert.match(homepage, /id="available"/);
  assert.match(homepage, /href="\/products\/1955-chevy-cameo"/);
  assert.match(homepage, /id="product-reference"[^>]*name="product-reference"/);
  assert.match(config, /from = "\/products\/1955-chevy-cameo"[\s\S]*to = "\/products\/1955-chevy-cameo\.html"/);
  assert.match(sitemap, /https:\/\/valleyoakcustoms\.com\/products\/1955-chevy-cameo/);
  assert.match(script, /"VOC-TS-015": "1955 Chevy Cameo \(VOC-TS-015\)"/);
  assert.match(script, /product-reference/);
});

test("all local image references resolve", async () => {
  for (const page of ["index.html", "products/1955-chevy-cameo.html"]) {
    const pageUrl = new URL(page, root);
    const html = await readFile(pageUrl, "utf8");
    for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const source = match[1];
      if (/^https?:/.test(source)) continue;
      const file = source.startsWith("/") ? new URL(source.slice(1), root) : new URL(source, pageUrl);
      await access(file);
    }
  }
});
