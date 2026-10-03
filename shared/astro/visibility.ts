/**
 * How visible is an object tonight, from this sky, with this telescope?
 *
 * Sky brightness: Bortle → zenith SQM, extinction with airmass, plus moonlight from the
 * Krisciunas & Schaefer (1991) model evaluated at the object's position.
 * Detectability: contrast of the object's surface brightness against that sky, with
 * corrections for apparent size, aperture and integrated brightness (calibrated so that
 * e.g. M31/M13/M57 are easy and M33/M101 hard from a Bortle 5 suburb with an 8" scope).
 */
import { DEG, HOUR_MS, Site, Vec3, HorizonFrame, horizonFrame, altAzOf, eqjVector, airmass, clamp, observerOf, A } from "./core";
import type { NightInfo } from "./night";

export const EXTINCTION_V = 0.2; // mag/airmass, typical V-band site

/** Zenith sky brightness (mag/arcsec²) and naked-eye limiting magnitude by Bortle class. */
export const BORTLE: Record<number, { sqm: number; nelm: number; label: string; description: string }> = {
  1: { sqm: 21.9, nelm: 7.8, label: "Excellent dark site", description: "Zodiacal light, gegenschein and airglow visible; M33 is obvious to the naked eye." },
  2: { sqm: 21.6, nelm: 7.3, label: "Typical dark site", description: "Summer Milky Way highly structured; clouds appear as black holes in the sky." },
  3: { sqm: 21.4, nelm: 6.8, label: "Rural sky", description: "Some light domes on the horizon; Milky Way still complex." },
  4: { sqm: 20.9, nelm: 6.3, label: "Rural / suburban transition", description: "Light domes visible in several directions; Milky Way lacks detail near the horizon." },
  5: { sqm: 20.2, nelm: 5.8, label: "Suburban sky", description: "Milky Way weak or invisible near the horizon; clouds brighter than the sky." },
  6: { sqm: 19.5, nelm: 5.3, label: "Bright suburban sky", description: "Milky Way only visible near the zenith; sky glows grey-white." },
  7: { sqm: 18.9, nelm: 4.8, label: "Suburban / urban transition", description: "Sky is light grey; M31 and M44 barely visible to the naked eye." },
  8: { sqm: 18.4, nelm: 4.3, label: "City sky", description: "Sky glows orange-grey; only bright clusters and planets stand out." },
  9: { sqm: 17.8, nelm: 4.0, label: "Inner-city sky", description: "Only the Moon, planets and a few bright stars are visible." },
};

export function sqmForBortle(bortle: number): number {
  const b = clamp(Math.round(bortle), 1, 9);
  return BORTLE[b].sqm;
}

export function bortleForSqm(sqm: number): number {
  for (let b = 1; b <= 9; b++) if (sqm >= BORTLE[b].sqm - 0.15) return b;
  return 9;
}

/** Naked-eye limiting magnitude for a sky brightness (Unihedron / Schaefer relation). */
export function nelmFromSqm(sqm: number): number {
  return 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - sqm / 5) + 1);
}

const nL = (mag: number) => 34.08 * Math.exp(20.7233 - 0.92104 * mag);
const magFromNL = (b: number) => (20.7233 - Math.log(b / 34.08)) / 0.92104;

export interface MoonGeometry {
  alt: number; // Moon altitude (deg)
  phaseAngle: number; // deg, 0 = full
  separation: number; // Moon–object angular distance (deg)
}

/** Moonlight sky brightness in nanoLamberts at an object (Krisciunas & Schaefer 1991). */
export function moonSkyNL(m: MoonGeometry, objAlt: number, k = EXTINCTION_V): number {
  if (m.alt <= 0 || objAlt <= 0) return 0;
  const a = Math.abs(m.phaseAngle);
  const iStar = Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * Math.pow(a, 4)));
  const rho = Math.max(m.separation, 3);
  const fRho = Math.pow(10, 5.36) * (1.06 + Math.cos(rho * DEG) ** 2) + Math.pow(10, 6.15 - rho / 40);
  const X = (zd: number) => Math.pow(1 - 0.96 * Math.sin(zd * DEG) ** 2, -0.5);
  const zm = 90 - m.alt;
  const zo = 90 - objAlt;
  return fRho * iStar * Math.pow(10, -0.4 * k * X(zm)) * (1 - Math.pow(10, -0.4 * k * X(zo)));
}

