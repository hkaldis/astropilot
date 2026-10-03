/**
 * Eyepiece-kit analysis: which magnifications a kit gives on a telescope, which of the
 * classic exit-pupil "sweet spots" it covers, and what to add to fill a gap.
 *
 *   exit pupil = aperture / magnification,  magnification = focal length × Barlow / eyepiece
 *   Sweet spots (visual practice): low 4–6 mm, medium 2–3 mm, high 0.7–1.2 mm.
 *   Useful range: aperture/7 (7 mm pupil) to 2 × aperture in mm, capped by typical seeing.
 */
import { scopeLimits, setup, type BarlowSpec, type EyepieceSpec, type ScopeSpec } from "@shared/astro/optics";
import { STANDARD_EYEPIECE_FOCALS, zoomRange } from "@shared/data/gear-presets";
import { fmtFRatio, fmtFocal, fmtMag, fmtPupil, fmtFactor } from "./format";

export type BandId = "low" | "medium" | "high";

export interface Band {
  id: BandId;
  label: string;
  short: string;
  pupil: [number, number]; // exit pupil range, mm
  purpose: string;
}

export const BANDS: Band[] = [
  { id: "low", label: "Low power", short: "low", pupil: [4, 6], purpose: "sweeping star fields, big clusters and large nebulae" },
  { id: "medium", label: "Medium power", short: "medium", pupil: [2, 3], purpose: "galaxies, globular clusters and most deep-sky objects" },
  { id: "high", label: "High power", short: "high", pupil: [0.7, 1.2], purpose: "the Moon, planets and close double stars" },
];

/** One magnification your kit gives (an eyepiece, optionally with a Barlow/reducer; zooms span a range). */
export interface KitPoint {
  key: string;
  eyepieceId: number | null;
  focal: number; // eyepiece focal length (zooms: short end)
  label: string; // "25 mm", "10 mm + 2×", "8–24 mm zoom"
  barlow: BarlowSpec | null;
  mag: number; // magnification (zooms: lowest)
  magHigh: number; // zooms: highest; otherwise = mag
  pupil: number; // at `mag`
  field: number; // true field (deg) at `mag`
  zoom: [number, number] | null;
}

export function kitPoints(scope: ScopeSpec, eyepieces: EyepieceSpec[], barlows: BarlowSpec[]): KitPoint[] {
  const out: KitPoint[] = [];
  const combos: (BarlowSpec | null)[] = [null, ...barlows.filter((b) => Math.abs(b.factor - 1) > 0.02)];
  for (const e of eyepieces) {
    const zoom = zoomRange(e.name ?? "");
    for (const b of combos) {
      const longFocal = zoom ? zoom[1] : e.focalLength;
      const lo = setup(scope, { ...e, focalLength: longFocal }, b);
      const hi = zoom ? setup(scope, { ...e, focalLength: zoom[0] }, b) : lo;
      const base = zoom ? `${zoom[0]}–${zoom[1]} mm zoom` : fmtFocal(e.focalLength);
      out.push({
        key: `${e.id ?? e.name ?? e.focalLength}-${b?.id ?? b?.name ?? "none"}`,
        eyepieceId: e.id ?? null,
        focal: e.focalLength,
        label: b ? `${base} + ${fmtFactor(b.factor)}` : base,
        barlow: b,
        mag: lo.magnification,
        magHigh: hi.magnification,
        pupil: lo.exitPupil,
        field: lo.trueField,
        zoom,
      });
    }
  }
  return out.sort((a, b) => a.mag - b.mag);
}

export interface BandStatus {
  band: Band;
  range: [number, number]; // magnification range inside the useful range
  seeingLimited: boolean; // the band was moved under the seeing cap
  coveredBy: KitPoint[];
  /** Not covered and no standard eyepiece can reach it (long-focus scopes at low power). */
  outOfReach: boolean;
  suggestion: string | null; // what to add when not covered, or why it can't be
  suggestedMag: number | null;
}

export interface KitAnalysis {
  minUseful: number;
  maxUseful: number;
  maxTheoretical: number;
  points: KitPoint[];
  bands: BandStatus[];
  missing: BandStatus[];
  headline: string;
  notes: string[];
}

