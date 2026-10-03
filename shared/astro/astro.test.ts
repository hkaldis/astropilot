import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "astronomy-engine";
import {
  nightOf,
  currentNightDate,
  altAzOf,
  horizonFrame,
  eqjVector,
  observerOf,
  detectability,
  sqmForBortle,
  rankEyepieces,
  bodyState,
  moonQuarters,
  formatDec,
  formatRA,
} from "./index";

const athens = { lat: 37.98, lon: 23.73, elevation: 100 };
const hhmm = (ms: number | null, offsetH: number) => (ms === null ? null : new Date(ms + offsetH * 3.6e6).toISOString().slice(11, 16));

test("Athens night of 2026-10-04: sunset ≈ 19:03 local, full darkness", () => {
  const n = nightOf("2026-10-04", athens);
  assert.equal(n.darkness, "astronomical");
  const sunset = hhmm(n.sunset, 3)!;
  assert.ok(sunset >= "19:00" && sunset <= "19:06", `sunset ${sunset}`);
  const sunrise = hhmm(n.sunrise, 3)!;
  assert.ok(sunrise >= "07:20" && sunrise <= "07:28", `sunrise ${sunrise}`);
  assert.ok(n.darkHours > 9 && n.darkHours < 10);
});

test("London at midsummer has no astronomical darkness, only nautical", () => {
  const n = nightOf("2026-06-21", { lat: 51.5, lon: -0.12 });
  assert.equal(n.darkness, "nautical");
});

test("Tromsø at midsummer: midnight sun", () => {
  const n = nightOf("2026-06-21", { lat: 69.65, lon: 18.96 });
  assert.equal(n.darkness, "none");
  assert.equal(n.sunNeverSets, true);
});

test("'tonight' follows the site's solar day, not UTC", () => {
  // 16:00 PDT on 4 Oct in Los Angeles is 23:00 UTC; tonight there is still the 4th.
  assert.equal(currentNightDate(Date.parse("2026-10-04T23:00:00Z"), { lat: 34.05, lon: -118.24 }), "2026-10-04");
  // 03:00 PDT on 5 Oct is still the night of the 4th.
  assert.equal(currentNightDate(Date.parse("2026-10-05T10:00:00Z"), { lat: 34.05, lon: -118.24 }), "2026-10-04");
  // Tokyo 21:00 JST on 5 Oct (12:00 UTC) is the night of the 5th.
  assert.equal(currentNightDate(Date.parse("2026-10-05T12:00:00Z"), { lat: 35.68, lon: 139.69 }), "2026-10-05");
});

test("fast horizon frames agree with astronomy-engine to < 0.02°", () => {
  const t = new Date("2026-10-04T20:30:00Z");
  const obs = observerOf(athens);
  for (const [ra, dec] of [
    [0.7123, 41.269],
    [18.6156, 38.7837],
    [2.5303, 89.2641],
  ]) {
    A.DefineStar(A.Body.Star1, ra, dec, 1000);
    const eq = A.Equator(A.Body.Star1, t, obs, true, true);
    const hor = A.Horizon(t, obs, eq.ra, eq.dec, "normal");
    const mine = altAzOf(horizonFrame(t, athens), eqjVector(ra, dec));
    assert.ok(Math.abs(mine.alt - hor.altitude) < 0.02, `alt ${mine.alt} vs ${hor.altitude}`);
    assert.ok(Math.abs(((mine.az - hor.azimuth + 540) % 360) - 180) < 0.05, `az ${mine.az} vs ${hor.azimuth}`);
  }
});

test("Moon phases: new Moon on 2026-10-10 and full Moon on 2026-10-26", () => {
  const q = moonQuarters(Date.parse("2026-10-04T00:00:00Z"), 30);
  const nm = q.find((x) => x.quarter === 0)!;
  const fm = q.find((x) => x.quarter === 2)!;
  assert.equal(new Date(nm.time).toISOString().slice(0, 10), "2026-10-10");
  assert.equal(new Date(fm.time).toISOString().slice(0, 10), "2026-10-26");
});

test("Saturn is near opposition in early October 2026 (bright, ~20″)", () => {
  const s = bodyState("saturn", Date.parse("2026-10-04T22:00:00Z"), athens);
  assert.ok(s.mag < 0.6 && s.diameter > 19 && s.diameter < 21);
  assert.ok(s.elongation > 170);
});

test("detectability: M31 easy and M101 very hard from a Bortle 5 suburb with an 8-inch", () => {
  const sqm = sqmForBortle(5);
  // OpenNGC values (SurfBr is B-band, mean inside D25).
  const M31 = { type: "galaxy", mag: 3.44, size: [177.8, 69.7], sb: 14.74, hubble: "Sb" };
  const m31 = detectability(M31, { sqmZenith: sqm, apertureMm: 203, alt: 60 });
  const m101 = detectability({ type: "galaxy", mag: 7.9, size: [24, 23.1], sb: 15.08, hubble: "SABc" }, { sqmZenith: sqm, apertureMm: 203, alt: 60 });
  assert.equal(m31.difficulty, "easy");
  assert.ok(["very hard", "out of reach"].includes(m101.difficulty));
  // A full Moon 20° away makes M31 harder.
  const m31Moon = detectability(M31, { sqmZenith: sqm, apertureMm: 203, alt: 60, moon: { alt: 50, phaseAngle: 5, separation: 20 } });
  assert.ok(m31Moon.index < m31.index - 0.5);
});

test("eyepiece choice: high power for Jupiter, lowest power for a wide double like Albireo", () => {
  const scope = { aperture: 203, focalLength: 1200 };
  const eps = [{ focalLength: 25, afov: 52 }, { focalLength: 10, afov: 52 }, { focalLength: 6, afov: 66 }, { focalLength: 32, afov: 52 }];
  const jup = rankEyepieces(scope, eps, [{ factor: 2 }], { type: "planet" }, { sizeArcmin: 0.75 });
  assert.ok(jup[0].setup.magnification >= 190);
  const alb = rankEyepieces(scope, eps, [], { type: "double_star", sep: 34.4 });
  assert.ok(alb[0].setup.magnification < 60);
});

test("coordinate formatting handles negative declinations and rounding", () => {
  assert.equal(formatDec(-5.3), "−05° 18′ 00″");
  assert.equal(formatDec(-0.4), "−00° 24′ 00″");
  assert.equal(formatRA(13.99999), "14h 00m 00s");
});
