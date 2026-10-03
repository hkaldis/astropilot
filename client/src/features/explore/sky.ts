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

const siteKey = (s: Site) => `${s.lat.toFixed(4)}|${s.lon.toFixed(4)}|${Math.round(s.elevation ?? 0)}`;

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
  /** Zenith sky brightness used for every estimate (measured SQM, else from Bortle). */
  sqm: number;
  sqmMeasured: boolean;
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

  const date = useMemo(
    () => (lat !== undefined && lon !== undefined ? currentNightDate(bucket * 600_000 + 1, { lat, lon, elevation: elev }) : null),
    [lat, lon, elev, bucket],
  );
  const night = useMemo(() => (date && lat !== undefined && lon !== undefined ? getNight(date, { lat, lon, elevation: elev }) : null), [date, lat, lon, elev]);
  const frames = useMemo(
    () => (night && lat !== undefined && lon !== undefined ? getFrames(night, { lat, lon, elevation: elev }, stepMin) : null),
    [night, lat, lon, elev, stepMin],
  );

  const ctx = useMemo<NightContext | null>(() => {
    if (!site || !night || !frames) return null;
    return {
      site,
      tz: siteTz(site),
      hour12,
      night,
      frames,
      sqm: site.sqm ?? sqmForBortle(site.bortle),
      sqmMeasured: site.sqm !== null && site.sqm !== undefined,
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
  const anyDark = dark.some(Boolean);
  let maxAlt = -90;
  let maxIdx = -1;
  points.forEach((p, i) => {
    if ((!anyDark || dark[i]) && p.alt > maxAlt) {
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
  let window: [number, number] | null = null;
  let above = 0;
  let riseTime: number | null = null;
  let setTime: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      if (q.alt < minAlt && p.alt >= minAlt && riseTime === null) riseTime = q.t + ((minAlt - q.alt) / (p.alt - q.alt)) * step;
      if (q.alt >= minAlt && p.alt < minAlt && setTime === null) setTime = q.t + ((q.alt - minAlt) / (q.alt - p.alt)) * step;
    }
    if (dark[i] && p.alt >= minAlt) {
      above += step;
      if (!window) window = [p.t, p.t];
      else window[1] = p.t;
    }
  }
  const darkPts = points.filter((_, i) => dark[i]);
  return {
    points,
    maxAlt,
    maxAltTime: maxIdx >= 0 ? points[maxIdx].t : null,
    transitTime,
    window,
    hoursAboveMin: above / 3_600_000,
    riseTime,
    setTime,
    alwaysUp: darkPts.length > 0 && darkPts.every((p) => p.alt >= minAlt),
    neverUp: darkPts.length > 0 ? darkPts.every((p) => p.alt < minAlt) : maxAlt < minAlt,
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
  bestTime: number | null;
}

/** Sun below this altitude counts as observing time for planets and the Moon. */
export const BODY_SUN_LIMIT = -6;

/** Evaluate a planet (or the Moon) for tonight, sampling its real motion at every frame. */
export function evaluateBody(id: SolarSystemId, ctx: NightContext, apertureMm: number): BodyTonight {
  const { frames: nf, site, night, minAlt, sqm } = ctx;
  const meta = PLANET_BY_ID[id];
  const points: TrackPoint[] =
    id === "moon"
      ? nf.times.map((t, i) => ({ t, alt: nf.moon[i].alt, az: nf.moon[i].az }))
      : nf.times.map((t) => {
          const p = bodyAltAz(meta.body, t, site);
          return { t, alt: p.alt, az: p.az };
        });
  const dark = nf.sunAlt.map((a) => a < BODY_SUN_LIMIT);
  const track = deriveTrack(points, dark, minAlt);
  const bestTime = track.maxAltTime;
  const state = bodyState(id, bestTime ?? night.solarMidnight, site);
  const events = bodyEvents(id, night.noon, site);

  let detect: DetectResult | null = null;
  if (id !== "moon" && bestTime !== null) {
    const i = nf.times.indexOf(bestTime);
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
      },
    );
  }
  const visible = track.window !== null && (!detect || detect.difficulty !== "out of reach");
  return { id, meta, state, events, track, detect, visible, bestTime };
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
