/** Resolve an object-page id to a catalog object or a solar-system body, and describe its night. */
import {
  PLANET_BY_ID,
  airmass,
  compassPoint,
  evaluateTarget,
  formatTime,
  skyBrightnessAt,
  type DetectResult,
  type ObjectTrack,
  type PlanetMeta,
  type SolarSystemId,
  type TrackPoint,
} from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import { matchRank, norm, searchKeys } from "@/features/explore/search";
import { evaluateBody, type BodyTonight, type NightContext } from "@/features/explore/sky";
import type { QualityKey } from "@/lib/objects";

export type Subject =
  | { kind: "deep"; id: string; name: string; type: string; obj: CatalogObject }
  | { kind: "body"; id: SolarSystemId; name: string; type: "planet" | "moon"; meta: PlanetMeta };

export type Resolution =
  | { status: "found"; subject: Subject }
  | { status: "redirect"; id: string }
  | { status: "missing"; suggestions: { id: string; name: string; type: string; hint?: string }[] };

export function resolveSubject(raw: string, objects: CatalogObject[], byId: Map<string, CatalogObject>): Resolution {
  const id = raw.trim();
  const lower = id.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PLANET_BY_ID, lower)) {
    const meta = PLANET_BY_ID[lower as SolarSystemId];
    return { status: "found", subject: { kind: "body", id: meta.id, name: meta.name, type: meta.id === "moon" ? "moon" : "planet", meta } };
  }
  const obj = byId.get(id.toUpperCase());
  if (obj) return { status: "found", subject: { kind: "deep", id: obj.id, name: obj.name, type: obj.type, obj } };

  // "NGC224", "M 31", "messier-31", "Ring Nebula" → canonical id.
  const q = norm(id);
  if (q) {
    const exact = objects.filter((o) => searchKeys(o).ids.includes(q) || searchKeys(o).names.includes(q));
    if (exact.length === 1) return { status: "redirect", id: exact[0].id };
  }
  // Typos usually sit at the end: back off one character at a time until something matches.
  let ranked: { id: string; name: string; type: string }[] = [];
  for (let n = q.length; n >= 3 && !ranked.length; n--) {
    const qq = q.slice(0, n);
    ranked = objects
      .map((o) => ({ o, r: matchRank(o, qq) }))
      .filter((x): x is { o: CatalogObject; r: number } => x.r !== null && x.r <= 4)
      .sort((a, b) => a.r - b.r || (a.o.mag ?? 99) - (b.o.mag ?? 99))
      .slice(0, 6)
      .map(({ o }) => ({ id: o.id, name: o.name, type: o.type }));
  }
  const bodies = Object.values(PLANET_BY_ID)
    .filter((p) => q && norm(p.name).startsWith(q.slice(0, 3)))
    .map((p) => ({ id: p.id, name: p.name, type: p.id === "moon" ? "moon" : "planet" }));
  return { status: "missing", suggestions: [...bodies, ...ranked].slice(0, 6) };
}

/** Everything the page needs about tonight, for either kind of subject. */
export interface Tonight {
  track: ObjectTrack;
  points: TrackPoint[];
  detect: DetectResult | null;
  bestTime: number | null;
  /** Start/end of the time that counts for this subject (astro darkness, or Sun < −6° for bodies). */
  darkStart: number | null;
  darkEnd: number | null;
  /** Sky brightness at the object at its best time without / with the Moon (mag/arcsec²). */
  skyNoMoon: number | null;
  skyWithMoon: number | null;
  body: BodyTonight | null;
  score: number | null;
  /** Where to look at the best time. */
  bestAz: number | null;
}

export function tonightFor(subject: Subject, ctx: NightContext, apertureMm: number): Tonight {
  const nf = ctx.frames;
  if (subject.kind === "deep") {
    const r = evaluateTarget(subject.obj, nf, { sqm: ctx.sqm, apertureMm, minAlt: ctx.minAlt });
    const best = r.bestTime !== null ? r.track.points.find((p) => p.t === r.bestTime) : undefined;
    const alt = Math.max(r.track.maxAlt, 1);
    return {
      track: r.track,
      points: r.track.points,
      detect: r.detect,
      bestTime: r.bestTime,
      darkStart: nf.darkStart,
      darkEnd: nf.darkEnd,
      skyNoMoon: r.track.maxAlt > 0 ? skyBrightnessAt(ctx.sqm, alt, null) : null,
      skyWithMoon: r.track.maxAlt > 0 ? r.detect.skySB : null,
      body: null,
      score: r.score,
      bestAz: best?.az ?? null,
    };
  }
  const b = evaluateBody(subject.id, ctx, apertureMm);
  const dark = nf.times.filter((_, i) => nf.sunAlt[i] < -6);
  const best = b.bestTime !== null ? b.track.points.find((p) => p.t === b.bestTime) : undefined;
  return {
    track: b.track,
    points: b.track.points,
    detect: b.detect,
    bestTime: b.bestTime,
    darkStart: ctx.night.civilDusk ?? dark[0] ?? null,
    darkEnd: ctx.night.civilDawn ?? dark[dark.length - 1] ?? null,
    skyNoMoon: b.detect && b.track.maxAlt > 0 ? skyBrightnessAt(ctx.sqm, Math.max(b.track.maxAlt, 1), null) : null,
    skyWithMoon: b.detect && b.track.maxAlt > 0 ? b.detect.skySB : null,
    body: b,
    score: null,
    bestAz: best?.az ?? null,
  };
}

// ------------------------------------------------------------------------------------
// The verdict sentence
// ------------------------------------------------------------------------------------

export interface Verdict {
  tone: QualityKey;
  headline: string;
  detail: string;
}

const NEAR = 12 * 60_000;

