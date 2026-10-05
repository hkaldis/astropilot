/**
 * Observing-conditions model. Turns numerical-weather-prediction fields into what an observer
 * cares about — effective cloud, seeing, transparency, dew risk — and into 0–100 scores for
 * general observing, faint deep-sky and planets, per hour and per night.
 *
 * Pure and deterministic (no I/O), shared by server and client. Every weight and threshold is
 * exported so the UI can explain a score. The model is deliberately simple and physically
 * motivated rather than fitted:
 *
 *  • Cloud dominates. Low and mid cloud are opaque; high cloud (cirrus) is usually optically
 *    thin, so it counts at half weight as cover and is charged again as lost transparency.
 *    Every score is multiplied by an S-curve of effective cloud, so an overcast hour scores ~0
 *    whatever else is true.
 *  • Seeing (FWHM at 500 nm, zenith) has a boundary-layer term (surface wind and gusts) and a
 *    free-atmosphere term (jet-stream speed plus wind shear, as a bulk Richardson number).
 *    Turbulent layers add like ε^(5/3), because ε ∝ 1/r₀ ∝ (∫Cn² dh)^(3/5).
 *  • Transparency is an estimated V-band extinction coefficient k (mag/airmass): Rayleigh
 *    (scaled with site elevation) + ozone + aerosol (CAMS AOD, else a humidity-grown
 *    background) + cirrus + near-surface haze (humidity, visibility).
 *  • Deep-sky quality falls with sky brightness relative to the site's moonless sky:
 *    moonlight from Krisciunas & Schaefer (1991), twilight glow from the Sun's depression,
 *    plus a mild cap for light-polluted sites.
 */
import { DEG, clamp } from "./core";
import { EXTINCTION_V, moonSkyNL, skyBrightnessAt, sqmForBortle } from "./visibility";
import type { Confidence, DewRisk, FogRisk, Verdict } from "../forecast";

const num =(x: number | null | undefined, fallback: number) => (x === null || x === undefined || !Number.isFinite(x) ? fallback : x);

/** Piecewise-linear interpolation through knots sorted by x (clamped at both ends). */
export function interpKnots(x: number, knots: readonly (readonly [number, number])[]): number {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i];
    if (x <= x1) {
      const [x0, y0] = knots[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1][1];
}

/** Names for the 1..5 seeing and transparency scales (index = scale). */
export const SCALE_LABELS = ["", "bad", "poor", "average", "good", "excellent"] as const;
export function scaleLabel(scale: number): string {
  return SCALE_LABELS[clamp(Math.round(scale), 1, 5)];
}

/** Upper bounds of seeing classes 5, 4, 3, 2 (arcsec FWHM); worse than the last is class 1. */
export const SEEING_CLASS_BOUNDS = [1.0, 1.5, 2.2, 3.2] as const;
/** Upper bounds of transparency classes 5, 4, 3, 2 (V extinction, mag/airmass); worse is class 1. */
export const TRANSPARENCY_CLASS_BOUNDS = [0.2, 0.28, 0.4, 0.6] as const;

/** Plain-language explanations of the model, for tooltips and "why this score?" panels. */
export const CONDITIONS_EXPLAINED = {
  cloud:
    "Low and mid-level cloud block the sky; thin high cloud counts half as cover and also dims faint objects. A few scattered clouds cost little — more than half cover is mostly fatal.",
  seeing:
    "Seeing is how steady the air is. It is estimated from the jet stream (~10 km up), wind shear aloft and gusty surface wind: under 1″ is excellent, over 3″ blurs planets and splits.",
  transparency:
    "Transparency is how clear the air is: aerosols (CAMS dust and smoke), humidity, haze and thin high cloud all dim faint stars and nebulae.",
  moon: "Moonlight brightens the whole sky (Krisciunas–Schaefer model): it hurts faint galaxies and nebulae, not planets, the Moon itself or double stars. The darker your site, the more it costs.",
  twilight: "Deep-sky needs astronomical darkness (Sun 18° below the horizon); planets are fine once the Sun is 8° down.",
  dew: "Dew forms when optics cool below the dew point — likeliest on clear, calm, humid nights.",
  fog: "Fog and low cloud can form on calm, humid nights even when the models show a clear sky — likeliest once the air is within 1–2 °C of its dew point.",
  confidence:
    "The main forecast is compared with three independent global models (ECMWF, GFS and ICON). When they disagree about the cloud, the forecast is less certain — check again closer to the time.",
  scores:
    "Each score multiplies cloud, rain chance, wind shake and darkness by a quality term from transparency and seeing. Deep-sky also counts the Moon and light pollution; planets mostly care about seeing.",
} as const;

// =====================================================================================
// Cloud
// =====================================================================================

