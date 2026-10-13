/**
 * Builds the offline reference fixtures behind shared/astro/reference.test.ts:
 *
 *   shared/astro/fixtures/horizons-nights.json  Sun, Moon and planets from JPL Horizons
 *   shared/astro/fixtures/fixed-targets.json    deep-sky targets from an independent Meeus computation
 *
 * Usage (repo root):  npx tsx scripts/reference/fetch-horizons.ts
 *
 * Horizons is queried politely (scripts/reference/horizons.ts: one request at a time, ≥ 2 s apart, cached in
 * .local/reference-cache), and only ever with coordinates, dates and object codes. A full run is ~160 requests
 * (~10 minutes); a re-run is served from the cache.
 *
 * How each value is derived (only the derived values are stored, never the series):
 * - Every body is fetched as a 1-minute series across the night of each date (local solar noon − 1 h to
 *   + 25 h, topocentric for the site, WGS-84): apparent elevation (quantity 4), hour angle (42), and for the
 *   Moon and planets magnitude (9), illuminated fraction (10) and angular diameter (13).
 * - Twilight: the Sun's AIRLESS (geometric) elevation crossing −6°/−12°/−18° (USNO definitions), linear
 *   interpolation between minutes. Solar noon / midnight: the Sun's hour angle crossing 0 h / 12 h.
 * - Rise and set: the REFRACTED elevation (Horizons' refraction model) of the upper limb (Sun and Moon:
 *   centre + half the angular diameter) or of the centre (planets) crossing 0° — a sea-level horizon, as
 *   almanacs and the app use. (Horizons' own rise/set listing, R_T_S_ONLY, gives only the first whole minute
 *   after the event, and its "true visual horizon" also lowers the horizon by the dip of an elevated
 *   observer — 17′ at 99 m. Spot checks: the derived times fall in the minute before Horizons' listing.)
 * - Transit: the hour angle crossing 0 h (meridian), as Horizons' own transit flag.
 * - Windows: the stretches between civil dusk and civil dawn (Sun's centre 6° down, geometric) when the
 *   REFRACTED elevation is ≥ 20° (also ≥ 10° for the Moon, Mercury and Venus), and the highest point in that
 *   span (parabola through the three samples around a culmination, else the value at dusk or dawn).
 * - Magnitude, % illuminated and diameter: the Horizons row at `refTime` (solar midnight, whole minute).
 * - Deep-sky targets (fixed-targets.json): Horizons has no mode for an arbitrary RA/Dec, so their altitudes
 *   come from scripts/reference/meeus.ts — precession, nutation, aberration, sidereal time and Saemundsson
 *   refraction written from Meeus' Astronomical Algorithms, sharing no code with astronomy-engine. Windows are
 *   within astronomical darkness (Sun 18° down, from the Horizons Sun above).
 * - "Through the year": the highest altitude within ±2 h of local mean solar midnight between the 15th and
 *   16th of each month (the strip's definition), exact — 1-minute samples and a parabola at the culmination.
 *   Fixed targets from Meeus; Mars, Jupiter and Saturn at Athens from Horizons.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheHits, horizons, hzTime, parseTime, requests, table, topo, type RefSite } from "./horizons";
import { horizontal } from "./meeus";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "shared", "astro", "fixtures");

export const SITES: Record<string, RefSite> = {
  athens: { name: "Athens", lat: 37.98, lon: 23.73, elevation: 99, timezone: "Europe/Athens" },
  sydney: { name: "Sydney", lat: -33.87, lon: 151.21, elevation: 50, timezone: "Australia/Sydney" },
  reykjavik: { name: "Reykjavik", lat: 64.15, lon: -21.94, elevation: 20, timezone: "Atlantic/Reykjavik" },
};
/** Autumn (today), northern winter / southern summer, the equinox, and midsummer (no darkness at Reykjavik). */
const DATES = ["2026-10-14", "2026-12-20", "2027-03-25", "2027-06-21"];
const BODIES: [string, string][] = [
  ["moon", "301"],
  ["mercury", "199"],
  ["venus", "299"],
  ["mars", "499"],
  ["jupiter", "599"],
  ["saturn", "699"],
  ["uranus", "799"],
  ["neptune", "899"],
];
/** Bright bodies the app also looks for down to 10° (sky.ts BRIGHT_LOW). */
const LOW = new Set(["moon", "mercury", "venus"]);
const TARGETS = ["M31", "M13", "M42", "NGC5139"];
const YEAR_FROM = Date.parse("2026-10-14T12:00:00Z");
const YEAR_PLANETS: [string, string][] = [
  ["mars", "499"],
  ["jupiter", "599"],
  ["saturn", "699"],
];

