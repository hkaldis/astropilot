/**
 * Reference tests: the app's own timings and numbers against JPL Horizons (and, for fixed RA/Dec targets, an
 * independent Meeus computation), from offline fixtures in ./fixtures built by scripts/reference/fetch-horizons.ts
 * (see that script for exactly how each reference value is derived). No network access.
 *
 * Sites: Athens, Sydney, Reykjavik. Nights: 2026-10-14, 2026-12-20, 2027-03-25, 2027-06-21 (no darkness at Reykjavik).
 *
 * Tolerances:
 *  - event times ≤ 2 min; ≤ 4 min when the body crosses the level slower than 0.05°/min (near-grazing — the Sun,
 *    Moon and planets skimming the horizon at Reykjavik: there a 0.06° difference between refraction models,
 *    34′ at the horizon in astronomy-engine vs ~37′ in Horizons, moves the crossing by more than a minute),
 *  - altitudes ≤ 0.2°, magnitudes ≤ 0.1, diameters ≤ 0.2″, illuminated fraction ≤ 1 percentage point.
 *
 * Explore's planet cards come from evaluateBody (client/src/features/explore/sky.ts) with 10-minute frames;
 * the test imports it directly (tsx resolves the @/ and @shared/ aliases through tsconfig.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import nightsJson from "./fixtures/horizons-nights.json";
import fixedJson from "./fixtures/fixed-targets.json";
import { A, altAzRaDec, bodyAltAz, bodyEvents, bodyState, currentNightDate, nightFrames, nightOf, objectTrack, sunGeometricAltitude, tzOffsetHours, PLANET_BY_ID, type ObjectTrack, type Site, type SolarSystemId } from "./index";
import { BRIGHT_LOW, BRIGHT_LOW_ALT, evaluateBody, getFrames, getNight } from "../../client/src/features/explore/sky";
import { yearAltitudes } from "../../client/src/features/object/YearStrip";

// ------------------------------------------------------------------------------------ fixtures

type Iso = string;
type Seg = [Iso, Iso];
interface BodyRef {
  rise: Iso[];
  set: Iso[];
  transit: Iso[];
  mag: number | null;
  illum: number;
  diam: number;
  max: { alt: number; t: Iso } | null;
  above: Record<string, Seg[]> | null;
}
interface NightRef {
  site: string;
  date: string;
  refTime: Iso;
  sun: Record<"noon" | "solarMidnight" | "nextNoon" | "sunset" | "sunrise" | "civilDusk" | "nauticalDusk" | "astroDusk" | "astroDawn" | "nauticalDawn" | "civilDawn", Iso | null>;
  bodies: Record<SolarSystemId, BodyRef>;
}
interface FixedNightRef {
  site: string;
  date: string;
  dark: [Iso, Iso] | null;
  targets: Record<string, { transit: { t: Iso; alt: number }[]; max: { alt: number; t: Iso } | null; above20: Seg[] | null }>;
}
const H = nightsJson as unknown as {
  sites: Record<string, Site & { name: string; timezone: string }>;
  nights: NightRef[];
  year: { from: string; site: string; bodies: Record<string, number[]> };
};
const F = fixedJson as unknown as {
  targets: Record<string, { ra: number; dec: number }>;
  nights: FixedNightRef[];
  year: { from: string; sites: Record<string, Record<string, number[]>> };
};

// ------------------------------------------------------------------------------------ helpers

const TOL = { min: 2, grazingMin: 4, alt: 0.2, mag: 0.1, diam: 0.2, illum: 1 };
const MIN = 60_000;
const ms = (s: Iso | null) => (s === null ? null : Date.parse(s));
const hhmm = (t: number | null) => (t === null ? "none" : new Date(t).toISOString().slice(11, 19));
const SITES = H.sites;
const where = (n: { site: string; date: string }) => `${SITES[n.site].name} ${n.date}`;

/** |d alt / dt| at t, °/min. */
const rate = (alt: (t: number) => number, t: number) => Math.abs(alt(t + 2 * MIN) - alt(t - 2 * MIN)) / 4;
/** Minutes allowed for a crossing at t: 2, or 4 when it is near-grazing (< 0.05°/min). */
const tolAt = (alt: (t: number) => number, t: number) => (rate(alt, t) < 0.05 ? TOL.grazingMin : TOL.min);