/** Effective sky surface brightness (mag/arcsec²) at an object's position. */
export function skyBrightnessAt(sqmZenith: number, objAlt: number, moon?: MoonGeometry | null, k = EXTINCTION_V): number {
  const alt = Math.max(objAlt, 1);
  const X = airmass(alt);
  // Natural/artificial sky glow brightens towards the horizon (K&S eq. 2 form).
  const base = nL(sqmZenith) * Math.pow(10, -0.4 * k * (X - 1)) * Math.min(X, 6);
  const moonNL = moon ? moonSkyNL(moon, alt, k) : 0;
  return magFromNL(base + moonNL);
}

// ------------------------------------------------------------------------------------
// Object night tracks
// ------------------------------------------------------------------------------------

export interface TrackPoint {
  t: number;
  alt: number;
  az: number;
}

export interface NightFrames {
  times: number[];
  frames: HorizonFrame[];
  sunAlt: number[];
  moon: { alt: number; az: number; ra: number; dec: number }[]; // J2000 ra/dec
  moonPhaseAngle: number;
  moonIllumination: number;
  darkStart: number | null;
  darkEnd: number | null;
}

/** Precompute horizon frames, Sun and Moon positions for every sample of a night. */
export function nightFrames(night: NightInfo, site: Site, stepMin = 10): NightFrames {
  const obs = observerOf(site);
  const start = (night.sunset ?? night.noon + 5 * HOUR_MS) - HOUR_MS;
  const end = (night.sunrise ?? night.nextNoon - 5 * HOUR_MS) + HOUR_MS;
  const step = stepMin * 60_000;
  const times: number[] = [];
  for (let x = Math.ceil(start / step) * step; x <= end; x += step) times.push(x);
  const frames = times.map((ms) => horizonFrame(ms, obs));
  const sunAlt: number[] = [];
  const moon: NightFrames["moon"] = [];
  for (const ms of times) {
    const d = new Date(ms);
    const sEq = A.Equator(A.Body.Sun, d, obs, true, true);
    sunAlt.push(A.Horizon(d, obs, sEq.ra, sEq.dec, "normal").altitude);
    const mEq = A.Equator(A.Body.Moon, d, obs, true, true);
    const mHor = A.Horizon(d, obs, mEq.ra, mEq.dec, "normal");
    const mJ = A.Equator(A.Body.Moon, d, obs, false, true);
    moon.push({ alt: mHor.altitude, az: mHor.azimuth, ra: mJ.ra, dec: mJ.dec });
  }
  const mid = new Date(night.solarMidnight);
  const illum = A.Illumination(A.Body.Moon, mid);
  return {
    times,
    frames,
    sunAlt,
    moon,
    moonPhaseAngle: illum.phase_angle,
    moonIllumination: illum.phase_fraction,
    darkStart: night.darkStart,
    darkEnd: night.darkEnd,
  };
}

export interface ObjectTrack {
  points: TrackPoint[];
  /** Highest altitude while the sky is dark (or during the whole night if no darkness). */
  maxAlt: number;
  maxAltTime: number | null;
  /** Upper transit inside the sampled interval, if it happens there. */
  transitTime: number | null;
  /** Interval during darkness when the object is above `minAlt`. */
  window: [number, number] | null;
  hoursAboveMin: number;
  riseTime: number | null; // crossing of minAlt upwards inside the night
  setTime: number | null; // crossing downwards
  alwaysUp: boolean; // above minAlt for the whole dark window
  neverUp: boolean; // never reaches minAlt during darkness
  moonSepAtBest: number | null;
  moonAltAtBest: number | null;
}

function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) / DEG;
}

