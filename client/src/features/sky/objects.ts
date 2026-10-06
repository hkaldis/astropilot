/**
 * Everything selectable on the chart, addressed by a string ref:
 *   "body:jupiter" | "body:moon" | "body:sun" | "moon:titan" | "dso:M31" | "star:Vega" | "con:Ori" | "anon:<index>"
 */
import { altAzOf, constellationOf, eqjVector, isMoonId, MOON_BY_ID, MOONS, PLANET_BY_ID, SOLAR_SYSTEM, type AltAz, type MoonId, type SolarSystemId } from "@shared/astro";
import { CONSTELLATION_NAMES } from "@shared/data/constellations-meta";
import type { CatalogObject } from "@shared/data/types";
import { TYPE_LABEL } from "@/lib/objects";
import type { SkyData, SkyDso } from "./data";
import type { Scene } from "./engine";

export type RefKind = "body" | "moon" | "dso" | "star" | "anon" | "con";

export interface SkyObject {
  ref: string;
  kind: RefKind;
  name: string;
  /** "Galaxy · Andromeda" style subtitle. */
  sub: string;
  /** Key for TypeGlyph. */
  glyph: string;
  ra?: number; // J2000 hours (fixed objects)
  dec?: number;
  mag?: number | null;
  con?: string; // IAU abbreviation
  dso?: CatalogObject;
  /** The body drawn on the chart: for a planet's moon, its planet (the moon is a few arcminutes away at most). */
  bodyId?: SolarSystemId | "sun";
  moonId?: MoonId;
}

export interface ObjectContext {
  data: SkyData;
  dsoById: Map<string, SkyDso>;
}

export const conName = (abbr?: string | null) => (abbr ? CONSTELLATION_NAMES[abbr] ?? abbr : "");

export function resolveRef(ref: string | null, ctx: ObjectContext): SkyObject | null {
  if (!ref) return null;
  const i = ref.indexOf(":");
  const kind = ref.slice(0, i) as RefKind;
  const id = ref.slice(i + 1);
  switch (kind) {
    case "body": {
      if (id === "sun") return { ref, kind, name: "Sun", sub: "Our star", glyph: "sun", bodyId: "sun" };
      const meta = PLANET_BY_ID[id as SolarSystemId];
      if (!meta) return null;
      return { ref, kind, name: meta.name, sub: id === "moon" ? "Earth's Moon" : "Planet", glyph: id === "moon" ? "moon" : "planet", bodyId: meta.id };
    }
    case "moon": {
      if (!isMoonId(id)) return null;
      const m = MOON_BY_ID[id.toLowerCase() as MoonId];
      return { ref, kind, name: m.name, sub: `Moon of ${PLANET_BY_ID[m.parent].name}`, glyph: "satellite", mag: m.mag, bodyId: m.parent, moonId: m.id };
    }
    case "dso": {
      const d = ctx.dsoById.get(id.toUpperCase());
      if (!d) return null;
      const o = d.o;
      return { ref, kind, name: o.name, sub: `${TYPE_LABEL[o.type] ?? o.type} · ${conName(o.con)}`, glyph: o.type, ra: o.ra, dec: o.dec, mag: o.mag ?? null, con: o.con, dso: o };
    }
    case "star": {
      const s = ctx.data.names?.find((n) => n.name === id);
      if (!s) return null;
      const con = constellationOf(s.ra, s.dec);
      return { ref, kind, name: s.name, sub: `Star · ${conName(con)}`, glyph: "star", ra: s.ra, dec: s.dec, mag: s.mag, con };
    }
    case "anon": {
      const st = ctx.data.stars;
      const k = Number(id);
      if (!st || !Number.isInteger(k) || k < 0 || k >= st.n) return null;
      const ra = st.ra[k];
      const dec = st.dec[k];
      const con = constellationOf(ra, dec);
      return { ref, kind, name: `Star in ${conName(con)}`, sub: "Star without a common name", glyph: "star", ra, dec, mag: Math.round(st.mag[k] * 100) / 100, con };
    }
    case "con": {
      const l = ctx.data.labels?.find((x) => x.abbr === id);
      const name = l?.name ?? CONSTELLATION_NAMES[id];
      if (!name) return null;
      return { ref, kind, name, sub: "Constellation", glyph: "constellation", ra: l?.ra, dec: l?.dec, con: id };
    }
  }
  return null;
}