/** Collects every mismatch of one test, so a failure lists them all at once. */
function problems() {
  const out: string[] = [];
  return {
    out,
    time(what: string, app: number | null, ref: number | null, tolMin = TOL.min) {
      if (app === null || ref === null) {
        if (app !== ref) out.push(`${what}: app ${hhmm(app)} vs ref ${hhmm(ref)}`);
        return;
      }
      const d = (app - ref) / MIN;
      if (Math.abs(d) > tolMin) out.push(`${what}: app ${hhmm(app)} vs ref ${hhmm(ref)} (${d.toFixed(1)} min, tolerance ${tolMin})`);
    },
    num(what: string, app: number, ref: number, tol: number) {
      if (!(Math.abs(app - ref) <= tol)) out.push(`${what}: app ${app.toFixed(3)} vs ref ${ref.toFixed(3)} (Δ ${(app - ref).toFixed(3)}, tolerance ${tol})`);
    },
    check(ok: boolean, what: string) {
      if (!ok) out.push(what);
    },
  };
}

/**
 * Observing windows: every reference stretch of 10 min or more must be in the app's segments, and every app
 * segment must match a reference stretch, with both ends within tolerance. (With 10-minute frames the app can
 * miss a stretch shorter than a frame step — by design — but must never invent one.)
 */
function compareSegments(p: ReturnType<typeof problems>, what: string, track: ObjectTrack, ref: Seg[], alt: (t: number) => number) {
  const refs = ref.map(([a, b]) => [ms(a)!, ms(b)!] as [number, number]);
  const overlap = (x: [number, number], y: [number, number]) => Math.min(x[1], y[1]) - Math.max(x[0], y[0]);
  for (const r of refs) {
    if (r[1] - r[0] < 10 * MIN) continue;
    if (!track.segments.some((s) => overlap(s, r) > 0)) p.out.push(`${what}: reference window ${hhmm(r[0])}–${hhmm(r[1])} missing (app: ${track.segments.map((s) => `${hhmm(s[0])}–${hhmm(s[1])}`).join(", ") || "none"})`);
  }
  for (const s of track.segments) {
    const r = refs.reduce<[number, number] | null>((best, x) => (overlap(x, s) > (best ? overlap(best, s) : -Infinity) ? x : best), null);
    if (!r || overlap(r, s) < 0) {
      p.out.push(`${what}: app window ${hhmm(s[0])}–${hhmm(s[1])} has no reference counterpart`);
      continue;
    }
    p.time(`${what} window start`, s[0], r[0], tolAt(alt, r[0]));
    p.time(`${what} window end`, s[1], r[1], tolAt(alt, r[1]));
  }
}

const sunAlt = (site: Site) => (t: number) => sunGeometricAltitude(t, site);
const bodyAlt = (id: SolarSystemId, site: Site) => (t: number) => bodyAltAz(PLANET_BY_ID[id].body, t, site).alt;
const fixedAlt = (ra: number, dec: number, site: Site) => (t: number) => altAzRaDec(ra, dec, t, site).alt;

// ------------------------------------------------------------------------------------ the Sun and the night

test("Sun: noon, sunset, twilight, sunrise and solar midnight within 2 min of Horizons", () => {
  const p = problems();
  for (const n of H.nights) {
    const site = SITES[n.site];
    const night = nightOf(n.date, site);
    const w = where(n);
    for (const k of ["noon", "solarMidnight", "nextNoon", "civilDusk", "nauticalDusk", "astroDusk", "astroDawn", "nauticalDawn", "civilDawn"] as const) p.time(`${w} ${k}`, night[k], ms(n.sun[k]));
    // Sunrise and sunset: the Sun's upper limb on the refracted horizon.
    for (const k of ["sunset", "sunrise"] as const) {
      const ref = ms(n.sun[k]);
      p.time(`${w} ${k}`, night[k], ref, ref === null ? TOL.min : tolAt(sunAlt(site), ref));
    }
  }
  assert.deepEqual(p.out, []);
});

