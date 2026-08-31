import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("offline Buy flow uses only the narrow same-origin licensing proxy", async () => {
  const script = await readFile(new URL("software.js", root), "utf8");
  const result = await readFile(new URL("software-checkout-result.js", root), "utf8");
  const config = await readFile(new URL("netlify.toml", root), "utf8");
  assert.match(script, /\/licensing-api\/checkout\/session/);
  assert.match(result, /\/licensing-api\/checkout\/credential/);
  assert.doesNotMatch(script + result, /sk_(?:test|live)_|whsec_|VODL_ADMIN_TOKEN|localStorage/);
  assert.match(config, /from = "\/licensing-api\/checkout\/session"/);
  assert.match(config, /from = "\/licensing-api\/checkout\/credential"/);
});

test("success flow clears callback material and stores no license credential", async () => {
  const source = await readFile(new URL("software-checkout-result.js", root), "utf8");
  assert.match(source, /history\.replaceState\(null, "", location\.pathname\)/);
  assert.match(source, /sessionStorage\.removeItem\(tokenKey\)/);
  assert.doesNotMatch(source, /sessionStorage\.setItem\([^,]+,\s*result\.licenseCredential/);
  assert.match(source, /do not submit another payment/i);
});

test("launch wording states the finite offer and keeps manuals", async () => {
  const html = await readFile(new URL("software.html", root), "utf8");
  const script = await readFile(new URL("software.js", root), "utf8");
  assert.match(html, /Early Adopter Launch — \$79 for the first 15 licenses with code EARLY20/);
  assert.match(html, /Regular price \$99/);
  assert.match(html, /data-release-version>v1\.2\.2</);
  assert.match(html, /Valley_Oak_Customs_Design_Manager_v1\.2\.2\.zip/);
  assert.match(html, /Exclude folders without deleting anything/);
  assert.match(script, /fallbackVersion: "v1\.2\.2"/);
  assert.match(html, /Valley-Oak-Design-Manager-Quick-Start\.pdf/);
  assert.match(html, /Valley-Oak-Design-Manager-User-Manual\.pdf/);
});

test("nested result routes use root-relative public assets and return links", async () => {
  const success = await readFile(new URL("software-success.html", root), "utf8");
  const canceled = await readFile(new URL("software-canceled.html", root), "utf8");
  assert.match(success, /href="\/styles\.css"/);
  assert.match(success, /src="\/software-checkout-result\.js"/);
  assert.match(success, /href="\/software"/);
  assert.match(canceled, /href="\/styles\.css"/);
  assert.match(canceled, /href="\/software#design-manager"/);
});
