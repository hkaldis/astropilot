/**
 * Comets. The server publishes, for each comet bright enough to matter, a daily ephemeris from JPL
 * Horizons (perturbed orbit, astrometric RA/Dec, distances and total magnitude); `cometAt` interpolates
 * it. When Horizons is unavailable we fall back to two-body motion from JPL SBDB orbital elements
 * (`cometFromElements`): a universal-variable Kepler solver valid for elliptic, parabolic and hyperbolic
 * orbits, with light-time correction.
 *
 * Magnitudes use the standard total-magnitude law m = M1 + 5·log10(Δ) + K1·log10(r). Comet brightness is
 * notoriously hard to predict, so treat it as a guide (often ±1–2 mag).
 */
import { A, DAY_MS } from "./core";

export interface CometElements {
  q: number; // perihelion distance (AU)
  e: number; // eccentricity
  i: number; // inclination (deg, ecliptic J2000)
  node: number; // longitude of the ascending node Ω (deg)
  peri: number; // argument of perihelion ω (deg)
  tp: number; // time of perihelion (JD, TDB)
  M1?: number | null; // total magnitude parameter
  K1?: number | null; // total magnitude slope parameter
}

export interface CometPoint {
  t: number; // ms (UTC)
  ra: number; // astrometric RA, hours (J2000/ICRF)
  dec: number; // degrees
  r: number; // Sun distance (AU)
  delta: number; // Earth distance (AU)
  mag: number | null; // predicted total magnitude
}

export interface CometInfo {
  id: string; // URL-safe key, e.g. "C2023A3" or "12P"
  designation: string; // "C/2023 A3", "12P"
  name: string; // "C/2023 A3 (Tsuchinshan-ATLAS)", "12P/Pons-Brooks"
  q: number;
  e: number;
  perihelion: number; // ms
  source: "horizons" | "elements";
  ephemeris: CometPoint[]; // ascending time, daily
}

const GAUSS_K = 0.01720209895; // AU^1.5 / day
const MU = GAUSS_K * GAUSS_K; // AU^3 / day^2
const C_AU_PER_DAY = 173.1446326846693;
const OBLIQUITY_J2000 = (23.4392911 * Math.PI) / 180;
const RAD = Math.PI / 180;

/** Stumpff functions C(z), S(z) with series near zero. */
function stumpff(z: number): [number, number] {
  if (Math.abs(z) < 1e-6) return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
  if (z > 0) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)];
  }
  const s = Math.sqrt(-z);
  return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)];
}

/** Heliocentric ecliptic-J2000 position (AU) at Julian date `jd` (TDB). */
export function heliocentricEcliptic(el: CometElements, jd: number): [number, number, number] {
  const dt = jd - el.tp; // days from perihelion
  const alpha = (1 - el.e) / el.q; // 1/a (0 for a parabola, negative for a hyperbola)
  const target = Math.sqrt(MU) * dt;
  // Solve e·χ³·S(αχ²) + q·χ = √μ·Δt for the universal anomaly χ (Newton, then bisection as a safety net).
  const f = (x: number) => {
    const [c, s] = stumpff(alpha * x * x);
    return { f: el.e * x * x * x * s + el.q * x - target, r: el.e * x * x * c + el.q };
  };
  // Starting guess: mean anomaly for ellipses (χ = E/√α ≈ √μ·α·Δt); near-parabolic growth otherwise.
  let x = alpha > 1e-8 ? target * alpha : Math.sign(target) * Math.min(Math.abs(target) / el.q, Math.cbrt((6 * Math.abs(target)) / Math.max(el.e, 1e-9)));
  let ok = false;
  for (let k = 0; k < 60; k++) {
    const { f: fx, r } = f(x);
    const step = fx / r;
    x -= step;
    if (!Number.isFinite(x)) break;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(x))) {
      ok = true;
      break;
    }
  }
  if (!ok || !Number.isFinite(x)) {
    // Bisection on a bracket that surely contains the root (f is monotonic in χ since dF/dχ = r > 0).
    let lo = -1;
    let hi = 1;
    while (f(lo).f > 0) lo *= 2;
    while (f(hi).f < 0) hi *= 2;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid).f > 0) hi = mid;
      else lo = mid;
    }
    x = (lo + hi) / 2;
  }
  const z = alpha * x * x;
  const [c, s] = stumpff(z);
  // Lagrange coefficients from the perihelion state (r0 = q along P, v0 = √(μ(1+e)/q) along Q).
  const fl = 1 - (x * x * c) / el.q;
  const gl = dt - (x * x * x * s) / Math.sqrt(MU);
  const v0 = Math.sqrt((MU * (1 + el.e)) / el.q);
  const px = el.q * fl;
  const qy = v0 * gl;

  const w = el.peri * RAD;
  const o = el.node * RAD;
  const inc = el.i * RAD;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const co = Math.cos(o);
  const so = Math.sin(o);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const P = [cw * co - sw * so * ci, cw * so + sw * co * ci, sw * si];
  const Q = [-sw * co - cw * so * ci, -sw * so + cw * co * ci, cw * si];
  return [px * P[0] + qy * Q[0], px * P[1] + qy * Q[1], px * P[2] + qy * Q[2]];
}