/** Does an object at this declination ever rise / ever set at this latitude? */
export function horizonClass(lat: number, dec: number): "never-rises" | "circumpolar" | "normal" {
  if (lat >= 0 ? dec < lat - 90 : dec > lat + 90) return "never-rises";
  if (lat >= 0 ? dec > 90 - lat : dec < -90 - lat) return "circumpolar";
  return "normal";
}

export function verdictFor(t: Tonight, ctx: NightContext, opts: { dec?: number; isBody: boolean; elongation?: number }): Verdict {
  const tf = { tz: ctx.tz, hour12: ctx.hour12 };
  const tr = t.track;
  const min = ctx.minAlt;
  const lat = ctx.site.lat;
  const latStr = `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? "N" : "S"}`;
  const darkWord = opts.isBody ? "after dark" : "during darkness";

  if (opts.dec !== undefined && horizonClass(lat, opts.dec) === "never-rises") {
    return {
      tone: "bad",
      headline: "Never rises from here",
      detail: `At latitude ${latStr} it stays below the horizon all year — you'd need to travel ${lat >= 0 ? "south" : "north"} to see it.`,
    };
  }
  if (tr.maxAlt < 0) {
    return {
      tone: "bad",
      headline: "Below the horizon tonight",
      detail: opts.isBody
        ? "It's only up in daylight at the moment, too close to the Sun to observe."
        : "At this time of year it's up during the day. Check the year view for its season.",
    };
  }
  const peakAt = formatTime(t.bestTime, tf);
  if (opts.isBody && opts.elongation !== undefined && opts.elongation < 20 && tr.neverUp) {
    return {
      tone: "bad",
      headline: "Too close to the Sun",
      detail: `Only ${Math.round(opts.elongation)}° from the Sun, it sets or rises in bright twilight — wait a few weeks for it to pull away.`,
    };
  }
  if (tr.neverUp && tr.maxAlt < 5) {
    return {
      tone: "bad",
      headline: "Skims the horizon tonight",
      detail: `It gets no higher than ${Math.max(0, Math.round(tr.maxAlt))}° ${darkWord} — practically unobservable from here tonight.`,
    };
  }
  if (tr.neverUp) {
    return {
      tone: "poor",
      headline: "Stays low tonight",
      detail: `It peaks at only ${Math.round(tr.maxAlt)}° (${peakAt}) ${darkWord}, below your ${min}° minimum — you'd be looking through thick, turbulent air near the horizon.`,
    };
  }

  const ds = t.darkStart;
  const de = t.darkEnd;
  const peakPhrase =
    t.bestTime !== null && ds !== null && Math.abs(t.bestTime - ds) <= NEAR
      ? `highest (${Math.round(tr.maxAlt)}°) as it gets dark, at ${peakAt}`
      : t.bestTime !== null && de !== null && Math.abs(t.bestTime - de) <= NEAR
        ? `highest (${Math.round(tr.maxAlt)}°) just before dawn, at ${peakAt}`
        : `highest (${Math.round(tr.maxAlt)}°) at ${peakAt}`;

  const tone: QualityKey = tr.maxAlt >= 50 ? "excellent" : tr.maxAlt >= 35 ? "good" : "fair";
  const headline = tr.maxAlt >= 50 ? "Well placed tonight" : tr.maxAlt >= 35 ? "Reasonably placed tonight" : "Low but observable tonight";

  if (tr.alwaysUp) {
    return { tone, headline: tr.maxAlt >= 35 ? "Up all night" : headline, detail: `Above ${min}° the whole time ${darkWord}, ${peakPhrase}.` };
  }
  const rs = tr.riseTime;
  const st = tr.setTime;
  const inDark = (x: number | null) => x !== null && ds !== null && de !== null && x > ds + 5 * 60_000 && x < de - 5 * 60_000;
  const parts: string[] = [];
  if (rs !== null && st !== null && st < rs && inDark(st) && inDark(rs)) {
    // Dips below the limit mid-night (low circumpolar objects).
    parts.push(`above ${min}° until ${formatTime(st, tf)} and again from ${formatTime(rs, tf)}`, peakPhrase);
  } else {
    if (inDark(rs)) parts.push(`rises above ${min}° at ${formatTime(rs, tf)}`);
    else parts.push(`already above ${min}° ${opts.isBody ? "at dusk" : "when darkness falls"}`);
    parts.push(peakPhrase);
    if (inDark(st) && (rs === null || st! > rs || !inDark(rs))) parts.push(`drops below ${min}° at ${formatTime(st, tf)}`);
    else if (tr.window && de !== null && tr.window[1] >= de - 20 * 60_000 && !peakPhrase.includes("dawn")) parts.push("still up at dawn");
  }
  const s = parts.join(", ");
  return { tone, headline, detail: s.charAt(0).toUpperCase() + s.slice(1) + "." };
}

/** "high in the south-east" style pointer for the best time. */
export function whereToLook(alt: number, az: number): string {
  const dir: Record<string, string> = {
    N: "north",
    NNE: "north-north-east",
    NE: "north-east",
    ENE: "east-north-east",
    E: "east",
    ESE: "east-south-east",
    SE: "south-east",
    SSE: "south-south-east",
    S: "south",
    SSW: "south-south-west",
    SW: "south-west",
    WSW: "west-south-west",
    W: "west",
    WNW: "west-north-west",
    NW: "north-west",
    NNW: "north-north-west",
  };
  const height = alt >= 75 ? "nearly overhead" : alt >= 50 ? "high" : alt >= 30 ? "halfway up" : "low";
  return alt >= 75 ? "nearly overhead" : `${height} in the ${dir[compassPoint(az)] ?? compassPoint(az)}`;
}

export function airmassText(alt: number): string {
  return alt > 0 ? `airmass ${airmass(alt).toFixed(2)}` : "";
}
