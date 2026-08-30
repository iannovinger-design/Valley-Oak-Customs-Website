import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const endpointUrl = new URL("assets/software/design-manager-latest.json", root);

test("Design Manager update endpoint matches the stable desktop contract", async () => {
  const source = await readFile(endpointUrl, "utf8");
  const endpoint = JSON.parse(source);
  assert.deepEqual(Object.keys(endpoint).sort(), [
    "channel",
    "product",
    "publishedUtc",
    "releaseNotesUrl",
    "releasePageUrl",
    "schemaVersion",
    "version"
  ]);
  assert.equal(endpoint.schemaVersion, 1);
  assert.equal(endpoint.product, "valley-oak-design-manager");
  assert.equal(endpoint.channel, "stable");
  assert.match(endpoint.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.match(endpoint.publishedUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(!Number.isNaN(Date.parse(endpoint.publishedUtc)));

  const releasePage = new URL(endpoint.releasePageUrl);
  assert.equal(releasePage.protocol, "https:");
  assert.equal(releasePage.hostname, "valleyoakcustoms.com");
  assert.equal(releasePage.pathname, "/software");

  const releaseNotes = new URL(endpoint.releaseNotesUrl);
  assert.equal(releaseNotes.protocol, "https:");
  assert.equal(releaseNotes.hostname, "github.com");
  assert.match(releaseNotes.pathname, /^\/iannovinger-design\/Valley-Oak-Design-Manager-Releases\/releases\/tag\/v\d+\.\d+\.\d+$/);
  assert.ok(releaseNotes.pathname.endsWith(`/v${endpoint.version}`));
});

test("Netlify serves the update endpoint explicitly as JSON with short revalidation", async () => {
  const config = await readFile(new URL("netlify.toml", root), "utf8");
  assert.match(config, /for = "\/assets\/software\/design-manager-latest\.json"[\s\S]*Content-Type = "application\/json; charset=utf-8"/);
  assert.match(config, /Cache-Control = "public, max-age=300, must-revalidate"/);
});

test("development endpoint continues to advertise the approved v1.2.1 stable release", async () => {
  const endpoint = JSON.parse(await readFile(endpointUrl, "utf8"));
  assert.equal(endpoint.version, "1.2.1");
  assert.equal(endpoint.publishedUtc, "2026-08-30T13:25:53Z");
  assert.equal(endpoint.releaseNotesUrl, "https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/tag/v1.2.1");
});