test("night kinds: astronomical darkness everywhere except midsummer Reykjavik, which never gets dark", () => {
  for (const n of H.nights) {
    const night = nightOf(n.date, SITES[n.site]);
    const expected = n.sun.astroDusk ? "astronomical" : n.sun.nauticalDusk ? "nautical" : n.sun.civilDusk ? "civil" : "none";
    assert.equal(night.darkness, expected, where(n));
    if (night.darkness === "astronomical") {
      assert.equal(night.darkStart, night.astroDusk);
      assert.equal(night.darkEnd, night.astroDawn);
    }
  }
  const midsummer = nightOf("2027-06-21", SITES.reykjavik);
  assert.equal(midsummer.darkness, "none");
  assert.equal(midsummer.civilDusk, null);
  assert.ok(midsummer.sunset !== null && midsummer.sunrise !== null, "the Sun still sets briefly at 64°N");
});

test("'tonight': the evening's date until sunrise, the new date from sunrise on (around midnight, sunrise and noon)", () => {
  const p = problems();
  for (const n of H.nights) {
    const site = SITES[n.site];
    const tz = site.timezone;
    const [y, m, d] = n.date.split("-").map(Number);
    /** UTC instant of a local wall-clock time `dayOffset` days after the evening's date. */
    const local = (dayOffset: number, h: number, min: number) => {
      const guess = Date.UTC(y, m - 1, d + dayOffset, h, min);
      return guess - tzOffsetHours(tz, guess)! * 3_600_000;
    };
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const sunrise = ms(n.sun.sunrise)!;
    const cases: [string, number, string][] = [
      ["18:00", local(0, 18, 0), n.date],
      ["23:59", local(0, 23, 59), n.date],
      ["00:01", local(1, 0, 1), n.date],
      ["sunrise − 2 min", sunrise - 2 * MIN, n.date],
      ["sunrise + 2 min", sunrise + 2 * MIN, next],
      ["11:30 next day", local(1, 11, 30), next],
      ["12:30 next day", local(1, 12, 30), next],
    ];
    for (const [label, t, want] of cases) {
      const got = currentNightDate(t, site);
      p.check(got === want, `${where(n)} at ${label} (${new Date(t).toISOString()}): tonight is ${got}, expected ${want}`);
      // …and that night isn't over yet (after sunrise it is the coming night, which starts at the next solar noon).
      const night = getNight(got, site);
      p.check(t < night.nextNoon && (got !== n.date || t >= night.noon), `${where(n)} at ${label}: ${got}'s night ${new Date(night.noon).toISOString()}–${new Date(night.nextNoon).toISOString()} is the wrong one`);
    }
  }
  assert.deepEqual(p.out, []);
});

// ------------------------------------------------------------------------------------ Moon and planets

const BODY_IDS = Object.keys(H.nights[0].bodies) as SolarSystemId[];