/** Fraction of high (cirrus) cloud treated as opaque cover for general and deep-sky observing. */
export const HIGH_CLOUD_OPACITY = 0.5;
/** Planets, the Moon and double stars shine through thin cirrus far better than faint fuzzies. */
export const HIGH_CLOUD_OPACITY_PLANETS = 0.25;
/** Effective cloud below this (%) counts as "clear" (clear dark hours, best windows). */
export const CLEAR_CLOUD_MAX = 30;
/** Shape of the cloud S-curve (see cloudFactor). */
export const CLOUD_CURVE_EXPONENT = 0.85;

/**
 * Effective cloud cover (%) for observing: layers overlap at random, low and mid cloud are
 * opaque, high cloud counts at `highOpacity`. Never exceeds the model's own total cover
 * (models often assume more overlap between layers than random).
 */
export function effectiveCloud(low: number, mid: number, high: number, total?: number | null, highOpacity = HIGH_CLOUD_OPACITY): number {
  const f = (x: number) => clamp(num(x, 0) / 100, 0, 1);
  const eff = 1 - (1 - f(low)) * (1 - f(mid)) * (1 - highOpacity * f(high));
  const capped = total === null || total === undefined || !Number.isFinite(total) ? eff : Math.min(eff, f(total));
  return capped * 100;
}

/**
 * 0..1 multiplier from effective cloud (%). A smooth S-curve: a few scattered clouds cost
 * little, more than half cover is mostly fatal — 10 % → 0.95, 20 % → 0.85, 30 % → 0.71,
 * 50 % → 0.41, 70 % → 0.16, 90 % → 0.02, 100 % → 0.
 */
export function cloudFactor(effCloudPct: number): number {
  const c = clamp(num(effCloudPct, 100) / 100, 0, 1);
  return 0.5 * (1 + Math.cos(Math.PI * Math.pow(c, CLOUD_CURVE_EXPONENT)));
}

/** Precipitation probability (%) penalty: none below `from`, up to `maxPenalty` at `to`. */
export const PRECIP_PENALTY = { from: 15, to: 75, maxPenalty: 0.5 } as const;
export function precipFactor(precipProb: number): number {
  const p = PRECIP_PENALTY;
  return 1 - p.maxPenalty * clamp((num(precipProb, 0) - p.from) / (p.to - p.from), 0, 1);
}

// =====================================================================================
// Wind shake (telescope usability, separate from its effect on seeing)
// =====================================================================================

export const WIND_SHAKE = {
  general: { gustFrom: 30, gustSpan: 40, gustPenalty: 0.3, windFrom: 20, windSpan: 25, windPenalty: 0.15 },
  planets: { gustFrom: 25, gustSpan: 40, gustPenalty: 0.45, windFrom: 15, windSpan: 25, windPenalty: 0.2 },
} as const;

/** 0..1 multiplier for wind shake (km/h at 10 m). High magnification suffers first. */
export function windFactor(wind: number, gust: number, kind: keyof typeof WIND_SHAKE = "general"): number {
  const w = WIND_SHAKE[kind];
  const g = Math.max(num(gust, 0), num(wind, 0));
  return 1 - w.gustPenalty * clamp((g - w.gustFrom) / w.gustSpan, 0, 1) - w.windPenalty * clamp((num(wind, 0) - w.windFrom) / w.windSpan, 0, 1);
}

// =====================================================================================
// Seeing
// =====================================================================================

/**
 * Seeing heuristic (all speeds km/h, results arcsec FWHM at the zenith):
 *   ground = groundBase + windSlope·max(0, wind − windFree) + gustSlope·max(0, gust − gustFree)
 *            + lowerShear·T(Ri 850–500 hPa)
 *   free   = freeBase + jetAtRef·(clamp((jet − jetFree)/(jetRef − jetFree), 0, 2))^jetExponent
 *            + upperShear·T(Ri 500–250 hPa)          (blended with 7Timer when available)
 *   seeing = (ground^(5/3) + free^(5/3))^(3/5)
 * where T(Ri) = 1/(1 + (Ri/riHalf)²) is the shear-turbulence potential of a layer (Ri ≤ 0 → 1).
 * Jet < ~50 km/h adds almost nothing; ~150 km/h adds ~1.2″; ≥ 200 km/h makes seeing poor
 * whatever happens near the ground. Telescope cooling and dome/local seeing are not modelled.
 */
export const SEEING_MODEL = {
  groundBase: 0.7,
  windFree: 8,
  windSlope: 0.04,
  gustFree: 18,
  gustSlope: 0.025,
  lowerShear: 0.5,
  freeBase: 0.4,
  jetFree: 40,
  jetRef: 200,
  jetAtRef: 2.0,
  jetExponent: 1.3,
  /** Assumed jet speed when upper-air data are missing (a typical mid-latitude value). */
  jetDefault: 80,
  upperShear: 0.6,
  riHalf: 2,
  /** Weight of 7Timer's seeing class in the free-atmosphere term when it is available. */
  sevenTimerWeight: 0.35,
} as const;