const eclToEq = ([x, y, z]: [number, number, number]): [number, number, number] => [
  x,
  y * Math.cos(OBLIQUITY_J2000) - z * Math.sin(OBLIQUITY_J2000),
  y * Math.sin(OBLIQUITY_J2000) + z * Math.cos(OBLIQUITY_J2000),
];

export function cometMagnitude(M1: number | null | undefined, K1: number | null | undefined, r: number, delta: number): number | null {
  if (M1 === null || M1 === undefined || !Number.isFinite(M1)) return null;
  const k = K1 === null || K1 === undefined || !Number.isFinite(K1) ? 10 : K1;
  return M1 + 5 * Math.log10(delta) + k * Math.log10(r);
}

/** Geocentric astrometric position (light-time corrected) from orbital elements, two-body. */
export function cometFromElements(el: CometElements, ms: number): CometPoint {
  const time = A.MakeTime(new Date(ms));
  const jd = time.tt + 2451545.0;
  const earth = A.HelioVector(A.Body.Earth, time); // EQJ, AU
  let tau = 0;
  let geo: [number, number, number] = [0, 0, 0];
  let helio: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    helio = eclToEq(heliocentricEcliptic(el, jd - tau));
    geo = [helio[0] - earth.x, helio[1] - earth.y, helio[2] - earth.z];
    tau = Math.hypot(...geo) / C_AU_PER_DAY;
  }
  const delta = Math.hypot(...geo);
  const r = Math.hypot(...helio);
  let ra = Math.atan2(geo[1], geo[0]) / RAD / 15;
  if (ra < 0) ra += 24;
  const dec = Math.asin(geo[2] / delta) / RAD;
  return { t: ms, ra, dec, r, delta, mag: cometMagnitude(el.M1, el.K1, r, delta) };
}

/** Interpolated position at `ms` from a daily ephemeris (null outside its span). */
export function cometAt(ephemeris: CometPoint[], ms: number): CometPoint | null {
  const n = ephemeris.length;
  if (!n || ms < ephemeris[0].t - DAY_MS / 2 || ms > ephemeris[n - 1].t + DAY_MS / 2) return null;
  let i = 0;
  while (i < n - 2 && ephemeris[i + 1].t <= ms) i++;
  const a = ephemeris[i];
  const b = ephemeris[Math.min(i + 1, n - 1)];
  if (a === b || b.t === a.t) return { ...a, t: ms };
  const u = (ms - a.t) / (b.t - a.t);
  // RA wraps at 24 h.
  let dra = b.ra - a.ra;
  if (dra > 12) dra -= 24;
  if (dra < -12) dra += 24;
  let ra = a.ra + u * dra;
  if (ra < 0) ra += 24;
  if (ra >= 24) ra -= 24;
  const lerp = (p: number, q: number) => p + u * (q - p);
  return {
    t: ms,
    ra,
    dec: lerp(a.dec, b.dec),
    r: lerp(a.r, b.r),
    delta: lerp(a.delta, b.delta),
    mag: a.mag !== null && b.mag !== null ? lerp(a.mag, b.mag) : (a.mag ?? b.mag),
  };
}

/** "C/2023 A3" → "C2023A3", "12P" → "12P" (safe in URLs). */
export const cometKey = (designation: string) => designation.replace(/[^A-Za-z0-9-]/g, "");