const MIN = 60_000;
const HOUR = 3_600_000;
const iso = (ms: number | null) => (ms === null ? null : new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z"));
const round = (x: number, d: number) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const isoSegs = (segs: [number, number][]) => segs.map(([a, b]) => [iso(a), iso(b)]);

/** JSON with one level per line, but short arrays and flat objects kept on one line (small, readable diffs). */
function pretty(v: unknown, ind = ""): string {
  const flat = (x: unknown) => x === null || typeof x !== "object";
  if (Array.isArray(v)) {
    if (v.every((x) => flat(x) || (Array.isArray(x) && x.every(flat)))) return JSON.stringify(v);
    return `[\n${v.map((x) => `${ind} ${pretty(x, `${ind} `)}`).join(",\n")}\n${ind}]`;
  }
  if (v && typeof v === "object") {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    if (e.every(([, x]) => flat(x) || (Array.isArray(x) && x.every(flat))) && JSON.stringify(v).length < 140) return JSON.stringify(v);
    return `{\n${e.map(([k, x]) => `${ind} ${JSON.stringify(k)}: ${pretty(x, `${ind} `)}`).join(",\n")}\n${ind}}`;
  }
  return JSON.stringify(v);
}

// ------------------------------------------------------------------------------------ series helpers

interface Series {
  t: number[];
  alt: number[];
  /** Hour angle, hours in −12..+12. */
  ha: number[];
  mag: number[];
  ill: number[];
  diam: number[];
}

async function series(command: string, site: RefSite, t0: number, t1: number, quantities: string, apparent: "AIRLESS" | "REFRACTED"): Promise<Series> {
  const txt = await horizons({
    COMMAND: command,
    EPHEM_TYPE: "OBSERVER",
    ...topo(site),
    START_TIME: hzTime(t0),
    STOP_TIME: hzTime(t1),
    STEP_SIZE: "1m",
    QUANTITIES: quantities,
    APPARENT: apparent,
    ANG_FORMAT: "DEG",
  });
  const { head, rows } = table(txt);
  const col = (ok: (h: string) => boolean) => head.findIndex(ok);
  const iE = col((h) => h.startsWith("Elev"));
  const iH = col((h) => h.includes("Hour_Ang"));
  const iM = col((h) => h === "APmag");
  const iI = col((h) => h === "Illu%");
  const iD = col((h) => h === "Ang-diam");
  if (iE < 0) throw new Error(`no elevation column in ${head.join("|")}`);
  const num = (row: string[], i: number) => (i < 0 ? NaN : Number(row[i]));
  return {
    t: rows.map((x) => parseTime(x[0])),
    alt: rows.map((x) => num(x, iE)),
    ha: rows.map((x) => num(x, iH)),
    mag: rows.map((x) => num(x, iM)),
    ill: rows.map((x) => num(x, iI)),
    diam: rows.map((x) => num(x, iD)),
  };
}

/** Linear interpolation of y at time x. */
function at(t: number[], y: number[], x: number): number {
  if (x <= t[0]) return y[0];
  for (let i = 1; i < t.length; i++) if (t[i] >= x) return y[i - 1] + ((x - t[i - 1]) / (t[i] - t[i - 1])) * (y[i] - y[i - 1]);
  return y[y.length - 1];
}

/** Every time y crosses `level` (linear between samples): +1 going up, −1 going down. */
function crossings(t: number[], y: number[], level: number): { t: number; dir: 1 | -1 }[] {
  const out: { t: number; dir: 1 | -1 }[] = [];
  for (let i = 1; i < t.length; i++) {
    const a = y[i - 1] - level;
    const b = y[i] - level;
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) out.push({ t: t[i - 1] + (a / (a - b)) * (t[i] - t[i - 1]), dir: b >= 0 ? 1 : -1 });
  }
  return out;
}

