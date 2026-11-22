import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const publisher = process.env.VOC_WEBSITE_BRIDGE;
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("unmodified Dashboard publisher builds one batch on the new layout and verifies the resulting deploy",
  { skip: !publisher && "Set VOC_WEBSITE_BRIDGE to the existing Dashboard WebsitePublishingBridge directory" }, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voc-layout-publisher-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const baseline = path.join(root, "baseline");
    for (const name of await readdir(sourceRoot)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      await cp(path.join(sourceRoot, name), path.join(baseline, name), { recursive: true });
    }
    const use = filename => import(pathToFileURL(path.join(publisher, filename)));
    const [{ startPilot }, { createSamplePackage }, { verifyPublicDeployment }] = await Promise.all([
      use("pilot-host.mjs"), use("sample-package.mjs"), use("public-deployment-verification.mjs"),
    ]);
    const image = Buffer.from("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360F8CFF000000401010018DD8DB10000000049454E44AE426082", "hex");
    const photo = path.join(root, "sample.png");
    await writeFile(photo, image);
    const demo = path.join(root, "sample");
    await createSamplePackage(demo, photo);
    const manifest = JSON.parse(await readFile(path.join(demo, "website-publishing-package.json")));
    const current = JSON.parse(await readFile(path.join(baseline, "product-inquiry-catalog.json")));
    const orig = "a".repeat(40), deployed = "b".repeat(40), operationId = randomUUID();
    const publicDir = path.join(root, operationId, "site", ".public-site");
    let commits = 0;
    const ownerToken = "synthetic-local-phase-10-test-token";
    const remote = {
      async findCommit() { return commits ? deployed : null; },
      async checkWriteTarget(expected) { assert.equal(expected, orig); },
      async checkVerifiedHead(expected) { return commits === 1 && expected === deployed; },
      async commit({ expectedHead, additions }) {
        assert.equal(expectedHead, orig);
        assert.ok(additions.some(file => file.path === "product-inquiry-catalog.json"));
        assert.ok(additions.every(file => !["shop.html", "quote.html", "script.js"].includes(file.path)));
        const result = path.dirname(publicDir);
        execFileSync(process.execPath, ["tools/stage-public.mjs"], { cwd: result,
          env: { ...process.env, NETLIFY: "true", CONTEXT: "production", COMMIT_REF: deployed } });
        commits++;
        return deployed;
      },
      verify({ commit, slug, photo, expected, ...listing }) {
        return verifyPublicDeployment({ commit, slug, ...listing, listing: { ...expected, photoPath: photo.path, photoSha256: photo.sha256 } },
          async url => {
            const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "") + (url.pathname.startsWith("/products/") ? ".html" : "");
            const bytes = await readFile(path.join(publicDir, file)).catch(() => null);
            return new Response(bytes, { status: bytes ? 200 : 404 });
          });
      },
    };
    const server = await startPilot({ root, baseline, remote, ownerToken, initialHead: orig, protectedProducts: new Set(current.map(product => product.productId)) });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const items = [1, 2].map(number => {
      const slug = "phase-10-fixture-" + number;
      const sku = "FIXTURE-" + number;
      const productId = randomUUID();
      const product = { ...manifest.products[0], product_id: productId, sku, stable_slug: slug, title: "Fixture product " + number,
        product_url: "https://valleyoakcustoms.com/products/" + slug, inquiry_url: "/?product=" + sku + "#quote",
        primary_photo: { ...manifest.products[0].primary_photo, file: "assets/products/" + slug + ".png" } };
      const snapshot = hash(JSON.stringify(product));
      return { operationId, action: "upsert", productId, snapshot, expectedRevision: null, photo: image.toString("base64"),
        manifest: JSON.stringify({ ...manifest, source_snapshot_sha256: snapshot, selected_product_ids: [productId], products: [product], excluded_products: [] }) };
    });
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/website-publications?batch=1",
      { method: "POST", headers: { authorization: "Bearer " + ownerToken, "content-type": "application/json" }, body: JSON.stringify({ operationId, items }) });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).state, "published");
    assert.equal(commits, 1);
    const shop = await readFile(path.join(publicDir, "shop.html"), "utf8");
    assert.equal([...shop.matchAll(/data-shop-card/g)].length, current.length + 2);
    assert.match(shop, /Fixture product 2/);
    for (const entry of current) {
      const file = "products/" + entry.slug + ".html";
      assert.deepEqual(await readFile(path.join(publicDir, file)), await readFile(path.join(baseline, file)));
    }
    for (const file of ["quote.html", "monograms.html", "product-inquiry.html", "software.html"]) {
      assert.deepEqual(await readFile(path.join(publicDir, file)), await readFile(path.join(baseline, file)));
    }
  });