test("Moon and planets: rise, set and meridian transit within 2 min of Horizons (4 min when grazing)", () => {
  const p = problems();
  for (const n of H.nights) {
    const site = SITES[n.site];
    const night = nightOf(n.date, site);
    for (const id of BODY_IDS) {
      const ref = n.bodies[id];
      const ev = bodyEvents(id, night.noon, site);
      const alt = bodyAlt(id, site);
      // bodyEvents: the first of each in the 24 h after the night's noon.
      const first = (xs: Iso[]) => xs.map((x) => ms(x)!).find((x) => x > night.noon && x <= night.noon + 86_400_000) ?? null;
      const [rise, set, transit] = [first(ref.rise), first(ref.set), first(ref.transit)];
      p.time(`${where(n)} ${id} rise`, ev.rise, rise, rise === null ? TOL.min : tolAt(alt, rise));
      p.time(`${where(n)} ${id} set`, ev.set, set, set === null ? TOL.min : tolAt(alt, set));
      p.time(`${where(n)} ${id} transit`, ev.transit, transit);
      if (id === "moon") {
        // The night's Moon: rise after noon, set after sunset (a Moon already up at dusk reports when it leaves).
        p.time(`${where(n)} night.moon.rise`, night.moon.rise, rise, rise === null ? TOL.min : tolAt(alt, rise));
        const from = night.sunset ?? night.noon;
        const mset = ref.set.map((x) => ms(x)!).find((x) => x > from) ?? null;
        p.time(`${where(n)} night.moon.set`, night.moon.set, mset, mset === null ? TOL.min : tolAt(alt, mset));
      }
    }
  }
  assert.deepEqual(p.out, []);
});

test("Moon and planets: magnitude ≤ 0.1, diameter ≤ 0.2″, illuminated ≤ 1 % of Horizons", () => {
  const p = problems();
  for (const n of H.nights) {
    const site = SITES[n.site];
    const t = ms(n.refTime)!;
    for (const id of BODY_IDS) {
      const ref = n.bodies[id];
      const s = bodyState(id, t, site);
      const w = `${where(n)} ${id}`;
      p.num(`${w} illuminated %`, s.illumination * 100, ref.illum, TOL.illum);
      if (id === "moon") {
        // The Moon's ~1,800″ disk: astronomy-engine's mean radius vs Horizons' — 0.1 % is ~2″.
        p.num(`${w} diameter ″`, s.diameter, ref.diam, 2);
        continue;
      }
      p.num(`${w} magnitude`, s.mag, ref.mag!, TOL.mag);
      p.num(`${w} diameter ″`, s.diameter, ref.diam, TOL.diam);
    }
  }
  assert.deepEqual(p.out, []);
});

test("Explore planet cards (10-minute frames): windows within 2 min of the exact crossings, peak altitude ≤ 0.2°, best time at the real peak", () => {
  const p = problems();
  for (const n of H.nights) {
    const site = SITES[n.site];
    const night = getNight(n.date, site);
    const frames = getFrames(night, site, 10);
    const ctx = { frames, site: { ...site, key: "guest" } as any, night, minAlt: 20, sqm: 20.2 };
    for (const id of BODY_IDS) {
      const ref = n.bodies[id];
      const b = evaluateBody(id, ctx, 203);
      const level = BRIGHT_LOW.has(id) ? Math.min(20, BRIGHT_LOW_ALT) : 20;
      const w = `${where(n)} ${id} (≥ ${level}°)`;
      if (!ref.above) {
        // No civil darkness at all (midsummer Reykjavik): nothing to observe, and said so.
        p.check(b.track.window === null && b.track.noDarkness === true, `${w}: expected no window on a night without darkness, got ${b.track.window ? b.track.window.map(hhmm).join("–") : "none"} (noDarkness ${b.track.noDarkness})`);
        continue;
      }
      compareSegments(p, w, b.track, ref.above[String(level)], bodyAlt(id, site));
      const max = ref.max!;
      // "peaks N°" (or "Low: peaks at N°"); below the horizon the card just says it isn't up.
      if (max.alt > 0) p.num(`${w} peak altitude`, b.track.maxAlt, max.alt, TOL.alt);
      else p.check(b.track.maxAlt <= 0.5, `${w}: below the horizon all night (ref ${max.alt.toFixed(2)}°) but app peaks at ${b.track.maxAlt.toFixed(2)}°`);
      // "best HH:MM": when it is really highest during the night (a culmination, or dusk / dawn) —
      // or, never reaching the minimum altitude, "Low: N° at HH:MM".
      if (b.track.window && max.alt > 0) p.time(`${w} best time`, b.peakTime, ms(max.t));
      if (!b.track.window && max.alt > 0) p.time(`${w} "Low: N° at" time`, b.track.maxAltTime, ms(max.t));
    }
  }
  assert.deepEqual(p.out, []);
});

