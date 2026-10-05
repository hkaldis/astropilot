/** Resolve an object-page id to a catalog object or a solar-system body, and describe its night. */
import {
  MOON_BY_ID,
  MOONS,
  PLANET_BY_ID,
  airmass,
  compassPoint,
  evaluateTarget,
  formatTime,
  isMoonId,
  maxElongation,
  satelliteDetectability,
  separation,
  separationOf,
  skyBrightnessAt,
  type DetectResult,
  type MoonId,
  type MoonMeta,
  type MoonPos,
  type ObjectTrack,
  type PlanetMeta,
  type SolarSystemId,
  type TrackPoint,
} from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import { matchRank, norm, searchKeys } from "@/features/explore/search";
import { altAt, bodyWindow, evaluateBody, peakTime, sampleAt, shownBestTime, type BodyTonight, type NightContext } from "@/features/explore/sky";
import type { QualityKey } from "@/lib/objects";

export type Subject =
  | { kind: "deep"; id: string; name: string; type: string; obj: CatalogObject }
  | { kind: "body"; id: SolarSystemId; name: string; type: "planet" | "moon"; meta: PlanetMeta }
  /** A planet's moon: it rises and sets with its planet; how visible it is depends on its own brightness and the planet's glare. */
  | { kind: "satellite"; id: MoonId; name: string; type: "satellite"; meta: MoonMeta; parent: PlanetMeta };

/** Planets and moons: observed in twilight too, tracked along the planet's real motion. */
export const isBodyLike = (s: Subject): s is Extract<Subject, { kind: "body" | "satellite" }> => s.kind !== "deep";

/** The planet whose moons a page shows (a planet with moons, or a moon's planet), else null. */
export function systemPlanetOf(s: Subject): string | null {
  if (s.kind === "satellite") return s.parent.id;
  if (s.kind === "body" && MOONS.some((m) => m.parent === s.id)) return s.id;
  return null;
}

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
  if (isMoonId(lower)) {
    const meta = MOON_BY_ID[lower as MoonId];
    return { status: "found", subject: { kind: "satellite", id: meta.id, name: meta.name, type: "satellite", meta, parent: PLANET_BY_ID[meta.parent] } };
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
  const bodies = [
    ...Object.values(PLANET_BY_ID).map((p) => ({ id: p.id as string, name: p.name, type: p.id === "moon" ? "moon" : "planet" })),
    ...MOONS.map((m) => ({ id: m.id as string, name: m.name, type: "satellite" })),
  ].filter((p) => q && norm(p.name).startsWith(q.slice(0, 3)));
  return { status: "missing", suggestions: [...bodies, ...ranked].slice(0, 6) };
}

/** Everything the page needs about tonight, for either kind of subject. */
export interface Tonight {
  track: ObjectTrack;
  points: TrackPoint[];
  detect: DetectResult | null;
  /** The best moment, for display: the refined transit when that's when it's best (as on every other page). */
  bestTime: number | null;
  /** When it's highest during the observing time (refined transit, else the highest sample). */
  peakTime: number | null;
  /** Start/end of the time that counts for this subject (astro darkness, or Sun < −6° for bodies). */
  darkStart: number | null;
  darkEnd: number | null;
  /** Sky brightness at the object at its best time without / with the Moon (mag/arcsec²). */
  skyNoMoon: number | null;
  skyWithMoon: number | null;
  body: BodyTonight | null;
  score: number | null;
  /** Where to look at the best time. */
  bestAlt: number | null;
  bestAz: number | null;
  /**
   * Moons: where it is at `at` (its best time, or the planet's highest when it isn't up in a dark sky),
   * and the brightness and distance from the planet used for `detect`. Without positions (`typical`), its
   * typical distance stands in; `loading` says whether they are still on their way.
   */
  satellite?: { pos: MoonPos | null; at: number | null; mag: number; sep: number; typical: boolean; loading: boolean };
}

/** Where a planet's moons are: positions at any moment, and whether they are still loading. */
type MoonSource = { at: (t: number) => MoonPos[] | null; status?: "ready" | "loading" | "error" };

export function tonightFor(subject: Subject, ctx: NightContext, apertureMm: number, system?: MoonSource | null): Tonight {
  const nf = ctx.frames;
  if (subject.kind === "satellite") return satelliteTonight(subject, ctx, apertureMm, system ?? null);
  if (subject.kind === "deep") {
    const r = evaluateTarget(subject.obj, nf, { sqm: ctx.sqm, apertureMm, minAlt: ctx.minAlt });
    const best = sampleAt(r.track, r.bestTime);
    const alt = Math.max(r.track.maxAlt, 1);
    return {
      track: r.track,
      points: r.track.points,
      detect: r.detect,
      bestTime: shownBestTime(r.bestTime, r.track, nf.darkStart, nf.darkEnd),
      peakTime: peakTime(r.track, nf.darkStart, nf.darkEnd),
      darkStart: nf.darkStart,
      darkEnd: nf.darkEnd,
      skyNoMoon: r.track.maxAlt > 0 ? skyBrightnessAt(ctx.sqm, alt, null) : null,
      skyWithMoon: r.track.maxAlt > 0 ? r.detect.skySB : null,
      body: null,
      score: r.score,
      bestAlt: best ? altAt(r.track, r.bestTime) : null,
      bestAz: best?.az ?? null,
    };
  }
  const b = evaluateBody(subject.id, ctx, apertureMm);
  const [darkStart, darkEnd] = bodyWindow(ctx.night, nf);
  const best = sampleAt(b.track, b.bestTime);
  return {
    track: b.track,
    points: b.track.points,
    detect: b.detect,
    // A body's best moment is its highest one.
    bestTime: b.peakTime,
    peakTime: b.peakTime,
    darkStart,
    darkEnd,
    skyNoMoon: b.detect && b.track.maxAlt > 0 ? skyBrightnessAt(ctx.sqm, Math.max(b.track.maxAlt, 1), null) : null,
    skyWithMoon: b.detect && b.track.maxAlt > 0 ? b.detect.skySB : null,
    body: b,
    score: null,
    bestAlt: best ? altAt(b.track, b.bestTime) : null,
    bestAz: best?.az ?? null,
  };
}

