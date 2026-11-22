import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const tag = (html, name) => html.match(new RegExp('<meta (?:name|property)="' + name + '" content="([^"]*)"'))?.[1];
const homeTitle = "Valley Oak Customs | Custom Signs, Laser Engraving &amp; Fabrication";
const description = "Custom metal signs, laser-cut wood creations, personalized gifts, and fabrication. Made in Austin, Arkansas.";

test("homepage shares current business copy and an existing shop photo", async () => {
  const home = await read("index.html");
  assert.ok(home.includes("<title>" + homeTitle + "</title>"));
  assert.ok(home.includes('<link rel="canonical" href="https://valleyoakcustoms.com/">'));
  assert.equal(tag(home, "og:url"), "https://valleyoakcustoms.com/");
  assert.equal(tag(home, "description"), description);
  assert.equal(tag(home, "og:title"), homeTitle);
  assert.equal(tag(home, "og:description"), description);
  assert.equal(tag(home, "twitter:card"), "summary_large_image");
  assert.equal(tag(home, "twitter:title"), homeTitle);
  assert.equal(tag(home, "twitter:description"), description);
  assert.equal(tag(home, "twitter:image"), tag(home, "og:image"));
  await access(new URL(".." + new URL(tag(home, "og:image")).pathname, import.meta.url));
  const business = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(business["@id"], "https://valleyoakcustoms.com/#business");
  assert.equal(business.description, description);
});

test("every live product shares its approved title, description and primary photo", async () => {
  const catalog = JSON.parse(await read("product-inquiry-catalog.json"));
  const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
  for (const item of catalog) {
    const page = await read("products/" + item.slug + ".html");
    const canonical = "https://valleyoakcustoms.com/products/" + item.slug;
    assert.equal(tag(page, "og:url"), canonical);
    assert.ok(page.includes('<link rel="canonical" href="' + canonical + '">'));
    assert.equal(tag(page, "og:title"), escape(item.title) + " | Valley Oak Customs");
    assert.equal(tag(page, "og:description"), tag(page, "description"));
    assert.equal(tag(page, "og:image"), "https://valleyoakcustoms.com/" + tag(page, "voc-dashboard-photo-path"));
    assert.ok(tag(page, "og:image:alt"));
  }
});
