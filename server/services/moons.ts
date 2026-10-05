/**
 * The moons of Mars, Saturn, Uranus and Neptune from JPL Horizons: each moon's offset from its planet
 * (arcseconds east/north, light-time included), magnitude and visibility code (transit, occulted,
 * eclipsed), every 15 minutes — 10 for Mars's fast moons — from a day and a half ago to a week ahead.
 * The offsets hardly depend on where on Earth you are, so one set serves everyone.
 *
 * Kept in memory and in the database (moon_ephemerides) so restarts don't refetch, and refreshed in the
 * background when fewer than three days remain; a request waits for JPL only when nothing stored covers
 * it. If JPL is down, the stored window keeps serving while it covers the request. Jupiter's moons are
 * computed on the client (shared/astro/moons.ts).
 */
import { A } from "@shared/astro/core";
import { iapetusBrightness, moonsOf, planetDisk, type MoonSeries, type MoonSeriesSet } from "@shared/astro/moons";
import { PLANET_BY_ID } from "@shared/astro/planets";
import { HttpError, USER_AGENT, fetchWithTimeout } from "../http";

export const HORIZON_PLANETS = ["mars", "saturn", "uranus", "neptune"] as const;
export type HorizonPlanet = (typeof HORIZON_PLANETS)[number];

const DAY = 86_400_000;
const STEP_MIN: Record<HorizonPlanet, number> = { mars: 10, saturn: 15, uranus: 15, neptune: 15 };
const BEFORE = 1.5 * DAY; // tonight began at most a day ago (noon to noon under the midnight sun)
const AFTER = 7 * DAY;
const REFRESH_LEFT = 3 * DAY; // refetch once less than this remains ahead
const FAILED_RETRY = 10 * 60_000;
/** Requests the stored window always answers, before and after now. */
export const SERVED = { before: BEFORE, after: REFRESH_LEFT };

const UNAVAILABLE = "Moon positions are unavailable right now. Please try again later.";
const OUTSIDE = "Moon positions are kept from a day and a half ago to three days ahead.";

interface Stored extends MoonSeriesSet {
  fetchedAt: number;
}

const hzTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

async function fetchMoon(naif: number, start: number, stop: number, stepMin: number): Promise<{ t: number[]; x: number[]; y: number[]; mag: (number | null)[]; vis: string }> {
  const q = (v: string) => `'${v}'`;
  const params = new URLSearchParams({
    format: "json",
    COMMAND: q(String(naif)),
    OBJ_DATA: q("NO"),
    MAKE_EPHEM: q("YES"),
    EPHEM_TYPE: q("OBSERVER"),
    CENTER: q("500@399"),
    START_TIME: q(hzTime(start)),
    STOP_TIME: q(hzTime(stop)),
    STEP_SIZE: q(`${stepMin}m`),
    QUANTITIES: q("6,9,12"),
    CSV_FORMAT: q("YES"),
  });
  // Horizons answers one request at a time per client and says 503 when busy: wait a moment and retry.
  let r: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((ok) => setTimeout(ok, 1500 * attempt));
    r = await fetchWithTimeout(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, { timeoutMs: 25_000, headers: { "User-Agent": USER_AGENT } });
    if (r.status !== 503) break;
  }
  if (!r || !r.ok) throw new Error(`Horizons HTTP ${r?.status}`);
  const text = String(((await r.json()) as { result?: string }).result ?? "");
  const a = text.indexOf("$$SOE");
  const b = text.indexOf("$$EOE");
  if (a < 0 || b < 0) throw new Error(`no ephemeris for ${naif}`);
  const out = { t: [] as number[], x: [] as number[], y: [] as number[], mag: [] as (number | null)[], vis: "" };
  for (const line of text.slice(a + 5, b).trim().split("\n")) {
    // Date__(UT)__HR:MN, , , X_(sat-prim), Y_(sat-prim), SatPANG, APmag, S-brt, ang-sep, vis.
    const f = line.split(",").map((c) => c.trim());
    const t = Date.parse(`${f[0].replace(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}:\d{2})$/, "$2 $3 $1 $4")} UTC`);
    const x = Number(f[3]);
    const y = Number(f[4]);
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const mag = Number(f[6]);
    out.t.push(t);
    out.x.push(Math.round(x * 100) / 100);
    out.y.push(Math.round(y * 100) / 100);
    out.mag.push(Number.isFinite(mag) ? Math.round(mag * 100) / 100 : null);
    out.vis += /^[tOpPuU*]$/.test(f[9] ?? "") ? f[9] : "*";
  }
  if (out.t.length < 4) throw new Error(`short ephemeris for ${naif}`);
  return out;
}

