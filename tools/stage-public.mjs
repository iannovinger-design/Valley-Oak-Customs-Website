import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderShop } from "./render-shop.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".public-site");
const files = [
  "about.html", "bigfoot.html", "business-signs.html", "chevy-truck-signs.html",
  "customer-inspired-designs.html", "favicon.ico", "flags.html", "index.html",
  "gallery.html", "inventory.html", "monogram-request.html", "monograms.html",
  "product-inquiry-catalog.json", "product-inquiry.html", "robots.txt", "script.js",
  "quote.html", "sitemap.xml", "software-canceled.html", "software-checkout-result.js",
  "software-success.html", "software-tester.html", "software.html", "software.js",
  "styles.css", "thanks.html",
];
const productPages = await readdir(path.join(root, "products"), { withFileTypes: true })
  .catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
if (productPages.some(entry => !entry.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(entry.name)))
  throw new Error("Unexpected entry in products directory.");

// The current assets tree is public. Functions are packaged separately by Netlify.
await mkdir(output);
for (const file of [...files, "assets", ...(productPages.length ? ["products"] : [])]) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true, errorOnExist: true, force: false });
}
const [shop, home, catalog] = await Promise.all(["shop.html", "index.html", "product-inquiry-catalog.json"]
  .map(file => readFile(path.join(root, file), "utf8")));
await writeFile(path.join(output, "shop.html"), await renderShop(shop, home, JSON.parse(catalog), output), { flag: "wx" });
if (process.env.NETLIFY === "true" && process.env.CONTEXT === "production") {
  const commit = process.env.COMMIT_REF;
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("A Netlify production build commit is required.");
  const photos = await readdir(path.join(output, "assets", "products"), { withFileTypes: true })
    .catch(error => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  if (photos.some(entry => !entry.isFile() || !/^[a-z0-9-]+\.(?:png|jpe?g|webp)$/.test(entry.name)))
    throw new Error("Unexpected entry in public product photos.");
  const listingFiles = ["index.html", "product-inquiry-catalog.json", "sitemap.xml",
    ...productPages.map(entry => "products/" + entry.name),
    ...photos.map(entry => "assets/products/" + entry.name)];
  const digests = await Promise.all(listingFiles.sort().map(async file => {
    const bytes = await readFile(path.join(output, file));
    return [file, createHash("sha256").update(bytes).digest("hex")];
  }));
  const marker = { commit, context: "production", files: Object.fromEntries(digests) };
  await writeFile(path.join(output, "website-build.json"), JSON.stringify(marker) + "\n", { flag: "wx" });
}
