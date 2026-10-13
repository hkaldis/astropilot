/**
 * An independent apparent-place and horizon computation for fixed J2000 targets (deep-sky objects, stars),
 * written from scratch after Meeus, "Astronomical Algorithms" (2nd ed.) — it shares no code with
 * astronomy-engine, which the app uses:
 *   IAU 1976 precession (ch. 21), IAU 1980 nutation main terms (ch. 22), annual aberration with the e-terms
 *   (ch. 23), Greenwich apparent sidereal time (ch. 12), alt/az (ch. 13), Saemundsson refraction (ch. 16).
 * JPL Horizons has no mode for an arbitrary RA/Dec, so the fixed-target fixtures use this instead. Over
 * 8 sites × 6 epochs × ~300 stars it agrees with astronomy-engine to a few arcseconds above 5° altitude.
 */
const D2R = Math.PI / 180;
const AS = D2R / 3600;
const norm360 = (x: number) => ((x % 360) + 360) % 360;
/** TT − UT1 for 2026–27, seconds (32.184 + 37 leap seconds − (UT1 − UTC ≈ 0)). */
export const DELTA_T = 69.2;

export function apparentPlace(raH: number, decD: number, ms: number) {
  const jdUT = ms / 86_400_000 + 2440587.5;
  const jdTT = jdUT + DELTA_T / 86400;
  const T = (jdTT - 2451545.0) / 36525;
  // Precession, J2000 → mean equator of date.
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * AS;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * AS;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * AS;
  const a0 = raH * 15 * D2R;
  const d0 = decD * D2R;
  const A = Math.cos(d0) * Math.sin(a0 + zeta);
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(theta) * Math.sin(d0);
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(theta) * Math.sin(d0);
  let a = Math.atan2(A, B) + z;
  let d = Math.asin(C);
  // Nutation (main terms, ~0.5″).
  const Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000) * D2R;
  const L = (280.4665 + 36000.7698 * T) * D2R;
  const Lp = (218.3165 + 481267.8813 * T) * D2R;
  const dpsi = -17.2 * Math.sin(Om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lp) + 0.21 * Math.sin(2 * Om); // arcsec
  const deps = 9.2 * Math.cos(Om) + 0.57 * Math.cos(2 * L) + 0.1 * Math.cos(2 * Lp) - 0.09 * Math.cos(2 * Om);
  const eps0 = 23 + 26 / 60 + 21.448 / 3600 - (46.815 * T + 0.00059 * T * T - 0.001813 * T ** 3) / 3600;
  const eps = (eps0 + deps / 3600) * D2R;
  const tanD = Math.tan(d);
  const da1 = (Math.cos(eps) + Math.sin(eps) * Math.sin(a) * tanD) * dpsi - Math.cos(a) * tanD * deps;
  const dd1 = Math.sin(eps) * Math.cos(a) * dpsi + Math.sin(a) * deps;
  // Annual aberration, with the e-terms.
  const k = 20.49552;
  const e = 0.016708634 - 0.000042037 * T;
  const varpi = (102.93735 + 1.71946 * T) * D2R;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
  const Cc = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const sun = (L0 + Cc) * D2R;
  const cosD = Math.cos(d);
  const da2 =
    (-k * (Math.cos(a) * Math.cos(sun) * Math.cos(eps) + Math.sin(a) * Math.sin(sun))) / cosD +
    (e * k * (Math.cos(a) * Math.cos(varpi) * Math.cos(eps) + Math.sin(a) * Math.sin(varpi))) / cosD;
  const dd2 =
    -k * (Math.cos(sun) * Math.cos(eps) * (Math.tan(eps) * cosD - Math.sin(a) * Math.sin(d)) + Math.cos(a) * Math.sin(d) * Math.sin(sun)) +
    e * k * (Math.cos(varpi) * Math.cos(eps) * (Math.tan(eps) * cosD - Math.sin(a) * Math.sin(d)) + Math.cos(a) * Math.sin(d) * Math.sin(varpi));
  a += (da1 + da2) * AS;
  d += (dd1 + dd2) * AS;
  // Greenwich apparent sidereal time.
  const Tu = (jdUT - 2451545.0) / 36525;
  const gmst = norm360(280.46061837 + 360.98564736629 * (jdUT - 2451545.0) + 0.000387933 * Tu * Tu - Tu ** 3 / 38710000);
  const gast = gmst + (dpsi / 3600) * Math.cos(eps);
  return { ra: norm360(a / D2R) / 15, dec: d / D2R, gast, eps };
}

/** Saemundsson: refraction (degrees) for a true (airless) altitude in degrees. */
export function saemundsson(h: number): number {
  if (h < -1) return 0;
  return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60;
}

/** Altitude (refracted unless `refract` is false), azimuth (from north, eastwards) and hour angle (0..360°). */
export function horizontal(raH: number, decD: number, ms: number, lat: number, lon: number, refract = true) {
  const ap = apparentPlace(raH, decD, ms);
  const H = (ap.gast + lon - ap.ra * 15) * D2R;
  const phi = lat * D2R;
  const dd = ap.dec * D2R;
  const sinh = Math.sin(phi) * Math.sin(dd) + Math.cos(phi) * Math.cos(dd) * Math.cos(H);
  const h = Math.asin(Math.max(-1, Math.min(1, sinh))) / D2R;
  const az = norm360(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dd) * Math.cos(phi)) / D2R + 180);
  return { alt: refract ? h + saemundsson(h) : h, geomAlt: h, az, ha: norm360(H / D2R) };
}
