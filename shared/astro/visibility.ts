/**
 * How visible is an object tonight, from this sky, with this telescope?
 *
 * Sky brightness: Bortle → zenith SQM, extinction with airmass, plus moonlight from the
 * Krisciunas & Schaefer (1991) model evaluated at the object's position.
 * Detectability: contrast of the object's surface brightness against that sky, with
 * corrections for apparent size, aperture and integrated brightness (calibrated so that
 * e.g. M31/M13/M57 are easy and M33/M101 hard from a Bortle 5 suburb with an 8" scope).
 */
import { DEG, HOUR_MS, Site, Vec3, HorizonFrame, horizonFrame, altAzOf, eqjVector, airmass, clamp, observerOf, sunGeometricAltitude, A } from "./core";
import type { NightInfo } from "./night";

export const EXTINCTION_V = 0.2; // mag/airmass, typical V-band site

/**
 * Zenith sky brightness (mag/arcsec²) and naked-eye limiting magnitude by Bortle class. SQM values sit
 * inside the Dark Skies Awareness nomogram ranges (21.76–22.0, 21.6–21.75, 21.3–21.6, 20.8–21.3,
 * 19.25–20.3, 18.5–19.25, 18.0–18.5, <18); NELM is Bortle's own (2001) description — for keen, experienced
 * eyes, and not what the ratings use (they take `nelmFromSqm`, which the app also shows).
 */
export const BORTLE: Record<number, { sqm: number; nelm: number; label: string; description: string }> = {
  1: { sqm: 21.9, nelm: 7.8, label: "Excellent dark site", description: "Zodiacal light, gegenschein and airglow visible; the Milky Way casts faint shadows." },
  2: { sqm: 21.65, nelm: 7.3, label: "Typical dark site", description: "Summer Milky Way highly structured; clouds appear as black holes in the sky." },
  3: { sqm: 21.4, nelm: 6.8, label: "Rural sky", description: "Some light domes on the horizon; Milky Way still complex." },
  4: { sqm: 20.9, nelm: 6.3, label: "Rural / suburban transition", description: "Light domes visible in several directions; Milky Way lacks detail near the horizon." },
  5: { sqm: 20.2, nelm: 5.8, label: "Suburban sky", description: "Milky Way weak or invisible near the horizon; clouds brighter than the sky." },
  6: { sqm: 18.9, nelm: 5.3, label: "Bright suburban sky", description: "Milky Way only visible near the zenith; sky glows grey-white." },
  7: { sqm: 18.25, nelm: 4.8, label: "Suburban / urban transition", description: "Sky is light grey; M31 and M44 barely visible to the naked eye." },
  8: { sqm: 17.8, nelm: 4.3, label: "City sky", description: "Sky glows orange-grey; only bright clusters and planets stand out." },
  9: { sqm: 17.3, nelm: 4.0, label: "Inner-city sky", description: "Only the Moon, planets and a few bright stars are visible." },
};

export function sqmForBortle(bortle: number): number {
  const b = clamp(Math.round(bortle), 1, 9);
  return BORTLE[b].sqm;
}

/** The class whose typical SQM is nearest (boundaries halfway between neighbouring classes), so it inverts sqmForBortle. */
export function bortleForSqm(sqm: number): number {
  for (let b = 1; b < 9; b++) if (sqm >= (BORTLE[b].sqm + BORTLE[b + 1].sqm) / 2) return b;
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
  let iStar = Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * Math.pow(a, 4)));
  if (a < 7) iStar *= 1.35 - 0.05 * a; // opposition brightening of the nearly full Moon (as in Thorstensen's skycalc)
  const rho = Math.max(m.separation, 0.25);
  // Rayleigh + Mie scattering; inside 10° the aureole follows K&S eq. 19 (6.2·10⁷ ρ⁻²).
  const mie = rho > 10 ? Math.pow(10, 6.15 - rho / 40) : 6.2e7 / (rho * rho);
  const fRho = Math.pow(10, 5.36) * (1.06 + Math.cos(rho * DEG) ** 2) + mie;
  const X = (zd: number) => Math.pow(1 - 0.96 * Math.sin(zd * DEG) ** 2, -0.5);
  const zm = 90 - m.alt;
  const zo = 90 - objAlt;
  return fRho * iStar * Math.pow(10, -0.4 * k * X(zm)) * (1 - Math.pow(10, -0.4 * k * X(zo)));
}

