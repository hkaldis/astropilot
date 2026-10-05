/**
 * Night windows, twilight and the Moon, anchored to the observer's local solar time.
 * "The night of D" starts at local solar noon on date D, so results never depend on
 * the server's or browser's time zone.
 */
import { A, DAY_MS, HOUR_MS, Site, observerOf, bodyAltAz, sunGeometricAltitude } from "./core";

export type Darkness = "astronomical" | "nautical" | "civil" | "none";

/** Astronomical darkness shorter than this (hours) is treated as a nautical-twilight night (summer at ~50–54°). */
const SHORT_DARK_H = 1.5;

export interface MoonInfo {
  illumination: number; // 0..1 illuminated fraction at the reference time
  phaseAngle: number; // Sun–Moon–Earth angle in degrees: 0 = full, 180 = new
  elongation: number; // ecliptic longitude Moon − Sun, 0..360 (0 new, 90 first quarter, 180 full)
  phaseName: string;
  ageDays: number;
  waxing: boolean;
  rise: number | null; // ms; next rise after the night's noon anchor
  set: number | null;
}

export interface NightInfo {
  /** Local calendar date of the evening, YYYY-MM-DD (by local mean solar time). */
  date: string;
  noon: number;
  nextNoon: number;
  solarMidnight: number;
  sunset: number | null;
  sunrise: number | null;
  civilDusk: number | null;
  nauticalDusk: number | null;
  astroDusk: number | null;
  astroDawn: number | null;
  nauticalDawn: number | null;
  civilDawn: number | null;
  /** The darkest usable window of the night. */
  darkStart: number | null;
  darkEnd: number | null;
  darkness: Darkness;
  darkHours: number;
  /** Hours of darkness with the Moon below the horizon. */
  moonFreeHours: number;
  /** Moon-free dark interval(s) as [start, end] pairs. */
  moonFreeWindows: [number, number][];
  sunNeverSets: boolean;
  moon: MoonInfo;
}

const t = (x: A.AstroTime | null | undefined) => (x ? x.date.getTime() : null);

/** Local mean solar noon (approx) for a calendar date at a longitude, as an epoch ms. */
function approxSolarNoon(dateStr: string, lon: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0) - (lon / 15) * HOUR_MS;
}

/** The solar-noon anchor for a calendar date (exact Sun transit). */
export function solarNoonFor(dateStr: string, site: Site): number {
  const obs = observerOf(site);
  const start = approxSolarNoon(dateStr, site.lon) - 3 * HOUR_MS;
  const ev = A.SearchHourAngle(A.Body.Sun, obs, 0, new Date(start), +1);
  return ev.time.date.getTime();
}

/** Calendar date (YYYY-MM-DD) of an instant in local mean solar time. */
export function solarDateOf(ms: number, lon: number): string {
  const local = new Date(ms + (lon / 15) * HOUR_MS);
  return local.toISOString().slice(0, 10);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat | null>();

/** UTC offset of an IANA zone at an instant, in hours (null for an unknown zone). */
export function tzOffsetHours(tz: string, ms: number): number | null {
  let f = offsetFormatters.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    } catch {
      f = null;
    }
    if (offsetFormatters.size < 1000) offsetFormatters.set(tz, f);
  }
  if (!f) return null;
  const parts = f.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  if (!Number.isFinite(asUtc)) return null;
  return (asUtc - Math.floor(ms / 60_000) * 60_000) / HOUR_MS;
}

/**
 * Days between the site's civil calendar and its mean-solar calendar: 0 almost everywhere, ±1 near the
 * date line (Samoa, Tonga, Kiribati, Chatham, the far Aleutians), where clocks run about a day off the Sun.
 * Nights are computed from the Sun but labelled with the civil date of their evening.
 */
export function dayShift(site: Site, ms: number): number {
  if (!site.timezone) return 0;
  const off = tzOffsetHours(site.timezone, ms);
  if (off === null) return 0;
  return Math.round((off - site.lon / 15) / 24);
}