/** Arcsec → continuous 1..5 scale. Integer classes: 5 ≤ 1.0″ < 4 ≤ 1.5″ < 3 ≤ 2.2″ < 2 ≤ 3.2″ < 1. */
export const SEEING_SCALE_KNOTS = [
  [0.7, 5],
  [1.0, 4.5],
  [1.5, 3.5],
  [2.2, 2.5],
  [3.2, 1.5],
  [4.5, 1],
] as const;

/** 7Timer ASTRO seeing classes 1..8 → representative arcsec (bins <0.5, 0.5–0.75, … >2.5″). */
export const SEVEN_TIMER_SEEING_ARCSEC = [NaN, 0.4, 0.625, 0.875, 1.125, 1.375, 1.75, 2.25, 2.75] as const;

export interface PressureLevel {
  hPa: number;
  height: number | null; // geopotential height, m
  temp: number | null; // °C
  speed: number | null; // km/h
  dir: number | null; // degrees, direction the wind blows from
}

/**
 * Bulk Richardson number of the layer between two pressure levels: Ri = N² / S², with
 * N² = (g/θ̄)·Δθ/Δz (static stability) and S = |ΔV|/Δz (vector wind shear). Ri < 0.25 is
 * dynamically unstable; over thick model layers values below ~2 already mean strong
 * shear that breaks into turbulent sheets.
 */
export function bulkRichardson(lower: PressureLevel, upper: PressureLevel): number | null {
  const vals = [lower.height, lower.temp, lower.speed, lower.dir, upper.height, upper.temp, upper.speed, upper.dir];
  if (vals.some((v) => v === null || v === undefined || !Number.isFinite(v))) return null;
  const dz = (upper.height as number) - (lower.height as number);
  if (dz < 200) return null;
  const theta = (tC: number, p: number) => (tC + 273.15) * Math.pow(1000 / p, 0.2857);
  const th1 = theta(lower.temp as number, lower.hPa);
  const th2 = theta(upper.temp as number, upper.hPa);
  const n2 = (9.81 / ((th1 + th2) / 2)) * ((th2 - th1) / dz);
  const uv = (kmh: number, dir: number) => {
    const v = kmh / 3.6;
    return [-v * Math.sin(dir * DEG), -v * Math.cos(dir * DEG)];
  };
  const [u1, v1] = uv(lower.speed as number, lower.dir as number);
  const [u2, v2] = uv(upper.speed as number, upper.dir as number);
  const s2 = ((u2 - u1) ** 2 + (v2 - v1) ** 2) / (dz * dz);
  if (s2 < 1e-10) return n2 <= 0 ? 0 : 1000;
  return n2 / s2;
}

/** 0..1 turbulence potential of a layer from its bulk Richardson number. */
export function shearTurbulence(ri: number | null | undefined): number {
  if (ri === null || ri === undefined || !Number.isFinite(ri)) return 0;
  if (ri <= 0) return 1;
  return 1 / (1 + (ri / SEEING_MODEL.riHalf) ** 2);
}

export interface SeeingInput {
  jet: number | null; // km/h near the jet level (250 hPa, or the 200–300 hPa maximum)
  wind: number; // km/h at 10 m
  gust: number; // km/h at 10 m
  riUpper?: number | null; // bulk Richardson number 500–250 hPa
  riLower?: number | null; // bulk Richardson number 850–500 hPa (omit for high sites)
  sevenTimer?: number | null; // 7Timer ASTRO seeing class 1..8
}

export interface SeeingEstimate {
  arcsec: number; // estimated FWHM
  value: number; // continuous 1..5
  scale: number; // integer 1..5 (5 = excellent)
  groundArcsec: number;
  freeArcsec: number;
}

export function estimateSeeing(i: SeeingInput): SeeingEstimate {
  const M = SEEING_MODEL;
  const wind = Math.max(0, num(i.wind, 10));
  const gust = Math.max(wind, num(i.gust, wind * 1.6));
  const ground =
    M.groundBase + M.windSlope * Math.max(0, wind - M.windFree) + M.gustSlope * Math.max(0, gust - M.gustFree) + M.lowerShear * shearTurbulence(i.riLower);
  const jet = Math.max(0, num(i.jet, M.jetDefault));
  const s = clamp((jet - M.jetFree) / (M.jetRef - M.jetFree), 0, 2);
  let free = M.freeBase + M.jetAtRef * Math.pow(s, M.jetExponent) + M.upperShear * shearTurbulence(i.riUpper);
  const cls = i.sevenTimer;
  if (cls !== null && cls !== undefined && Number.isInteger(cls) && cls >= 1 && cls <= 8) {
    free = (1 - M.sevenTimerWeight) * free + M.sevenTimerWeight * SEVEN_TIMER_SEEING_ARCSEC[cls];
  }
  const arcsec = Math.pow(Math.pow(ground, 5 / 3) + Math.pow(free, 5 / 3), 3 / 5);
  const value = interpKnots(arcsec, SEEING_SCALE_KNOTS);
  return { arcsec, value, scale: clamp(Math.round(value), 1, 5), groundArcsec: ground, freeArcsec: free };
}