/**
 * How many magnitudes twilight brightens the zenith sky with the Sun at `sunAlt` (deg): Thorstensen's
 * skycalc fit to Meinel & Meinel (1983) / Ashburn (1952). 0 at −18°, ≈1 at −15°, ≈3.2 at −12°, ≈9 at −6°.
 */
export function twilightBrightening(sunAlt: number): number {
  if (sunAlt <= -18) return 0;
  const y = (-Math.min(sunAlt, -4) - 9) / 9;
  return Math.max(0, ((2.0635175 * y + 1.246602) * y - 9.4084495) * y + 6.132725);
}

const NATURAL_SQM = 21.9;

/** Effective sky surface brightness (mag/arcsec²) at an object's position (light pollution, moonlight, twilight). */
export function skyBrightnessAt(sqmZenith: number, objAlt: number, moon?: MoonGeometry | null, k = EXTINCTION_V, sunAlt?: number | null): number {
  const alt = Math.max(objAlt, 1);
  // K&S's own airmass for sky glow (finite at the horizon, where it reaches 5): the path through the glowing
  // layer lengthens while extinction dims it. (The star airmass grows without limit near the horizon and
  // would make the sky there *darker* than at the zenith.)
  const X = Math.pow(1 - 0.96 * Math.sin((90 - alt) * DEG) ** 2, -0.5);
  const toAlt = Math.pow(10, -0.4 * k * (X - 1)) * X;
  // Natural/artificial sky glow brightens towards the horizon (K&S eq. 2 form).
  const base = nL(sqmZenith) * toAlt;
  const tw = sunAlt !== null && sunAlt !== undefined && sunAlt > -18 ? nL(NATURAL_SQM) * (Math.pow(10, 0.4 * twilightBrightening(sunAlt)) - 1) * toAlt : 0;
  const moonNL = moon ? moonSkyNL(moon, alt, k) : 0;
  return magFromNL(base + tw + moonNL);
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
  /** The Sun's geometric altitude at each sample (deg). */
  sunAlt: number[];
  moon: { alt: number; az: number; ra: number; dec: number }[]; // J2000 ra/dec
  moonPhaseAngle: number;
  moonIllumination: number;
  darkStart: number | null;
  darkEnd: number | null;
  /** The site, for exact positions between samples (the edges of darkness, a transit). */
  observer: A.Observer;
}

/** Precompute horizon frames, Sun and Moon positions for every sample of a night. */
export function nightFrames(night: NightInfo, site: Site, stepMin = 10): NightFrames {
  const obs = observerOf(site);
  // From an hour before sunset to an hour after sunrise, and always across the whole dark window
  // (polar night has no sunset but can be dark from early afternoon).
  const start = Math.min((night.sunset ?? night.noon + 5 * HOUR_MS) - HOUR_MS, night.darkStart ?? Infinity);
  const end = Math.max((night.sunrise ?? night.nextNoon - 5 * HOUR_MS) + HOUR_MS, night.darkEnd ?? -Infinity);
  const step = stepMin * 60_000;
  const times: number[] = [];
  for (let x = Math.ceil(start / step) * step; x <= end; x += step) times.push(x);
  const frames = times.map((ms) => horizonFrame(ms, obs));
  const sunAlt: number[] = [];
  const moon: NightFrames["moon"] = [];
  for (const ms of times) {
    const d = new Date(ms);
    // Geometric, like the night's twilight times: refraction would make every twilight boundary minutes late.
    sunAlt.push(sunGeometricAltitude(d, obs));
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
    observer: obs,
  };
}

export interface ObjectTrack {
  points: TrackPoint[];
  /** Highest altitude while the sky is dark — or, on a night with no darkness at all (`noDarkness`), during the night. */
  maxAlt: number;
  maxAltTime: number | null;
  /** The night has no dark window (midnight sun, or twilight all night too bright to observe in). */
  noDarkness?: boolean;
  /** Index into `points` (and the night frames) of `maxAltTime`, −1 if none. */
  maxIdx: number;
  /** Upper transit inside the sampled interval, if it happens there. */
  transitTime: number | null;
  /** The stretch of darkness above `minAlt` that contains the best moment (or the longest one). */
  window: [number, number] | null;
  /** Every stretch of darkness above `minAlt` (an object can dip below it and come back). */
  segments: [number, number][];
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
  // Without a dark window (midnight sun, white nights) nothing is observable: no observing windows, but
  // the night's real highest point is still reported (flagged `noDarkness`), never a made-up −90°.
  const hasDark = nf.darkStart !== null && nf.darkEnd !== null;
  const inDark = (t: number) => hasDark && t >= nf.darkStart! && t <= nf.darkEnd!;

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

