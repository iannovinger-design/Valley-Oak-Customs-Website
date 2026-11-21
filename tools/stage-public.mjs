import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".public-site");
const files = [
  "bigfoot.html", "business-signs.html", "chevy-truck-signs.html",
  "customer-inspired-designs.html", "favicon.ico", "flags.html", "index.html",
  "inventory.html", "monogram-request.html", "monograms.html",
  "product-inquiry-catalog.json", "product-inquiry.html", "robots.txt", "script.js",
  "sitemap.xml", "software-canceled.html", "software-checkout-result.js",
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
if (process.env.NETLIFY === "true" && process.env.CONTEXT === "production") {
  const commit = process.env.COMMIT_REF;
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("A Netlify production build commit is required.");
  await writeFile(path.join(output, "website-build.json"), JSON.stringify({ commit, context: "production" }) + "\n", { flag: "wx" });
}