// =====================================================================================
// Transparency
// =====================================================================================

/**
 * Transparency as V-band extinction k (mag/airmass):
 *   k = rayleigh·e^(−elevation/scaleHeight) + ozone + aodToMag·AOD₅₅₀ + haze(RH) + cirrus·high + haze(visibility)
 * AOD comes from CAMS when available, otherwise backgroundAod grown with humidity as
 * ((1 − 0.5)/(1 − RH))^γ (Hänel). Humidity above hazeFromRh adds near-surface mist the column
 * AOD misses; model visibility below 20 km adds haze, and below 1 km in near-saturated air, fog.
 */
export const TRANSPARENCY_MODEL = {
  rayleigh: 0.106,
  scaleHeight: 8000,
  ozone: 0.016,
  aodToMag: 1.086,
  backgroundAod: 0.12,
  hygroscopicGamma: 0.3,
  hazeFromRh: 80,
  hazeAtSaturation: 0.15,
  cirrus: 0.6,
  hazeVisibility: 20_000,
  hazeVisibilityMag: 0.3,
  fogMag: 1.0,
  /** Visibility only counts at or above this humidity (%) unless CAMS AOD is missing. */
  fogMinRh: 93,
  /**
   * Weight of 7Timer's transparency (as extinction) — only when CAMS AOD is missing. 7Timer is a
   * humidity-based GFS index that sits at class 2 (0.3–0.4 mag/airmass) on most clear nights even
   * where CAMS measures a clean sky (k ≈ 0.2), so it would drag a physical estimate down by a class.
   */
  sevenTimerWeight: 0.25,
} as const;

/** k (mag/airmass) → continuous 1..5. Integer classes: 5 ≤ 0.20 < 4 ≤ 0.28 < 3 ≤ 0.40 < 2 ≤ 0.60 < 1. */
export const TRANSPARENCY_SCALE_KNOTS = [
  [0.15, 5],
  [0.2, 4.5],
  [0.28, 3.5],
  [0.4, 2.5],
  [0.6, 1.5],
  [0.85, 1],
] as const;

/**
 * 7Timer ASTRO transparency classes 1..8 → representative V extinction (mag/airmass), from the
 * documented bins 1: <0.3, 2: 0.3–0.4, 3: 0.4–0.5, 4: 0.5–0.6, 5: 0.6–0.7, 6: 0.7–0.85,
 * 7: 0.85–1, 8: >1 (www.7timer.info/doc.php). They go through the same k → 1..5 scale as ours.
 */
export const SEVEN_TIMER_TRANSPARENCY_K = [NaN, 0.24, 0.35, 0.45, 0.55, 0.65, 0.775, 0.925, 1.1] as const;

export interface TransparencyInput {
  humidity: number; // % at 2 m
  cloudHigh: number; // %
  aod: number | null; // aerosol optical depth at 550 nm
  visibility: number | null; // m
  elevation?: number | null; // site elevation, m
  sevenTimer?: number | null; // 7Timer ASTRO transparency class 1..8 (only used when aod is missing)
}

export interface TransparencyEstimate {
  extinction: number; // mag/airmass (V)
  value: number; // continuous 1..5
  scale: number; // integer 1..5 (5 = excellent)
  aodUsed: number;
}

export function estimateTransparency(i: TransparencyInput): TransparencyEstimate {
  const T = TRANSPARENCY_MODEL;
  const rh = clamp(num(i.humidity, 60), 0, 100);
  const elevation = Math.max(0, num(i.elevation, 0));
  const hasAod = i.aod !== null && i.aod !== undefined && Number.isFinite(i.aod) && i.aod >= 0;
  const aod = hasAod ? (i.aod as number) : T.backgroundAod * Math.pow(0.5 / (1 - Math.min(rh, 95) / 100), T.hygroscopicGamma);
  const rayleigh = T.rayleigh * Math.exp(-elevation / T.scaleHeight);
  const mist = T.hazeAtSaturation * Math.pow(clamp((rh - T.hazeFromRh) / (100 - T.hazeFromRh), 0, 1), 1.5);
  const cirrus = T.cirrus * clamp(num(i.cloudHigh, 0) / 100, 0, 1);
  // Model visibility is noisy (e.g. phantom "fog" at mountain grid points in dry air), so it only
  // counts when the air is near saturation — real fog and mist — or as the sole haze indicator
  // when CAMS AOD is missing.
  let haze = 0;
  const saturated = rh >= T.fogMinRh;
  if (i.visibility !== null && i.visibility !== undefined && Number.isFinite(i.visibility) && (saturated || !hasAod)) {
    const v = Math.max(i.visibility, 1);
    haze =
      v < 1000 && saturated
        ? T.hazeVisibilityMag + (T.fogMag - T.hazeVisibilityMag) * (1 - v / 1000)
        : T.hazeVisibilityMag * clamp(Math.log10(T.hazeVisibility / v) / Math.log10(T.hazeVisibility / 1000), 0, 1);
  }
  let extinction = rayleigh + T.ozone + T.aodToMag * aod + mist + cirrus + haze;
  const cls = i.sevenTimer;
  if (!hasAod && cls !== null && cls !== undefined && Number.isInteger(cls) && cls >= 1 && cls <= 8) {
    extinction = (1 - T.sevenTimerWeight) * extinction + T.sevenTimerWeight * SEVEN_TIMER_TRANSPARENCY_K[cls];
  }
  const value = interpKnots(extinction, TRANSPARENCY_SCALE_KNOTS);
  return { extinction, value, scale: clamp(Math.round(value), 1, 5), aodUsed: aod };
}