/** Upper transits: the hour angle crossing 0 h going from east (−) to west (+). */
function transits(t: number[], ha: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < t.length; i++) if (ha[i - 1] < 0 && ha[i] >= 0 && ha[i] - ha[i - 1] < 6) out.push(t[i - 1] + (-ha[i - 1] / (ha[i] - ha[i - 1])) * (t[i] - t[i - 1]));
  return out;
}

/** Lower transits (the Sun's: solar midnight): the hour angle wrapping from +12 h to −12 h. */
function lowerTransits(t: number[], ha: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < t.length; i++)
    if (ha[i - 1] > 6 && ha[i] < -6) {
      const b = ha[i] + 24;
      out.push(t[i - 1] + ((12 - ha[i - 1]) / (b - ha[i - 1])) * (t[i] - t[i - 1]));
    }
  return out;
}

/** Highest value in [a, b]: a culmination inside (parabola through three samples), else an end. */
function maxIn(t: number[], y: number[], a: number, b: number): { alt: number; t: number } {
  let best = { alt: at(t, y, a), t: a };
  const atB = at(t, y, b);
  if (atB > best.alt) best = { alt: atB, t: b };
  for (let i = 1; i < t.length - 1; i++) {
    if (t[i] <= a || t[i] >= b) continue;
    if (y[i] >= y[i - 1] && y[i] >= y[i + 1]) {
      const den = y[i - 1] - 2 * y[i] + y[i + 1];
      const off = den !== 0 ? (0.5 * (y[i - 1] - y[i + 1])) / den : 0;
      const tt = t[i] + off * (t[i + 1] - t[i]);
      const v = y[i] - 0.25 * (y[i - 1] - y[i + 1]) * off;
      if (v > best.alt && tt >= a && tt <= b) best = { alt: v, t: tt };
    } else if (y[i] > best.alt) best = { alt: y[i], t: t[i] };
  }
  return best;
}

/** The stretches inside [a, b] where y ≥ level. */
function above(t: number[], y: number[], level: number, a: number, b: number): [number, number][] {
  const segs: [number, number][] = [];
  let open: number | null = at(t, y, a) >= level ? a : null;
  for (const c of crossings(t, y, level)) {
    if (c.t <= a || c.t >= b) continue;
    if (c.dir > 0) open = c.t;
    else if (open !== null) {
      segs.push([open, c.t]);
      open = null;
    }
  }
  if (open !== null) segs.push([open, b]);
  return segs;
}

const firstIn = (xs: number[], a: number, b: number) => xs.find((x) => x > a && x < b) ?? null;

// ------------------------------------------------------------------------------------ one night