/** Apparent alt/az of an object at the scene's instant. */
export function positionOf(obj: SkyObject, scene: Scene): AltAz | null {
  if (obj.bodyId === "sun") return { alt: scene.sun.alt, az: scene.sun.az };
  if (obj.bodyId) {
    const b = scene.bodies.find((x) => x.id === obj.bodyId);
    return b ? { alt: b.alt, az: b.az } : null;
  }
  if (obj.ra === undefined || obj.dec === undefined) return null;
  return altAzOf(scene.frame, eqjVector(obj.ra, obj.dec));
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

export interface SearchEntry {
  ref: string;
  name: string;
  sub: string;
  glyph: string;
  keys: string[];
  /** Secondary keys (a moon's planet and designation): they find it, ranked below anything named that way. */
  also?: string[];
  boost: number;
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function buildSearchIndex(dsos: SkyDso[], data: SkyData): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of SOLAR_SYSTEM) {
    out.push({ ref: `body:${p.id}`, name: p.name, sub: p.id === "moon" ? "Moon" : "Planet", glyph: p.id === "moon" ? "moon" : "planet", keys: [norm(p.name)], boost: 8 });
  }
  out.push({ ref: "body:sun", name: "Sun", sub: "Our star", glyph: "sun", keys: ["sun"], boost: 2 });
  // The planets' moons; a planet's name (or "Saturn VI") also finds them, brightest first, after everything else.
  for (const m of MOONS) {
    const planet = PLANET_BY_ID[m.parent].name;
    out.push({ ref: `moon:${m.id}`, name: m.name, sub: `Moon of ${planet} · mag ${m.mag.toFixed(1)}`, glyph: "satellite", keys: [norm(m.name)], also: [norm(planet), norm(m.designation)], boost: 5 - m.mag * 0.1 });
  }
  for (const d of dsos) {
    const o = d.o;
    const keys = new Set<string>([norm(o.id), norm(o.name), ...o.designations.map(norm)]);
    if (o.m) keys.add(`messier${o.m}`);
    out.push({
      ref: `dso:${o.id}`,
      name: o.name,
      sub: [o.m && !/^M ?\d/.test(o.name) ? `M${o.m}` : null, TYPE_LABEL[o.type] ?? o.type, conName(o.con)].filter(Boolean).join(" · "),
      glyph: o.type,
      keys: [...keys],
      boost: (o.showpiece ? 4 : 0) + (o.m ? 2 : 0),
    });
  }
  for (const s of data.names ?? []) {
    out.push({ ref: `star:${s.name}`, name: s.name, sub: `Star · mag ${s.mag.toFixed(1)}`, glyph: "star", keys: [norm(s.name)], boost: 3 - s.mag * 0.5 });
  }
  const seen = new Set<string>();
  for (const l of data.labels ?? []) {
    if (seen.has(l.abbr)) continue;
    seen.add(l.abbr);
    out.push({ ref: `con:${l.abbr}`, name: l.name, sub: "Constellation", glyph: "constellation", keys: [norm(l.name), l.abbr.toLowerCase()], boost: 2 });
  }
  return out;
}

export function searchSky(index: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of index) {
    let best = 0;
    for (const k of e.keys) {
      if (!k) continue;
      let s = 0;
      if (k === q) s = 100;
      else if (k.startsWith(q)) s = 70 - Math.min(20, k.length - q.length);
      else if (q.length >= 3 && k.includes(q)) s = 40 - Math.min(15, k.length - q.length);
      if (s > best) best = s;
    }
    if (!best && e.also?.some((k) => k.startsWith(q))) best = 30;
    if (best > 0) scored.push({ e, s: best + e.boost });
  }
  scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map((x) => x.e);
}

/** Map a `?focus=` value ("M31", "NGC7000", "jupiter", "Vega", "Ori") to a ref. */
export function refForFocus(focus: string | null, ctx: ObjectContext): string | null {
  if (!focus) return null;
  const f = focus.trim();
  if (!f) return null;
  if (/^(body|moon|dso|star|con|anon):/.test(f)) return resolveRef(f, ctx) ? f : null;
  const lower = f.toLowerCase();
  if (lower === "sun") return "body:sun";
  if (PLANET_BY_ID[lower as SolarSystemId]) return `body:${lower}`;
  if (isMoonId(lower)) return `moon:${lower}`;
  const d = ctx.dsoById.get(f.toUpperCase()) ?? ctx.dsoById.get(f.replace(/\s+/g, "").toUpperCase());
  if (d) return `dso:${d.o.id}`;
  const s = ctx.data.names?.find((n) => n.name.toLowerCase() === lower);
  if (s) return `star:${s.name}`;
  const l = ctx.data.labels?.find((x) => x.abbr.toLowerCase() === lower || x.name.toLowerCase() === lower);
  if (l) return `con:${l.abbr}`;
  return null;
}