// =====================================================================================
// Dew
// =====================================================================================

/**
 * Dew forms on optics that radiate below the dew point. Risk from the dew-point spread
 * (T − Td): ≤ high → "high", ≤ moderate → "moderate". Calm air (< calmWind) lets optics cool
 * ~1 °C further below ambient, a breeze (> breezyWind) keeps them near ambient, and an
 * overcast sky (> overcast %) stops radiative cooling: each shifts the spread by 1 °C.
 */
export const DEW_MODEL = { high: 2, moderate: 4.5, calmWind: 5, breezyWind: 18, overcast: 70, shift: 1 } as const;

export function dewRisk(temp: number, dewPoint: number, wind: number, cloud?: number | null): DewRisk {
  const D = DEW_MODEL;
  let spread = num(temp, 10) - num(dewPoint, 0);
  const w = num(wind, 10);
  if (w < D.calmWind) spread -= D.shift;
  else if (w > D.breezyWind) spread += D.shift;
  if (cloud !== null && cloud !== undefined && Number.isFinite(cloud) && cloud > D.overcast) spread += D.shift;
  if (spread <= D.high) return "high";
  if (spread <= D.moderate) return "moderate";
  return "low";
}

// =====================================================================================
// Fog and low cloud
// =====================================================================================

/**
 * Radiation fog and low stratus form on clear, calm, humid nights — exactly the nights observers
 * want — and model cloud fields often miss them (shallow fog lives below the model's resolution).
 * Risk from the 2 m dew-point spread (T − Td) and 10 m wind, or the model's own visibility:
 *   high:     visibility < 1 km with spread ≤ 2 °C, or spread ≤ 1 °C with wind ≤ 10 km/h
 *   moderate: visibility < 5 km with spread ≤ 3 °C, or spread ≤ 2.5 °C with wind ≤ 15 km/h
 * Wind keeps the air mixed (and fog off the ground), so a breezy saturated night counts as mist
 * at most.
 */
export const FOG_MODEL = {
  highSpread: 1,
  moderateSpread: 2.5,
  calmWind: 10,
  lightWind: 15,
  fogVisibility: 1000,
  fogVisibilitySpread: 2,
  mistVisibility: 5000,
  mistVisibilitySpread: 3,
} as const;

export function fogRisk(temp: number, dewPoint: number, wind: number, visibility?: number | null): FogRisk {
  const F = FOG_MODEL;
  const spread = Math.max(0, num(temp, 10) - num(dewPoint, 0));
  const w = Math.max(0, num(wind, 10));
  const vis = visibility === null || visibility === undefined || !Number.isFinite(visibility) ? Infinity : visibility;
  if ((vis < F.fogVisibility && spread <= F.fogVisibilitySpread) || (spread <= F.highSpread && w <= F.calmWind)) return "high";
  if ((vis < F.mistVisibility && spread <= F.mistVisibilitySpread) || (spread <= F.moderateSpread && w <= F.lightWind)) return "moderate";
  return "low";
}

// =====================================================================================
// Hour slots from hourly model output
// =====================================================================================

/**
 * Open-Meteo's hourly values are either instantaneous at the hour mark (cloud, temperature,
 * humidity, wind, visibility, upper air) or aggregates over the *preceding* hour (gusts,
 * precipitation probability). An hour slot [t, t + 1 h] is described by the mean of the instants
 * at t and t + 1 h (the value at mid-slot) and by the aggregate stamped t + 1 h.
 */
