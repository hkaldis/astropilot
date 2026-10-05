/**
 * "What should I look at tonight?" — rank catalog objects for a site, night, sky and telescope.
 */
import { clamp, DEG, HOUR_MS, Site, Vec3, eqjVector } from "./core";
import type { NightInfo } from "./night";
import {
  NightFrames,
  ObjectTrack,
  DetectInput,
  DetectResult,
  InstrumentKind,
  objectTrack,
  detectability,
  altitudeQuality,
  difficultyScore,
  instrumentOf,
  TargetLike,
} from "./visibility";

const angleBetween = (a: Vec3, b: Vec3) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) / DEG;

export interface CatalogLike extends TargetLike {
  id: string;
  name: string;
  ra: number;
  dec: number;
  con?: string;
  showpiece?: boolean;
  m?: number;
  c?: number;
}

export interface SkyContext {
  sqm: number; // zenith sky brightness
  apertureMm: number; // 7 = naked eye
  minAlt?: number; // default 20°
  /** The instrument (else guessed from the aperture) and, for binoculars, their magnification. */
  instrument?: InstrumentKind;
  power?: number | null;
}

export interface RankedTarget<T extends CatalogLike = CatalogLike> {
  object: T;
  score: number; // 0..100 (display)
  rawScore: number; // unclamped, for ordering
  track: ObjectTrack;
  detect: DetectResult;
  bestTime: number | null;
  /** Short human summary, e.g. "Best 23:40 · 68° high · moderate". */
  reasons: string[];
}

/** How rewarding an object is to look at, independent of tonight (showpieces first, plain clusters last). */
export function interestOf(o: CatalogLike): number {
  let f = 1;
  if (o.showpiece) f *= 1.3;
  else if (o.m || o.c) f *= 1.08;
  if (!o.showpiece && (o.type === "open_cluster" || o.type === "asterism" || o.type === "star_cloud")) f *= 0.8;
  if (o.type === "galaxy_group") f *= 0.9;
  return f;
}

/** Sky geometry for an object at sample `i` of the night. */
function sampleInput(v: Vec3, track: ObjectTrack, nf: NightFrames, i: number, ctx: SkyContext): DetectInput {
  const m = nf.moon[i];
  return {
    sqmZenith: ctx.sqm,
    apertureMm: ctx.apertureMm,
    instrument: ctx.instrument,
    power: ctx.power,
    alt: Math.max(track.points[i].alt, 1),
    moon: m ? { alt: m.alt, phaseAngle: nf.moonPhaseAngle, separation: angleBetween(v, eqjVector(m.ra, m.dec)) } : null,
    sunAlt: nf.sunAlt[i],
  };
}

export function evaluateTarget<T extends CatalogLike>(o: T, nf: NightFrames, ctx: SkyContext): RankedTarget<T> {
  const minAlt = ctx.minAlt ?? 20;
  const track = objectTrack(o.ra, o.dec, nf, minAlt);
  const v = eqjVector(o.ra, o.dec);
  // The best moment is the highest one, unless twilight brightens the sky then (short summer nights):
  // weigh altitude against sky darkness over the observable stretch.
  let idx = track.maxIdx;
  let input = idx >= 0 ? sampleInput(v, track, nf, idx, ctx) : null;
  let detect = input ? detectability(o, input) : detectability(o, { sqmZenith: ctx.sqm, apertureMm: ctx.apertureMm, instrument: ctx.instrument, power: ctx.power, alt: 1, moon: null, sunAlt: 0 });
  if (idx >= 0 && nf.sunAlt[idx] > -18 && track.window) {
    const merit = (alt: number, d: DetectResult) => Math.pow(altitudeQuality(alt), 0.6) * (0.12 + 0.88 * difficultyScore(d));
    let best = merit(track.points[idx].alt, detect);
    for (let i = 0; i < track.points.length; i += 2) {
      const p = track.points[i];
      if (p.t < track.window[0] || p.t > track.window[1] || i === idx) continue;
      const inp = sampleInput(v, track, nf, i, ctx);
      const d = detectability(o, inp);
      const m = merit(p.alt, d);
      if (m > best) {
        best = m;
        idx = i;
        input = inp;
        detect = d;
      }
    }
  }
  const alt = idx >= 0 ? track.points[idx].alt : track.maxAlt;
  const altQ = altitudeQuality(alt);
  const dur = clamp(track.hoursAboveMin / 3, 0, 1);
  const det = difficultyScore(detect);
  let raw = 100 * Math.pow(altQ, 0.6) * (0.12 + 0.88 * det) * (0.6 + 0.4 * dur) * interestOf(o);
  if (alt < minAlt) raw *= 0.25;
  // Naked eye and binoculars (~1–10×): tiny objects look like stars and close pairs don't split.
  const kind = instrumentOf(ctx);
  if (kind !== "telescope") {
    const eye = kind === "eye";
    if (o.type === "double_star") {
      if ((o.sep ?? 0) < (eye ? 240 : 30)) raw *= 0.2;
    } else if ((o.size?.[0] ?? 0) < (eye ? 30 : 4)) raw *= 0.35;
  }
  const reasons: string[] = [];
  if (track.maxAltTime) reasons.push(`peaks at ${Math.round(track.maxAlt)}°`);
  if (track.hoursAboveMin > 0) reasons.push(`${track.hoursAboveMin.toFixed(1)} h above ${minAlt}°`);
  if (detect.note) reasons.push(detect.note);
  const bestTime = idx < 0 ? null : idx === track.maxIdx ? track.maxAltTime : track.points[idx].t;
  return { object: o, score: Math.round(Math.min(100, raw * 0.85)), rawScore: raw, track, detect, bestTime, reasons };
}

