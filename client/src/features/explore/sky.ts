/**
 * Night context shared by Explore and the object page: the current night at the active site,
 * precomputed horizon frames (cached per site & night), and evaluation of the planets/Moon on
 * the same footing as catalog objects.
 */
import { useMemo } from "react";
import {
  bodyAltAz,
  bodyEvents,
  bodyState,
  currentNightDate,
  detectability,
  nightFrames,
  nightOf,
  separation,
  sqmForBortle,
  PLANET_BY_ID,
  type BodyNightEvents,
  type BodyState,
  type DetectResult,
  type NightFrames,
  type NightInfo,
  type ObjectTrack,
  type PlanetMeta,
  type Site,
  type SolarSystemId,
  type TrackPoint,
} from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import { siteTz, useSite } from "@/hooks/useSite";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";

// ------------------------------------------------------------------------------------
// Caches: the night and its frames only depend on (date, site), so navigating between
// Explore and object pages is instant.
// ------------------------------------------------------------------------------------

const NIGHTS = new Map<string, NightInfo>();
const FRAMES = new Map<string, NightFrames>();

const siteKey = (s: Site) => `${s.lat.toFixed(4)}|${s.lon.toFixed(4)}|${Math.round(s.elevation ?? 0)}|${s.timezone ?? ""}`;

function remember<T>(map: Map<string, T>, key: string, make: () => T, max: number): T {
  let v = map.get(key);
  if (v === undefined) {
    v = make();
    map.set(key, v);
    if (map.size > max) {
      const first = map.keys().next().value;
      if (first !== undefined) map.delete(first);
    }
  }
  return v;
}

export function getNight(date: string, site: Site): NightInfo {
  return remember(NIGHTS, `${date}|${siteKey(site)}`, () => nightOf(date, site), 16);
}

export function getFrames(night: NightInfo, site: Site, stepMin = 15): NightFrames {
  return remember(FRAMES, `${night.date}|${siteKey(site)}|${stepMin}`, () => nightFrames(night, site, stepMin), 8);
}

export interface NightContext {
  site: ObservingSite;
  tz: string | undefined;
  hour12: boolean;
  night: NightInfo;
  frames: NightFrames;
  /** Zenith sky brightness used for every estimate (measured SQM, atlas estimate, else from Bortle). */
  sqm: number;
  /** Only a meter reading counts as measured; the light-pollution atlas gives an estimate. */
  sqmMeasured: boolean;
  sqmSource: "measured" | "atlas" | "bortle";
  bortle: number;
  minAlt: number;
  now: number;
}

/** The night "now" belongs to at the active site, with frames every `stepMin` minutes. */
export function useNightContext(stepMin = 15): { ctx: NightContext | null; siteLoading: boolean; now: number } {
  const { site, isLoading } = useSite();
  const { prefs, hour12 } = usePrefs();
  const now = useNow(60_000);
  const bucket = Math.floor(now / 600_000); // the relevant night can only change at sunrise / noon
  const lat = site?.lat;
  const lon = site?.lon;
  const elev = site?.elevation ?? 0;
  const timezone = site?.timezone ?? null;

  const date = useMemo(
    () => (lat !== undefined && lon !== undefined ? currentNightDate(bucket * 600_000 + 1, { lat, lon, elevation: elev, timezone }) : null),
    [lat, lon, elev, timezone, bucket],
  );
  const night = useMemo(
    () => (date && lat !== undefined && lon !== undefined ? getNight(date, { lat, lon, elevation: elev, timezone }) : null),
    [date, lat, lon, elev, timezone],
  );
  const frames = useMemo(
    () => (night && lat !== undefined && lon !== undefined ? getFrames(night, { lat, lon, elevation: elev, timezone }, stepMin) : null),
    [night, lat, lon, elev, timezone, stepMin],
  );

  const ctx = useMemo<NightContext | null>(() => {
    if (!site || !night || !frames) return null;
    const hasSqm = site.sqm !== null && site.sqm !== undefined;
    // A guest place's SQM from the light-pollution atlas is still used for every estimate, but it isn't a measurement.
    const sqmSource = !hasSqm ? "bortle" : site.bortleSource === "atlas" ? "atlas" : "measured";
    return {
      site,
      tz: siteTz(site),
      hour12,
      night,
      frames,
      sqm: site.sqm ?? sqmForBortle(site.bortle),
      sqmMeasured: sqmSource === "measured",
      sqmSource,
      bortle: site.bortle,
      minAlt: prefs.minAltitude ?? 20,
      now,
    };
  }, [site, night, frames, hour12, prefs.minAltitude, now]);

  return { ctx, siteLoading: isLoading, now };
}

