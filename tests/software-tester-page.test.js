import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pageUrl = new URL("software-tester.html", root);

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

test("tester page contains the approved RC.30 customer guidance", async () => {
  const page = await readFile(pageUrl, "utf8");
  for (const text of [
    "Valley Oak Design Manager 1.4 Release Candidate",
    "Private Tester Build",
    "Version 1.4.0-rc.30",
    "Set up folder visibility and search",
    "Refresh related files",
    "Design Manager does not execute TAP or NC machine programs",
    "Settings → Export Diagnostics"
  ]) assert.ok(page.includes(text), `missing: ${text}`);
  assert.doesNotMatch(page, /\bRootId\b|\bGUIDs?\b|schema [0-9]|commit hash|revision conflict|database terminology/i);
});

test("tester downloads use the approved RC.30 GitHub prerelease assets", async () => {
  const page = await readFile(pageUrl, "utf8");
  const base = "https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/download/v1.4.0-rc.30/";
  for (const asset of [
    "Valley_Oak_Customs_Design_Manager_v1.4.0-rc.30.zip",
    "Valley_Oak_Customs_Design_Manager_Setup_v1.4.0-rc.30.exe",
    "Valley.Oak.Design.Manager.Quick.Start.Guide.pdf",
    "Valley.Oak.Design.Manager.User.Manual.pdf"
  ]) assert.ok(page.includes(base + asset), `missing asset link: ${asset}`);
  assert.doesNotMatch(page, /tester-disabled|disabled>Download|will be enabled/i);
});