export function slotInstant(atStart: number | null | undefined, atEnd: number | null | undefined): number | null {
  const a = atStart === null || atStart === undefined || !Number.isFinite(atStart) ? null : atStart;
  const b = atEnd === null || atEnd === undefined || !Number.isFinite(atEnd) ? null : atEnd;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

export function slotPreceding(atStart: number | null | undefined, atEnd: number | null | undefined): number | null {
  if (atEnd !== null && atEnd !== undefined && Number.isFinite(atEnd)) return atEnd;
  return atStart !== null && atStart !== undefined && Number.isFinite(atStart) ? atStart : null;
}

/** Mid-slot wind as the mean of the two wind vectors (directions in degrees, "blowing from"). */
export function slotWind(
  a: { speed: number | null; dir: number | null },
  b: { speed: number | null; dir: number | null },
): { speed: number | null; dir: number | null } {
  const ok = (w: { speed: number | null; dir: number | null }) => w.speed !== null && w.dir !== null && Number.isFinite(w.speed) && Number.isFinite(w.dir);
  if (!ok(a)) return ok(b) ? b : { speed: a.speed ?? b.speed, dir: a.dir ?? b.dir };
  if (!ok(b)) return a;
  const vec = (w: { speed: number | null; dir: number | null }) => [(w.speed as number) * Math.sin((w.dir as number) * DEG), (w.speed as number) * Math.cos((w.dir as number) * DEG)];
  const [ua, va] = vec(a);
  const [ub, vb] = vec(b);
  const u = (ua + ub) / 2;
  const v = (va + vb) / 2;
  const speed = Math.hypot(u, v);
  return { speed, dir: speed < 1e-9 ? (a.dir as number) : ((Math.atan2(u, v) / DEG) % 360 + 360) % 360 };
}

// =====================================================================================
// Forecast confidence from model agreement
// =====================================================================================

/**
 * Deterministic models that disagree about cloud are the clearest warning that a forecast may
 * not hold. Per hour, each model's effective cloud is turned into how usable the hour is,
 *   u = clamp((cloudFactor(eff) − usableFloor) / (1 − usableFloor), 0, 1),
 * so that 70 % and 95 % cloud — both not worth setting up for — count as agreement. Each
 * independent model's disagreement with the main forecast is the window-weighted mean of
 * |u_model − u_main| hour by hour, so it catches timing as well as amount:
 *   every model ≤ agree → "high";
 *   at least two models (or the only one) > dissent → "low" (one outlier among several is "medium");
 *   otherwise "medium".
 * More than longLeadHours ahead the answer is never "high" (cloud skill fades after ~4 days).
 * A model is "cloudier"/"clearer" than the main forecast when its mean u differs by more than
 * `bias`.
 */
export const CONFIDENCE_MODEL = { usableFloor: 0.2, agree: 0.15, dissent: 0.35, longLeadHours: 96, bias: 0.15, minCoverage: 0.5 } as const;

/** 0..1: how usable an hour with this effective cloud (%) is, for model comparison. */
export function usableSky(effCloudPct: number): number {
  const floor = CONFIDENCE_MODEL.usableFloor;
  return clamp((cloudFactor(effCloudPct) - floor) / (1 - floor), 0, 1);
}

export interface AgreementHour {
  weight: number; // fraction of the hour inside the window (0..1)
  effCloud: (number | null | undefined)[]; // effective cloud % per model; index 0 = the main forecast
}

export interface Agreement {
  confidence: Confidence;
  spread: number; // 0..1, window mean of the per-hour range of usableSky across all models
  disagreement: (number | null)[]; // per model: window mean of |u − u_main| (index 0 = main = 0); null if missing
  bias: (number | null)[]; // per model: mean usableSky − the main forecast's (positive = clearer); null if missing
  cappedByLead: boolean; // would have been "high" but the night is too far ahead
  models: number; // models with data (incl. the main forecast)
}

export function cloudAgreement(hours: AgreementHour[], leadHours = 0): Agreement | null {
  const C = CONFIDENCE_MODEL;
  const nModels = Math.max(0, ...hours.map((h) => h.effCloud.length));
  const valid = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x);
  let wSum = 0;
  let wAll = 0;
  let spreadSum = 0;
  const uSum = new Array<number>(nModels).fill(0);
  const dSum = new Array<number>(nModels).fill(0);
  const uW = new Array<number>(nModels).fill(0);
  for (const h of hours) {
    if (!(h.weight > 0)) continue;
    wAll += h.weight;
    const u = h.effCloud.map((e) => (valid(e) ? usableSky(e) : null));
    const present = u.filter((x): x is number => x !== null);
    if (u[0] === null || present.length < 2) continue;
    wSum += h.weight;
    spreadSum += h.weight * (Math.max(...present) - Math.min(...present));
    u.forEach((x, i) => {
      if (x !== null) {
        uSum[i] += h.weight * x;
        dSum[i] += h.weight * Math.abs(x - (u[0] as number));
        uW[i] += h.weight;
      }
    });
  }
  if (wAll <= 0 || wSum < C.minCoverage * wAll) return null;
  const mean = uSum.map((s, i) => (uW[i] > 0 ? s / uW[i] : null));
  const disagreement = dSum.map((s, i) => (uW[i] > 0 ? s / uW[i] : null));
  const bias = mean.map((m) => (m === null || mean[0] === null ? null : m - (mean[0] as number)));
  const others = disagreement.slice(1).filter((d): d is number => d !== null);
  const dissenters = others.filter((d) => d > C.dissent).length;
  let confidence: Confidence = others.every((d) => d <= C.agree) ? "high" : dissenters >= Math.min(2, others.length) ? "low" : "medium";
  const cappedByLead = confidence === "high" && leadHours > C.longLeadHours;
  if (cappedByLead) confidence = "medium";
  return { confidence, spread: spreadSum / wSum, disagreement, bias, cappedByLead, models: mean.filter((m) => m !== null).length };
}

