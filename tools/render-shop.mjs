import { access } from "node:fs/promises";
import path from "node:path";

const placeholder = "<!-- DASHBOARD SHOP CARDS -->";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export async function renderShop(template, homepage, catalog, publicRoot) {
  if (template.split(placeholder).length !== 2 || !Array.isArray(catalog))
    throw new Error("Shop template or product catalog is invalid.");

  // The unchanged Dashboard bridge already writes this product ID and approved
  // primary image to each homepage card. The catalog supplies the public facts.
  const photos = new Map();
  for (const [, id, markup] of homepage.matchAll(/<a class="available-product-card" data-voc-product-id="([^"]+)"([^]*?)<\/a>/g)) {
    const image = /<img\b[^>]*\bsrc="(\/assets\/products\/[a-z0-9-]+\.(?:png|jpe?g|webp))"/.exec(markup);
    const alt = /<img\b[^>]*\balt="([^"<>]*)"/.exec(markup)?.[1];
    if (!image || photos.has(id)) throw new Error("Shop could not resolve a unique approved image for " + id);
    photos.set(id, { url: image[1], alt });
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
    const availability = quantity === 0 ? "Sold Out" : quantity + " available";
    const productUrl = "/products/" + slug;
    return `<article class="shop-card" data-shop-card>
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