// ------------------------------------------------------------------------------------
// Tracks for arbitrary altitude samples (used for the Moon and planets, which move)
// ------------------------------------------------------------------------------------

/**
 * Same summary as `objectTrack`, for precomputed samples. `dark[i]` says whether sample i
 * counts as observing time (deep-sky: astronomical darkness; planets: Sun below −6°).
 */
export function deriveTrack(points: TrackPoint[], dark: boolean[], minAlt: number): ObjectTrack {
  // Only observing time counts: with no such time at all (midnight sun) there is no best moment.
  let maxAlt = -90;
  let maxIdx = -1;
  points.forEach((p, i) => {
    if (dark[i] && p.alt > maxAlt) {
      maxAlt = p.alt;
      maxIdx = i;
    }
  });

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

  const step = points.length > 1 ? points[1].t - points[0].t : 600_000;
  const segments: [number, number][] = [];
  let above = 0;
  let riseTime: number | null = null;
  let setTime: number | null = null;
  let open = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      if (q.alt < minAlt && p.alt >= minAlt && riseTime === null) riseTime = q.t + ((minAlt - q.alt) / (p.alt - q.alt)) * step;
      if (q.alt >= minAlt && p.alt < minAlt && setTime === null) setTime = q.t + ((q.alt - minAlt) / (q.alt - p.alt)) * step;
    }
    if (dark[i] && p.alt >= minAlt) {
      above += step;
      if (open) segments[segments.length - 1][1] = p.t;
      else segments.push([p.t, p.t]);
      open = true;
    } else open = false;
  }
  // As in objectTrack: the refined transit when it falls in observing time next to the highest sample, so
  // every page quotes the same time whatever its sampling.
  let bestT = maxIdx >= 0 ? points[maxIdx].t : null;
  const transitIdx = transitTime !== null && points.length ? Math.round((transitTime - points[0].t) / step) : -1;
  if (bestT !== null && transitTime !== null && Math.abs(transitTime - bestT) <= step && dark[transitIdx]) bestT = transitTime;
  const window =
    segments.find(([a, b]) => bestT !== null && bestT >= a - step && bestT <= b + step) ??
    segments.reduce<[number, number] | null>((best, sg) => (!best || sg[1] - sg[0] > best[1] - best[0] ? sg : best), null);
  const darkPts = points.filter((_, i) => dark[i]);
  return {
    points,
    maxAlt,
    maxAltTime: bestT,
    maxIdx,
    transitTime,
    window,
    segments,
    hoursAboveMin: above / 3_600_000,
    riseTime,
    setTime,
    alwaysUp: darkPts.length > 0 && darkPts.every((p) => p.alt >= minAlt),
    neverUp: darkPts.length > 0 ? darkPts.every((p) => p.alt < minAlt) : true,
    moonSepAtBest: null,
    moonAltAtBest: null,
  };
}

export interface BodyTonight {
  id: SolarSystemId;
  meta: PlanetMeta;
  /** State at the best time tonight (or local midnight if it never gets up). */
  state: BodyState;
  events: BodyNightEvents;
  track: ObjectTrack;
  detect: DetectResult | null;
  visible: boolean;
  /** When it's highest after dark (refined between frames when it culminates then). */
  bestTime: number | null;
  /** When it's highest after dark, for display (see peakTime). */
  peakTime: number | null;
}

/** Sun below this altitude counts as observing time for planets and the Moon. */
export const BODY_SUN_LIMIT = -6;

/** A planet's (or the Moon's) track through the night's frames, sampling its real motion; observing time is Sun < −6°. */
export function bodyTrack(id: SolarSystemId, nf: NightFrames, site: Site, minAlt: number): ObjectTrack {
  const meta = PLANET_BY_ID[id];
  const points: TrackPoint[] =
    id === "moon"
      ? nf.times.map((t, i) => ({ t, alt: nf.moon[i].alt, az: nf.moon[i].az }))
      : nf.times.map((t) => {
          const p = bodyAltAz(meta.body, t, site);
          return { t, alt: p.alt, az: p.az };
        });
  return deriveTrack(points, nf.sunAlt.map((a) => a < BODY_SUN_LIMIT), minAlt);
}

