/**
 * Regression tests for the 2026-10 platform audit: each pins a fix checked against an outside reference
 * (JPL Horizons, NASA eclipse tables, the IMO calendar, Heavens-Above, observers' rules of thumb).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyState,
  detectability,
  meteorPeak,
  METEOR_SHOWERS,
  nightFrames,
  nightOf,
  objectTrack,
  planetaryEvents,
  resolutionArcsec,
  skyBrightnessAt,
  sqmForBortle,
  sunGeometricAltitude,
  upcomingEvents,
} from "./index";

const at = (iso: string) => Date.parse(iso);
const minutes = (a: number, b: number) => Math.abs(a - b) / 60_000;

test("Saturn's and Neptune's magnitudes follow Mallama & Hilton (2018), as Horizons does", () => {
  const athens = { lat: 37.98, lon: 23.73, elevation: 99 };
  // Horizons, 2026-10-05 22:00 UT: Saturn 0.33, Neptune 7.68.
  assert.ok(Math.abs(bodyState("saturn", at("2026-10-05T22:00:00Z"), athens).mag - 0.33) < 0.06);
  assert.ok(Math.abs(bodyState("neptune", at("2026-10-05T22:00:00Z"), athens).mag - 7.68) < 0.05);
});

test("Saturn's opposition is timed on apparent geocentric longitudes (Horizons 2026-10-04 12:29 UT)", () => {
  const opp = planetaryEvents(at("2026-09-20T00:00:00Z"), 30).find((e) => e.kind === "opposition" && e.body === "saturn")!;
  assert.ok(minutes(opp.time, at("2026-10-04T12:29:00Z")) < 6, new Date(opp.time).toISOString());
});

test("meteor peaks at the IMO's J2000 solar longitudes (Leonids 2026 23:45 UT, Geminids 13:41 UT)", () => {
  const leo = METEOR_SHOWERS.find((s) => s.id === "leo")!;
  const gem = METEOR_SHOWERS.find((s) => s.id === "gem")!;
  assert.ok(minutes(meteorPeak(leo, 2026)!, at("2026-11-17T23:45:00Z")) < 3);
  assert.ok(minutes(meteorPeak(gem, 2026)!, at("2026-12-14T13:41:00Z")) < 3);
});

test("solar eclipses: the time at the site, and partial ones setting or rising under way", () => {
  const athens = { lat: 37.98, lon: 23.73, elevation: 99, timezone: "Europe/Athens" };
  const aug2 = upcomingEvents(at("2027-08-01T00:00:00Z"), 3, athens).find((e) => e.id.startsWith("se-"))!;
  // NASA: maximum at Athens 09:33 UT (the global maximum is 10:06 UT).
  assert.ok(minutes(aug2.time, at("2027-08-02T09:33:00Z")) < 3, new Date(aug2.time).toISOString());
  assert.ok(aug2.start! < aug2.time && aug2.end! > aug2.time);
  // Rome, 2026-08-12: begins at 17:32 UT with the Sun 6.7° up and sets eclipsed — visible, not "not visible".
  const rome = { lat: 41.9, lon: 12.5, elevation: 20, timezone: "Europe/Rome" };
  const aug12 = upcomingEvents(at("2026-08-11T00:00:00Z"), 3, rome).find((e) => e.id.startsWith("se-"))!;
  assert.ok(aug12.importance >= 2 && /sets eclipsed/.test(aug12.detail), aug12.detail);
  assert.ok(minutes(aug12.time, at("2026-08-12T17:32:40Z")) < 2);
});

test("meteor showers at the site: the radiant's height through all of darkness, and nights that never darken", () => {
  const apia = { lat: -13.83, lon: -171.76, elevation: 2, timezone: "Pacific/Apia" };
  const qua = upcomingEvents(at("2027-01-02T00:00:00Z"), 3, apia).find((e) => e.id.startsWith("meteor-qua"))!;
  assert.ok(qua.importance === 2 && /climbs to 7°/.test(qua.detail), qua.detail);
  const tromso = { lat: 69.65, lon: 18.96, elevation: 10, timezone: "Europe/Oslo" };
  const per = upcomingEvents(at("2026-08-11T00:00:00Z"), 4, tromso).find((e) => e.id.startsWith("meteor-per"))!;
  assert.ok(per.importance === 1 && /doesn't get dark/.test(per.detail), per.detail);
});

test("twilight is judged on the Sun's geometric altitude, like the night's dusk and dawn", () => {
  const athens = { lat: 37.98, lon: 23.73, elevation: 99 };
  const n = nightOf("2026-10-05", athens);
  assert.ok(Math.abs(sunGeometricAltitude(n.astroDusk!, athens) + 18) < 0.02);
  assert.ok(Math.abs(sunGeometricAltitude(n.civilDusk!, athens) + 6) < 0.02);
});

test("a night without darkness still reports how high things get (midnight sun at Tromsø)", () => {
  const tromso = { lat: 69.65, lon: 18.96, elevation: 10 };
  const n = nightOf("2026-06-21", tromso);
  const tr = objectTrack(16.695, 36.46, nightFrames(n, tromso, 10)); // M13
  assert.equal(tr.noDarkness, true);
  assert.ok(tr.maxAlt > 50 && tr.window === null);
});

test("the sky brightens towards the horizon (not darker, as the star airmass would make it)", () => {
  const sqm = 20.2;
  assert.ok(skyBrightnessAt(sqm, 2) < skyBrightnessAt(sqm, 30));
  assert.ok(skyBrightnessAt(sqm, 30) < skyBrightnessAt(sqm, 90));
  assert.ok(Math.abs(skyBrightnessAt(sqm, 90) - sqm) < 0.01);
});

test("stars and planets fainter than the limit are out of reach (Neptune to the naked eye)", () => {
  const d = detectability({ type: "planet", mag: 7.8 }, { sqmZenith: sqmForBortle(5), apertureMm: 7, alt: 50, instrument: "eye" });
  assert.equal(d.difficulty, "out of reach");
});

test("double stars: the eye and binoculars resolve what their magnification allows", () => {
  assert.ok(resolutionArcsec({ apertureMm: 7, instrument: "eye" }) >= 100);
  assert.ok(Math.abs(resolutionArcsec({ apertureMm: 50, instrument: "binoculars", power: 10 }) - 12) < 0.5);
  assert.ok(resolutionArcsec({ apertureMm: 203, instrument: "telescope" }) < 0.6);
  const sky = { sqmZenith: sqmForBortle(4), alt: 60 };
  const castor = { type: "double_star", mag: 1.9, mag2: 2.9, sep: 5.8 };
  assert.equal(detectability(castor, { ...sky, apertureMm: 50, instrument: "binoculars", power: 10 }).difficulty, "out of reach");
  assert.equal(detectability(castor, { ...sky, apertureMm: 203, instrument: "telescope" }).difficulty, "easy");
  // 15×70 binoculars are binoculars, not a 70 mm telescope at 140×.
  assert.equal(detectability(castor, { ...sky, apertureMm: 70, instrument: "binoculars", power: 15 }).difficulty, "out of reach");
  // Mizar–Alcor splits to the naked eye; the Double Double's close pairs need a telescope, its wide pair doesn't.
  const mizar = { type: "double_star", mag: 2.23, mag2: 3.88, sep: 14.4, wide: [715.5, 2.23, 4.0] as [number, number, number] };
  assert.notEqual(detectability(mizar, { ...sky, apertureMm: 7, instrument: "eye" }).difficulty, "out of reach");
  const eps = { type: "double_star", mag: 5.15, mag2: 6.1, sep: 2.1, wide: [209.4, 4.77, 4.6] as [number, number, number] };
  assert.equal(detectability(eps, { ...sky, apertureMm: 50, instrument: "binoculars", power: 10 }).difficulty, "easy");
  assert.match(detectability(eps, { ...sky, apertureMm: 203, instrument: "telescope" }).note, /high magnification/);
});

test("galaxies with blue catalog magnitudes are rated on their visual brightness (NGC 253)", () => {
  const ngc253 = { type: "galaxy", mag: 7.94, magB: true, size: [26.79, 4.58], sb: 13.53, hubble: "SABc" };
  const asB = detectability({ ...ngc253, magB: false }, { sqmZenith: sqmForBortle(5), apertureMm: 203, alt: 60 });
  const asV = detectability(ngc253, { sqmZenith: sqmForBortle(5), apertureMm: 203, alt: 60 });
  assert.ok(asV.index > asB.index + 0.5);
});
