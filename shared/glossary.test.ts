import { test } from "node:test";
import assert from "node:assert/strict";
import catalog from "./data/catalog.json";
import { MOONS } from "./astro/moons";
import { SOLAR_SYSTEM } from "./astro/planets";
import { TYPE_LABEL } from "./data/objectTypes";
import { GLOSSARY, GLOSSARY_BY_SLUG, GLOSSARY_CATEGORIES, GLOSSARY_PATHS, TYPE_TERM, plainText, richParts, searchGlossary, suggestGlossary, wordOfTheNight } from "./glossary";

const objectIds = new Set([...(catalog as { id: string }[]).map((o) => o.id), ...SOLAR_SYSTEM.map((p) => p.id as string), ...MOONS.map((m) => m.id as string)]);

test("glossary: unique slugs, every link, related term and example resolves", () => {
  assert.equal(new Set(GLOSSARY.map((t) => t.slug)).size, GLOSSARY.length);
  const problems: string[] = [];
  for (const t of GLOSSARY) {
    if (!/^[a-z0-9-]+$/.test(t.slug)) problems.push(`${t.slug}: bad slug`);
    if (!GLOSSARY_CATEGORIES.some((c) => c.id === t.category)) problems.push(`${t.slug}: category`);
    for (const r of t.related ?? []) if (!GLOSSARY_BY_SLUG[r]) problems.push(`${t.slug}: related ${r}`);
    for (const e of t.examples ?? []) if (!objectIds.has(e)) problems.push(`${t.slug}: example ${e}`);
    for (const text of [t.short, ...t.body, t.tip ?? "", t.inApp ?? ""])
      for (const p of richParts(text)) if ("slug" in p && !GLOSSARY_BY_SLUG[p.slug]) problems.push(`${t.slug}: link ${p.slug}`);
    if (t.short.length > 200) problems.push(`${t.slug}: short is ${t.short.length} chars`);
  }
  assert.deepEqual(problems, []);
  for (const c of GLOSSARY_CATEGORIES) assert.ok(GLOSSARY.some((t) => t.category === c.id), c.id);
});

test("every kind of object has a glossary entry", () => {
  for (const type of Object.keys(TYPE_LABEL)) assert.ok(GLOSSARY_BY_SLUG[TYPE_TERM[type]], type);
});

test("glossary search finds terms by name, other names and meaning", () => {
  assert.equal(searchGlossary("double star")[0].slug, "double-star");
  assert.equal(searchGlossary("binary")[0].slug, "double-star");
  assert.equal(searchGlossary("DSO")[0].slug, "deep-sky-object");
  assert.equal(searchGlossary("paracorr")[0].slug, "coma-corrector");
  assert.equal(searchGlossary("plossl")[0].slug, "eyepiece");
  assert.ok(searchGlossary("twinkle").some((t) => t.slug === "seeing"));
  assert.equal(searchGlossary("zzzz").length, 0);
  assert.equal(plainText("a [[seeing]] and [[exit-pupil|pupil]]"), "a seeing and pupil");
});

test("glossary paths only use real terms, once each", () => {
  assert.equal(new Set(GLOSSARY_PATHS.map((p) => p.id)).size, GLOSSARY_PATHS.length);
  for (const p of GLOSSARY_PATHS) {
    for (const s of p.slugs) assert.ok(GLOSSARY_BY_SLUG[s], `${p.id}: ${s}`);
    assert.equal(new Set(p.slugs).size, p.slugs.length, p.id);
  }
});

test("glossary suggestions forgive typing slips", () => {
  assert.equal(suggestGlossary("nebulla")[0].slug, "nebula");
  assert.equal(suggestGlossary("azimut")[0].slug, "azimuth");
  assert.ok(suggestGlossary("globlar").some((t) => t.slug === "globular-cluster"));
  assert.ok(suggestGlossary("dobsonain").some((t) => t.slug === "dobsonian"));
  assert.deepEqual(suggestGlossary("qq"), []);
});

test("the word of the night changes daily and never repeats within a cycle", () => {
  const seen = new Set<string>();
  const n = GLOSSARY.filter((t) => t.category !== "astropilot").length;
  for (let d = 0; d < n; d++) seen.add(wordOfTheNight(new Date(Date.UTC(2026, 0, 1, 20) + d * 86_400_000)).slug);
  assert.equal(seen.size, n);
});
