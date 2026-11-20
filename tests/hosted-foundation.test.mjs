import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("production-based foundation adds an empty storefront without importing a draft product", async () => {
  const [home, catalog, sitemap, config] = await Promise.all([
    read("index.html"), read("product-inquiry-catalog.json"), read("sitemap.xml"), read("netlify.toml"),
  ]);
  assert.match(home, /href="#available"/);
  assert.match(home, /<div class="available-product-grid">\s*<\/div>/);
  assert.deepEqual(JSON.parse(catalog), []);
  for (const file of [home, sitemap, config]) assert.doesNotMatch(file, /1955-chevy-cameo|VOC-TS-015/);
  assert.match(home, /<form class="quote-form" name="quote-request" method="POST" data-netlify="true"/);
  assert.match(config, /from = "\/licensing-api\/checkout\/session"/);
});

test("Product Inquiry uses the catalog endpoint and keeps its message optional", async () => {
  const [html, script] = await Promise.all([read("product-inquiry.html"), read("script.js")]);
  assert.match(html, /<form[^>]*action="\/api\/product-inquiry"/);
  assert.doesNotMatch(html, /data-netlify|name="sku"/);
  assert.match(html, /What would you like to know\? \(Optional\)/);
  assert.doesNotMatch(html.match(/<textarea[^>]+>/)?.[0] ?? "", /\brequired\b/);
  assert.match(script, /fetch\("\/product-inquiry-catalog\.json"/);
});
