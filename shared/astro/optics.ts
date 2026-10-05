/**
 * Telescope optics and "what eyepiece should I use for this object?".
 * Plain textbook optics; recommendations follow established visual-observing practice
 * (exit-pupil targets per object class, framing, seeing- and aperture-limited power).
 */
import { clamp } from "./core";
import { telescopeLimitingMag, type TargetLike } from "./visibility";

export interface ScopeSpec {
  aperture: number; // mm
  focalLength: number; // mm
  obstruction?: number | null; // % of aperture diameter
}

export interface EyepieceSpec {
  id?: number;
  name?: string;
  focalLength: number; // mm
  afov?: number | null; // apparent field, degrees
}

export interface BarlowSpec {
  id?: number;
  name?: string;
  factor: number;
}

export interface OpticalSetup {
  magnification: number;
  exitPupil: number; // mm
  trueField: number; // degrees
  effectiveFocalLength: number;
  fRatio: number;
}

export const DEFAULT_AFOV = 52;

export function fRatio(s: ScopeSpec): number {
  return s.focalLength / s.aperture;
}

export function setup(s: ScopeSpec, e: EyepieceSpec, b?: BarlowSpec | null, reducer = 1): OpticalSetup {
  const efl = s.focalLength * (b?.factor ?? 1) * reducer;
  const mag = efl / e.focalLength;
  return {
    magnification: mag,
    exitPupil: s.aperture / mag,
    trueField: (e.afov ?? DEFAULT_AFOV) / mag,
    effectiveFocalLength: efl,
    fRatio: efl / s.aperture,
  };
}

export interface ScopeLimits {
  minUsefulMag: number; // 7 mm exit pupil
  maxUsefulMag: number; // ~2× aperture in mm, capped by typical seeing
  maxTheoreticalMag: number;
  dawes: number; // arcsec
  rayleigh: number; // arcsec
  lightGrasp: number; // × the dark-adapted eye (7 mm)
  limitingMag: number; // under a dark sky (NELM 6.5)
  fRatio: number;
}

export function scopeLimits(s: ScopeSpec): ScopeLimits {
  const D = s.aperture;
  return {
    minUsefulMag: D / 7,
    maxTheoreticalMag: 2 * D,
    maxUsefulMag: Math.min(2 * D, 350),
    dawes: 116 / D,
    rayleigh: 138 / D,
    lightGrasp: (D / 7) ** 2,
    limitingMag: telescopeLimitingMag(6.5, D),
    fRatio: s.focalLength / D,
  };
}

/** Camera field of view (degrees) and image scale for a sensor on this scope. */
export function cameraField(focalLength: number, sensorWmm: number, sensorHmm: number, pixelUm?: number) {
  const w = (2 * Math.atan(sensorWmm / (2 * focalLength)) * 180) / Math.PI;
  const h = (2 * Math.atan(sensorHmm / (2 * focalLength)) * 180) / Math.PI;
  return { widthDeg: w, heightDeg: h, scale: pixelUm ? (206.265 * pixelUm) / focalLength : undefined };
}

// ------------------------------------------------------------------------------------
// Eyepiece recommendation
// ------------------------------------------------------------------------------------

export type ViewKind =
  | "planet"
  | "moon"
  | "double"
  | "globular"
  | "planetary_small"
  | "planetary_large"
  | "galaxy_small"
  | "galaxy"
  | "galaxy_large"
  | "nebula"
  | "nebula_large"
  | "open_cluster"
  | "satellite"
  | "wide";

export function viewKind(o: TargetLike & { id?: string }): ViewKind {
  const size = o.size?.[0] ?? 0;
  switch (o.type) {
    case "planet":
      return "planet";
    case "moon":
      return "moon";
    case "satellite":
      return "satellite";
    case "double_star":
      return "double";
    case "globular_cluster":
      return "globular";
    case "planetary_nebula":
      return size && size > 2 ? "planetary_large" : "planetary_small";
    case "galaxy":
    case "galaxy_group":
      return size >= 40 ? "galaxy_large" : size >= 6 ? "galaxy" : "galaxy_small";
    case "emission_nebula":
    case "reflection_nebula":
    case "dark_nebula":
    case "supernova_remnant":
    case "cluster_nebula":
      return size >= 45 ? "nebula_large" : "nebula";
    case "open_cluster":
      return size >= 60 ? "wide" : "open_cluster";
    default:
      return "wide";
  }
}