// =====================================================================================
// Darkness, twilight and moonlight
// =====================================================================================

/** General observing: usable fraction of the sky's potential by Sun altitude (deg). */
export const TWILIGHT_GENERAL_KNOTS = [
  [-18, 1],
  [-12, 0.9],
  [-6, 0.5],
  [-0.83, 0.1],
  [0, 0],
] as const;

/** Planets, the Moon and doubles are fine in nautical twilight; poor right after sunset. */
export const TWILIGHT_PLANET_KNOTS = [
  [-8, 1],
  [-0.83, 0.3],
  [0, 0],
] as const;

export function darknessFactor(sunAlt: number): number {
  return interpKnots(sunAlt, TWILIGHT_GENERAL_KNOTS);
}

export function planetLightFactor(sunAlt: number): number {
  return interpKnots(sunAlt, TWILIGHT_PLANET_KNOTS);
}

/**
 * Twilight glow near the zenith (V mag/arcsec²): ~12.6 at the end of civil twilight (Sun −6°),
 * fading ~1.2 mag per degree of solar depression — ~19.8 at −12°, ~23.4 at −15°, negligible
 * against even a pristine 21.9 sky by −17°.
 */
export const TWILIGHT_SKY = { atMinus6: 12.6, magPerDegree: 1.2 } as const;
export function twilightSkyMag(sunAlt: number): number {
  return TWILIGHT_SKY.atMinus6 + TWILIGHT_SKY.magPerDegree * (-6 - sunAlt);
}

/**
 * Deep-sky sky-brightness model. The Moon's and twilight's light is added to the site's moonless
 * sky (from Bortle) at a representative target 60° high and away from the Moon (average of the
 * targets opposite and 90° in azimuth). Faint-object quality scales as (moonless/actual sky
 * flux)^contrastExponent, i.e. ×10^(−0.4·γ·Δm). A mild light-pollution cap multiplies by
 * 10^(−lightPollutionPerMag·(pristineSqm − siteSqm)): Bortle 9 → ×0.69, Bortle 5 → ×0.85.
 */
export const DSO_SKY = { refAlt: 60, contrastExponent: 0.4, lightPollutionPerMag: 0.04, pristineSqm: 21.9 } as const;
/** Default site sky when the Bortle class is unknown (suburban). */
export const DEFAULT_BORTLE = 5;

const nanoLamberts = (mag: number) => 34.08 * Math.exp(20.7233 - 0.92104 * mag);

export interface DsoSky {
  factor: number; // 0..1 multiplier for deep-sky quality
  deltaMag: number; // sky brightening by Moon + twilight vs. the moonless site sky (mag)
  moonDeltaMag: number; // brightening by the Moon alone
  twilightDeltaMag: number; // brightening by twilight alone
}

export function dsoSkyFactor(sunAlt: number, moonAlt: number, moonIllum: number, sqm: number, k = EXTINCTION_V): DsoSky {
  if (sunAlt > -6) return { factor: 0, deltaMag: 99, moonDeltaMag: 0, twilightDeltaMag: 99 };
  const ext = clamp(num(k, EXTINCTION_V), 0.1, 0.8);
  const refAlt = DSO_SKY.refAlt;
  const base = nanoLamberts(skyBrightnessAt(sqm, refAlt, null, ext));
  const twilight = nanoLamberts(twilightSkyMag(sunAlt));
  let moon = 0;
  if (moonAlt > 0 && moonIllum > 0.001) {
    const phaseAngle = Math.acos(clamp(2 * moonIllum - 1, -1, 1)) / DEG;
    const opposite = 180 - refAlt - moonAlt;
    const square = Math.acos(clamp(Math.sin(refAlt * DEG) * Math.sin(moonAlt * DEG), -1, 1)) / DEG;
    moon =
      0.5 *
      (moonSkyNL({ alt: moonAlt, phaseAngle, separation: opposite }, refAlt, ext) + moonSkyNL({ alt: moonAlt, phaseAngle, separation: square }, refAlt, ext));
  }
  const dm = (extra: number) => 2.5 * Math.log10((base + extra) / base);
  const deltaMag = dm(twilight + moon);
  const lp = Math.pow(10, -DSO_SKY.lightPollutionPerMag * Math.max(0, DSO_SKY.pristineSqm - sqm));
  return {
    factor: Math.pow(10, -0.4 * DSO_SKY.contrastExponent * deltaMag) * lp,
    deltaMag,
    moonDeltaMag: dm(moon),
    twilightDeltaMag: dm(twilight),
  };
}

// =====================================================================================
// Hour scores
// =====================================================================================

/**
 * Each score = 100 × cloud × precipitation × wind shake × light × quality, where
 * quality = base + (1 − base)·(wT·t + wS·s) with t, s the transparency and seeing scales mapped
 * to 0..1. Light is darknessFactor (general), dsoSkyFactor (deep-sky: twilight + Moon + light
 * pollution) or planetLightFactor (planets). The Moon only enters the deep-sky score.
 */
