import { access } from "node:fs/promises";
import path from "node:path";

const placeholder = "<!-- DASHBOARD SHOP CARDS -->";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const materialCategory = value => {
  const material = String(value ?? "").toLowerCase();
  if (material.includes("acrylic")) return "acrylic";
  if (material.includes("wood") || material.includes("plywood")) return "wood";
  if (material.includes("steel") || material.includes("metal") || material.includes("aluminum")) return "metal";
  return "";
};

export async function renderShop(template, homepage, catalog, publicRoot) {
  if (template.split(placeholder).length !== 2 || !Array.isArray(catalog))
    throw new Error("Shop template or product catalog is invalid.");

  // Home cards preserve publisher ownership and primary images. Compare stock to the catalog before staging.
  const photos = new Map();
  for (const [, id, markup] of homepage.matchAll(/<a class="available-product-card" data-voc-product-id="([^"]+)"([^]*?)<\/a>/g)) {
    const image = /<img\b[^>]*\bsrc="(\/assets\/products\/[a-z0-9-]+\.(?:png|jpe?g|webp))"/.exec(markup);
    const alt = /<img\b[^>]*\balt="([^"<>]*)"/.exec(markup)?.[1];
    if (!image || photos.has(id)) throw new Error("Shop could not resolve a unique approved image for " + id);
    const stock = /<p class="stock-label">([^<]+)<\/p>/.exec(markup)?.[1];
    const material = /<div class="available-product-copy"><h3>[^]*?<\/h3><p>([^<]*)<\/p>/.exec(markup)?.[1];
    photos.set(id, { url: image[1], alt, stock, material: materialCategory(material) });
  }
  const seen = new Set();
  const cards = await Promise.all(catalog.map(async product => {
    const { productId, slug, title, quantity, price } = product;
    const image = photos.get(productId);
    if (seen.has(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? "") ||
        typeof title !== "string" || !title.trim() || !/^\d+\.\d{2}$/.test(price ?? "") ||
        !Number.isSafeInteger(quantity) || quantity < 0 || !image)
      throw new Error("Invalid Shop catalog entry for " + (product.sku ?? "unknown product"));
    seen.add(slug);
    await access(path.join(publicRoot, image.url.slice(1)));
    const availability = quantity === 0 ? "Sold out" : quantity + " available";
    if (image.stock !== availability) throw new Error("Homepage stock does not match the published catalog for " + slug);
    const productUrl = "/products/" + slug;
    return `<article class="shop-card" data-shop-card data-shop-material="${image.material}" data-shop-price="${price}" data-shop-name="${escape(title)}">
          <a class="shop-image-link" href="${productUrl}">
            <img class="available-product-image" src="${image.url}" alt="${image.alt ?? escape(title)}" loading="lazy" decoding="async">
          </a>
          <div class="shop-card-copy">
            <h2><a href="${productUrl}">${escape(title)}</a></h2>
            <p class="shop-price">$${price}</p>
            <p class="shop-stock">${availability}</p>${quantity === 0 ? `
            <a class="shop-inquiry" href="/product-inquiry?slug=${slug}">Ask About This Product</a>` : ""}
          </div>
        </article>`;
  }));
  return template.replace(placeholder, () => cards.length ? cards.join("\n        ") :
    '<p>There are no products listed right now. <a href="/quote">Request a quote for a custom piece.</a></p>');
}
