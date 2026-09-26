import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pageUrl = new URL("software-tester.html", root);
const expectedAsset = "Valley_Oak_Design_Manager_v1.5_Preview_1.5.0-preview.1_Private_Beta.zip";
const expectedDownload = `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/download/v1.5.0-preview.1/${expectedAsset}`;
const expectedSha256 = "B120B732A1918B0BA662DD2CF7A7BF7E5E8C7CF3A81D7C61E1D6F168DAD1D66F";

test("tester page is unlisted and protected from indexing", async () => {
  const [page, sitemap, config, entries] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(new URL("sitemap.xml", root), "utf8"),
    readFile(new URL("netlify.toml", root), "utf8"),
    readdir(root)
  ]);
  const listedPages = await Promise.all(entries.filter(name => name.endsWith(".html") && name !== "software-tester.html").map(name => readFile(new URL(name, root), "utf8")));
  assert.match(page, /meta name="robots" content="noindex, nofollow"/);
  assert.match(page, /rel="canonical" href="https:\/\/valleyoakcustoms\.com\/software\/tester"/);
  assert.doesNotMatch(listedPages.join("\n") + sitemap, /software\/tester|software-tester/);
  assert.match(config, /for = "\/software\/tester"[\s\S]*X-Robots-Tag = "noindex, nofollow"/);
  assert.match(config, /for = "\/software-tester\.html"[\s\S]*X-Robots-Tag = "noindex, nofollow"/);
  assert.match(config, /from = "\/software\/tester"[\s\S]*to = "\/software-tester\.html"[\s\S]*status = 200/);
});

test("tester page contains the approved v1.5 private-preview guidance", async () => {
  const page = await readFile(pageUrl, "utf8");
  for (const text of [
    "Valley Oak Design Manager v1.5 Private Preview",
    "Version 1.5.0-preview.1",
    "Private Beta · Invited Testers Only",
    "installs separately from the current public v1.4.x version",
    "Private Beta Agreement",
    "Open Design Workspace",
    "Design → SheetCam JOB → TAP/NC",
    "Always verify a machine file before cutting",
    "Remove the Preview without removing v1.4"
  ]) assert.ok(page.includes(text), `missing: ${text}`);
  assert.doesNotMatch(page, /Phase 4|SHOPPC|C:\\|source commit|test fixture|development path|transaction head/i);
});

test("tester download uses the exact validated private-beta ZIP", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.ok(page.includes(expectedDownload), "missing exact private-preview download URL");
  assert.ok(page.includes(expectedSha256), "missing exact private-preview SHA-256");
  assert.equal((page.match(new RegExp(expectedAsset.replaceAll(".", "\\."), "g")) || []).length, 1);
  assert.doesNotMatch(page, /tester-disabled|disabled>Download|will be enabled/i);
});

test("public v1.4.2 software surfaces remain stable-only", async () => {
  const [software, script, endpoint] = await Promise.all([
    readFile(new URL("software.html", root), "utf8"),
    readFile(new URL("software.js", root), "utf8"),
    readFile(new URL("assets/software/design-manager-latest.json", root), "utf8")
  ]);
  assert.match(software, /Current stable[\s\S]*v1\.4\.2/);
  assert.match(software, /Download v1\.4\.2/);
  assert.match(endpoint, /"version": "1\.4\.2"/);
  assert.match(endpoint, /Valley_Oak_Customs_Design_Manager_v1\.4\.2_win-x64\.zip/);
  assert.doesNotMatch(software + script + endpoint, /1\.5\.0-preview\.1|Private Preview|Private_Beta/);
});
