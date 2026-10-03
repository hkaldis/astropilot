/**
 * Star-chart data: stars, names, constellation figures, labels and the Milky Way.
 * Every file is its own lazily loaded chunk; vectors are precomputed once so a redraw for a
 * new time is a single rotation per point.
 */
import { useQuery } from "@tanstack/react-query";
import { eqjVector, type Vec3 } from "@shared/astro";
import type { CatalogObject, ObjectType } from "@shared/data/types";

// import.meta.glob → one dynamic-import chunk per file. A file that has not been generated yet
// simply leaves its layer empty instead of breaking the page.
const FILES = import.meta.glob([
  "../../../../shared/data/stars.json",
  "../../../../shared/data/starnames.json",
  "../../../../shared/data/constellation-lines.json",
  "../../../../shared/data/constellation-labels.json",
  "../../../../shared/data/milkyway.json",
]);

async function loadJson(name: string): Promise<unknown | null> {
  const key = Object.keys(FILES).find((k) => k.endsWith(`/${name}.json`));
  if (!key) return null;
  const mod = (await FILES[key]()) as { default?: unknown };
  return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// ---------------------------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------------------------

export interface StarField {
  n: number;
  /** J2000 unit vectors, 3 per star. Sorted brightest first. */
  xyz: Float64Array;
  mag: Float32Array;
  bv: Float32Array;
  ra: Float32Array; // hours
  dec: Float32Array; // degrees
}

function prepStars(raw: unknown): StarField | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw.filter((r): r is number[] => Array.isArray(r) && r.length >= 3 && num(r[0]) && num(r[1]) && num(r[2]));
  rows.sort((a, b) => a[2] - b[2]);
  const n = rows.length;
  const xyz = new Float64Array(n * 3);
  const mag = new Float32Array(n);
  const bv = new Float32Array(n);
  const ra = new Float32Array(n);
  const dec = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [r, d, m, b] = rows[i];
    const v = eqjVector(r, d);
    xyz[i * 3] = v[0];
    xyz[i * 3 + 1] = v[1];
    xyz[i * 3 + 2] = v[2];
    mag[i] = m;
    bv[i] = num(b) ? b : NaN;
    ra[i] = r;
    dec[i] = d;
  }
  return { n, xyz, mag, bv, ra, dec };
}

export interface NamedStar {
  name: string;
  ra: number;
  dec: number;
  mag: number;
  v: Vec3;
}

function prepNames(raw: unknown): NamedStar[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: NamedStar[] = [];
  for (const s of raw as any[]) {
    if (!s || typeof s.name !== "string" || !s.name.trim() || !num(s.ra) || !num(s.dec)) continue;
    const name = s.name.trim();
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, ra: s.ra, dec: s.dec, mag: num(s.mag) ? s.mag : 3, v: eqjVector(s.ra, s.dec) });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

// ---------------------------------------------------------------------------------------------
// Constellations
// ---------------------------------------------------------------------------------------------

export interface ConstellationFigure {
  abbr: string;
  /** Polylines as J2000 unit vectors (x,y,z triples), subdivided so curves stay true near the horizon. */
  lines: Float64Array[];
}

const MAX_STEP = (2.5 * Math.PI) / 180;

function subdivide(points: number[][]): Float64Array | null {
  const vs = points.filter((p) => Array.isArray(p) && num(p[0]) && num(p[1])).map((p) => eqjVector(p[0], p[1]));
  if (vs.length < 2) return null;
  const out: number[] = [...vs[0]];
  for (let i = 1; i < vs.length; i++) {
    const a = vs[i - 1];
    const b = vs[i];
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const steps = Math.max(1, Math.ceil(Math.acos(dot) / MAX_STEP));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      const len = Math.hypot(x, y, z) || 1;
      out.push(x / len, y / len, z / len);
    }
  }
  return new Float64Array(out);
}

function prepLines(raw: unknown): ConstellationFigure[] | null {
  if (!raw || typeof raw !== "object") return null;
  const out: ConstellationFigure[] = [];
  for (const [abbr, polys] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(polys)) continue;
    const lines = polys.map((p) => (Array.isArray(p) ? subdivide(p as number[][]) : null)).filter((x): x is Float64Array => !!x);
    if (lines.length) out.push({ abbr, lines });
  }
  return out;
}

export interface ConstellationLabel {
  abbr: string;
  name: string;
  ra: number;
  dec: number;
  v: Vec3;
}

