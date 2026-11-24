import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { filterAndSortProducts, supportedMaterialFilters } from "../shop.js";
import { renderShop } from "../tools/render-shop.mjs";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");
const catalog = JSON.parse(await read("product-inquiry-catalog.json"));

test("Phase 13 homepage messaging and responsive grid are present", async () => {
  const [home, css] = await Promise.all([read("index.html"), read("styles.css")]);
  assert.match(home, /CNC PLASMA • LASER CUTTING &amp; ENGRAVING/);
  assert.match(home, /Custom Signs, Engraving &amp; Fabrication/);
  assert.match(home, /Made in Austin, Arkansas\. Custom metal signs, laser-cut wood products/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("Shop renderer derives supported materials without changing the catalog schema", async () => {
  const shop = await renderShop(await read("shop.html"), await read("index.html"), catalog, fileURLToPath(root));
  assert.equal([...shop.matchAll(/data-shop-card/g)].length, 5);
  assert.equal([...shop.matchAll(/data-shop-material="metal"/g)].length, 2);
  assert.equal([...shop.matchAll(/data-shop-material="wood"/g)].length, 3);
  assert.doesNotMatch(shop, /data-shop-material="acrylic"/);
  assert.ok(catalog.every(product => !("material" in product) && !("createdAt" in product)));
});

test("Filtering and numeric price sorting work together and preserve default order", () => {
  const products = [
    { index: 0, material: "wood", price: 50, name: "Zulu" },
    { index: 1, material: "metal", price: 9, name: "Bravo" },
    { index: 2, material: "wood", price: 12, name: "Alpha" },
    { index: 3, material: "", price: 3, name: "Unknown" },
  ];
  assert.deepEqual(filterAndSortProducts(products).map(product => product.name), ["Zulu", "Bravo", "Alpha", "Unknown"]);
  assert.deepEqual(filterAndSortProducts(products, "wood", "price-asc").map(product => product.name), ["Alpha", "Zulu"]);
  assert.deepEqual(filterAndSortProducts(products, "all", "price-desc").map(product => product.price), [50, 12, 9, 3]);
  assert.deepEqual(filterAndSortProducts(products, "all", "name-asc").map(product => product.name), ["Alpha", "Bravo", "Unknown", "Zulu"]);
  assert.deepEqual(supportedMaterialFilters(products), ["metal", "wood"]);
  assert.deepEqual(filterAndSortProducts(products, "acrylic"), []);
});