  const segments: [number, number][] = [];
  let above = 0;
  let riseTime: number | null = null;
  let setTime: number | null = null;
  const step = points.length > 1 ? points[1].t - points[0].t : 600_000;
  let open = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      if (q.alt < minAlt && p.alt >= minAlt && riseTime === null) riseTime = q.t + ((minAlt - q.alt) / (p.alt - q.alt)) * step;
      if (q.alt >= minAlt && p.alt < minAlt && setTime === null) setTime = q.t + ((q.alt - minAlt) / (q.alt - p.alt)) * step;
    }
    if (inDark(p.t) && p.alt >= minAlt) {
      above += step;
      if (open) segments[segments.length - 1][1] = p.t;
      else segments.push([p.t, p.t]);
      open = true;
    } else open = false;
  }
  // The highest moment, exactly: the transit when it falls in darkness next to the highest sample, or an
  // edge of darkness when the object is highest there (rising at dawn, setting at dusk) — not the nearest
  // sample, so every page (whatever its sampling step) quotes the same time and altitude.
  let bestT = maxIdx >= 0 ? points[maxIdx].t : null;
  if (hasDark && maxIdx >= 0) {
    const exact = (t: number) => altAzOf(horizonFrame(t, nf.observer), v).alt;
    const atEdge = maxIdx === 0 || !inDark(points[maxIdx - 1].t) ? nf.darkStart! : maxIdx === points.length - 1 || !inDark(points[maxIdx + 1].t) ? nf.darkEnd! : null;
    if (transitTime !== null && Math.abs(transitTime - points[maxIdx].t) <= step && inDark(transitTime)) {
      bestT = transitTime;
      maxAlt = Math.max(maxAlt, exact(transitTime));
    } else if (atEdge !== null && Math.abs(atEdge - points[maxIdx].t) <= step) {
      const edgeAlt = exact(atEdge);
      if (edgeAlt > maxAlt) {
        maxAlt = edgeAlt;
        bestT = atEdge;
      }
    }
  }
  const window =
    segments.find(([a, b]) => bestT !== null && bestT >= a - step && bestT <= b + step) ??
    segments.reduce<[number, number] | null>((best, s) => (!best || s[1] - s[0] > best[1] - best[0] ? s : best), null);

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
    maxAltTime: bestT,
    ...(hasDark ? {} : { noDarkness: true }),
    maxIdx,
    transitTime,
    window,
    segments,
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
  /** `mag` is a blue (B) magnitude, there being no visual one: galaxies are ~0.8 mag brighter in V. */
  magB?: boolean;
  size?: number[]; // arcmin
  sb?: number; // mag/arcmin² (OpenNGC SurfBr: B-band mean inside the 25 mag/arcsec² isophote)
  sep?: number; // arcsec (doubles)
  mag2?: number;
  /** A wide companion pair (Mizar–Alcor, ε¹–ε²): [separation ″, magnitude, magnitude]. */
  wide?: [number, number, number];
  hubble?: string; // galaxy morphology, e.g. "Sb", "SABc", "E2"
  /** The catalog magnitude is really that of an embedded star or cluster, not the nebula. */
  magOf?: "star" | "cluster";
}

/**
 * How much brighter (mag/arcsec²) a galaxy's central region is than its visible disk, by morphology
 * (calibrated, see `detectability`): bulges and bars make cores that show even from bright skies.
 */
function galaxyCoreGain(hubble?: string): number {
  if (!hubble) return 1.0;
  const h = hubble.trim();
  if (/^(c?E|S0|SA?B?0)/.test(h)) return 2.0;
  if (/^S(A|B|AB)?a/.test(h)) return 1.32;
  if (/^S(A|B|AB)?bc/.test(h)) return 1.99;
  if (/^S(A|B|AB)?b/.test(h)) return 2.41;
  if (/^S(A|B|AB)?c/.test(h)) return 1.56;
  if (/^(S(A|B|AB)?[dm]|I)/.test(h)) return 1.0;
  return 2.0; // peculiar/uncertain types (e.g. M82's "S?") are mostly bright, compact starbursts
}