export const SCORE_WEIGHTS = {
  general: { base: 0.4, transparency: 0.6, seeing: 0.4 },
  dso: { base: 0.35, transparency: 0.75, seeing: 0.25 },
  planets: { base: 0.3, transparency: 0.15, seeing: 0.85 },
} as const;

export interface HourScoreInput {
  cloud: number; // total %
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  precipProb: number; // %
  wind: number; // km/h
  gust: number; // km/h
  seeing: number; // continuous 1..5 (SeeingEstimate.value)
  transparency: number; // continuous 1..5 (TransparencyEstimate.value)
  extinction?: number | null; // mag/airmass, for moonlight scattering
  sunAlt: number; // deg
  moonAlt: number; // deg
  moonIllum: number; // 0..1
  sqm?: number | null; // moonless zenith sky of the site, mag/arcsec² (default: Bortle 5)
}

export interface HourScores {
  score: number; // 0..100
  dsoScore: number;
  planetScore: number;
  effCloud: number; // % (general / deep-sky weighting of cirrus)
  effCloudPlanets: number; // % (planet weighting of cirrus)
  dsoSky: DsoSky;
}

export function hourScores(h: HourScoreInput): HourScores {
  const tN = clamp((num(h.transparency, 3) - 1) / 4, 0, 1);
  const sN = clamp((num(h.seeing, 3) - 1) / 4, 0, 1);
  const quality = (w: { base: number; transparency: number; seeing: number }) => w.base + (1 - w.base) * (w.transparency * tN + w.seeing * sN);

  const effCloud = effectiveCloud(h.cloudLow, h.cloudMid, h.cloudHigh, h.cloud);
  const effCloudPlanets = effectiveCloud(h.cloudLow, h.cloudMid, h.cloudHigh, h.cloud, HIGH_CLOUD_OPACITY_PLANETS);
  const fp = precipFactor(h.precipProb);
  const sqm = num(h.sqm, sqmForBortle(DEFAULT_BORTLE));
  const dsoSky = dsoSkyFactor(h.sunAlt, h.moonAlt, h.moonIllum, sqm, num(h.extinction, EXTINCTION_V));

  const general = cloudFactor(effCloud) * fp * windFactor(h.wind, h.gust) * darknessFactor(h.sunAlt) * quality(SCORE_WEIGHTS.general);
  const dso = cloudFactor(effCloud) * fp * windFactor(h.wind, h.gust) * dsoSky.factor * quality(SCORE_WEIGHTS.dso);
  const planets =
    cloudFactor(effCloudPlanets) * fp * windFactor(h.wind, h.gust, "planets") * planetLightFactor(h.sunAlt) * quality(SCORE_WEIGHTS.planets);

  const pct = (x: number) => Math.round(clamp(x, 0, 1) * 100);
  return { score: pct(general), dsoScore: pct(dso), planetScore: pct(planets), effCloud, effCloudPlanets, dsoSky };
}

// =====================================================================================
// Night scores and verdicts
// =====================================================================================

/**
 * A night's score blends the weighted mean over its window (weights = fraction of each hour
 * inside the dark window) with the best `bestHours`-hour stretch — an observer only needs a
 * few good hours, but a night that is good throughout should rank higher.
 */
export const NIGHT_MODEL = { meanWeight: 0.65, bestWeight: 0.35, bestHours: 3 } as const;

export interface WeightedScore {
  score: number;
  weight: number; // 0..1 fraction of the hour inside the window
}

export function nightScore(hours: WeightedScore[]): number {
  const valid = hours.filter((h) => h.weight > 0 && Number.isFinite(h.score));
  const total = valid.reduce((s, h) => s + h.weight, 0);
  if (total <= 0) return 0;
  const mean = valid.reduce((s, h) => s + h.score * h.weight, 0) / total;
  const n = Math.min(NIGHT_MODEL.bestHours, valid.length);
  let best = 0;
  for (let i = 0; i + n <= valid.length; i++) {
    let sw = 0;
    let ss = 0;
    for (let j = i; j < i + n; j++) {
      sw += valid[j].weight;
      ss += valid[j].score * valid[j].weight;
    }
    if (sw > 0) best = Math.max(best, ss / sw);
  }
  return Math.round(NIGHT_MODEL.meanWeight * mean + NIGHT_MODEL.bestWeight * best);
}

/**
 * Minimum score for each verdict — the same bands as the UI's qualityOf() and score colours
 * (client/src/lib/objects.ts), so a night's words and its colour always agree.
 */
export const VERDICT_THRESHOLDS = { excellent: 80, good: 62, fair: 42, poor: 22 } as const;

export function verdictOf(score: number): Verdict {
  const v = VERDICT_THRESHOLDS;
  if (score >= v.excellent) return "excellent";
  if (score >= v.good) return "good";
  if (score >= v.fair) return "fair";
  if (score >= v.poor) return "poor";
  return "bad";
}
