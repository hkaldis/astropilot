/**
 * The app's data against independent open sources (not Wikipedia), offline: reference values gathered by
 * scripts/crosscheck/*.{py,ts} from SIMBAD, VizieR (Hipparcos, Gaia DR3, WDS, Hunt & Reffert, Cantat-Gaudin, Dias,
 * Kharchenko, Harris, Baumgardt, Frew, Green, Sharpless, Lynds, Zucker…), NED, HyperLEDA, Cosmicflows-4 and NASA/JPL,
 * saved in shared/data/xcheck/. Every value we show must agree within a tolerance chosen for how well that kind of
 * quantity is known; the few that don't are listed in shared/data/xcheck/exceptions.json with the reason (e.g. a
 * distance where published estimates themselves disagree). Clear errors found by the cross-check were corrected at
 * the source (scripts/crosscheck/apply.py → curated_facts.json, curation.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BODY_PHYSICS, EARTH } from "./bodies";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const catalog: Record<string, any>[] = read("./data/catalog.json");
const factsFile = read("./data/objectFacts.json");
const FACTS: Record<string, Record<string, number>> = factsFile.facts ?? factsFile;
const CAT = new Map(catalog.map((o) => [o.id, o]));
const EXCEPT: Record<string, string> = read("./data/xcheck/exceptions.json");

type Field = "d" | "size" | "mag" | "mass" | "age" | "members" | "r" | "lum" | "teff" | "sep";
type Ref = { v: number; src: string };
type Refs = Record<string, Partial<Record<Field, Ref>>>;

const num = (x: unknown): number | undefined => (Array.isArray(x) ? num(x[0]) : typeof x === "number" && isFinite(x) ? x : undefined);
const pick = (o: Record<string, any>, fields: Field[], flat = false): Partial<Record<Field, Ref>> => {
  const out: Partial<Record<Field, Ref>> = {};
  for (const f of fields) {
    const v = flat ? num(o[f]) : num(o[f]?.v);
    if (v !== undefined) out[f] = { v, src: flat ? String(o[`${f}_src`] ?? "") : String(o[f]?.src ?? "") };
  }
  return out;
};
const objects = (j: any) => Object.fromEntries(Object.entries(j.objects ?? j).filter(([k]) => !k.startsWith("_") && k !== "meta"));

/** Each family's reference file, normalised to { id: { field: { v, src } } }. */
const FAMILIES: Record<string, Refs> = {
  stars: Object.fromEntries(Object.entries(objects(read("./data/xcheck/stars.json"))).map(([id, o]: [string, any]) => [id, pick(o, ["d", "mag", "mass", "r", "lum", "teff", "sep"])])),
  "open-clusters": Object.fromEntries(Object.entries(objects(read("./data/xcheck/open-clusters.json"))).map(([id, o]: [string, any]) => [id, pick(o, ["d", "age", "size", "members", "mass"])])),
  globulars: Object.fromEntries(Object.entries(objects(read("./data/xcheck/globulars.json"))).map(([id, o]: [string, any]) => [id, pick(o, ["d", "mass", "mag"], true)])),
  nebulae: Object.fromEntries(Object.entries(objects(read("./data/xcheck/nebulae.json"))).map(([id, o]: [string, any]) => [id, pick(o, ["d", "size"], true)])),
  galaxies: Object.fromEntries(Object.entries(objects(read("./data/xcheck/galaxies.json"))).map(([id, o]: [string, any]) => [id, pick(o, ["d", "size", "mag", "mass"], true)])),
};

/** Tolerances: a factor (ratio either way) or, for magnitudes, a difference. */
const TOL: Record<string, Partial<Record<Field, number>>> = {
  // Hot-star temperature calibrations differ by up to ~20%.
  stars: { d: 1.25, mag: 0.3, mass: 2.5, r: 2, lum: 2.5, teff: 1.22, sep: 1.25 },
  "open-clusters": { d: 1.25, age: 2.5, size: 3, members: 1.5, mass: 5 },
  // Gaia parallaxes of clusters 20,000–35,000 ly away carry 10–20% errors plus the EDR3 zero-point offset.
  globulars: { d: 1.3, mass: 2.5, mag: 0.5 },
  nebulae: { d: 1.6, size: 2 },
  galaxies: { d: 1.4, size: 1.6, mag: 0.5, mass: 3 },
};

function ours(id: string, f: Field): number | undefined {
  const o = CAT.get(id);
  if (f === "size") return num(o?.size);
  if (f === "mag") return num(o?.mag);
  if (f === "sep") return num(o?.sep);
  return num(FACTS[id]?.[f]);
}

function disagreements(): string[] {
  const out: string[] = [];
  for (const [fam, refs] of Object.entries(FAMILIES)) {
    for (const [id, fields] of Object.entries(refs)) {
      for (const [f, ref] of Object.entries(fields) as [Field, Ref][]) {
        const tol = TOL[fam][f];
        const mine = ours(id, f);
        if (tol === undefined || mine === undefined || !(ref.v > 0 || f === "mag")) continue;
        const off = f === "mag" ? Math.abs(mine - ref.v) > tol : Math.max(mine, ref.v) / Math.min(mine, ref.v) > tol;
        const key = `${fam}:${id}:${f}`;
        if (off && !EXCEPT[key]) out.push(`${key} ours ${mine} vs ${ref.v} (${ref.src.slice(0, 80)})`);
      }
    }
  }
  return out;
}

test("every catalogue and facts value agrees with its independent reference (or is a listed exception)", () => {
  assert.deepEqual(disagreements(), []);
});

test("listed exceptions still exist and still disagree (no stale entries)", () => {
  const stale = Object.keys(EXCEPT).filter((key) => {
    const [fam, id, f] = key.split(":") as [string, string, Field];
    const ref = FAMILIES[fam]?.[id]?.[f];
    const mine = ours(id, f);
    if (!ref || mine === undefined) return true;
    const tol = TOL[fam][f]!;
    return f === "mag" ? Math.abs(mine - ref.v) <= tol : Math.max(mine, ref.v) / Math.min(mine, ref.v) <= tol;
  });
  assert.deepEqual(stale, []);
});

test("the planets', the Moon's and the moons' physical data match NASA/JPL", () => {
  const ref = read("./data/xcheck/bodies.json").bodies as Record<string, Record<string, { v: number | number[]; alt?: { v: number | number[] }[] }>>;
  const TOLB: Record<string, number> = { radiusKm: 0.012, massKg: 0.012, gravity: 0.03, density: 0.012, rotationH: 0.005, solarDayH: 0.005, orbitDays: 0.005, escapeKms: 0.025 };
  const bad: string[] = [];
  for (const [id, fields] of Object.entries(ref)) {
    const mine = id === "earth" ? EARTH : (BODY_PHYSICS as Record<string, Record<string, unknown>>)[id];
    if (!mine) continue;
    for (const [f, r] of Object.entries(fields)) {
      const tol = TOLB[f];
      const v = (mine as Record<string, unknown>)[f];
      if (tol === undefined || typeof v !== "number") continue;
      // Agree with the primary value or any alternative NASA/JPL gives (e.g. NSSDCA vs JPL radius definitions).
      const cands = [r.v, ...(r.alt ?? []).map((a) => a.v)].map(num).filter((x): x is number => x !== undefined);
      if (!cands.some((c) => Math.abs(Math.abs(v) - Math.abs(c)) / Math.abs(c) <= tol)) bad.push(`${id}.${f} ours ${v} vs ${cands.join(" / ")}`);
    }
  }
  assert.deepEqual(bad, []);
});