export function objectTrack(raHours: number, decDeg: number, nf: NightFrames, minAlt = 20): ObjectTrack {
  const v = eqjVector(raHours, decDeg);
  const points = nf.frames.map((f) => ({ t: f.t, ...altAzOf(f, v) }));
  const inDark = (t: number) => nf.darkStart !== null && nf.darkEnd !== null && t >= nf.darkStart && t <= nf.darkEnd;
  const hasDark = nf.darkStart !== null && nf.darkEnd !== null;

  let maxAlt = -90;
  let maxIdx = -1;
  points.forEach((p, i) => {
    if ((!hasDark || inDark(p.t)) && p.alt > maxAlt) {
      maxAlt = p.alt;
      maxIdx = i;
    }
  });

  // Transit: local maximum of altitude inside the sampled night (parabolic refinement).
  let transitTime: number | null = null;
  for (let i = 1; i < points.length - 1; i++) {
    if (points[i].alt >= points[i - 1].alt && points[i].alt > points[i + 1].alt) {
      const y0 = points[i - 1].alt, y1 = points[i].alt, y2 = points[i + 1].alt;
      const denom = y0 - 2 * y1 + y2;
      const off = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
      transitTime = points[i].t + off * (points[i + 1].t - points[i].t);
      break;
    }
  }

  let window: [number, number] | null = null;
  let above = 0;
  let riseTime: number | null = null;
  let setTime: number | null = null;
  const step = points.length > 1 ? points[1].t - points[0].t : 600_000;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      if (q.alt < minAlt && p.alt >= minAlt && riseTime === null) riseTime = q.t + ((minAlt - q.alt) / (p.alt - q.alt)) * step;
      if (q.alt >= minAlt && p.alt < minAlt && setTime === null) setTime = q.t + ((q.alt - minAlt) / (q.alt - p.alt)) * step;
    }
    if (inDark(p.t) && p.alt >= minAlt) {
      above += step;
      if (!window) window = [p.t, p.t];
      else window[1] = p.t;
    }
  }

  const darkPts = points.filter((p) => inDark(p.t));
  const alwaysUp = darkPts.length > 0 && darkPts.every((p) => p.alt >= minAlt);
  const neverUp = darkPts.length > 0 ? darkPts.every((p) => p.alt < minAlt) : maxAlt < minAlt;

  let moonSepAtBest: number | null = null;
  let moonAltAtBest: number | null = null;
  if (maxIdx >= 0) {
    const m = nf.moon[maxIdx];
    moonSepAtBest = angleBetween(v, eqjVector(m.ra, m.dec));
    moonAltAtBest = m.alt;
  }

  return {
    points,
    maxAlt,
    maxAltTime: maxIdx >= 0 ? points[maxIdx].t : null,
    transitTime,
    window,
    hoursAboveMin: above / HOUR_MS,
    riseTime,
    setTime,
    alwaysUp,
    neverUp,
    moonSepAtBest,
    moonAltAtBest,
  };
}

// ------------------------------------------------------------------------------------
// Detectability
// ------------------------------------------------------------------------------------

export interface TargetLike {
  type: string;
  m?: number; // Messier number (well-studied objects: catalog values are trustworthy)
  showpiece?: boolean;
  mag?: number;
  size?: number[]; // arcmin
  sb?: number; // mag/arcmin² (OpenNGC SurfBr: B-band mean inside the 25 mag/arcsec² isophote)
  sep?: number; // arcsec (doubles)
  mag2?: number;
  hubble?: string; // galaxy morphology, e.g. "Sb", "SABc", "E2"
}

/** How much brighter a galaxy's visible core is than its D25-mean surface brightness, by morphology. */
function galaxyCoreBoost(hubble?: string): number {
  if (!hubble) return 0.3;
  const h = hubble.trim();
  if (/^(c?E|S0|SA?B?0)/.test(h)) return 0.6;
  if (/^S(A|B|AB)?a/.test(h)) return 0.6;
  if (/^S(A|B|AB)?b/.test(h)) return 0.4;
  if (/^(S(A|B|AB)?[cdm]|I|Im|IB)/.test(h)) return 0;
  return 0.3;
}

export type Difficulty = "easy" | "moderate" | "challenging" | "very hard" | "out of reach";