function bandRange(scope: ScopeSpec, band: Band): { range: [number, number]; seeingLimited: boolean } {
  const lim = scopeLimits(scope);
  const D = scope.aperture;
  const lo = Math.max(D / band.pupil[1], lim.minUsefulMag);
  const hi = Math.min(D / band.pupil[0], lim.maxUsefulMag);
  if (hi > lo * 1.05) return { range: [lo, hi], seeingLimited: false };
  // Very large apertures: "high power" is whatever the seeing allows.
  return { range: [lim.maxUsefulMag * 0.7, lim.maxUsefulMag], seeingLimited: true };
}

const covers = (p: KitPoint, [lo, hi]: [number, number]) => p.magHigh >= lo * 0.95 && p.mag <= hi * 1.05;

/** Pick the standard eyepiece focal length whose magnification sits best inside `range`. */
function suggestEyepiece(scope: ScopeSpec, band: Band, range: [number, number]) {
  const ideal = Math.min(Math.max(scope.aperture / Math.sqrt(band.pupil[0] * band.pupil[1]), range[0]), range[1]);
  const fits = STANDARD_EYEPIECE_FOCALS.map((fe) => ({ fe, mag: scope.focalLength / fe })).filter((c) => c.mag >= range[0] * 0.98 && c.mag <= range[1] * 1.02);
  if (!fits.length) return null;
  return fits.reduce((best, c) => (Math.abs(Math.log(c.mag / ideal)) < Math.abs(Math.log(best.mag / ideal)) ? c : best));
}

/** A Barlow combination that reaches `range`, preferring eyepieces you own and a plain 2×. */
function suggestBarlow(scope: ScopeSpec, owned: EyepieceSpec[], band: Band, range: [number, number]) {
  const ideal = Math.min(Math.max(scope.aperture / Math.sqrt(band.pupil[0] * band.pupil[1]), range[0]), range[1]);
  const mine = owned.filter((e) => !zoomRange(e.name ?? "")).map((e) => e.focalLength);
  let best: { fe: number; factor: number; mag: number; owned: boolean; cost: number } | null = null;
  for (const [pool, isOwned] of [
    [mine, true],
    [STANDARD_EYEPIECE_FOCALS, false],
  ] as const)
    for (const fe of pool)
      for (const factor of [2, 2.5, 3]) {
        const mag = (scope.focalLength * factor) / fe;
        if (mag < range[0] * 0.98 || mag > range[1] * 1.02) continue;
        const cost = Math.abs(Math.log(mag / ideal)) + (factor === 2 ? 0 : 0.05) + (isOwned ? 0 : 0.3);
        if (!best || cost < best.cost) best = { fe, factor, mag, owned: isOwned, cost };
      }
  return best;
}

/** Order in which gaps matter most: high power (Moon, planets) is the most common hole in a kit. */
const GAP_PRIORITY: BandId[] = ["high", "low", "medium"];