async function night(siteKey: string, date: string) {
  const site = SITES[siteKey];
  const [y, m, d] = date.split("-").map(Number);
  const approxNoon = Date.UTC(y, m - 1, d, 12) - (site.lon / 15) * HOUR;
  const t0 = Math.floor((approxNoon - HOUR) / MIN) * MIN;
  const t1 = t0 + 26 * HOUR;

  // The Sun: geometric elevation for twilight and solar noon / midnight, refracted for sunrise and sunset.
  const sa = await series("10", site, t0, t1, "4,42", "AIRLESS");
  const sr = await series("10", site, t0, t1, "4,13", "REFRACTED");
  const [noon, nextNoon] = transits(sa.t, sa.ha);
  const midnight = lowerTransits(sa.t, sa.ha).find((x) => x > noon && x < nextNoon)!;
  const twilight = (level: number) => {
    const xs = crossings(sa.t, sa.alt, level);
    const dusk = firstIn(xs.filter((c) => c.dir < 0).map((c) => c.t), noon, nextNoon);
    const dawn = firstIn(xs.filter((c) => c.dir > 0).map((c) => c.t), dusk ?? noon, nextNoon);
    return [dusk, dawn] as const;
  };
  const limb = crossings(sr.t, sr.alt.map((a, i) => a + sr.diam[i] / 7200), 0);
  const sunset = firstIn(limb.filter((c) => c.dir < 0).map((c) => c.t), noon, nextNoon);
  const sunrise = firstIn(limb.filter((c) => c.dir > 0).map((c) => c.t), sunset ?? midnight, nextNoon);
  const [civilDusk, civilDawn] = twilight(-6);
  const [nauticalDusk, nauticalDawn] = twilight(-12);
  const [astroDusk, astroDawn] = twilight(-18);
  const refTime = Math.round(midnight / MIN) * MIN;

  const bodies: Record<string, unknown> = {};
  for (const [id, command] of BODIES) {
    const s = await series(command, site, t0, t1, "4,9,10,13,42", "REFRACTED");
    const edge = crossings(s.t, s.alt.map((a, i) => a + (id === "moon" ? s.diam[i] / 7200 : 0)), 0);
    const k = s.t.indexOf(refTime);
    if (k < 0) throw new Error(`refTime outside the ${id} series`);
    const civil = civilDusk !== null && civilDawn !== null;
    const levels = LOW.has(id) ? [20, 10] : [20];
    bodies[id] = {
      rise: edge.filter((c) => c.dir > 0).map((c) => iso(c.t)),
      set: edge.filter((c) => c.dir < 0).map((c) => iso(c.t)),
      transit: transits(s.t, s.ha).map(iso),
      mag: round(s.mag[k], 3),
      illum: round(s.ill[k], 3),
      diam: round(s.diam[k], 3),
      ...(civil
        ? (() => {
            const mx = maxIn(s.t, s.alt, civilDusk!, civilDawn!);
            return {
              max: { alt: round(mx.alt, 3), t: iso(mx.t) },
              above: Object.fromEntries(levels.map((l) => [String(l), isoSegs(above(s.t, s.alt, l, civilDusk!, civilDawn!))])),
            };
          })()
        : { max: null, above: null }),
    };
  }

  // Deep-sky targets (Meeus) on the same 1-minute grid, inside astronomical darkness.
  const dark = astroDusk !== null && astroDawn !== null ? ([astroDusk, astroDawn] as const) : null;
  const targets: Record<string, unknown> = {};
  for (const id of TARGETS) {
    const { ra, dec } = TARGET_POS[id];
    const h = sa.t.map((t) => horizontal(ra, dec, t, site.lat, site.lon));
    const alt = h.map((x) => x.alt);
    const ha = h.map((x) => (x.ha > 180 ? x.ha - 360 : x.ha) / 15);
    const tr = transits(sa.t, ha);
    targets[id] = {
      transit: tr.map((t) => ({ t: iso(t), alt: round(horizontal(ra, dec, t, site.lat, site.lon).alt, 3) })),
      max: dark ? (({ alt: a, t }) => ({ alt: round(a, 3), t: iso(t) }))(maxIn(sa.t, alt, dark[0], dark[1])) : null,
      above20: dark ? isoSegs(above(sa.t, alt, 20, dark[0], dark[1])) : null,
    };
  }

  return {
    horizons: {
      site: siteKey,
      date,
      refTime: iso(refTime),
      sun: {
        noon: iso(noon),
        solarMidnight: iso(midnight),
        nextNoon: iso(nextNoon),
        sunset: iso(sunset),
        sunrise: iso(sunrise),
        civilDusk: iso(civilDusk),
        nauticalDusk: iso(nauticalDusk),
        astroDusk: iso(astroDusk),
        astroDawn: iso(astroDawn),
        nauticalDawn: iso(nauticalDawn),
        civilDawn: iso(civilDawn),
      },
      bodies,
    },
    fixed: { site: siteKey, date, dark: dark ? [iso(dark[0]), iso(dark[1])] : null, targets },
  };
}

// ------------------------------------------------------------------------------------ through the year

/** The strip's months: local mean solar midnight between the 15th and 16th, for 12 months from YEAR_FROM. */
function yearMidnights(lon: number): number[] {
  const local = new Date(YEAR_FROM + (lon / 15) * HOUR);
  const [y0, m0] = [local.getUTCFullYear(), local.getUTCMonth()];
  return Array.from({ length: 12 }, (_, i) => Date.UTC(y0 + Math.floor((m0 + i) / 12), (m0 + i) % 12, 16) - (lon / 15) * HOUR);
}