/** Start and end of the observing time for planets and the Moon (Sun below −6°). */
export function bodyWindow(night: NightInfo, nf: NightFrames): [number | null, number | null] {
  const dark = nf.times.filter((_, i) => nf.sunAlt[i] < BODY_SUN_LIMIT);
  return [night.civilDusk ?? dark[0] ?? null, night.civilDawn ?? dark[dark.length - 1] ?? null];
}

/**
 * When an object is highest tonight, for display: the refined transit when it happens inside the
 * observing window, else the best sample. Every page samples the same night, so they all agree.
 */
export function peakTime(track: ObjectTrack, windowStart: number | null, windowEnd: number | null): number | null {
  const t = track.transitTime;
  if (t !== null && windowStart !== null && windowEnd !== null && t >= windowStart && t <= windowEnd) return t;
  return track.maxAltTime;
}

/** The best moment, for display: the refined peak when the best sample is the highest one (twilight can make them differ). */
export function shownBestTime(bestTime: number | null, track: ObjectTrack, windowStart: number | null, windowEnd: number | null): number | null {
  return bestTime !== null && bestTime === track.maxAltTime ? peakTime(track, windowStart, windowEnd) : bestTime;
}

/** The track sample nearest to `t` (best and peak times may be refined between samples), or null. */
export function sampleAt(track: ObjectTrack, t: number | null): TrackPoint | null {
  const pts = track.points;
  if (t === null || !pts.length) return null;
  const step = pts.length > 1 ? pts[1].t - pts[0].t : 600_000;
  const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round((t - pts[0].t) / step)))];
  return Math.abs(p.t - t) <= step ? p : null;
}

/** Altitude at the track's best (or any) moment: the highest one at the peak, else the nearest sample. */
export function altAt(track: ObjectTrack, t: number | null): number {
  if (t !== null && t === track.maxAltTime) return track.maxAlt;
  return sampleAt(track, t)?.alt ?? track.maxAlt;
}

/** Evaluate a planet (or the Moon) for tonight, sampling its real motion at every frame. */
export function evaluateBody(id: SolarSystemId, ctx: Pick<NightContext, "frames" | "site" | "night" | "minAlt" | "sqm">, apertureMm: number): BodyTonight {
  const { frames: nf, site, night, minAlt, sqm } = ctx;
  const meta = PLANET_BY_ID[id];
  const track = bodyTrack(id, nf, site, minAlt);
  const bestTime = track.maxAltTime;
  const state = bodyState(id, bestTime ?? night.solarMidnight, site);
  const events = bodyEvents(id, night.noon, site);

  let detect: DetectResult | null = null;
  if (id !== "moon" && bestTime !== null) {
    // Moon and twilight at the highest sample (the best time itself may fall between samples).
    const i = track.maxIdx;
    const m = i >= 0 ? nf.moon[i] : null;
    if (m) {
      track.moonAltAtBest = m.alt;
      track.moonSepAtBest = separation(state.raJ2000, state.decJ2000, m.ra, m.dec);
    }
    detect = detectability(
      { type: "planet", mag: state.mag },
      {
        sqmZenith: sqm,
        apertureMm,
        alt: Math.max(track.maxAlt, 1),
        moon: m && track.moonSepAtBest !== null ? { alt: m.alt, phaseAngle: nf.moonPhaseAngle, separation: track.moonSepAtBest } : null,
        sunAlt: i >= 0 ? nf.sunAlt[i] : null,
      },
    );
  }
  const visible = track.window !== null && (!detect || detect.difficulty !== "out of reach");
  return { id, meta, state, events, track, detect, visible, bestTime, peakTime: peakTime(track, ...bodyWindow(night, nf)) };
}

/** Altitude samples of the Moon across the night (for charts). */
export function moonPoints(nf: NightFrames): TrackPoint[] {
  return nf.times.map((t, i) => ({ t, alt: nf.moon[i].alt, az: nf.moon[i].az }));
}

/** Index of the frame closest to `t`. */
export function frameIndex(nf: NightFrames, t: number): number {
  if (!nf.times.length) return -1;
  const step = nf.times.length > 1 ? nf.times[1] - nf.times[0] : 1;
  return Math.max(0, Math.min(nf.times.length - 1, Math.round((t - nf.times[0]) / step)));
}

export function isSolarSystemId(id: string): id is SolarSystemId {
  return Object.prototype.hasOwnProperty.call(PLANET_BY_ID, id.toLowerCase());
}
