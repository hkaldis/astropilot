/**
 * Space-station pass predictions (ISS and China's Tiangong). SGP4 via satellite.js over the next
 * 10 days (as Heavens-Above lists them): a 60-second scan finds when a station is above the horizon,
 * then 10-second samples describe the pass. A pass is the stretch above 10°; it is *visible* when, at
 * some moment of it, the observer is in darkness (Sun below −6°) while the station is still sunlit —
 * outside the Earth's shadow, modelled as a cylinder of Earth radius along the anti-Sun direction
 * (Sun vector from astronomy-engine, rotated to the true equator of date ≈ SGP4's TEME frame).
 *
 * Orbits (TLEs) come from CelesTrak, with SatNOGS and AMSAT as fallbacks, refreshed every 6 h and
 * kept in the database (`orbit_elements`) so a restart or a new instance doesn't depend on any of
 * them being up. Requests are answered from the stored orbit while a refresh runs in the background.
 *
 * Magnitude: m = M₀ + 5·log10(range / 1000 km) + 0.0115·(φ − 90°), φ the Sun–station–observer
 * phase angle. For the ISS, M₀ = −1.7 reproduces Heavens-Above's predictions within ~0.15 mag
 * (overhead ≈ −3.7, low passes toward the twilight glow ≈ −0.5). Tiangong is ~1.8 mag fainter
 * intrinsically (Heavens-Above: 0.0 vs −1.8 at 1000 km, half lit), so M₀ = +0.1 (overhead ≈ −2).
 * Tiangong's 41.5° orbit keeps it below 10° for observers poleward of ~55°.
 */
import * as satellite from "satellite.js";
import { A, DEG, HOUR_MS, compassPoint } from "@shared/astro";
import type { IssPass, StationId } from "@shared/forecast";
import { HttpError, TTLCache, USER_AGENT, fetchWithTimeout } from "../http";

export const STATIONS: Record<StationId, { norad: number; name: string; stdMag: number }> = {
  iss: { norad: 25544, name: "ISS", stdMag: -1.7 },
  tiangong: { norad: 48274, name: "Tiangong", stdMag: 0.1 },
};

const TLE_TTL = 6 * HOUR_MS; // refresh after this (CelesTrak asks for no more than one download per 2 h)
const TLE_MAX_AGE = 4 * 24 * HOUR_MS; // by the elements' epoch: older orbits drift too far for pass times
const BACKGROUND_RETRY = 15 * 60_000; // after a failed background refresh, wait this long before the next
const FAILED_RETRY = 2 * 60_000; // with nothing usable, don't ask the sources again sooner than this after a failure
const OLD_RETRY = 2 * HOUR_MS; // the sources only had elements too old to use: ask again after this (CelesTrak's minimum)
const SOURCE_TIMEOUT = 8000;
const HEDGE_MS = 3000; // a slow source gets the next one started alongside it
const DAYS = 10;
const COARSE_MS = 60_000;
const STEP_MS = 10_000;
const MIN_ALT = 10; // deg
const DARK_SUN_ALT = -6; // deg
const EARTH_R = 6378.137; // km
const PHASE_COEF = 0.0115; // mag per degree of phase angle
const PASS_TTL = 30 * 60_000;

// ---------------------------------------------------------------------------------------------
// Orbital elements
// ---------------------------------------------------------------------------------------------

interface Tle {
  name: string;
  line1: string;
  line2: string;
  epoch: number; // epoch ms of the elements
  fetchedAt: number;
  source: string;
}

type RawTle = { name?: string; line1: string; line2: string };

/** TLE checksum: digits summed, "-" counts 1, modulo 10, in column 69. */
const checksumOk = (line: string) => {
  let sum = 0;
  for (const ch of line.slice(0, 68)) sum += ch === "-" ? 1 : ch >= "0" && ch <= "9" ? Number(ch) : 0;
  return sum % 10 === Number(line[68]);
};

/** Epoch of line 1 (columns 19–32: two-digit year and fractional day of year). */
export function tleEpoch(line1: string): number {
  const yy = Number(line1.slice(18, 20));
  const doy = Number(line1.slice(20, 32));
  return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 24 * HOUR_MS;
}

