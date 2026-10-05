/**
 * Core coordinate machinery. Everything is computed with astronomy-engine
 * (VSOP87 / ELP + IAU 2006 precession, nutation, aberration, refraction),
 * anchored to the observer's position — never to the server's or browser's clock zone.
 */
import * as A from "astronomy-engine";

export const DEG = Math.PI / 180;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export interface Site {
  lat: number;
  lon: number;
  elevation?: number | null;
  /** IANA time zone. Only used to label nights with the local calendar date near the date line. */
  timezone?: string | null;
}

export type Vec3 = [number, number, number];

export function observerOf(site: Site): A.Observer {
  return new A.Observer(site.lat, site.lon, site.elevation ?? 0);
}

/** Unit vector in the J2000 mean equator frame for RA (hours) / Dec (degrees). */
export function eqjVector(raHours: number, decDeg: number): Vec3 {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

/**
 * A rotation from J2000 equatorial to the local horizon at one instant.
 * Precession, nutation and Earth rotation are all inside the matrix,
 * so rotating thousands of catalog vectors per frame is cheap and exact.
 */
export interface HorizonFrame {
  t: number; // epoch ms
  m: number[][];
}

export function horizonFrame(date: Date | number, site: Site | A.Observer): HorizonFrame {
  const obs = site instanceof A.Observer ? site : observerOf(site);
  const d = typeof date === "number" ? new Date(date) : date;
  const rot = A.Rotation_EQJ_HOR(d, obs);
  return { t: d.getTime(), m: rot.rot };
}

/** Standard atmospheric refraction (degrees) to add to a geometric altitude. */
export function refraction(altDeg: number): number {
  if (altDeg < -1.5) return 0;
  return A.Refraction("normal", altDeg);
}

export interface AltAz {
  alt: number; // apparent altitude, degrees
  az: number; // azimuth, degrees east of north
}

/** Horizontal coordinates of a J2000 unit vector in a precomputed frame. */
export function altAzOf(frame: HorizonFrame, v: Vec3, refract = true): AltAz {
  const r = frame.m;
  // Same convention as astronomy-engine RotateVector.
  const x = r[0][0] * v[0] + r[1][0] * v[1] + r[2][0] * v[2];
  const y = r[0][1] * v[0] + r[1][1] * v[1] + r[2][1] * v[2];
  const z = r[0][2] * v[0] + r[1][2] * v[1] + r[2][2] * v[2];
  // HOR frame: x → north, y → west, z → zenith.
  let alt = Math.atan2(z, Math.hypot(x, y)) / DEG;
  let az = Math.atan2(-y, x) / DEG;
  if (az < 0) az += 360;
  if (refract) alt += refraction(alt);
  return { alt, az };
}

/** One-off alt/az for J2000 RA/Dec. Prefer frames when evaluating many objects. */
export function altAzRaDec(raHours: number, decDeg: number, date: Date | number, site: Site): AltAz {
  return altAzOf(horizonFrame(date, site), eqjVector(raHours, decDeg));
}

/** Angular distance in degrees between two J2000 positions. */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const a = eqjVector(ra1, dec1);
  const b = eqjVector(ra2, dec2);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / DEG;
}

/** Angular distance between two horizontal positions (degrees). */
export function separationAltAz(a: AltAz, b: AltAz): number {
  const s =
    Math.sin(a.alt * DEG) * Math.sin(b.alt * DEG) +
    Math.cos(a.alt * DEG) * Math.cos(b.alt * DEG) * Math.cos((a.az - b.az) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, s))) / DEG;
}

/** Relative airmass, Kasten & Young (1989). Valid down to the horizon. */
export function airmass(altDeg: number): number {
  if (altDeg <= -1) return Infinity;
  const h = Math.max(altDeg, 0);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

/** Current J2000 RA/Dec (hours, degrees) of a solar-system body as seen from the site. */
export function bodyJ2000(body: A.Body, date: Date | number, site: Site): { ra: number; dec: number; dist: number } {
  const eq = A.Equator(body, new Date(date), observerOf(site), false, true);
  return { ra: eq.ra, dec: eq.dec, dist: eq.dist };
}

/** Topocentric apparent horizontal position of a solar-system body. */
export function bodyAltAz(body: A.Body, date: Date | number, site: Site | A.Observer): AltAz & { ra: number; dec: number; dist: number } {
  const obs = site instanceof A.Observer ? site : observerOf(site);
  const d = new Date(date);
  const eq = A.Equator(body, d, obs, true, true);
  const hor = A.Horizon(d, obs, eq.ra, eq.dec, "normal");
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra, dec: eq.dec, dist: eq.dist };
}

/**
 * The Sun's geometric (airless) altitude, degrees — what twilight is defined on (civil −6°, nautical −12°,
 * astronomical −18°; sunrise and sunset at −0.833°, the upper limb on the refracted horizon). Refraction
 * would lift it by ~0.6° near and below the horizon, and every twilight boundary would come minutes late.
 */
export function sunGeometricAltitude(date: Date | number, site: Site | A.Observer): number {
  const obs = site instanceof A.Observer ? site : observerOf(site);
  const d = new Date(date);
  const eq = A.Equator(A.Body.Sun, d, obs, true, true);
  return A.Horizon(d, obs, eq.ra, eq.dec).altitude;
}

/** IAU constellation abbreviation for a J2000 position. */
export function constellationOf(raHours: number, decDeg: number): string {
  return A.Constellation(raHours, decDeg).symbol;
}

export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

export function compassPoint(azDeg: number): string {
  return COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16];
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export { A };