/** The local date (YYYY-MM-DD) of the evening whose night contains `ms` (anything before local noon belongs to the previous evening). */
export function nightDateOf(ms: number, site: Site): string {
  return addDays(solarDateOf(ms - 12 * HOUR_MS, site.lon), dayShift(site, ms));
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const PHASES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

export function moonPhaseName(elongation: number): string {
  const e = ((elongation % 360) + 360) % 360;
  // Named quarters get a ±~1 day band; the rest are the in-between phases.
  if (e < 6 || e >= 354) return PHASES[0];
  if (e < 84) return PHASES[1];
  if (e < 96) return PHASES[2];
  if (e < 174) return PHASES[3];
  if (e < 186) return PHASES[4];
  if (e < 264) return PHASES[5];
  if (e < 276) return PHASES[6];
  return PHASES[7];
}

export function moonInfoAt(ms: number, site: Site, riseFrom?: number, setFrom?: number): MoonInfo {
  const d = new Date(ms);
  const illum = A.Illumination(A.Body.Moon, d);
  const elong = A.MoonPhase(d);
  // Age = time since the last new Moon (the elongation runs unevenly, so scaling it can be a day off).
  const lastNew = A.SearchMoonPhase(0, d, -35);
  const obs = observerOf(site);
  const rise = A.SearchRiseSet(A.Body.Moon, obs, +1, new Date(riseFrom ?? ms - 12 * HOUR_MS), 1.5);
  const set = A.SearchRiseSet(A.Body.Moon, obs, -1, new Date(setFrom ?? riseFrom ?? ms - 12 * HOUR_MS), 1.5);
  return {
    illumination: illum.phase_fraction,
    phaseAngle: illum.phase_angle,
    elongation: elong,
    phaseName: moonPhaseName(elong),
    ageDays: lastNew ? (ms - lastNew.date.getTime()) / DAY_MS : (elong / 360) * 29.530588,
    waxing: elong < 180,
    rise: t(rise),
    set: t(set),
  };
}

/** Full description of the night that starts on the evening of `dateStr` at `site`. */
export function nightOf(dateStr: string, site: Site): NightInfo {
  const obs = observerOf(site);
  // `dateStr` is the civil date of the evening; the computation runs on the matching mean-solar date.
  const solarDate = addDays(dateStr, -dayShift(site, approxSolarNoon(dateStr, site.lon)));
  const noon = solarNoonFor(solarDate, site);
  const noonDate = new Date(noon);
  const nextNoon = solarNoonFor(addDays(solarDate, 1), site);
  const solarMidnight = A.SearchHourAngle(A.Body.Sun, obs, 12, noonDate, +1).time.date.getTime();

  const sunset = t(A.SearchRiseSet(A.Body.Sun, obs, -1, noonDate, 1));
  const civilDusk = t(A.SearchAltitude(A.Body.Sun, obs, -1, noonDate, 1, -6));
  const nauticalDusk = t(A.SearchAltitude(A.Body.Sun, obs, -1, noonDate, 1, -12));
  const astroDusk = t(A.SearchAltitude(A.Body.Sun, obs, -1, noonDate, 1, -18));

  const within = (x: number | null) => (x !== null && x < nextNoon ? x : null);
  const mid = new Date(solarMidnight);
  // Dawn events are searched for even without the matching dusk: at the end of polar night the Sun
  // rises (or twilight begins) on a morning that had no sunset the evening before.
  const sunrise = within(t(A.SearchRiseSet(A.Body.Sun, obs, +1, sunset ? new Date(sunset) : mid, 1)));
  const civilDawn = within(t(A.SearchAltitude(A.Body.Sun, obs, +1, civilDusk ? mid : noonDate, 1, -6)));
  const nauticalDawn = within(t(A.SearchAltitude(A.Body.Sun, obs, +1, nauticalDusk ? mid : noonDate, 1, -12)));
  const astroDawn = within(t(A.SearchAltitude(A.Body.Sun, obs, +1, astroDusk ? mid : noonDate, 1, -18)));

  let darkness: Darkness = "none";
  let darkStart: number | null = null;
  let darkEnd: number | null = null;
  const sunAtMidnight = sunGeometricAltitude(solarMidnight, obs);
  const astroLong = astroDusk && astroDawn && astroDusk < nextNoon && astroDawn > astroDusk ? astroDawn - astroDusk : 0;
  if (astroLong >= SHORT_DARK_H * HOUR_MS || (astroLong > 0 && !(nauticalDusk && nauticalDawn))) {
    darkness = "astronomical";
    darkStart = astroDusk;
    darkEnd = astroDawn;
  } else if (nauticalDusk && nauticalDawn && nauticalDawn > nauticalDusk) {
    // Includes nights whose astronomical darkness is only a brief dip: the nautical window is the
    // useful one there, and twilight's extra sky brightness is accounted for target by target.
    darkness = "nautical";
    darkStart = nauticalDusk;
    darkEnd = nauticalDawn;
  } else if (civilDusk && civilDawn) {
    darkness = "civil";
    darkStart = civilDusk;
    darkEnd = civilDawn;
  } else if (sunAtMidnight < -18) {
    // Polar night: darkness all day.
    darkness = "astronomical";
    darkStart = noon;
    darkEnd = nextNoon;
  }

  // Rise: first after noon. Set: first after sunset, so a Moon already up at dusk reports when it leaves.
  const moon = moonInfoAt(solarMidnight, site, noon, sunset ?? noon);
  const { hours: moonFreeHours, windows: moonFreeWindows } =
    darkStart && darkEnd ? moonFree(darkStart, darkEnd, site) : { hours: 0, windows: [] };

  return {
    date: dateStr,
    noon,
    nextNoon,
    solarMidnight,
    sunset,
    sunrise,
    civilDusk,
    nauticalDusk,
    astroDusk,
    astroDawn,
    nauticalDawn,
    civilDawn,
    darkStart,
    darkEnd,
    darkness,
    darkHours: darkStart && darkEnd ? (darkEnd - darkStart) / HOUR_MS : 0,
    moonFreeHours,
    moonFreeWindows,
    sunNeverSets: sunset === null && sunAtMidnight > -0.833,
    moon,
  };
}

/** Moon-below-horizon intervals inside [start, end]: sampled every 10 min, crossings refined by bisection (~10 s). */
function moonFree(start: number, end: number, site: Site): { hours: number; windows: [number, number][] } {
  const obs = observerOf(site);
  // Same convention as moonrise/moonset: the upper limb on the (refracted) horizon, i.e. the centre at −0.26°.
  const up = (t: number) => bodyAltAz(A.Body.Moon, t, obs).alt > -0.26;
  const refine = (a: number, b: number, upAtA: boolean) => {
    for (let i = 0; i < 6; i++) {
      const m = (a + b) / 2;
      if (up(m) === upAtA) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  const step = 10 * 60_000;
  const windows: [number, number][] = [];
  let prevT = start;
  let prevUp = up(start);
  let open: number | null = prevUp ? null : start;
  for (let x = start + step; ; x += step) {
    const tt = Math.min(x, end);
    const u = up(tt);
    if (u !== prevUp) {
      const cross = refine(prevT, tt, prevUp);
      if (!u) open = cross;
      else if (open !== null) {
        windows.push([open, cross]);
        open = null;
      }
    }
    prevT = tt;
    prevUp = u;
    if (tt >= end) break;
  }
  if (open !== null) windows.push([open, end]);
  const hours = windows.reduce((s, [a, b]) => s + (b - a), 0) / HOUR_MS;
  return { hours, windows };
}

/**
 * The night that is relevant "now": the current night if the Sun is down
 * (or before its sunrise), otherwise tonight.
 */
export function currentNightDate(nowMs: number, site: Site): string {
  const solarToday = solarDateOf(nowMs, site.lon);
  const today = addDays(solarToday, dayShift(site, nowMs));
  const yesterday = addDays(today, -1);
  // Before local solar noon we may still be inside last night.
  const noonToday = approxSolarNoon(solarToday, site.lon);
  if (nowMs < noonToday) {
    const prev = nightOf(yesterday, site);
    const end = prev.sunrise ?? prev.civilDawn ?? prev.nextNoon;
    if (nowMs < end) return yesterday;
  }
  return today;
}

/** The Sun's geometric altitude at the site (for twilight tests; see sunGeometricAltitude). */
export function sunAltitude(ms: number, site: Site): number {
  return sunGeometricAltitude(ms, site);
}

export function moonPosition(ms: number, site: Site) {
  return bodyAltAz(A.Body.Moon, ms, site);
}

/** Sample instants across a night (default: from 1 h before sunset to 1 h after sunrise). */
export function nightSamples(night: NightInfo, stepMin = 10, padHours = 1): number[] {
  const start = (night.sunset ?? night.noon + 6 * HOUR_MS) - padHours * HOUR_MS;
  const end = (night.sunrise ?? night.nextNoon - 6 * HOUR_MS) + padHours * HOUR_MS;
  const out: number[] = [];
  const step = stepMin * 60_000;
  for (let x = Math.floor(start / step) * step; x <= end; x += step) out.push(x);
  return out;
}

export interface MoonQuarter {
  quarter: 0 | 1 | 2 | 3; // new, first quarter, full, last quarter
  name: string;
  time: number;
}

export function moonQuarters(fromMs: number, days: number): MoonQuarter[] {
  const names = ["New Moon", "First Quarter", "Full Moon", "Last Quarter"];
  const out: MoonQuarter[] = [];
  let mq = A.SearchMoonQuarter(new Date(fromMs));
  const limit = fromMs + days * DAY_MS;
  while (mq.time.date.getTime() < limit) {
    out.push({ quarter: mq.quarter as 0 | 1 | 2 | 3, name: names[mq.quarter], time: mq.time.date.getTime() });
    mq = A.NextMoonQuarter(mq);
  }
  return out;
}