async function download(planet: HorizonPlanet): Promise<Stored> {
  const step = STEP_MIN[planet] * 60_000;
  const t0 = Math.floor((Date.now() - BEFORE) / step) * step;
  const stop = t0 + BEFORE + AFTER;
  const moons = moonsOf(planet);
  const results: Awaited<ReturnType<typeof fetchMoon>>[] = [];
  for (const m of moons) results.push(await fetchMoon(m.naif, t0, stop, STEP_MIN[planet])); // one at a time, as Horizons asks
  // Every moon on the same grid, sample for sample (a skipped line would shift everything after it).
  const n = Math.min(...results.map((r) => r.t.length));
  if (results.some((r) => r.t.slice(0, n).some((t, i) => t !== t0 + i * step))) throw new Error("unexpected Horizons time grid");
  const distAu = planet === "saturn" ? A.GeoVector(A.Body.Saturn, new Date(t0 + (n * step) / 2), true).Length() : 0;
  const series: MoonSeries[] = moons.map((m, k) => {
    const r = results[k];
    const mag = r.mag.slice(0, n);
    // Horizons doesn't model Iapetus's dark and bright hemispheres.
    if (m.id === "iapetus") for (let i = 0; i < n; i++) if (mag[i] !== null) mag[i] = Math.round((mag[i]! + iapetusBrightness(r.x[i], distAu)) * 100) / 100;
    return { id: m.id, x: r.x.slice(0, n), y: r.y.slice(0, n), mag, vis: r.vis.slice(0, n) };
  });
  return { planet, t0, step, moons: series, fetchedAt: Date.now() };
}

/* Database copy, loaded lazily so the module works without a database (tests, scripts). */
async function loadStored(planet: HorizonPlanet): Promise<Stored | null> {
  try {
    const { pool } = await import("../db");
    const { rows } = await pool.query(`SELECT t0, step_s, data, fetched_at FROM moon_ephemerides WHERE planet = $1`, [planet]);
    if (!rows[0]) return null;
    return { planet, t0: new Date(rows[0].t0).getTime(), step: rows[0].step_s * 1000, moons: rows[0].data as MoonSeries[], fetchedAt: new Date(rows[0].fetched_at).getTime() };
  } catch (e) {
    console.warn(`[moons] stored ${planet} ephemeris unavailable: ${(e as Error).message}`);
    return null;
  }
}