function fixedYear(site: RefSite, ra: number, dec: number): (number | null)[] {
  return yearMidnights(site.lon).map((tm) => {
    const t: number[] = [];
    for (let x = Math.floor((tm - 2 * HOUR) / MIN) * MIN; x <= tm + 2 * HOUR + MIN; x += MIN) t.push(x);
    return round(maxIn(t, t.map((x) => horizontal(ra, dec, x, site.lat, site.lon).alt), tm - 2 * HOUR, tm + 2 * HOUR).alt, 3);
  });
}

async function planetYear(site: RefSite, command: string): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (const tm of yearMidnights(site.lon)) {
    const s = await series(command, site, Math.floor((tm - 2 * HOUR) / MIN) * MIN, Math.ceil((tm + 2 * HOUR) / MIN) * MIN, "4", "REFRACTED");
    out.push(round(maxIn(s.t, s.alt, tm - 2 * HOUR, tm + 2 * HOUR).alt, 3));
  }
  return out;
}

// ------------------------------------------------------------------------------------ run

const catalog = JSON.parse(readFileSync(join(ROOT, "shared", "data", "catalog.json"), "utf8")) as { id: string; ra: number; dec: number }[];
const TARGET_POS: Record<string, { ra: number; dec: number }> = Object.fromEntries(
  TARGETS.map((id) => {
    const o = catalog.find((x) => x.id === id);
    if (!o) throw new Error(`${id} not in the catalog`);
    return [id, { ra: o.ra, dec: o.dec }];
  }),
);

const nights: unknown[] = [];
const fixedNights: unknown[] = [];
for (const siteKey of Object.keys(SITES))
  for (const date of DATES) {
    const n = await night(siteKey, date);
    nights.push(n.horizons);
    fixedNights.push(n.fixed);
    console.log(`${siteKey} ${date} done (${requests} requests, ${cacheHits} from cache)`);
  }

const planetYears: Record<string, (number | null)[]> = {};
for (const [id, command] of YEAR_PLANETS) planetYears[id] = await planetYear(SITES.athens, command);

const fromMonth = new Date(YEAR_FROM).toISOString().slice(0, 7);
const generated = new Date().toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "horizons-nights.json"),
  pretty(
    {
      about: [
        "Generated by scripts/reference/fetch-horizons.ts from JPL Horizons (https://ssd.jpl.nasa.gov/horizons/) — see that script for how each value is derived.",
        "Times are UTC. Rise/set: upper limb (Sun, Moon) or centre (planets) on the refracted sea-level horizon. Transit: meridian. Twilight: Sun's geometric centre at −6/−12/−18°.",
        "above[N]: stretches between civil dusk and dawn with refracted altitude ≥ N°; max: highest refracted altitude in that span. mag/illum (%)/diam (″) at refTime.",
        `generated ${generated}`,
      ],
      sites: SITES,
      nights,
      year: { from: fromMonth, site: "athens", bodies: planetYears },
    },
  ) + "\n",
);
writeFileSync(
  join(OUT, "fixed-targets.json"),
  pretty(
    {
      about: [
        "Generated by scripts/reference/fetch-horizons.ts. Altitudes from scripts/reference/meeus.ts (independent of astronomy-engine; Horizons has no fixed RA/Dec mode); darkness from the JPL Horizons Sun.",
        "dark: astronomical dusk and dawn (UTC). transit: meridian passages in the night's 26 h span with refracted altitude. max / above20: inside astronomical darkness.",
        "year: highest refracted altitude within ±2 h of local mean solar midnight 15th/16th of each month, from `from`.",
        `generated ${generated}`,
      ],
      targets: TARGET_POS,
      nights: fixedNights,
      year: { from: fromMonth, sites: Object.fromEntries(Object.entries(SITES).map(([k, s]) => [k, Object.fromEntries(TARGETS.map((id) => [id, fixedYear(s, TARGET_POS[id].ra, TARGET_POS[id].dec)]))])) },
    },
  ) + "\n",
);
console.log(`wrote ${OUT}/horizons-nights.json and fixed-targets.json — ${requests} Horizons requests, ${cacheHits} from cache`);