/** Target exit pupil (mm) range and ideal for each kind of view. */
const PUPIL: Record<ViewKind, { min: number; ideal: number; max: number; why: string }> = {
  planet: { min: 0.5, ideal: 0.8, max: 1.3, why: "high power for fine planetary detail" },
  moon: { min: 0.6, ideal: 1.2, max: 3, why: "crisp terminator detail" },
  double: { min: 0.5, ideal: 1, max: 2, why: "enough power to separate the pair" },
  globular: { min: 0.8, ideal: 1.3, max: 2.2, why: "high power resolves the cluster into stars" },
  planetary_small: { min: 0.6, ideal: 1, max: 1.8, why: "magnify the tiny disk above the star field" },
  planetary_large: { min: 1.5, ideal: 2.5, max: 4, why: "a medium exit pupil keeps this large planetary bright" },
  galaxy_small: { min: 1.2, ideal: 2, max: 3, why: "moderate power darkens the background around a compact galaxy" },
  galaxy: { min: 1.8, ideal: 3, max: 4.5, why: "medium power balances contrast and brightness" },
  galaxy_large: { min: 3.5, ideal: 5, max: 7, why: "low power to fit the whole galaxy" },
  nebula: { min: 2.5, ideal: 4, max: 6, why: "a large exit pupil keeps faint nebulosity bright (ideal with a filter)" },
  nebula_large: { min: 4, ideal: 5.5, max: 7, why: "the widest, brightest view for a sprawling nebula" },
  open_cluster: { min: 1.5, ideal: 2.5, max: 4.5, why: "frame the cluster with dark sky around it" },
  satellite: { min: 0.7, ideal: 1.3, max: 2.5, why: "medium-high power darkens the sky around the moon while keeping it in the field with its planet" },
  wide: { min: 4, ideal: 5.5, max: 7, why: "the widest field available" },
};

export interface EyepieceChoice {
  eyepiece: EyepieceSpec;
  barlow: BarlowSpec | null;
  setup: OpticalSetup;
  score: number; // 0..100
  verdict: "ideal" | "good" | "usable" | "poor";
  reasons: string[];
}

export interface RecommendOptions {
  /** Approximate seeing-limited ceiling on magnification. Default: 250×. */
  seeingLimit?: number;
  /** Apparent size in arcminutes for objects without catalog size (planets: diameter/60). */
  sizeArcmin?: number;
}

function gaussLog(x: number, ideal: number, width: number) {
  const d = Math.log(x / ideal) / Math.log(width);
  return Math.exp(-d * d);
}

/** A zoom eyepiece's focal-length range, read from its name ("8–24 mm zoom"); null for fixed eyepieces. */
function zoomOf(e: EyepieceSpec): [number, number] | null {
  if (!e.name || !/zoom/i.test(e.name)) return null;
  const m = e.name.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*mm/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(",", "."));
  const b = parseFloat(m[2].replace(",", "."));
  return a > 0 && b > a && b <= 60 ? [a, b] : null;
}

/**
 * Zooms are stored at their short end; offer the whole range as click stops (the apparent field narrows
 * towards the long end, e.g. 60° at 8 mm to ~40° at 24 mm).
 */
/**
 * A zoom eyepiece's apparent field at focal length `f`: the stated field is the short end's, and it narrows
 * towards the long end (an 8–24 mm at 60° is about 40° at 24 mm).
 */
export function zoomApparentField(afov: number | null | undefined, shortF: number, f: number): number {
  return (afov ?? DEFAULT_AFOV) * Math.pow(shortF / f, 0.37);
}

function expandZooms(eyepieces: EyepieceSpec[]): EyepieceSpec[] {
  const out: EyepieceSpec[] = [];
  for (const e of eyepieces) {
    if (!(e.focalLength > 0)) continue; // legacy rows without a focal length
    const z = zoomOf(e);
    if (!z) {
      out.push(e);
      continue;
    }
    const steps = 5;
    for (let k = 0; k < steps; k++) {
      const f = Math.round(z[0] * Math.pow(z[1] / z[0], k / (steps - 1)) * 2) / 2;
      out.push({ ...e, focalLength: f, afov: zoomApparentField(e.afov, z[0], f) });
    }
  }
  return out;
}

