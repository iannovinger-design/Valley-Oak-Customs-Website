import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.match(html, /property="og:image" content="https:\/\/valleyoakcustoms\.com\/assets\/products\/1955-chevy-cameo\.jpg"/);
  assert.match(html, /property="og:image:alt" content="Representative 1955 Chevy Cameo design image"/);
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
  assert.equal(data.image, "https://valleyoakcustoms.com/assets/products/1955-chevy-cameo.jpg");
  assert.equal(data.offers.availability, undefined);
});

test("approved representative image and disclosure are present", async () => {
  const html = await readFile(productPageUrl, "utf8");
  const homepage = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /src="\/assets\/products\/1955-chevy-cameo\.jpg"/);
  assert.match(homepage, /src="\/assets\/products\/1955-chevy-cameo\.jpg"/);
  assert.match(html, /Design image shown\. Actual finished sign may vary\./);
  assert.match(html, /alt="Representative 1955 Chevy Cameo design image"/);
  assert.doesNotMatch(html, /cffaa03a665f4c048631a9addc43d9c0/);
});

test("approved source copy is exact and web derivative is separate", async () => {
  const original = await readFile(new URL("assets/products/1955-chevy-cameo-original.png", root));
  const web = await readFile(new URL("assets/products/1955-chevy-cameo.jpg", root));
  assert.equal(createHash("sha256").update(original).digest("hex").toUpperCase(), "912B355DB2FEFBF8BC64651C5BC15324332067BD6EBC36AB54B1FF5CA70E71F4");
  assert.notDeepEqual(web, original);
  assert.ok(web.length > 0);
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