const lateType = (hubble?: string) => !!hubble && /^(S(A|B|AB)?(c|d|m)|I)/.test(hubble.trim()) && !/^S(A|B|AB)?bc/.test(hubble.trim());

/**
 * Well-studied nebulae whose brightest part dominates what you see: [V mag/arcsec², diameter in arcmin]
 * (Huygens region of M42, the Lagoon's core and Hourglass, M17's bar, the Trifid's core, the Dumbbell's "apple core").
 */
const BRIGHT_REGION: Record<number, [number, number]> = { 42: [17.4, 5], 8: [19.4, 8], 17: [18.6, 5], 20: [20.3, 8], 27: [19.6, 5] };

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

/** Faintest star visible in a telescope: light grasp over a 7 mm pupil (≈14 for an 8″ under a 6.5 sky). */
export function telescopeLimitingMag(nelm: number, apertureMm: number): number {
  return nelm + 5 * Math.log10(Math.max(apertureMm, 7) / 7) + (apertureMm > 10 ? 0.3 : 0);
}

export type InstrumentKind = "eye" | "binoculars" | "telescope";

export interface DetectInput {
  sqmZenith: number;
  apertureMm: number; // use 7 for naked eye, 50 for binoculars
  alt: number;
  moon?: MoonGeometry | null;
  /** Sun altitude (deg) at that moment; twilight brightens the sky above −18°. */
  sunAlt?: number | null;
  /** What's looking: when omitted, guessed from the aperture (≤ 10 mm the eye, < 60 mm binoculars). */
  instrument?: InstrumentKind;
  /** Binoculars' fixed magnification (default D/5, e.g. 10×50). */
  power?: number | null;
}

/** The kind of instrument behind an input (given, or guessed from its aperture). */
export function instrumentOf(input: Pick<DetectInput, "apertureMm" | "instrument">): InstrumentKind {
  return input.instrument ?? (input.apertureMm <= 10 ? "eye" : input.apertureMm < 60 ? "binoculars" : "telescope");
}

/** Binoculars' magnification: their own, else D/5 (10×50). */
const binocularPower = (input: Pick<DetectInput, "apertureMm" | "power">) => (input.power && input.power > 0 ? input.power : Math.max(input.apertureMm, 7) / 5);

/**
 * Smallest separation (arcsec) of a pair this instrument can split: the optics' Dawes limit, or the eye's own
 * resolution (~2′ for a pair of stars) divided by the magnification — the eye alone at 1×, binoculars at their
 * fixed power, a telescope at the highest useful power (2× the aperture in mm, up to ~350×).
 */