export function rankEyepieces(
  scope: ScopeSpec,
  eyepieces: EyepieceSpec[],
  barlows: BarlowSpec[],
  target: TargetLike & { id?: string },
  opts: RecommendOptions = {},
): EyepieceChoice[] {
  if (!eyepieces.some((e) => e.focalLength > 0)) return [];
  const kind = viewKind(target);
  const rule = PUPIL[kind];
  const lim = scopeLimits(scope);
  const seeingCap = Math.min(lim.maxUsefulMag, opts.seeingLimit ?? 250);
  const size = opts.sizeArcmin ?? target.size?.[0] ?? 0; // arcmin
  // Score against the same ideal power the page quotes (exit-pupil target, capped so the object fits).
  const idealMag = idealMagnification(scope, target, opts).magnification;
  const width = Math.max(rule.max / rule.ideal, rule.ideal / rule.min) * 1.15;
  const combos: { e: EyepieceSpec; b: BarlowSpec | null }[] = [];
  for (const e of expandZooms(eyepieces)) {
    combos.push({ e, b: null });
    // A 1× "Barlow" (a coma corrector, say) changes nothing: it would only repeat the eyepiece alone.
    for (const b of barlows) if (Math.abs(b.factor - 1) > 0.02) combos.push({ e, b });
  }

  const setups = combos.map(({ e, b }) => ({ e, b, s: setup(scope, e, b) }));
  const widestField = Math.max(...setups.map((x) => x.s.trueField)) * 60; // arcmin
  // Doubles: wide pairs look best at low-medium power (colour, context); close pairs need high power.
  const doubleIdealMag = kind === "double" && target.sep ? clamp(800 / Math.pow(target.sep, 0.9), lim.minUsefulMag, seeingCap) : null;

  const results = setups.map(({ e, b, s }) => {
    const reasons: string[] = [];
    let score =
      doubleIdealMag !== null
        ? 100 * gaussLog(s.magnification, doubleIdealMag, 2.2)
        : 100 * gaussLog(s.magnification, idealMag, width);

    // Framing: extended objects should fit with some margin.
    if (size > 0 && kind !== "planet" && kind !== "double") {
      const fieldArcmin = s.trueField * 60;
      const fill = size / fieldArcmin;
      if (fill > 1.05) {
        if (size > widestField * 1.05) {
          // Nothing you own frames it: judge against your widest view instead.
          score *= clamp(Math.pow(fieldArcmin / widestField, 1.5), 0.15, 1);
          if (fieldArcmin >= widestField * 0.98) reasons.push(`the ${size.toFixed(0)}′ object is wider than your widest field (${fieldArcmin.toFixed(0)}′) — you'll see the bright core`);
        } else {
          score *= clamp(1 / (fill * fill), 0.15, 1);
          reasons.push(`field ${fieldArcmin.toFixed(0)}′ is smaller than the ${size.toFixed(0)}′ object`);
        }
      } else if (fill < 0.04 && kind !== "galaxy_small" && kind !== "planetary_small" && kind !== "globular") {
        score *= 0.85;
      }
    }

    if (kind === "moon") {
      if (s.trueField >= 0.6) reasons.push("whole lunar disk in view");
      else reasons.push("close-up of craters and the terminator");
    }

    // Doubles: magnification must split the pair comfortably (~240″ / separation).
    if (kind === "double" && target.sep) {
      const need = 240 / target.sep;
      if (s.magnification < need * 0.7) {
        score *= 0.35;
        reasons.push(`${Math.round(need)}× or more needed to split ${target.sep}″`);
      } else if (s.magnification >= need) {
        reasons.push(`splits the ${target.sep}″ pair cleanly`);
      }
    }

    if (s.magnification > seeingCap * 1.05) {
      score *= s.magnification > lim.maxTheoreticalMag ? 0.15 : 0.55;
      reasons.push(`${Math.round(s.magnification)}× is above what the scope or typical seeing supports`);
    }
    if (s.exitPupil > 7.2) {
      score *= 0.6;
      reasons.push("exit pupil wider than a dark-adapted eye — wastes light");
    }
    if (b) score *= 0.97; // slight preference for fewer glass surfaces
    return { eyepiece: e, barlow: b, setup: s, score, reasons };
  });

  results.sort((a, b) => b.score - a.score);
  return results.map((r, i) => {
    const verdict: EyepieceChoice["verdict"] = r.score >= 75 ? "ideal" : r.score >= 50 ? "good" : r.score >= 28 ? "usable" : "poor";
    const lead = `${Math.round(r.setup.magnification)}×, ${r.setup.exitPupil.toFixed(1)} mm exit pupil, ${(r.setup.trueField * 60).toFixed(0)}′ field`;
    return {
      ...r,
      score: Math.round(r.score),
      verdict,
      reasons: i === 0 ? [lead + " — " + rule.why, ...r.reasons] : [lead, ...r.reasons],
    };
  });
}

