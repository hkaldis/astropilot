/**
 * ISS pass predictions. TLE from CelesTrak (cached 6 h), SGP4 via satellite.js, 10-second scan
 * over the next 5 days. A pass is the stretch above 10°; it is *visible* when, at some moment of
 * it, the observer is in darkness (Sun below −6°) while the ISS is still sunlit — outside the
 * Earth's shadow, modelled as a cylinder of Earth radius along the anti-Sun direction (Sun
 * vector from astronomy-engine, rotated to the true equator of date ≈ SGP4's TEME frame).
 *
 * Magnitude: m = −1.7 + 5·log10(range / 1000 km) + 0.0115·(φ − 90°), φ the Sun–ISS–observer
 * phase angle. This linear phase law reproduces Heavens-Above's predictions within ~0.15 mag
 * (overhead ≈ −3.7, low passes toward the twilight glow ≈ −0.5).
 */
import * as satellite from "satellite.js";
import { A, DEG, HOUR_MS, compassPoint } from "@shared/astro";
import type { IssPass } from "@shared/forecast";
import { HttpError, TTLCache, USER_AGENT, fetchWithTimeout } from "../http";

const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle";
const TLE_TTL = 6 * HOUR_MS;
const TLE_STALE_MAX = 3 * 24 * HOUR_MS; // still usable for a few days if CelesTrak is down
const DAYS = 5;
const STEP_MS = 10_000;
const MIN_ALT = 10; // deg
const DARK_SUN_ALT = -6; // deg
const EARTH_R = 6378.137; // km
const STD_MAG = -1.7; // at 1000 km and 90° phase angle
const PHASE_COEF = 0.0115; // mag per degree of phase angle
const PASS_TTL = 30 * 60_000;

interface Tle {
  name: string;
  line1: string;
  line2: string;
  fetchedAt: number;
}

let tleCache: Tle | null = null;
let tleInflight: Promise<Tle> | null = null;