export function analyseKit(
  scope: ScopeSpec & { type?: string | null },
  eyepieces: EyepieceSpec[],
  barlows: BarlowSpec[],
): KitAnalysis {
  const lim = scopeLimits(scope);
  const D = scope.aperture;
  const N = scope.focalLength / D;
  const points = kitPoints(scope, eyepieces, barlows);

  const bands: BandStatus[] = BANDS.map((band) => {
    const { range, seeingLimited } = bandRange(scope, band);
    const coveredBy = points.filter((p) => covers(p, range));
    let suggestion: string | null = null;
    let suggestedMag: number | null = null;
    let outOfReach = false;
    if (!coveredBy.length) {
      const ep = suggestEyepiece(scope, band, range);
      if (ep) {
        suggestedMag = ep.mag;
        suggestion = `a ${fmtFocal(ep.fe)} would give ${fmtMag(ep.mag)} (${fmtPupil(D / ep.mag)} exit pupil)`;
      } else if (scope.focalLength / STANDARD_EYEPIECE_FOCALS[STANDARD_EYEPIECE_FOCALS.length - 1] > range[1]) {
        // Even the longest eyepiece gives too much power: a long-focus (slow) telescope.
        const mag = scope.focalLength / 32;
        outOfReach = true;
        suggestedMag = mag;
        suggestion =
          `at ${fmtFRatio(N)}, even a 32 mm gives ${fmtMag(mag)} (${fmtPupil(D / mag)} exit pupil), the widest view 1.25″ eyepieces allow` +
          (scope.type === "sct" ? `; an f/6.3 reducer takes it down to ${fmtMag(mag * 0.63)}` : "");
      } else {
        const b = suggestBarlow(scope, eyepieces, band, range);
        if (b) {
          suggestedMag = b.mag;
          suggestion = `a ${fmtFactor(b.factor)} Barlow with ${b.owned ? "your" : "a"} ${fmtFocal(b.fe)} eyepiece would give ${fmtMag(b.mag)}`;
        }
      }
    }
    return { band, range, seeingLimited, coveredBy, outOfReach, suggestion, suggestedMag };
  });

  const missing = bands
    .filter((b) => !b.coveredBy.length)
    .sort((a, b) => Number(a.outOfReach) - Number(b.outOfReach) || GAP_PRIORITY.indexOf(a.band.id) - GAP_PRIORITY.indexOf(b.band.id));
  const notes: string[] = [];
  const singles = points.filter((p) => !p.barlow);

  for (const p of singles) {
    if (p.magHigh > lim.maxTheoreticalMag * 1.02)
      notes.push(`Your ${p.label} gives ${fmtMag(p.magHigh)} — beyond this telescope's ${fmtMag(lim.maxTheoreticalMag)} limit (2× the aperture in mm), so the view turns dim and soft.`);
    else if (p.magHigh > lim.maxUsefulMag * 1.02)
      notes.push(`Your ${p.label} gives ${fmtMag(p.magHigh)} — the atmosphere rarely allows more than about ${fmtMag(lim.maxUsefulMag)}; keep it for exceptionally steady nights.`);
    if (p.pupil > 7.2)
      notes.push(
        `Your ${p.label} gives a ${fmtPupil(p.pupil)} exit pupil — wider than a dark-adapted eye (about 7 mm), so some light is wasted` +
          (scope.type && scope.type !== "refractor" ? " and the secondary mirror's shadow can show." : "."),
      );
  }
  const sorted = [...singles].filter((p) => !p.zoom).sort((a, b) => a.mag - b.mag);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (b.mag / a.mag < 1.1 && a.eyepieceId !== b.eyepieceId)
      notes.push(`Your ${a.label} and ${b.label} give almost the same view (${fmtMag(a.mag)} and ${fmtMag(b.mag)}).`);
  }

  let headline: string;
  if (!eyepieces.length) {
    const picks = bands.map((b) => suggestEyepiece(scope, b.band, b.range)).filter((x): x is { fe: number; mag: number } => !!x);
    headline = picks.length
      ? `A good starter set for this telescope: ${picks.map((p) => `${fmtFocal(p.fe)} (${fmtMag(p.mag)})`).join(", ")}.`
      : "Add your eyepieces to see the magnifications they give.";
  } else if (!missing.length) {
    headline = "Your kit covers low, medium and high power — a well-balanced set.";
  } else {
    headline = gapSentence(missing[0]);
  }

  return { minUseful: lim.minUsefulMag, maxUseful: lim.maxUsefulMag, maxTheoretical: lim.maxTheoreticalMag, points, bands, missing, headline, notes };
}

/** "You're missing a high-power option: a 6 mm would give 200× (1.0 mm exit pupil)." */
export function gapSentence(b: BandStatus): string {
  if (b.outOfReach) return `${b.band.label} is out of reach: ${b.suggestion}.`;
  return b.suggestion ? `You're missing a ${b.band.short}-power option: ${b.suggestion}.` : `You're missing a ${b.band.short}-power option.`;
}

/** What an exit pupil is good for, in plain words (with a tone for out-of-range values). */
export function pupilUse(pupil: number, mag: number, maxUseful: number): { label: string; tone: "poor" | "fair" | null } {
  if (pupil > 7.2) return { label: "Wider than your pupil — wastes light", tone: "poor" };
  if (pupil < 0.5) return { label: "Empty magnification", tone: "poor" };
  if (mag > maxUseful * 1.02) return { label: "Beyond typical seeing", tone: "fair" };
  if (pupil < 0.7) return { label: "Very high · steady nights only", tone: "fair" };
  if (pupil <= 1.2) return { label: "High · Moon, planets, doubles", tone: null };
  if (pupil < 2) return { label: "Medium-high · globulars, small targets", tone: null };
  if (pupil <= 3) return { label: "Medium · galaxies, clusters", tone: null };
  if (pupil < 5) return { label: "Low · nebulae, big clusters", tone: null };
  return { label: "Lowest · widest star fields", tone: null };
}