/**
 * A moon tonight: its planet's track (they rise and set together), with the moon's own visibility at the
 * moment it is easiest — scanning the night for the best mix of altitude, a dark sky and distance from
 * the planet's glare (a morning planet is highest in twilight, when a faint moon is lost). Until
 * positions load, its typical distance (about two-thirds of the greatest) stands in.
 */
function satelliteTonight(subject: Extract<Subject, { kind: "satellite" }>, ctx: NightContext, apertureMm: number, system: MoonSource | null): Tonight {
  const nf = ctx.frames;
  const b = evaluateBody(subject.parent.id, ctx, apertureMm);
  const [darkStart, darkEnd] = bodyWindow(ctx.night, nf);
  const typicalSep = maxElongation(subject.meta, b.state.distanceAu) * (2 / Math.PI);
  const rate = (i: number) => {
    const p = b.track.points[i];
    const t = nf.times[i];
    const pos = system?.at(t)?.find((x) => x.id === subject.id) ?? null;
    const m = nf.moon[i];
    const detect = satelliteDetectability(pos?.mag ?? subject.meta.mag, pos ? separationOf(pos) : typicalSep, b.state.mag, subject.parent.name, {
      sqmZenith: ctx.sqm,
      apertureMm,
      alt: Math.max(p.alt, 1),
      moon: m ? { alt: m.alt, phaseAngle: nf.moonPhaseAngle, separation: separation(b.state.raJ2000, b.state.decJ2000, m.ra, m.dec) } : null,
      sunAlt: nf.sunAlt[i] ?? null,
    });
    return { i, t, pos, detect, alt: p.alt };
  };
  let best: ReturnType<typeof rate> | null = null;
  for (let i = 0; i < nf.times.length && i < b.track.points.length; i++) {
    if (b.track.points[i].alt < 8 || nf.sunAlt[i] >= -6) continue;
    const r = rate(i);
    if (r.pos && (r.pos.occulted || r.pos.eclipse === "total")) continue;
    if (!best || r.detect.index > best.detect.index + 0.05 || (r.detect.index > best.detect.index - 0.05 && r.alt > best.alt)) best = r;
  }
  // Never up in a dark-enough sky: describe it at the planet's highest moment.
  if (!best && b.track.maxIdx >= 0 && b.track.maxAlt > 0) best = rate(b.track.maxIdx);
  const bestTime = best?.t ?? b.peakTime;
  // Not up at all tonight: still say where the moon is, at the planet's highest (or the middle of the night).
  const at = bestTime ?? nf.times[Math.floor(nf.times.length / 2)] ?? null;
  const pos = best ? best.pos : at !== null ? (system?.at(at)?.find((x) => x.id === subject.id) ?? null) : null;
  const p = best ? b.track.points[best.i] : null;
  // The Moon's light at the moon's own best moment, which needn't be the planet's highest.
  const m = best ? nf.moon[best.i] : null;
  const track = m ? { ...b.track, moonAltAtBest: m.alt, moonSepAtBest: separation(b.state.raJ2000, b.state.decJ2000, m.ra, m.dec) } : b.track;
  return {
    track,
    points: b.track.points,
    detect: best?.detect ?? null,
    bestTime,
    peakTime: b.peakTime,
    darkStart,
    darkEnd,
    skyNoMoon: best && b.track.maxAlt > 0 ? skyBrightnessAt(ctx.sqm, Math.max(best.alt, 1), null) : null,
    skyWithMoon: best?.detect.skySB ?? null,
    body: b,
    score: null,
    bestAlt: p?.alt ?? null,
    bestAz: p?.az ?? null,
    satellite: { pos, at, mag: pos?.mag ?? subject.meta.mag, sep: pos ? separationOf(pos) : typicalSep, typical: !pos, loading: !pos && system?.status === "loading" },
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
  const peakAt = formatTime(t.peakTime, tf);
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
    t.peakTime !== null && ds !== null && Math.abs(t.peakTime - ds) <= NEAR
      ? `highest (${Math.round(tr.maxAlt)}°) as it gets dark, at ${peakAt}`
      : t.peakTime !== null && de !== null && Math.abs(t.peakTime - de) <= NEAR
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