async function loadTle(): Promise<Tle> {
  const res = await fetchWithTimeout(TLE_URL, { timeoutMs: 8000, headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lines = (await res.text())
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const i = lines.findIndex((l) => l.startsWith("1 25544"));
  if (i < 0 || !lines[i + 1]?.startsWith("2 25544") || lines[i].length < 69 || lines[i + 1].length < 69) throw new Error("unexpected TLE format");
  satellite.twoline2satrec(lines[i], lines[i + 1]); // throws on garbage
  return { name: (lines[i - 1] ?? "ISS").trim(), line1: lines[i], line2: lines[i + 1], fetchedAt: Date.now() };
}

async function getTle(): Promise<Tle> {
  if (tleCache && Date.now() - tleCache.fetchedAt < TLE_TTL) return tleCache;
  if (!tleInflight) {
    tleInflight = loadTle()
      .then((t) => (tleCache = t))
      .finally(() => (tleInflight = null));
  }
  try {
    return await tleInflight;
  } catch (e) {
    console.warn(`[iss] TLE fetch failed: ${(e as Error).message}`);
    if (tleCache && Date.now() - tleCache.fetchedAt < TLE_STALE_MAX) return tleCache;
    throw new HttpError(502, "ISS orbit data is unavailable right now. Please try again later.");
  }
}

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

/** Is the observer dark and the ISS sunlit at this sample? Returns a magnitude when visible. */
function visibility(s: Sample, obs: Observer, sun: V3): number | null {
  const sunLen = norm(sun);
  const u: V3 = [sun[0] / sunLen, sun[1] / sunLen, sun[2] / sunLen];
  // Observer's local vertical in the inertial frame (geodetic normal rotated by GMST).
  const lst = obs.lon + s.gmst;
  const up: V3 = [Math.cos(obs.lat) * Math.cos(lst), Math.cos(obs.lat) * Math.sin(lst), Math.sin(obs.lat)];
  const sunAlt = Math.asin(dot(up, u)) / DEG;
  if (sunAlt >= DARK_SUN_ALT) return null;
  // Cylindrical shadow: behind the Earth (relative to the Sun) and within one Earth radius of the axis.
  const along = dot(s.eci, u);
  const perp2 = dot(s.eci, s.eci) - along * along;
  if (along < 0 && perp2 < EARTH_R * EARTH_R) return null;
  // Phase angle at the ISS between the Sun and the observer.
  const o = satellite.ecfToEci(obs.ecf, s.gmst);
  const toObs = sub([o.x, o.y, o.z], s.eci);
  const toSun = sub(sun, s.eci);
  const phase = Math.acos(Math.max(-1, Math.min(1, dot(toObs, toSun) / (norm(toObs) * norm(toSun)))));
  const mag = STD_MAG + 5 * Math.log10(s.range / 1000) + PHASE_COEF * (phase / DEG - 90);
  return Math.max(-4.5, Math.min(5, mag));
}

/** Time where a quantity crosses `level` between two samples (linear). */
const cross = (a: Sample, b: Sample, level: number) => a.t + ((level - a.alt) / (b.alt - a.alt)) * (b.t - a.t);

function buildPass(rec: satellite.SatRec, obs: Observer, pts: Sample[]): IssPass | null {
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

  // Visibility along the pass (10 s samples between the 10° crossings, plus the exact ends).
  const sun = sunVector(tMax);
  const along = [sStart, ...pts.slice(iUp, iDown + 1), sEnd].filter((s) => s.t >= sStart.t && s.t <= sEnd.t).sort((a, b) => a.t - b.t);
  let visibleStart: number | null = null;
  let visibleEnd: number | null = null;
  let brightest: number | null = null;
  let prev: { s: Sample; vis: boolean } | null = null;
  const refine = (a: Sample, b: Sample, aVisible: boolean) => {
    // Bisect the shadow / twilight boundary to ~1 s.
    let lo = a.t;
    let hi = b.t;
    for (let k = 0; k < 4 && hi - lo > 1000; k++) {
      const midT = Math.round((lo + hi) / 2);
      const m = sample(rec, obs, midT);
      const v = m ? visibility(m, obs, sun) !== null : !aVisible;
      if (v === aVisible) lo = midT;
      else hi = midT;
    }
    return (lo + hi) / 2;
  };
  for (const s of along) {
    const mag = visibility(s, obs, sun);
    const vis = mag !== null;
    if (vis) {
      if (visibleStart === null) visibleStart = prev && !prev.vis ? refine(prev.s, s, false) : s.t;
      visibleEnd = s.t;
      brightest = brightest === null ? mag : Math.min(brightest, mag);
    } else if (prev?.vis) {
      visibleEnd = refine(prev.s, s, true);
    }
    prev = { s, vis };
  }

  // Like Heavens-Above / Spot the Station: a visible pass is described by its visible part — from
  // when it is ≥ 10° up and sunlit against a dark sky until it sets or vanishes into the shadow.
  let s0 = sStart;
  let s1 = sEnd;
  let sm = sMax;
  if (visibleStart !== null && visibleEnd !== null) {
    s0 = sample(rec, obs, Math.round(visibleStart)) ?? sStart;
    s1 = sample(rec, obs, Math.round(visibleEnd)) ?? sEnd;
    sm = sMax.t >= s0.t && sMax.t <= s1.t ? sMax : s0.alt >= s1.alt ? s0 : s1;
  }

  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    start: s0.t,
    max: sm.t,
    end: s1.t,
    maxAlt: r1(sm.alt),
    startAz: r1(s0.az),
    endAz: r1(s1.az),
    maxAz: r1(sm.az),
    startDir: compassPoint(s0.az),
    endDir: compassPoint(s1.az),
    visible: visibleStart !== null,
    magnitude: brightest === null ? null : r1(brightest),
    passStart: Math.round(start),
    passEnd: Math.round(end),
    peakAlt: r1(sMax.alt),
  };
}

function computePasses(tle: Tle, lat: number, lon: number, elevM: number, from: number, to: number): IssPass[] {
  const rec = satellite.twoline2satrec(tle.line1, tle.line2);
  const gd = { latitude: lat * DEG, longitude: lon * DEG, height: elevM / 1000 };
  const obs: Observer = { gd, ecf: satellite.geodeticToEcf(gd), lat: lat * DEG, lon: lon * DEG };
  const passes: IssPass[] = [];
  let run: Sample[] | null = null;
  let prev: Sample | null = null;
  for (let t = from; t <= to; t += STEP_MS) {
    const s = sample(rec, obs, t);
    if (!s) {
      prev = null;
      continue;
    }
    if (s.alt > 0) {
      if (!run) run = prev ? [prev] : [];
      run.push(s);
    } else if (run) {
      run.push(s);
      const p = buildPass(rec, obs, run);
      if (p) passes.push(p);
      run = null;
    }
    prev = s;
  }
  if (run) {
    const p = buildPass(rec, obs, run);
    if (p) passes.push(p);
  }
  return passes;
}

const passCache = new TTLCache<IssPass[]>(PASS_TTL, 300);

export async function getIssPasses(q: { lat: number; lon: number; elev?: number }): Promise<IssPass[]> {
  const tle = await getTle();
  const lat = Math.round(q.lat * 100) / 100;
  const lon = Math.round(q.lon * 100) / 100;
  const elev = Math.round((q.elev ?? 0) / 10) * 10;
  const key = `${lat},${lon},${elev},${tle.line1.slice(18, 32)}`;
  let passes = passCache.get(key);
  if (!passes) {
    const now = Date.now();
    passes = computePasses(tle, lat, lon, elev, now - 20 * 60_000, now + DAYS * 24 * HOUR_MS);
    passCache.set(key, passes);
  }
  const now = Date.now();
  return passes.filter((p) => p.end > now);
}