/** The magnification you'd ideally like for this target, regardless of what you own. */
export function idealMagnification(scope: ScopeSpec, target: TargetLike & { id?: string }, opts: RecommendOptions = {}) {
  const kind = viewKind(target);
  const rule = PUPIL[kind];
  const lim = scopeLimits(scope);
  let mag = scope.aperture / rule.ideal;
  if (kind === "double" && target.sep) mag = 800 / Math.pow(target.sep, 0.9);
  const size = opts.sizeArcmin ?? target.size?.[0];
  if (size && kind !== "planet" && kind !== "double") {
    const maxForField = (DEFAULT_AFOV * 60) / (size * 1.3);
    mag = Math.min(mag, maxForField);
  }
  mag = clamp(mag, lim.minUsefulMag, Math.min(lim.maxUsefulMag, opts.seeingLimit ?? 250));
  return { magnification: mag, eyepieceFocalLength: scope.focalLength / mag, kind, why: rule.why };
}

// ------------------------------------------------------------------------------------
// Filters
// ------------------------------------------------------------------------------------

export type FilterKind = "uhc" | "oiii" | "h_beta" | "none" | "moon" | "color" | "lps";

export interface FilterAdvice {
  best: FilterKind;
  label: string;
  why: string;
  alsoGood?: FilterKind[];
  avoid?: FilterKind[];
}

const H_BETA_TARGETS = new Set(["IC434", "B33", "NGC1499", "IC5146", "C19", "IC1318"]);
const OIII_TARGETS = new Set(["NGC6960", "NGC6992", "NGC6995", "C33", "C34", "NGC7000", "C20", "IC443", "NGC2359", "NGC6888", "C27"]);
const NO_FILTER = new Set(["M1", "M78", "M45", "NGC1977"]);

export function filterAdvice(target: TargetLike & { id?: string; name?: string }): FilterAdvice {
  const id = (target.id ?? "").toUpperCase();
  if (H_BETA_TARGETS.has(id))
    return { best: "h_beta", label: "H-beta", why: "This nebula shines almost only in H-β light — the H-beta filter is the classic key to seeing it.", avoid: ["oiii"] };
  if (OIII_TARGETS.has(id))
    return { best: "oiii", label: "OIII", why: "Strong doubly-ionised oxygen emission: an OIII filter dramatically raises the contrast.", alsoGood: ["uhc"] };
  if (NO_FILTER.has(id))
    return { best: "none", label: "No filter", why: "Its light is mostly continuum or reflected starlight, which narrowband filters would dim.", avoid: ["oiii", "h_beta"] };
  switch (target.type) {
    case "planetary_nebula":
      return { best: "oiii", label: "OIII", why: "Planetaries glow strongly in OIII; a filter makes them pop out of the star field ('blinking').", alsoGood: ["uhc"] };
    case "supernova_remnant":
      return { best: "oiii", label: "OIII", why: "Remnant filaments emit strongly in OIII.", alsoGood: ["uhc"] };
    case "emission_nebula":
    case "cluster_nebula":
      return { best: "uhc", label: "UHC / narrowband", why: "A narrowband (UHC) filter passes the H-β and OIII lines and blocks sky glow.", alsoGood: ["oiii"] };
    case "dark_nebula":
      return { best: "none", label: "No filter", why: "Dark nebulae are seen against star fields — dark skies matter, filters don't help." };
    case "planet":
    case "moon":
      return target.type === "moon"
        ? { best: "moon", label: "Moon / ND filter (optional)", why: "Cuts glare near full Moon; not needed for crescents." }
        : { best: "color", label: "Colour filters (optional)", why: "Light blue (#80A) lifts Jupiter's belts and Mars' clouds; orange/red (#21/#23A) sharpens Mars' markings." };
    default:
      return {
        best: "none",
        label: "No filter",
        why: "Galaxies, clusters and reflection nebulae emit broadband light — narrowband filters only dim them.",
        avoid: ["uhc", "oiii", "h_beta"],
      };
  }
}
