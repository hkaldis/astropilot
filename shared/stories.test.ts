import { test } from "node:test";
import assert from "node:assert/strict";
import catalog from "./data/catalog.json";
import storiesJson from "./data/stories.json";
import factsJson from "./data/objectFacts.json";
import { MOONS } from "./astro/moons";
import { SOLAR_SYSTEM } from "./astro/planets";
import { GLOSSARY_BY_SLUG } from "./glossary";
import { DISTANCE_SOURCE, physicalSizeLy, type ObjectFacts, type ObjectStory } from "./stories";

const STORIES = storiesJson as unknown as Record<string, ObjectStory>;
const FACTS = factsJson as unknown as Record<string, ObjectFacts>;
const ids = [...(catalog as { id: string }[]).map((o) => o.id), ...SOLAR_SYSTEM.map((p) => p.id as string), ...MOONS.map((m) => m.id as string)];

test("every object has a story, and stories only belong to real objects", () => {
  const missing = ids.filter((id) => !STORIES[id]);
  assert.deepEqual(missing, []);
  const known = new Set(ids);
  assert.deepEqual(Object.keys(STORIES).filter((k) => !known.has(k)), []);
});

test("stories are well formed: glossary links resolve, no distances that could contradict the measured ones", () => {
  const problems: string[] = [];
  for (const [id, s] of Object.entries(STORIES)) {
    if (!s.tagline || !s.story.length) problems.push(`${id}: empty`);
    const text = [s.tagline, ...s.story, ...s.facts.flatMap((f) => [f.title, f.text])].join(" ");
    for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) if (!GLOSSARY_BY_SLUG[m[1]]) problems.push(`${id}: [[${m[1]}]]`);
    if (/\d[\d,.]*\s*(?:thousand|million|billion)?\s*(?:light[- ]years?|parsecs?)\b/i.test(text)) problems.push(`${id}: states a distance`);
    if (/\[\[|\]\]/.test(text.replace(/\[\[[^\]]+\]\]/g, ""))) problems.push(`${id}: broken link brackets`);
    if (s.discovered?.year !== undefined && (s.discovered.year < -3000 || s.discovered.year > 2026)) problems.push(`${id}: discovery year ${s.discovered.year}`);
  }
  assert.deepEqual(problems, []);
});

test("measured distances agree with the standard values for well-known objects", () => {
  // Reference distances in light-years (Wikipedia / the papers they cite), with the tolerance each deserves.
  const REF: [string, number, number][] = [
    ["M31", 2_500_000, 0.1],
    ["M33", 2_730_000, 0.1],
    ["M81", 11_700_000, 0.15],
    ["M104", 31_000_000, 0.15],
    ["M87", 53_500_000, 0.15],
    ["M13", 22_200, 0.15],
    ["NGC5139", 17_090, 0.1],
    ["M42", 1_344, 0.15],
    ["M45", 444, 0.05],
    ["M44", 577, 0.08],
    ["C41", 153, 0.05],
    ["M57", 2_570, 0.15],
    ["M1", 6_500, 0.15],
    ["polaris", 433, 0.1],
    ["61-cygni", 11.4, 0.03],
    ["alpha-centauri", 4.37, 0.03],
    ["NGC2070", 160_000, 0.05],
  ];
  const off = REF.filter(([id, ref, tol]) => !FACTS[id]?.d || Math.abs(FACTS[id].d! / ref - 1) > tol).map(([id, ref]) => `${id}: ${FACTS[id]?.d} vs ${ref}`);
  assert.deepEqual(off, []);
  for (const f of Object.values(FACTS)) if (f.src) assert.ok(DISTANCE_SOURCE[f.src], f.src);
});

test("cluster ages agree with the standard values (Cantat-Gaudin et al. 2020; Pleiades and Hyades from the literature)", () => {
  const REF: [string, number][] = [["M45", 115e6], ["C41", 625e6], ["M44", 650e6], ["M67", 4e9], ["NGC188", 6.5e9], ["M35", 150e6], ["M37", 500e6], ["NGC7789", 1.6e9]];
  const off = REF.filter(([id, ref]) => !FACTS[id]?.age || Math.abs(Math.log(FACTS[id].age! / ref)) > Math.log(1.4)).map(([id, ref]) => `${id}: ${FACTS[id]?.age} vs ${ref}`);
  assert.deepEqual(off, []);
});

test("physical sizes: M 31 is wider than the Milky Way's ~100,000 ly, the Ring Nebula about a light-year", () => {
  const m31 = (catalog as { id: string; size?: number[] }[]).find((o) => o.id === "M31")!;
  assert.ok(physicalSizeLy(m31.size![0], FACTS.M31.d!) > 100_000);
  const m57 = (catalog as { id: string; size?: number[] }[]).find((o) => o.id === "M57")!;
  const w = physicalSizeLy(m57.size![0], FACTS.M57.d!);
  assert.ok(w > 0.6 && w < 2, String(w));
});