function prepLabels(raw: unknown): ConstellationLabel[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as any[])
    .filter((l) => l && typeof l.abbr === "string" && typeof l.name === "string" && num(l.ra) && num(l.dec))
    .map((l) => ({ abbr: l.abbr, name: l.name, ra: l.ra, dec: l.dec, v: eqjVector(l.ra, l.dec) }));
}

// ---------------------------------------------------------------------------------------------
// Milky Way
// ---------------------------------------------------------------------------------------------

export interface MilkyWayLevels {
  /** Rings of [raHours, decDeg] per brightness level, faintest first. */
  levels: { level: number; rings: number[][][] }[];
}

function prepMilkyWay(raw: unknown): MilkyWayLevels | null {
  const lv = (raw as any)?.levels;
  if (!Array.isArray(lv)) return null;
  const levels = lv
    .filter((l: any) => l && Array.isArray(l.polys))
    .map((l: any, i: number) => ({
      level: num(l.level) ? l.level : i + 1,
      rings: (l.polys as unknown[]).filter((r): r is number[][] => Array.isArray(r) && r.length > 2),
    }))
    .sort((a: { level: number }, b: { level: number }) => a.level - b.level);
  return levels.length ? { levels } : null;
}

// ---------------------------------------------------------------------------------------------
// Deep-sky objects
// ---------------------------------------------------------------------------------------------

export type DsoSymbol = "galaxy" | "globular" | "open" | "nebula" | "planetary" | "double" | "dark";

export function dsoSymbol(type: ObjectType | string): DsoSymbol {
  switch (type) {
    case "galaxy":
    case "galaxy_group":
      return "galaxy";
    case "globular_cluster":
      return "globular";
    case "open_cluster":
    case "asterism":
    case "star_cloud":
      return "open";
    case "planetary_nebula":
      return "planetary";
    case "double_star":
      return "double";
    case "dark_nebula":
      return "dark";
    default:
      return "nebula";
  }
}

export interface SkyDso {
  o: CatalogObject;
  v: Vec3;
  symbol: DsoSymbol;
  /** Major / minor axis in degrees (0 if unknown). */
  major: number;
  minor: number;
  /** Shown at the default zoom (showpieces + Messier). */
  primary: boolean;
  /** Short chart label ("M31", "NGC 7000", "Albireo"). */
  label: string;
}

export function prepDsos(objects: CatalogObject[]): SkyDso[] {
  const out: SkyDso[] = [];
  for (const o of objects) {
    if (!num(o.ra) || !num(o.dec)) continue;
    const major = o.size?.[0] ? o.size[0] / 60 : 0;
    const minor = o.size?.[1] ? o.size[1] / 60 : major;
    const ngc = o.designations?.find((d) => /^(NGC|IC) /.test(d));
    const short = o.name.replace(/\s*\(.*\)\s*$/, "");
    const label = o.m ? `M${o.m}` : o.type === "double_star" || !ngc ? short : o.showpiece && short.length <= 18 ? short : ngc;
    out.push({ o, v: eqjVector(o.ra, o.dec), symbol: dsoSymbol(o.type), major, minor, primary: !!o.m || !!o.showpiece, label });
  }
  // Brightest first, so label placement favours the showpieces.
  return out.sort((a, b) => (a.primary === b.primary ? (a.o.mag ?? 12) - (b.o.mag ?? 12) : a.primary ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------------------------

function useSkyFile<T>(name: string, prep: (raw: unknown) => T | null) {
  return useQuery({
    queryKey: ["sky-data", name],
    queryFn: async () => {
      const raw = await loadJson(name);
      return raw === null ? null : prep(raw);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

export interface SkyData {
  stars: StarField | null;
  names: NamedStar[] | null;
  lines: ConstellationFigure[] | null;
  labels: ConstellationLabel[] | null;
  milkyWay: MilkyWayLevels | null;
  starsLoading: boolean;
  starsError: boolean;
}

export function useSkyData(): SkyData {
  const stars = useSkyFile("stars", prepStars);
  const names = useSkyFile("starnames", prepNames);
  const lines = useSkyFile("constellation-lines", prepLines);
  const labels = useSkyFile("constellation-labels", prepLabels);
  const mw = useSkyFile("milkyway", prepMilkyWay);
  return {
    stars: stars.data ?? null,
    names: names.data ?? null,
    lines: lines.data ?? null,
    labels: labels.data ?? null,
    milkyWay: mw.data ?? null,
    starsLoading: stars.isLoading,
    starsError: !!stars.error,
  };
}