// ------------------------------------------------------------------------------------ deep-sky targets

test("deep-sky targets (10- and 15-minute frames): windows inside astronomical darkness, transit and highest point vs Meeus", () => {
  const p = problems();
  for (const n of F.nights) {
    const site = SITES[n.site];
    const night = nightOf(n.date, site);
    for (const step of [10, 15]) {
      const frames = nightFrames(night, site, step);
      for (const [id, ref] of Object.entries(n.targets)) {
        const { ra, dec } = F.targets[id];
        const tr = objectTrack(ra, dec, frames, 20);
        const w = `${where(n)} ${id} (${step}-min frames)`;
        const alt = fixedAlt(ra, dec, site);
        // Transit: the app finds the culmination inside its sampled span (sunset − 1 h … sunrise + 1 h).
        const span = [frames.times[1], frames.times[frames.times.length - 2]];
        const inSpan = ref.transit.map((x) => ms(x.t)!).find((x) => x >= span[0] && x <= span[1]) ?? null;
        if (inSpan !== null) p.time(`${w} transit`, tr.transitTime, inSpan);
        if (!n.dark) {
          p.check(tr.window === null && tr.noDarkness === true, `${w}: no darkness, yet window ${tr.window?.map(hhmm).join("–")}`);
          continue;
        }
        compareSegments(p, w, tr, ref.above20!, alt);
        p.num(`${w} highest in darkness`, tr.maxAlt, ref.max!.alt, TOL.alt);
        if (ref.max!.alt > 0) p.time(`${w} time of highest`, tr.maxAltTime, ms(ref.max!.t));
      }
    }
  }
  assert.deepEqual(p.out, []);
});

// ------------------------------------------------------------------------------------ through the year

/** Every month of the strip for the fixture's targets and planets: [label, app altitude, exact altitude]. */
function yearRows(): [string, number, number][] {
  const now = Date.parse(`${F.year.from}-14T12:00:00Z`);
  const rows: [string, number, number][] = [];
  const add = (label: string, months: ReturnType<typeof yearAltitudes>, ref: number[]) => {
    assert.equal(months.length, 12);
    assert.equal(`${months[0].year}-${String(months[0].month + 1).padStart(2, "0")}`, F.year.from, "the strip starts with the current month");
    months.forEach((m, i) => rows.push([`${label} ${m.year}-${String(m.month + 1).padStart(2, "0")}`, m.alt, ref[i]]));
  };
  for (const [sk, targets] of Object.entries(F.year.sites)) for (const [id, ref] of Object.entries(targets)) add(`${SITES[sk].name} ${id}`, yearAltitudes(SITES[sk], now, F.targets[id]), ref);
  const athens = SITES[H.year.site];
  for (const [id, ref] of Object.entries(H.year.bodies)) add(`${athens.name} ${id}`, yearAltitudes(athens, now, { body: PLANET_BY_ID[id as SolarSystemId].body as A.Body }), ref);
  return rows;
}

/**
 * Above the horizon the strip shows "up to N°"; below it, just "below the horizon" (refraction models disagree
 * there by up to ~0.7°, so only the side of the horizon is checked).
 */
function checkYear(tol: number) {
  const p = problems();
  for (const [label, app, ref] of yearRows()) {
    if (ref > 0.5) p.num(label, app, ref, tol);
    else p.check(app < 1, `${label}: app ${app.toFixed(2)}° but it is below the horizon (ref ${ref.toFixed(2)}°)`);
  }
  return p.out;
}

test("'Through the year' monthly altitudes (highest within ±2 h of midnight) within 1° of the exact maxima", () => {
  assert.deepEqual(checkYear(1), []);
});

/** yearAltitudes refines the best half-hourly sample to the exact highest moment, so it holds near the zenith too. */
test("'Through the year' monthly altitudes ≤ 0.2° of the exact maxima", () => {
  assert.deepEqual(checkYear(TOL.alt), []);
});