export interface RankOptions {
  limit?: number;
  /** Cap per object type to keep the list varied. */
  perTypeCap?: number;
  types?: string[];
  excludeIds?: Set<string>;
}

export function rankTargets<T extends CatalogLike>(objects: T[], nf: NightFrames, ctx: SkyContext, opts: RankOptions = {}): RankedTarget<T>[] {
  const pool = objects.filter((o) => (!opts.types || opts.types.includes(o.type)) && !opts.excludeIds?.has(o.id));
  const ranked = pool.map((o) => evaluateTarget(o, nf, ctx)).filter((r) => r.score > 0);
  ranked.sort((a, b) => b.rawScore - a.rawScore);
  if (!opts.perTypeCap && !opts.limit) return ranked;
  const caps: Record<string, number> = {};
  const out: RankedTarget<T>[] = [];
  for (const r of ranked) {
    const k = r.object.type;
    if (opts.perTypeCap && (caps[k] ?? 0) >= opts.perTypeCap) continue;
    caps[k] = (caps[k] ?? 0) + 1;
    out.push(r);
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

/**
 * Order targets into an observing run: each is placed as close to its best (highest) moment as the
 * schedule allows, never outside its observable window, with `minutesPerTarget` at the eyepiece.
 * A first pass walks forward in time; anything that found no room is then fitted into the nearest
 * free gap of its window (so two targets competing for the last slot before dawn both get one).
 */
export function planSequence<T extends CatalogLike>(
  targets: RankedTarget<T>[],
  night: NightInfo,
  minutesPerTarget = 20,
  bounds?: { start?: number | null; end?: number | null },
) {
  const start = bounds?.start ?? night.darkStart ?? night.sunset ?? night.noon;
  const end = bounds?.end ?? night.darkEnd ?? night.sunrise ?? night.nextNoon;
  const dur = minutesPerTarget * 60_000;
  const items = targets
    .filter((t) => t.track.window)
    .map((t) => {
      const [w0, w1] = t.track.window!;
      const lo = Math.max(w0, start);
      const hi = Math.min(w1, end) - dur;
      const best = Math.min(Math.max((t.bestTime ?? lo) - dur / 2, lo), hi);
      return { t, lo, hi, best };
    })
    .filter((x) => x.hi >= x.lo)
    .sort((a, b) => a.best - b.best || a.hi - b.hi);
  const slots: { target: RankedTarget<T>; at: number }[] = [];
  const left: typeof items = [];
  let cursor = start;
  for (const it of items) {
    const at = Math.max(cursor, it.best);
    if (at > it.hi) {
      left.push(it); // no room after the previous target; try a gap below
      continue;
    }
    slots.push({ target: it.t, at });
    cursor = at + dur;
  }
  for (const it of left) {
    // Free intervals between booked slots, clipped to this target's window.
    const booked = slots.map((s) => [s.at, s.at + dur] as const).sort((a, b) => a[0] - b[0]);
    let best: number | null = null;
    let prevEnd = start;
    for (const [a, b] of [...booked, [end + dur, end + dur] as const]) {
      const g0 = Math.max(prevEnd, it.lo);
      const g1 = Math.min(a - dur, it.hi);
      if (g1 >= g0) {
        const at = Math.min(Math.max(it.best, g0), g1);
        if (best === null || Math.abs(at - it.best) < Math.abs(best - it.best)) best = at;
      }
      prevEnd = Math.max(prevEnd, b);
    }
    if (best !== null) slots.push({ target: it.t, at: best });
  }
  return slots.sort((a, b) => a.at - b.at);
}

export function hoursBetween(a: number, b: number) {
  return (b - a) / HOUR_MS;
}

export type { Site };