/** Mean surface brightness in mag/arcsec² (from catalog SB, or estimated from magnitude & size). */
export function surfaceBrightnessArcsec(o: TargetLike): number | null {
  if (o.sb !== undefined && o.sb !== null) return o.sb + 8.89;
  if (o.mag === undefined || !o.size || !o.size[0]) return null;
  const a = o.size[0];
  const b = o.size[1] ?? a;
  const area = (Math.PI / 4) * a * b; // arcmin²
  return o.mag + 2.5 * Math.log10(Math.max(area, 0.01)) + 8.89;
}

export function telescopeLimitingMag(nelm: number, apertureMm: number): number {
  return nelm + 5 * Math.log10(Math.max(apertureMm, 7) / 7) - 0.5;
}

export interface DetectInput {
  sqmZenith: number;
  apertureMm: number; // use 7 for naked eye, 50 for binoculars
  alt: number;
  moon?: MoonGeometry | null;
}

export interface DetectResult {
  difficulty: Difficulty;
  index: number; // higher = easier; ~ >0.5 easy, < -2.5 out of reach
  skySB: number; // effective sky brightness at the object (mag/arcsec²)
  limitingMag: number; // telescopic limiting magnitude under that sky
  note: string;
}

const EXTENDED = new Set([
  "galaxy",
  "galaxy_group",
  "planetary_nebula",
  "emission_nebula",
  "reflection_nebula",
  "dark_nebula",
  "supernova_remnant",
  "cluster_nebula",
  "globular_cluster",
]);

function classify(index: number): Difficulty {
  if (index >= 0.5) return "easy";
  if (index >= -0.5) return "moderate";
  if (index >= -1.5) return "challenging";
  if (index >= -2.5) return "very hard";
  return "out of reach";
}

