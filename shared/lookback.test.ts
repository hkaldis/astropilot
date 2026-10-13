import { test } from "node:test";
import assert from "node:assert/strict";
import { DEEP_TIME, HISTORY, galacticXYZ, lookback, niceYears, toGalactic } from "./lookback";

test("galactic coordinates: the Galactic centre, Andromeda and the north Galactic pole", () => {
  const gc = toGalactic(17.7611, -29.0078); // Sgr A*
  assert.ok(Math.min(gc.l, 360 - gc.l) < 0.1 && Math.abs(gc.b) < 0.1, JSON.stringify(gc));
  const m31 = toGalactic(0.7123, 41.269);
  assert.ok(Math.abs(m31.l - 121.17) < 0.1 && Math.abs(m31.b + 21.57) < 0.1, JSON.stringify(m31));
  assert.ok(toGalactic(12.857, 27.128).b > 89.9);
  const p = galacticXYZ(17.7611, -29.0078, 26_700);
  assert.ok(Math.abs(p.x - 26_700) < 10 && Math.abs(p.y) < 50 && Math.abs(p.z) < 50);
});

test("lookback: calendar history for recent light, deep time beyond", () => {
  const pleiades = lookback(440, 2026);
  assert.equal(pleiades.when, "around 1585");
  assert.match(pleiades.moment, /years before Galileo first turned a telescope to the sky/);
  assert.match(lookback(24_000, 2026).moment, /Ice Age/);
  assert.match(lookback(2_500_000, 2026).moment, /stone tools/);
  assert.match(lookback(56_000_000, 2026).moment, /without dinosaurs/);
  assert.equal(lookback(11.4, 2026).when, "in 2015");
  assert.match(lookback(4600, 2026).moment, /Great Pyramid/);
  assert.equal(lookback(4600, 2026).when, "around 2580 BC"); // 2026 − 4600 = −2574 = 2575 BC
  // Every age has a moment.
  for (let ago = 1; ago < 1e10; ago *= 1.7) assert.ok(lookback(ago, 2026).moment.length > 10, String(ago));
});

test("history and deep time are in order and seamless", () => {
  for (let i = 1; i < HISTORY.length; i++) assert.ok(HISTORY[i].year < HISTORY[i - 1].year);
  for (let i = 1; i < DEEP_TIME.length; i++) assert.equal(DEEP_TIME[i].from, DEEP_TIME[i - 1].to);
  assert.equal(niceYears(2_500_000), "2.5 million");
  assert.equal(niceYears(24_130), "24,000");
  assert.equal(niceYears(23), "25");
});
