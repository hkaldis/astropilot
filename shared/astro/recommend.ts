/**
 * "What should I look at tonight?" — rank catalog objects for a site, night, sky and telescope.
 */
import { clamp, HOUR_MS, Site } from "./core";
import type { NightInfo } from "./night";
import {
  NightFrames,
  ObjectTrack,
  DetectResult,
  objectTrack,
  detectability,
  altitudeQuality,
  difficultyScore,
  TargetLike,
} from "./visibility";

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

export function evaluateTarget<T extends CatalogLike>(o: T, nf: NightFrames, ctx: SkyContext): RankedTarget<T> {
  const minAlt = ctx.minAlt ?? 20;
  const track = objectTrack(o.ra, o.dec, nf, minAlt);
  const alt = track.maxAlt;
  const moon =
    track.moonAltAtBest !== null && track.moonSepAtBest !== null
      ? { alt: track.moonAltAtBest, phaseAngle: nf.moonPhaseAngle, separation: track.moonSepAtBest }
      : null;
  const detect = detectability(o, { sqmZenith: ctx.sqm, apertureMm: ctx.apertureMm, alt: Math.max(alt, 1), moon });
  const altQ = altitudeQuality(alt);
  const dur = clamp(track.hoursAboveMin / 3, 0, 1);
  const det = difficultyScore(detect);
  let raw = 100 * Math.pow(altQ, 0.6) * (0.12 + 0.88 * det) * (0.6 + 0.4 * dur) * interestOf(o);
  if (alt < minAlt) raw *= 0.25;
  // Naked eye and binoculars (~1–10×): tiny objects look like stars and close pairs don't split.
  if (ctx.apertureMm < 60) {
    const eye = ctx.apertureMm < 10;
    if (o.type === "double_star") {
      if ((o.sep ?? 0) < (eye ? 240 : 30)) raw *= 0.2;
    } else if ((o.size?.[0] ?? 0) < (eye ? 30 : 4)) raw *= 0.35;
  }
  const reasons: string[] = [];
  if (track.maxAltTime) reasons.push(`peaks at ${Math.round(alt)}°`);
  if (track.hoursAboveMin > 0) reasons.push(`${track.hoursAboveMin.toFixed(1)} h above ${minAlt}°`);
  if (detect.note) reasons.push(detect.note);
  return { object: o, score: Math.round(Math.min(100, raw * 0.85)), rawScore: raw, track, detect, bestTime: track.maxAltTime, reasons };
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
 */
export function planSequence<T extends CatalogLike>(targets: RankedTarget<T>[], night: NightInfo, minutesPerTarget = 20) {
  const start = night.darkStart ?? night.sunset ?? night.noon;
  const end = night.darkEnd ?? night.sunrise ?? night.nextNoon;
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
  let cursor = start;
  for (const it of items) {
    const at = Math.max(cursor, it.best);
    if (at > it.hi) continue; // no room left before it sets
    slots.push({ target: it.t, at });
    cursor = at + dur;
  }
  return slots;
}

export function hoursBetween(a: number, b: number) {
  return (b - a) / HOUR_MS;
}

export type { Site };