export function detectability(o: TargetLike, input: DetectInput): DetectResult {
  const skySB = skyBrightnessAt(input.sqmZenith, input.alt, input.moon);
  const nelm = nelmFromSqm(skySB);
  const lm = telescopeLimitingMag(nelm, input.apertureMm);
  const ext = EXTENDED.has(o.type);
  const apTerm = 0.8 * Math.log2(Math.max(input.apertureMm, 7) / 100);
  const extinction = -EXTINCTION_V * (airmass(Math.max(input.alt, 1)) - 1);

  if (o.type === "double_star") {
    const dawes = 116 / Math.max(input.apertureMm, 7);
    const faint = Math.max(o.mag ?? 0, o.mag2 ?? o.mag ?? 0);
    let index = (lm - 1.5 - (faint - extinction)) / 2; // brightness margin
    let note = "";
    if (o.sep !== undefined) {
      const ratio = o.sep / dawes;
      if (ratio < 1) {
        index = Math.min(index, -3);
        note = `Separation ${o.sep}" is below your scope's ${dawes.toFixed(1)}" resolution limit`;
      } else if (ratio < 1.6) {
        index = Math.min(index, -1);
        note = "Close pair: needs steady seeing and high power";
      } else if (o.sep < 3) {
        index = Math.min(index, 0);
        note = "Needs high magnification to split";
      } else note = "Splits easily at moderate power";
      const deltaM = (o.mag2 ?? o.mag ?? 0) - (o.mag ?? 0);
      if (deltaM > 4 && o.sep < 8) {
        index -= 1;
        note += "; the faint companion hides in the primary's glare";
      }
    }
    return { difficulty: classify(index), index, skySB, limitingMag: lm, note };
  }

  if (o.type === "open_cluster" || o.type === "asterism" || o.type === "star_cloud") {
    const mag = (o.mag ?? 7) - extinction;
    // Clusters are seen as their member stars: compare against the limiting magnitude.
    const index = (lm - mag - 4) / 1.5 + (skySB - 19.5) * 0.25;
    const note = index > 0.5 ? "Rich and bright in your scope" : index > -0.5 ? "Visible, best under darker skies" : "Faint members get lost in the sky glow";
    return { difficulty: classify(index), index, skySB, limitingMag: lm, note };
  }

  if (ext) {
    let objSB = surfaceBrightnessArcsec(o);
    const size = o.size?.[0] ?? 5;
    const minor = o.size?.[1] ?? size;
    if (objSB === null) {
      const index = (lm - (o.mag ?? 10) - 2) / 2;
      return { difficulty: classify(index), index, skySB, limitingMag: lm, note: "" };
    }
    const isGalaxy = o.type === "galaxy" || o.type === "galaxy_group";
    let structure = 0;
    if (isGalaxy) {
      if (o.sb !== undefined && o.sb !== null) objSB -= 0.85; // catalog SB is B-band; galaxies are ~0.85 mag brighter in V
      structure += galaxyCoreBoost(o.hubble) + (minor / size < 0.3 ? 0.3 : 0); // bright bulge / edge-on disks
    }
    const nebula = o.type === "emission_nebula" || o.type === "reflection_nebula" || o.type === "cluster_nebula" || o.type === "supernova_remnant";
    const wellKnown = Boolean(o.m || o.showpiece);
    // Catalog magnitudes of reflection nebulae and cluster+nebula complexes usually describe the star or cluster,
    // not the nebulosity; treat the nebula as ~2 mag fainter unless it's a well-studied object.
    if ((o.type === "reflection_nebula" || o.type === "cluster_nebula") && !o.m) objSB += 2.0;
    const giantNebula = (o.type === "emission_nebula" || o.type === "supernova_remnant") && size > 60 && !o.m;
    if (giantNebula && o.sb === undefined && o.mag !== undefined) {
      // Catalog minor axes of big nebular complexes are unreliable; treat them as roughly round.
      objSB = o.mag + 2.5 * Math.log10((Math.PI / 4) * size * size) + 8.89;
    }
    if (o.type === "supernova_remnant" && size > 30 && minor / size >= 0.3) objSB -= 2.0; // bounding box of thin filaments
    if (nebula && !wellKnown) structure -= 0.5; // lesser-known nebulae: catalog brightness tends to be optimistic
    if ((o.type === "emission_nebula" || o.type === "cluster_nebula") && o.sb === undefined) objSB -= 0.6; // bright inner regions
    if (giantNebula) structure -= 1.2; // giant, diffuse: little contrast without a filter
    // Visible extent: galaxies show their inner ~60%; beyond ~1° the field of view caps the gain from size.
    const visSize = Math.min(isGalaxy ? size * 0.6 : size, 60);
    const contrast = skySB - (objSB - extinction);
    const sizeTerm = Math.log10(Math.max(visSize, 0.3) / 5);
    const brightTerm = isGalaxy ? clamp(0.25 * (8 - (o.mag ?? 10)), 0, 1.2) : clamp(0.2 * (8 - (o.mag ?? 10)), 0, 1.0);
    let index = contrast + sizeTerm + apTerm + brightTerm + structure;
    if (o.type === "dark_nebula") index -= 1.2;
    if ((o.mag ?? 0) - extinction > lm) index = Math.min(index, -3);
    const filterNote =
      o.type === "emission_nebula" || o.type === "supernova_remnant" || o.type === "planetary_nebula" || o.type === "cluster_nebula"
        ? " A UHC/OIII filter helps a lot."
        : "";
    const note =
      index >= 0.5
        ? "Stands out clearly against this sky"
        : index >= -0.5
          ? "Visible; better with averted vision"
          : index >= -1.5
            ? "Low contrast: needs dark adaptation and averted vision." + filterNote
            : "Contrast is too low for this sky — try a darker site or a moonless night." + filterNote;
    return { difficulty: classify(index), index, skySB, limitingMag: lm, note: note.trim() };
  }

  const index = (lm - (o.mag ?? 8) - 2) / 2;
  return { difficulty: classify(index), index, skySB, limitingMag: lm, note: "" };
}

/** 0..1 quality of altitude for observing (atmosphere + comfort). */
export function altitudeQuality(alt: number): number {
  if (alt <= 5) return 0;
  if (alt >= 60) return 1;
  // Smooth rise: 10° → 0.18, 20° → 0.45, 30° → 0.66, 45° → 0.88
  return clamp(1 - Math.pow((60 - alt) / 55, 1.6), 0, 1);
}

export function difficultyScore(d: DetectResult): number {
  // logistic map of the detectability index to 0..1
  return 1 / (1 + Math.exp(-(d.index + 0.9) * 2.2));
}