async function store(s: Stored) {
  try {
    const { pool } = await import("../db");
    await pool.query(
      `INSERT INTO moon_ephemerides (planet, t0, step_s, data, fetched_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (planet) DO UPDATE SET t0 = EXCLUDED.t0, step_s = EXCLUDED.step_s, data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
      [s.planet, new Date(s.t0), s.step / 1000, JSON.stringify(s.moons), new Date(s.fetchedAt)],
    );
  } catch (e) {
    console.warn(`[moons] couldn't store the ${s.planet} ephemeris: ${(e as Error).message}`);
  }
}

const cache = new Map<HorizonPlanet, Stored>();
/** Downloads run one after another across planets too (Horizons takes one request at a time). */
let queue: Promise<unknown> = Promise.resolve();
const storedLoads = new Map<HorizonPlanet, Promise<void>>();
const inflight = new Map<HorizonPlanet, Promise<Stored>>();
const lastFailure = new Map<HorizonPlanet, number>();

const end = (s: Stored) => s.t0 + (s.moons[0].x.length - 1) * s.step;

/** Download a fresh window (one at a time per planet); a failure is remembered so JPL isn't asked again for a while. */
function refresh(planet: HorizonPlanet): Promise<Stored> {
  let p = inflight.get(planet);
  if (!p) {
    const run = queue.then(() => download(planet));
    queue = run.catch(() => undefined);
    p = run
      .then(
        (s) => {
          cache.set(planet, s);
          lastFailure.delete(planet);
          void store(s);
          return s;
        },
        (e) => {
          lastFailure.set(planet, Date.now());
          console.warn(`[moons] Horizons failed for ${planet}: ${(e as Error).message}`);
          throw new HttpError(502, UNAVAILABLE);
        },
      )
      .finally(() => inflight.delete(planet));
    inflight.set(planet, p);
  }
  return p;
}

async function getSet(planet: HorizonPlanet, from: number, to: number): Promise<Stored> {
  if (!cache.has(planet)) {
    let load = storedLoads.get(planet);
    if (!load) {
      load = loadStored(planet).then((s) => {
        if (s && !cache.has(planet)) cache.set(planet, s);
      });
      storedLoads.set(planet, load);
    }
    await load;
  }
  const now = Date.now();
  const have = cache.get(planet);
  const covers = (s: Stored | undefined): s is Stored => !!s && s.t0 <= from && end(s) >= to;
  const stale = !have || end(have) - now <= REFRESH_LEFT;
  const failedLately = now - (lastFailure.get(planet) ?? 0) < FAILED_RETRY;
  // The stored window answers whenever it covers the request; running low, it's renewed in the background.
  if (covers(have)) {
    if (stale && !failedLately) void refresh(planet).catch(() => undefined);
    return have;
  }
  // A fresh window that doesn't cover it: the request is outside what we keep, and downloading won't help.
  if (!stale) throw new HttpError(404, OUTSIDE);
  if (failedLately && !inflight.has(planet)) throw new HttpError(502, UNAVAILABLE);
  const s = await refresh(planet);
  if (!covers(s)) throw new HttpError(404, OUTSIDE);
  return s;
}

/** The moons of `planet` between `from` and `to` (a little padding either side for interpolation). */
export async function getMoonSeries(planet: HorizonPlanet, from: number, to: number): Promise<MoonSeriesSet & { source: string; updated: string }> {
  const s = await getSet(planet, from, to);
  const last = s.moons[0].x.length - 1;
  const i0 = Math.max(0, Math.floor((from - s.t0) / s.step) - 2);
  const i1 = Math.max(i0, Math.min(last, Math.ceil((to - s.t0) / s.step) + 2));
  // The planet's outline mid-window (it changes by a hair over a night), for exact limb crossings.
  const g = A.GeoVector(PLANET_BY_ID[planet].body, new Date((from + to) / 2), true);
  const dist = g.Length();
  const ra = (((Math.atan2(g.y, g.x) * 12) / Math.PI) % 24 + 24) % 24;
  const dec = (Math.asin(g.z / dist) * 180) / Math.PI;
  return {
    planet: s.planet,
    t0: s.t0 + i0 * s.step,
    step: s.step,
    disk: planetDisk(planet, ra, dec, dist),
    moons: s.moons.map((m) => ({ id: m.id, x: m.x.slice(i0, i1 + 1), y: m.y.slice(i0, i1 + 1), mag: m.mag.slice(i0, i1 + 1), vis: m.vis.slice(i0, i1 + 1) })),
    source: "JPL Horizons",
    updated: new Date(s.fetchedAt).toISOString(),
  };
}

export const isHorizonPlanet = (p: string): p is HorizonPlanet => (HORIZON_PLANETS as readonly string[]).includes(p);

/** Warm the store after boot (spaced out), so the first visitor to Saturn's page doesn't wait for JPL. */
export function warmMoons() {
  const now = Date.now();
  HORIZON_PLANETS.forEach((p, i) => setTimeout(() => void getSet(p, now, now + DAY).catch(() => undefined), 30_000 + i * 15_000).unref?.());
}
