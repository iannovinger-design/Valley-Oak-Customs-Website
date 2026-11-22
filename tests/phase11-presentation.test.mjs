import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderShop } from "../tools/render-shop.mjs";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");
const catalog = JSON.parse(await read("product-inquiry-catalog.json"));

test("existing Home, Shop, and product pages show the catalog stock without visible SKUs", async () => {
  const home = await read("index.html");
  const shop = await renderShop(await read("shop.html"), home, catalog, fileURLToPath(root));
  for (const product of catalog) {
    const quantity = product.quantity === 0 ? "Sold out" : product.quantity + " available";
    const card = home.match(new RegExp('<a[^>]*data-voc-product-id="' + product.productId + '"[\\s\\S]*?</a>'))[0];
    const shopCard = shop.split("<article").find(markup => markup.includes('href="/products/' + product.slug + '"'));
    const page = await read("products/" + product.slug + ".html");
    assert.ok(card.includes('<p class="stock-label">' + quantity + '</p>'));
    assert.ok(shopCard.includes('<p class="shop-stock">' + quantity + '</p>'));
    assert.ok(page.includes('class="product-detail-page storefront-product"'));
    assert.ok(page.includes('<p class="product-availability"><strong>' + quantity + '</strong></p>'));
    assert.equal(page.match(/class="product-availability"/g).length, 1);
    assert.ok(page.includes('content="' + product.productId + '"'));
    assert.ok(page.includes('name="voc-dashboard-product-sku" content="' + product.sku + '"'));
    assert.ok(page.includes('rel="canonical" href="https://valleyoakcustoms.com/products/' + product.slug + '"'));
    assert.ok(page.includes('href="/product-inquiry?slug=' + product.slug + '"'));
    for (const markup of [card, shopCard, page.split("<main>")[1].split("</main>")[0]]) {
      assert.ok(!markup.replace(/<[^>]*>/g, "").includes(product.sku));
      assert.ok(!markup.includes("<dt>SKU</dt>"));
    }
  }
});

test("Shop staging rejects a homepage stock label that disagrees with the published catalog", async () => {
  const home = await read("index.html");
  const incorrect = catalog.map((entry, index) => index === 0 ? { ...entry, quantity: entry.quantity + 1 } : entry);
  await assert.rejects(renderShop(await read("shop.html"), home, incorrect, fileURLToPath(root)), /Homepage stock does not match/);
});
