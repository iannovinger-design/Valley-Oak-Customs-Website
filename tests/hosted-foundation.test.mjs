import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { catalogRevision } from "../netlify/functions/product-inquiry-core.mjs";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the isolated prototype preserves the Bells listing, page and approved photograph", async () => {
  const [home, page, catalogText, photo] = await Promise.all([
    read("index.html"), read("products/bells-christmas-ornament-voc-ot-008.html"),
    read("product-inquiry-catalog.json"),
    readFile(new URL("../assets/products/bells-christmas-ornament-voc-ot-008-4f7731553369.png", import.meta.url)),
  ]);
  const catalog = JSON.parse(catalogText);
  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0], {
    slug: "bells-christmas-ornament-voc-ot-008",
    productId: "332188eb-35d9-4486-a022-010f7ebde880",
    sku: "VOC-OT-008",
    title: "Wooden Christmas Ornament – Bells",
    price: "10.00",
    quantity: 2,
  });
  assert.match(catalogRevision(catalog), /^[0-9a-f]{64}$/);
  assert.match(home, /data-voc-product-id="332188eb-35d9-4486-a022-010f7ebde880"/);
  assert.match(page, /<h1>Wooden Christmas Ornament – Bells<\/h1>/);
  assert.match(page, /\$10\.00/);
  assert.match(page, /product-inquiry\?slug=bells-christmas-ornament-voc-ot-008/);
  assert.equal(createHash("sha256").update(photo).digest("hex").toUpperCase(),
    "3DBDD4E0500FE0ADB5D17B0C36AD3FF72D9464B379149CE1D23E449E0E9AC716");
});

test("Product Inquiry no longer declares a Native Forms capture surface", async () => {
  const [html, script, entry] = await Promise.all([
    read("product-inquiry.html"), read("script.js"), read("netlify/functions/product-inquiry.mjs"),
  ]);
  const form = html.match(/<form id="product-inquiry-form"[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.match(form, /action="\/api\/product-inquiry"/);
  assert.doesNotMatch(form, /data-netlify|netlify-honeypot|name="product-inquiry"|form-name/);
  for (const name of ["product_name", "sku", "product_id", "displayed_price", "product_page"])
    assert.doesNotMatch(form, new RegExp(`name=["']${name}["']`));
  assert.match(script, /submissionId/);
  assert.match(script, /catalogRevision/);
  assert.match(script, /Content-Type": "application\/json"/);
  assert.doesNotMatch(script, /X-VOC-Inquiry-Forwarded|form-name/);
  assert.match(entry, /path: "\/api\/product-inquiry"/);
  assert.match(entry, /windowLimit: 8/);
  await assert.rejects(stat(new URL("../product-inquiry-submit.html", import.meta.url)), /ENOENT/);
  await assert.rejects(stat(new URL("../netlify/edge-functions/product-inquiry.js", import.meta.url)), /ENOENT/);
});

test("Quote Request and Monogram Quote remain native and separate", async () => {
  const [home, monograms, requestPage] = await Promise.all([
    read("index.html"), read("monograms.html"), read("monogram-request.html"),
  ]);
  assert.match(home, /<form class="quote-form" name="quote-request" method="POST" data-netlify="true" netlify-honeypot="company" enctype="multipart\/form-data" action="\/">/);
  for (const page of [monograms, requestPage]) {
    assert.match(page, /<form class="quote-form" name="monogram-quote" method="POST" data-netlify="true" netlify-honeypot="company" enctype="multipart\/form-data" action="\/"/);
    assert.doesNotMatch(page, /\/api\/product-inquiry/);
  }
});

test("the accepted responsive Product Inquiry presentation remains", async () => {
  const [html, css] = await Promise.all([read("product-inquiry.html"), read("styles.css")]);
  assert.match(html, /What would you like to know\? \(Optional\)/);
  assert.doesNotMatch(html.match(/<textarea[^>]+>/)?.[0] ?? "", /\brequired\b/);
  assert.match(html, /Shipping ZIP code/);
  assert.match(html, /id="product-inquiry-success"/);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*\.physical-product-layout, \.product-inquiry-layout/);
  assert.match(css, /\.product-inquiry-form input,[^{]+\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});