function validTle(raw: RawTle, norad: number, source: string): Tle {
  const line1 = raw.line1.trimEnd();
  const line2 = raw.line2.trimEnd();
  if (!line1.startsWith(`1 ${norad}`) || !line2.startsWith(`2 ${norad}`) || line1.length < 69 || line2.length < 69) throw new Error("unexpected TLE format");
  if (!checksumOk(line1) || !checksumOk(line2)) throw new Error("TLE checksum mismatch");
  const rec = satellite.twoline2satrec(line1, line2);
  const epoch = tleEpoch(line1);
  const pv = rec.error ? null : satellite.propagate(rec, new Date(epoch));
  if (!pv?.position || typeof pv.position === "boolean" || !Number.isFinite(epoch)) throw new Error("TLE doesn't propagate");
  return { name: raw.name?.trim() || String(norad), line1, line2, epoch, fetchedAt: Date.now(), source };
}

/** The two lines for one satellite in a TLE text (2- or 3-line format). */
function pickTle(text: string, norad: number): RawTle {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const i = lines.findIndex((l) => l.startsWith(`1 ${norad}`));
  if (i < 0 || !lines[i + 1]) throw new Error(`no elements for ${norad}`);
  const prev = lines[i - 1];
  return { name: prev && !/^[12] /.test(prev) ? prev.replace(/^0 /, "") : undefined, line1: lines[i], line2: lines[i + 1] };
}

