import { test } from "node:test";
import assert from "node:assert/strict";
import { pageFor, renderShell, objectContent, SITE } from "./pages";
import { skyFacts } from "./facts";

const SHELL = `<html><head><!--seo--><title>x</title><!--/seo--></head><body><div id="root"><!--ssr--></div></body></html>`;

test("every page gets its own title, description, canonical and readable content", () => {
  const m31 = pageFor("/object/M31");
  assert.equal(m31.status, 200);
  assert.match(m31.title, /^Andromeda Galaxy \(M 31\)/);
  const html = renderShell(SHELL, m31);
  assert.ok(html.includes(`<link rel="canonical" href="${SITE}/object/M31" />`));
  assert.ok(html.includes('<div id="ssr">') && html.includes("<h1>Andromeda Galaxy (M 31)</h1>"));
  assert.ok(!html.includes("<title>x</title>"), "the shell's default block is replaced");
  assert.ok(html.includes("application/ld+json"));
  // Ids are case-insensitive, but the canonical address is the catalog's own.
  assert.equal(pageFor("/object/m31").path, "/object/M31");
});

test("unknown addresses are real 404s; personal screens aren't indexed", () => {
  assert.equal(pageFor("/no-such-page").status, 404);
  assert.equal(pageFor("/object/not-an-object").status, 404);
  assert.equal(pageFor("/journal").robots, "noindex, follow");
  assert.equal(pageFor("/").robots, undefined);
});

test("object facts: best evening month and heights from familiar latitudes", () => {
  // M31 (RA 0h43m, Dec +41°): highest at about 10 pm in November, at midnight in October.
  const f = skyFacts({ ra: 0.7123, dec: 41.269 });
  assert.equal(f.eveningMonth, "November");
  assert.equal(f.midnightMonth, "October");
  assert.equal(f.altitudes.find((a) => a.lat === 50)?.alt, 81);
  assert.match(f.latitudes, /north of 49°S/);
  // M7 (Dec −34.8°) only just clears the horizon from 50°N; the Carina Nebula (−59.9°) never rises there.
  assert.equal(skyFacts({ ra: 17.9, dec: -34.8 }).altitudes.find((a) => a.lat === 50)?.alt, 5);
  assert.equal(skyFacts({ ra: 10.75, dec: -59.9 }).altitudes.find((a) => a.lat === 50)?.alt, null);
});

test("markdown twins exist for catalog objects, planets and their moons", () => {
  assert.match(objectContent("M42")!.md, /^# Orion Nebula/);
  assert.match(objectContent("jupiter")!.md, /^# Jupiter/);
  assert.match(objectContent("titan")!.md, /moon of Saturn/);
  assert.equal(objectContent("nope"), null);
});
