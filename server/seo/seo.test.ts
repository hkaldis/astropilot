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
  // It previews with its own photograph, which the readable page and its structured data carry too.
  assert.ok(html.includes(`<meta property="og:image" content="${SITE}/img/objects/m31.webp?v=2" />`));
  assert.ok(html.includes('<figure><img src="') && html.includes("primaryImageOfPage"));
  assert.match(objectContent("jupiter")!.md, /!\[Jupiter\]\(https:\/\/[^)]+\/img\/objects\/jupiter\.webp/);
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

test("glossary: an index page, a page per term with structured data, and real 404s", () => {
  const index = pageFor("/glossary");
  assert.equal(index.status, 200);
  assert.ok(JSON.stringify(index.jsonLd).includes('"DefinedTermSet"'));
  const term = pageFor("/glossary/exit-pupil");
  assert.equal(term.status, 200);
  assert.match(term.title, /^Exit pupil/);
  const html = renderShell(SHELL, term);
  assert.ok(html.includes('"DefinedTerm"') && html.includes('href="/glossary/magnification"'));
  assert.equal(pageFor("/glossary/not-a-term").status, 404);
  // Object pages link their kind to the glossary.
  assert.ok(pageFor("/object/M13").body.includes('href="/glossary/globular-cluster"'));
});

test("object pages tell the object's story: tagline, facts, distance and when its light set off", () => {
  const m13 = pageFor("/object/M13").body;
  assert.match(m13, /Did you know\?/);
  assert.match(m13, /the light we see from it set off about [\d,]+ years ago, when the last Ice Age/);
  assert.match(m13, /<dt>Distance<\/dt><dd>[\d,]+ light-years<\/dd>/);
  assert.match(m13, /<dt>Discovered<\/dt><dd>Edmond Halley, 1714<\/dd>/);
  assert.match(objectContent("M13")?.md ?? "", /## Did you know\?/);
});

test("titles don't repeat a name the object's name already contains", () => {
  assert.match(pageFor("/object/epsilon-lyrae").title, /^Epsilon Lyrae \(Double Double\) — /);
  assert.match(pageFor("/object/M13").title, /^Hercules Globular Cluster \(M 13\) — /);
});

test("bright stars have their own pages, with spectral type, colour and distance", () => {
  const vega = pageFor("/object/vega");
  assert.equal(vega.status, 200);
  assert.match(vega.title, /^Vega \(Alpha Lyrae\) — /);
  assert.match(vega.body, /<dt>Spectral type<\/dt><dd>A0V<\/dd>/);
  assert.match(vega.body, /<dt>Colour<\/dt><dd>white/);
  assert.match(vega.body, /<dt>Distance<\/dt><dd>25 light-years<\/dd>/);
  assert.match(pageFor("/object/mira").body, /<dt>Brightness<\/dt><dd>varies from magnitude 2 to 10.1<\/dd>/);
  assert.match(pageFor("/explore").title, /\d+ bright stars/);
});