async function download(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { timeoutMs: SOURCE_TIMEOUT, headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const TLE_SOURCES: { name: string; load: (norad: number) => Promise<RawTle> }[] = [
  { name: "CelesTrak", load: async (n) => pickTle(await download(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${n}&FORMAT=tle`), n) },
  {
    name: "SatNOGS",
    load: async (n) => {
      const rows = JSON.parse(await download(`https://db.satnogs.org/api/tle/?norad_cat_id=${n}&format=json`)) as { tle0?: string; tle1?: string; tle2?: string }[];
      const r = Array.isArray(rows) ? rows[0] : undefined;
      if (!r?.tle1 || !r.tle2) throw new Error(`no elements for ${n}`);
      return { name: r.tle0?.replace(/^0 /, ""), line1: r.tle1, line2: r.tle2 };
    },
  },
  { name: "AMSAT", load: async (n) => pickTle(await download("https://www.amsat.org/tle/current/nasabare.txt"), n) },
];

/**
 * First valid answer from the sources, in order of preference. The next source starts when one fails
 * or hasn't answered within HEDGE_MS, so a slow CelesTrak costs a few seconds at most.
 */
function fetchTle(id: StationId): Promise<Tle> {
  const { norad, name } = STATIONS[id];
  return new Promise((resolve, reject) => {
    const errors: string[] = [];
    let next = 0;
    let running = 0;
    let settled = false;
    const launch = () => {
      if (settled || next >= TLE_SOURCES.length) return;
      const src = TLE_SOURCES[next++];
      running++;
      const hedge = setTimeout(launch, HEDGE_MS);
      src
        .load(norad)
        .then((raw) => validTle({ ...raw, name: raw.name || name }, norad, src.name))
        .then(
          (tle) => {
            clearTimeout(hedge);
            running--;
            if (!settled) {
              settled = true;
              resolve(tle);
            }
          },
          (e: unknown) => {
            clearTimeout(hedge);
            running--;
            errors.push(`${src.name}: ${e instanceof Error ? e.message : String(e)}`);
            if (next < TLE_SOURCES.length) launch();
            else if (running === 0 && !settled) {
              settled = true;
              reject(new Error(errors.join("; ")));
            }
          },
        );
    };
    launch();
  });
}

/* The database copy. Loaded lazily so this module (and its tests) don't need a database. */
async function loadStoredTle(id: StationId): Promise<{ tle: Tle | null; ok: boolean }> {
  try {
    const { pool } = await import("../db");
    const { rows } = await pool.query(`SELECT name, line1, line2, source, fetched_at FROM orbit_elements WHERE norad = $1`, [STATIONS[id].norad]);
    if (!rows[0]) return { tle: null, ok: true };
    const tle = validTle({ name: rows[0].name, line1: rows[0].line1, line2: rows[0].line2 }, STATIONS[id].norad, rows[0].source ?? "stored");
    return { tle: { ...tle, fetchedAt: new Date(rows[0].fetched_at).getTime() }, ok: true };
  } catch (e) {
    console.warn(`[passes] stored ${STATIONS[id].name} orbit unavailable: ${(e as Error).message}`);
    return { tle: null, ok: false };
  }
}

async function storeTle(id: StationId, tle: Tle) {
  try {
    const { pool } = await import("../db");
    await pool.query(
      `INSERT INTO orbit_elements (norad, name, line1, line2, source, fetched_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (norad) DO UPDATE SET name = EXCLUDED.name, line1 = EXCLUDED.line1, line2 = EXCLUDED.line2, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at`,
      [STATIONS[id].norad, tle.name.slice(0, 64), tle.line1, tle.line2, tle.source, new Date(tle.fetchedAt)],
    );
  } catch (e) {
    console.warn(`[passes] couldn't store the ${STATIONS[id].name} orbit: ${(e as Error).message}`);
  }
}

const tleCache = new Map<StationId, Tle>();
const storedLoads = new Map<StationId, Promise<void>>();
const tleInflight = new Map<StationId, Promise<Tle>>();
const lastBackgroundTry = new Map<StationId, number>();
const lastFailure = new Map<StationId, number>();

/** Read the stored copy once per process (requests arriving meanwhile wait for the same read; a failed read is retried after a while). */
function loadStoredOnce(id: StationId): Promise<void> {
  let p = storedLoads.get(id);
  if (!p) {
    p = loadStoredTle(id).then(({ tle, ok }) => {
      if (tle && !tleCache.has(id)) tleCache.set(id, tle);
      if (!ok) setTimeout(() => storedLoads.delete(id), BACKGROUND_RETRY).unref?.();
    });
    storedLoads.set(id, p);
  }
  return p;
}

/** Download fresh elements (once at a time per station); never replaces newer elements with older ones. */
function refreshTle(id: StationId): Promise<Tle> {
  let pending = tleInflight.get(id);
  if (!pending) {
    pending = fetchTle(id)
      .then((fresh) => {
        const have = tleCache.get(id);
        const tle = have && have.epoch > fresh.epoch ? { ...have, fetchedAt: fresh.fetchedAt } : fresh;
        tleCache.set(id, tle);
        void storeTle(id, tle);
        return tle;
      })
      .finally(() => tleInflight.delete(id));
    tleInflight.set(id, pending);
  }
  return pending;
}

const unavailable = (id: StationId) => new HttpError(502, `${STATIONS[id].name} orbit data is unavailable right now. Please try again later.`);

async function getTle(id: StationId): Promise<Tle> {
  if (!tleCache.has(id)) await loadStoredOnce(id);
  const now = Date.now();
  const have = tleCache.get(id);
  const usable = have && now - have.epoch < TLE_MAX_AGE ? have : null;
  const fetchedRecently = !!have && now - have.fetchedAt < TLE_TTL;
  if (usable && fetchedRecently) return usable;
  if (usable) {
    // Stale but still accurate: answer with it and refresh in the background.
    if (now - (lastBackgroundTry.get(id) ?? 0) > BACKGROUND_RETRY) {
      lastBackgroundTry.set(id, now);
      refreshTle(id).catch((e: Error) => console.warn(`[passes] ${STATIONS[id].name} orbit refresh failed: ${e.message}`));
    }
    return usable;
  }
  // Nothing accurate enough. Don't ask the sources again right after they failed, or soon after the newest
  // elements they had were already too old — that would be a download per page view. (Not for the whole
  // refresh interval, though: newer elements may well be out within a couple of hours.)
  const oldLately = !!have && now - have.fetchedAt < OLD_RETRY;
  if (!tleInflight.has(id) && (oldLately || now - (lastFailure.get(id) ?? 0) < FAILED_RETRY)) throw unavailable(id);
  try {
    const tle = await refreshTle(id);
    if (Date.now() - tle.epoch >= TLE_MAX_AGE) throw new Error(`the newest elements are ${((Date.now() - tle.epoch) / (24 * HOUR_MS)).toFixed(1)} days old`);
    return tle;
  } catch (e) {
    lastFailure.set(id, Date.now());
    console.warn(`[passes] ${STATIONS[id].name} orbit download failed: ${(e as Error).message}`);
    throw unavailable(id);
  }
}

// ---------------------------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3) => Math.sqrt(dot(a, a));

/** Geocentric Sun vector (km) in the true-equator-of-date frame. */
function sunVector(ms: number): V3 {
  const d = new Date(ms);
  const v = A.RotateVector(A.Rotation_EQJ_EQD(d), A.GeoVector(A.Body.Sun, d, true));
  return [v.x * A.KM_PER_AU, v.y * A.KM_PER_AU, v.z * A.KM_PER_AU];
}

interface Sample {
  t: number;
  alt: number; // deg
  az: number; // deg
  range: number; // km
  eci: V3; // km
  gmst: number;
}

interface Observer {
  gd: satellite.GeodeticLocation;
  ecf: satellite.EcfVec3<number>;
  lat: number; // rad
  lon: number; // rad
}

function sample(rec: satellite.SatRec, obs: Observer, t: number): Sample | null {
  const d = new Date(t);
  const pv = satellite.propagate(rec, d);
  const p = pv.position;
  if (!p || typeof p === "boolean") return null;
  const gmst = satellite.gstime(d);
  const look = satellite.ecfToLookAngles(obs.gd, satellite.eciToEcf(p, gmst));
  return { t, alt: look.elevation / DEG, az: look.azimuth / DEG, range: look.rangeSat, eci: [p.x, p.y, p.z], gmst };
}

const unit = (v: V3): V3 => {
  const n = norm(v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** The Sun's altitude for the observer at a sample's moment (deg). */
function sunAltitude(s: Sample, obs: Observer, sunDir: V3): number {
  // Observer's local vertical in the inertial frame (geodetic normal rotated by GMST).
  const lst = obs.lon + s.gmst;
  const up: V3 = [Math.cos(obs.lat) * Math.cos(lst), Math.cos(obs.lat) * Math.sin(lst), Math.sin(obs.lat)];
  return Math.asin(dot(up, sunDir)) / DEG;
}

/** Cylindrical shadow: behind the Earth (relative to the Sun) and within one Earth radius of the axis. */
function inShadow(s: Sample, sunDir: V3): boolean {
  const along = dot(s.eci, sunDir);
  return along < 0 && dot(s.eci, s.eci) - along * along < EARTH_R * EARTH_R;
}

/** Brightness of the sunlit station from its range and the phase angle at the station (Sun–station–observer). */
function magnitude(s: Sample, obs: Observer, sun: V3, stdMag: number): number {
  const o = satellite.ecfToEci(obs.ecf, s.gmst);
  const toObs = sub([o.x, o.y, o.z], s.eci);
  const toSun = sub(sun, s.eci);
  const phase = Math.acos(Math.max(-1, Math.min(1, dot(toObs, toSun) / (norm(toObs) * norm(toSun)))));
  const mag = stdMag + 5 * Math.log10(s.range / 1000) + PHASE_COEF * (phase / DEG - 90);
  return Math.max(-4.5, Math.min(6, mag));
}

/** Time where a quantity crosses `level` between two samples (linear). */
const cross = (a: Sample, b: Sample, level: number) => a.t + ((level - a.alt) / (b.alt - a.alt)) * (b.t - a.t);

function buildPass(rec: satellite.SatRec, obs: Observer, pts: Sample[], id: StationId): IssPass | null {
  const stdMag = STATIONS[id].stdMag;
  // pts: consecutive samples, the first and last at or below the horizon when available.
  let iMax = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].alt > pts[iMax].alt) iMax = i;
  if (pts[iMax].alt <= MIN_ALT) return null;
  let tMax = pts[iMax].t;
  if (iMax > 0 && iMax < pts.length - 1) {
    const [y0, y1, y2] = [pts[iMax - 1].alt, pts[iMax].alt, pts[iMax + 1].alt];
    const den = y0 - 2 * y1 + y2;
    if (den !== 0) tMax += Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / den)) * STEP_MS;
  }
  let iUp = iMax;
  while (iUp > 0 && pts[iUp - 1].alt >= MIN_ALT) iUp--;
  let iDown = iMax;
  while (iDown < pts.length - 1 && pts[iDown + 1].alt >= MIN_ALT) iDown++;
  const start = iUp > 0 ? cross(pts[iUp - 1], pts[iUp], MIN_ALT) : pts[iUp].t;
  const end = iDown < pts.length - 1 ? cross(pts[iDown], pts[iDown + 1], MIN_ALT) : pts[iDown].t;

  const sStart = sample(rec, obs, Math.round(start)) ?? pts[iUp];
  const sEnd = sample(rec, obs, Math.round(end)) ?? pts[iDown];
  const sMax = sample(rec, obs, Math.round(tMax)) ?? pts[iMax];

  // Sunlight along the pass (10 s samples between the 10° crossings, plus the exact ends). The station
  // shows when it's sunlit while the observer's sky is dark (Sun below −6°) at some point of the pass.
  const sun = sunVector(tMax);
  const sunDir = unit(sun);
  const along = [sStart, ...pts.slice(iUp, iDown + 1), sEnd].filter((s) => s.t >= sStart.t && s.t <= sEnd.t).sort((a, b) => a.t - b.t);
  let litStart: number | null = null;
  let litEnd: number | null = null;
  let brightest: number | null = null;
  let seen = false;
  let prev: { s: Sample; lit: boolean } | null = null;
  const refine = (a: Sample, b: Sample, aLit: boolean) => {
    // Bisect the shadow boundary to ~1 s.
    let lo = a.t;
    let hi = b.t;
    for (let k = 0; k < 4 && hi - lo > 1000; k++) {
      const midT = Math.round((lo + hi) / 2);
      const m = sample(rec, obs, midT);
      const lit = m ? !inShadow(m, sunDir) : !aLit;
      if (lit === aLit) lo = midT;
      else hi = midT;
    }
    return (lo + hi) / 2;
  };
  for (const s of along) {
    const lit = !inShadow(s, sunDir);
    if (lit) {
      if (litStart === null) litStart = prev && !prev.lit ? refine(prev.s, s, false) : s.t;
      litEnd = s.t;
      const mag = magnitude(s, obs, sun, stdMag);
      brightest = brightest === null ? mag : Math.min(brightest, mag);
      if (sunAltitude(s, obs, sunDir) < DARK_SUN_ALT) seen = true;
    } else if (prev?.lit) {
      litEnd = refine(prev.s, s, true);
    }
    prev = { s, lit };
  }

  // Like Heavens-Above / Spot the Station: a visible pass is described by its whole sunlit part above
  // 10° — from when it rises past 10° (or leaves Earth's shadow) until it sets (or enters the shadow) —
  // even if the observer's twilight turns bright or dark partway through.
  let s0 = sStart;
  let s1 = sEnd;
  let sm = sMax;
  if (seen && litStart !== null && litEnd !== null) {
    s0 = sample(rec, obs, Math.round(litStart)) ?? sStart;
    s1 = sample(rec, obs, Math.round(litEnd)) ?? sEnd;
    sm = sMax.t >= s0.t && sMax.t <= s1.t ? sMax : s0.alt >= s1.alt ? s0 : s1;
  }

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const visible = seen;
  // Where to look: the visible part's path across the sky, every ~30 s.
  const track = visible
    ? [s0, ...along.filter((s, k) => s.t > s0.t + 5000 && s.t < s1.t - 5000 && k % 3 === 0), s1].map((s) => [Math.round(s.az), Math.round(s.alt)] as [number, number])
    : undefined;
  return {
    sat: id,
    name: STATIONS[id].name,
    start: s0.t,
    max: sm.t,
    end: s1.t,
    maxAlt: r1(sm.alt),
    startAlt: r1(s0.alt),
    endAlt: r1(s1.alt),
    startAz: r1(s0.az),
    endAz: r1(s1.az),
    maxAz: r1(sm.az),
    startDir: compassPoint(s0.az),
    endDir: compassPoint(s1.az),
    visible,
    magnitude: visible && brightest !== null ? r1(brightest) : null,
    hidden: visible ? undefined : sunAltitude(sMax, obs, unit(sun)) >= DARK_SUN_ALT ? "daylight" : "shadow",
    track,
    passStart: Math.round(start),
    passEnd: Math.round(end),
    peakAlt: r1(sMax.alt),
  };
}

/** 10-second samples from `a` to `b` (both below the horizon, except at the ends of the search window). */
function passBetween(rec: satellite.SatRec, obs: Observer, a: number, b: number, id: StationId): IssPass | null {
  const pts: Sample[] = [];
  for (let t = a; t <= b; t += STEP_MS) {
    const s = sample(rec, obs, t);
    if (s) pts.push(s);
  }
  return pts.length ? buildPass(rec, obs, pts, id) : null;
}

function computePasses(id: StationId, tle: Tle, lat: number, lon: number, elevM: number, from: number, to: number): IssPass[] {
  const rec = satellite.twoline2satrec(tle.line1, tle.line2);
  const gd = { latitude: lat * DEG, longitude: lon * DEG, height: elevM / 1000 };
  const obs: Observer = { gd, ecf: satellite.geodeticToEcf(gd), lat: lat * DEG, lon: lon * DEG };
  const passes: IssPass[] = [];
  // Every pass above 10° spends several minutes above the horizon, so a 60 s scan can't miss one.
  let runStart: number | null = null;
  for (let t = from; t <= to; t += COARSE_MS) {
    const s = sample(rec, obs, t);
    const up = !!s && s.alt > 0;
    if (up && runStart === null) runStart = Math.max(from, t - COARSE_MS);
    else if (!up && runStart !== null) {
      const p = passBetween(rec, obs, runStart, t, id);
      if (p) passes.push(p);
      runStart = null;
    }
  }
  if (runStart !== null) {
    // A pass still under way at the end of the window: follow it until it sets (at most half an hour).
    let end = to;
    while (end < to + 30 * 60_000) {
      end += COARSE_MS;
      const s = sample(rec, obs, end);
      if (!s || s.alt <= 0) break;
    }
    const p = passBetween(rec, obs, runStart, end, id);
    if (p) passes.push(p);
  }
  return passes;
}

const passCache = new TTLCache<IssPass[]>(PASS_TTL, 600);

type PassQuery = { lat: number; lon: number; elev?: number };

async function passesFor(id: StationId, q: PassQuery): Promise<IssPass[]> {
  const tle = await getTle(id);
  const lat = Math.round(q.lat * 100) / 100;
  const lon = Math.round(q.lon * 100) / 100;
  const elev = Math.round((q.elev ?? 0) / 10) * 10;
  const key = `${id},${lat},${lon},${elev},${tle.line1.slice(18, 32)}`;
  let passes = passCache.get(key);
  if (!passes) {
    const now = Date.now();
    passes = computePasses(id, tle, lat, lon, elev, now - 20 * 60_000, now + DAYS * 24 * HOUR_MS);
    passCache.set(key, passes);
  }
  const now = Date.now();
  return passes.filter((p) => p.end > now);
}

/**
 * Passes of the given stations, merged and sorted by start. A station whose orbit data is
 * unavailable is skipped when another one succeeds; with a single station the error surfaces.
 */
export async function getStationPasses(ids: StationId[], q: PassQuery): Promise<IssPass[]> {
  const results = await Promise.allSettled(ids.map((id) => passesFor(id, q)));
  const ok = results.filter((r): r is PromiseFulfilledResult<IssPass[]> => r.status === "fulfilled");
  if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  return ok.flatMap((r) => r.value).sort((a, b) => a.start - b.start);
}

/** ISS only — the original /api/iss/passes behaviour. */
export function getIssPasses(q: PassQuery): Promise<IssPass[]> {
  return getStationPasses(["iss"], q);
}