export function resolutionArcsec(input: Pick<DetectInput, "apertureMm" | "instrument" | "power">): number {
  const D = Math.max(input.apertureMm, 7);
  const kind = instrumentOf(input);
  const maxPower = kind === "eye" ? 1 : kind === "binoculars" ? binocularPower(input) : Math.min(2 * D, 350);
  return Math.max(116 / D, 120 / maxPower);
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

/*
 * Extended objects: the eye detects a patch when its contrast against the sky beats a threshold that
 * depends on the patch's apparent size and on the background brightness at the eye (Blackwell 1946;
 * see Crumey 2014, MNRAS 442, 2600):
 *  - size: below ~20′ apparent the threshold grows like 1/α² (Ricco: only total light counts, as for
 *    averted night vision), up to ~75′ like 1/α (Piper), and flattens beyond;
 *  - background: at night-vision levels (de Vries–Rose) the threshold contrast grows like √(1/B): 0.5 mag
 *    more contrast needed per magnitude of darker background. That's why a city sky costs much less than
 *    its raw loss of contrast suggests, and why bright showpieces stay easy from town.
 * A telescope can't raise surface brightness, but magnification enlarges the patch while the shrinking exit
 * pupil dims the background; we take the best power the instrument offers (binoculars and the eye: fixed).
 * Objects are modelled as their visible extent plus, where they have one, a brighter core (galaxy bulges,
 * globular cores, the bright parts of nebulae). The constants were fitted to ~210 observing judgments
 * (naked eye, 10×50, 4″, 8″ and 12″ under Bortle 2–9 and city skies) — e.g. M31/M42 easy to the eye from a
 * rural site, M31/M13/M57 easy and M101 very hard in an 8″ from a suburb, M42/M13/M57 fine in a city.
 */
const RICCO_ARCMIN = 19;
const PIPER_ARCMIN = 74;
const K_EXT = -1.172;
const EYE_BONUS = 0.99; // both eyes, a wide field and no light lost in optics
const APERTURE_GAIN = 1.74; // per decade of aperture beyond what the patch model captures (image scale, detail)

function sizeThreshold(alphaArcmin: number): number {
  const a = Math.max(alphaArcmin, 0.05);
  if (a >= PIPER_ARCMIN) return 0;
  if (a >= RICCO_ARCMIN) return 2.5 * Math.log10(PIPER_ARCMIN / a);
  return 2.5 * Math.log10(PIPER_ARCMIN / RICCO_ARCMIN) + 5 * Math.log10(RICCO_ARCMIN / a);
}

/** Magnifications an instrument offers: the eye 1×, binoculars fixed (their own, else D/5), telescopes a range. */
function powersFor(input: DetectInput, sizeArcmin: number): number[] {
  const D = Math.max(input.apertureMm, 7);
  const kind = instrumentOf(input);
  if (kind === "eye") return [1];
  if (kind === "binoculars") return [binocularPower(input)];
  // From a 7 mm exit pupil up to 2× the aperture in mm, keeping the object inside a ~1° field.
  const lo = D / 7;
  const hi = Math.max(lo, Math.min(2 * D, 3600 / Math.max(sizeArcmin, 0.1)));
  return Array.from({ length: 13 }, (_, k) => lo * Math.pow(hi / lo, k / 12));
}

/** Best detection margin (mag) for a uniform patch of surface brightness `sb` (mag/arcsec²) and diameter `size` (arcmin). */
function patchMargin(sb: number, size: number, skySB: number, input: DetectInput): number {
  const D = Math.max(input.apertureMm, 7);
  let best = -Infinity;
  for (const M of powersFor(input, size)) {
    const pupil = Math.min(7, D / M);
    const eyeSky = skySB + 5 * Math.log10(7 / pupil);
    best = Math.max(best, skySB - sb - sizeThreshold(size * M) - 0.5 * (eyeSky - 21.5));
  }
  return best;
}

const scopeGain = (input: DetectInput) => (instrumentOf(input) === "telescope" ? APERTURE_GAIN * Math.log10(Math.max(input.apertureMm, 7) / 200) : 0);
const areaSB = (mag: number, a: number, b: number) => mag + 2.5 * Math.log10(Math.max((Math.PI / 4) * a * b, 0.01)) + 8.89;

export function detectability(o: TargetLike, input: DetectInput): DetectResult {
  const skySB = skyBrightnessAt(input.sqmZenith, input.alt, input.moon, EXTINCTION_V, input.sunAlt);
  const nelm = nelmFromSqm(skySB);
  const lm = telescopeLimitingMag(nelm, input.apertureMm);
  const ext = EXTENDED.has(o.type);
  const extinction = -EXTINCTION_V * (airmass(Math.max(input.alt, 1)) - 1);
  const kind = instrumentOf(input);
  const eye = kind === "eye";
  const moonUp = !!input.moon && input.moon.alt > 0 && Math.abs(input.moon.phaseAngle) < 120;
  const isGalaxy = o.type === "galaxy" || o.type === "galaxy_group";
  // Visual magnitude: a galaxy's blue one is ~0.8 brighter in V (its typical colour).
  const vmag = o.mag !== undefined && o.magB && isGalaxy ? o.mag - 0.8 : o.mag;

  if (o.type === "double_star" && o.wide) {
    // Rate the close pair and the famous wide one (Alcor, ε²) alike, and keep the easier: the eye and
    // binoculars split the wide pair long before a telescope splits the close one.
    const close = detectability({ ...o, wide: undefined }, input);
    // A telescope that splits the close pair is rated on it: that's the sight (the Double Double's four stars).
    if (kind === "telescope" && close.index > -2.5) return close;
    const wide = detectability({ type: "double_star", sep: o.wide[0], mag: Math.min(o.wide[1], o.wide[2]), mag2: Math.max(o.wide[1], o.wide[2]) }, input);
    if (close.index >= wide.index) return close;
    return { ...wide, note: `The wide pair splits${close.index < -2.5 ? "; the close pair needs a telescope" : ""}` };
  }

  if (o.type === "double_star") {
    const res = resolutionArcsec(input);
    const faint = Math.max(o.mag ?? 0, o.mag2 ?? o.mag ?? 0);
    let index = (lm - 1.5 - (faint - extinction)) / 2; // brightness margin
    let note = "";
    if (o.sep !== undefined) {
      const ratio = o.sep / res;
      const who = eye ? "eyes'" : kind === "binoculars" ? "binoculars'" : "scope's";
      if (ratio < 1) {
        index = Math.min(index, -3);
        note = `Separation ${o.sep}″ is below your ${who} ${res < 10 ? res.toFixed(1) : Math.round(res)}″ resolution limit`;
      } else if (ratio < 1.6) {
        index = Math.min(index, -1);
        note = kind === "telescope" ? "Close pair: needs steady seeing and high power" : "Close pair: only just split, in steady air";
      } else if (o.sep < 3) {
        index = Math.min(index, 0);
        note = "Needs high magnification to split";
      } else if (eye && ratio < 2.5) {
        // ε Lyrae's 3½′: the classic test of keen eyesight.
        index = Math.min(index, 0);
        note = "A test of keen eyesight";
      } else note = kind === "telescope" ? "Splits easily at moderate power" : "Splits easily";
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
    const a = o.size?.[0] ?? 10;
    const b = o.size?.[1] ?? a;
    // Seen as member stars — the brightest few are ~1.3 (Pleiades) to ~3 mag fainter than the total…
    const brightest = mag + clamp(1 + 0.5 * (mag - 1), 1.2, 3);
    const stars = (lm - brightest - 1.12) / 1.302 + (skySB - 19.5) * 0.216;
    // …or as a glow of unresolved light.
    const glow = patchMargin(areaSB(mag, a, b), Math.sqrt(a * b), skySB, input) + K_EXT - 0.5;
    const index = Math.max(stars, glow) + (eye ? EYE_BONUS : 0) + scopeGain(input);
    const note = index > 0.5 ? (eye ? "Rich and bright" : "Rich and bright in your scope") : index > -0.5 ? "Visible, best under darker skies" : "Faint members get lost in the sky glow";
    return { difficulty: classify(index), index, skySB, limitingMag: lm, note };
  }

  if (o.type === "cluster_nebula" && o.magOf === "cluster") {
    // The cluster is seen even when the nebula isn't: rate both and keep the easier.
    const asCluster = detectability({ ...o, type: "open_cluster", magOf: undefined }, input);
    const asNebula = detectability({ ...o, magOf: "star" }, input);
    return asCluster.index >= asNebula.index ? { ...asCluster, note: asNebula.index < -0.5 ? "The cluster shows; the nebula needs dark skies or a UHC/OIII filter" : asCluster.note } : asNebula;
  }

  if (ext) {
    const a = o.size?.[0] ?? 5;
    const b = o.size?.[1] ?? a;
    const nebula = o.type === "emission_nebula" || o.type === "reflection_nebula" || o.type === "cluster_nebula" || o.type === "supernova_remnant";
    const wellKnown = Boolean(o.m || o.showpiece);
    let size = Math.sqrt(a * b);
    let sb: number | null;
    if (isGalaxy) {
      // The visible part is roughly the inner half of the catalog (D25) extent and holds ~3/4 of the light.
      size *= 0.545;
      if (vmag !== undefined) sb = areaSB(vmag + 0.31, size, size);
      else if (o.sb !== undefined && o.sb !== null) sb = o.sb + 8.89 - 0.85 - 0.8; // B-band D25 mean → V, inner region
      else sb = null;
    } else sb = surfaceBrightnessArcsec(o);
    if (sb === null) {
      const index = (lm - (vmag ?? 10) - 2) / 2;
      return { difficulty: classify(index), index, skySB, limitingMag: lm, note: "" };
    }
    let structure = 0;
    if (isGalaxy && lateType(o.hubble)) structure -= 0.11; // light spread in arms
    if (isGalaxy && b / a < 0.3) structure += 0.3; // edge-on disks concentrate their light
    // Catalog magnitudes of reflection nebulae and cluster+nebula complexes often describe the star or cluster,
    // not the nebulosity (flagged as `magOf`): treat the nebula as ~2 mag fainter.
    if (o.magOf || ((o.type === "reflection_nebula" || o.type === "cluster_nebula") && !o.m)) sb += 2.0;
    const giantNebula = (o.type === "emission_nebula" || o.type === "supernova_remnant") && a > 60 && !o.m;
    if (giantNebula && o.mag !== undefined && b / a >= 0.3) {
      // Catalog minor axes of big nebular complexes are unreliable; treat them as roughly round. (Not the long,
      // thin arcs — the Veil's — whose narrow width is real.)
      sb = areaSB(o.mag, a, a);
      size = a;
    }
    if (o.type === "supernova_remnant" && a > 30 && b / a >= 0.3) sb -= 2.0; // bounding box of thin filaments
    if (nebula && !wellKnown) structure -= 0.5; // lesser-known nebulae: catalog brightness tends to be optimistic
    if (o.type === "emission_nebula" || o.type === "cluster_nebula") sb -= 0.82; // emission concentrates in bright regions
    // Giant, diffuse emission: little contrast without a filter. (A remnant's filaments are already modelled above.)
    if (giantNebula && o.type === "emission_nebula") structure -= 1.2;
    if (o.type === "planetary_nebula") structure += 0.39; // crisp edges, often high contrast
    sb -= extinction;

    const parts = [patchMargin(sb, size, skySB, input)];
    // A galaxy's bright inner region, ~1/6 of its catalog extent (for the Magellanic Clouds, a bar degrees long).
    if (isGalaxy) parts.push(patchMargin(sb - galaxyCoreGain(o.hubble), clamp(Math.sqrt(a * b) * 0.171, 0.5, 120), skySB, input));
    if (o.type === "globular_cluster" && o.mag !== undefined) {
      // Half the light sits in the inner ~30% of the diameter (independent of how far out the catalog size reaches).
      const dc = clamp(size * 0.285, 1.5, 8);
      parts.push(patchMargin(areaSB(o.mag + 0.75, dc, dc) + 0.4 - extinction, dc, skySB, input));
    }
    if (o.type === "emission_nebula" || o.type === "cluster_nebula") parts.push(patchMargin(sb - 1.2, size * 0.088, skySB, input));
    const region = o.m ? BRIGHT_REGION[o.m] : undefined;
    if (region) parts.push(patchMargin(region[0] - extinction, region[1], skySB, input));
    let index = Math.max(...parts) + K_EXT + structure;
    // The eye and binoculars show small objects as stars: detectable, but not recognisable as what they are.
    if (kind !== "telescope" && o.type !== "globular_cluster") {
      const apparent = Math.sqrt(a * b) * (eye ? 1 : binocularPower(input));
      if (apparent < 15) index -= ((15 - apparent) / 15) * 3;
    }
    index += (eye ? EYE_BONUS : 0) + scopeGain(input);
    if (o.type === "dark_nebula") index -= 1.2;
    if ((vmag ?? 0) - extinction > lm + 1) index = Math.min(index, -3);
    const filterNote =
      o.type === "emission_nebula" || o.type === "supernova_remnant" || o.type === "planetary_nebula" || o.type === "cluster_nebula"
        ? " A UHC/OIII filter helps a lot."
        : "";
    const remedy = moonUp ? "a darker site or a moonless night" : "a darker site";
    const note =
      index >= 0.5
        ? "Stands out clearly against this sky"
        : index >= -0.5
          ? "Visible; better with averted vision"
          : index >= -1.5
            ? "Low contrast: needs dark adaptation and averted vision." + filterNote
            : `Contrast is too low for this sky — try ${remedy}.` + filterNote;
    return { difficulty: classify(index), index, skySB, limitingMag: lm, note: note.trim() };
  }

  // Point sources (stars, planets): the margin over the limiting magnitude, after extinction. Fainter than
  // the limit is out of reach, whatever the margin formula says.
  const m = (vmag ?? 8) - extinction;
  let index = (lm - m - 2) / 2;
  if (m > lm + 0.3) index = Math.min(index, -3);
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
