import { test } from "node:test";
import assert from "node:assert/strict";
import { cometAt, cometFromElements, cometKey, heliocentricEcliptic, type CometElements, type CometPoint } from "./comets";

const sep = (ra1: number, d1: number, ra2: number, d2: number) => {
  const r = Math.PI / 180;
  const c = Math.sin(d1 * r) * Math.sin(d2 * r) + Math.cos(d1 * r) * Math.cos(d2 * r) * Math.cos((ra1 - ra2) * 15 * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

// 24P/Schaumasse, JPL SBDB elements (epoch 2024-01-05) vs JPL Horizons (perturbed) for 2026-10-05 00:00 UT:
// RA 240.06396°, Dec −20.27311°, r 3.114693 AU, Δ 3.650767 AU, T-mag 21.359.
const P24: CometElements = { e: 0.707909552000865, q: 1.184637149648941, i: 11.50232943610609, node: 78.28793113152491, peri: 58.47910605334581, tp: 2461049.059244143273, M1: 14.6, K1: 8 };

test("comets: two-body position matches JPL Horizons within a few arcminutes", () => {
  const p = cometFromElements(P24, Date.UTC(2026, 9, 5));
  const d = sep(p.ra, p.dec, 240.06396 / 15, -20.27311);
  assert.ok(d < 0.1, `separation ${d.toFixed(4)}°`);
  assert.ok(Math.abs(p.r - 3.114693) < 0.005, `r ${p.r}`); // two-body vs perturbed: ~0.002 AU after 2.75 years
  assert.ok(Math.abs(p.delta - 3.650767) < 0.005, `delta ${p.delta}`);
  assert.ok(p.mag !== null && Math.abs(p.mag - 21.359) < 0.05, `mag ${p.mag}`);
});

test("comets: at perihelion the distance from the Sun is q, for every kind of orbit", () => {
  for (const e of [0.2, 0.9, 0.999, 1, 1.0005, 1.3]) {
    const el: CometElements = { e, q: 0.8, i: 30, node: 40, peri: 50, tp: 2461000.5 };
    const r = Math.hypot(...heliocentricEcliptic(el, el.tp));
    assert.ok(Math.abs(r - 0.8) < 1e-9, `e=${e}: r=${r}`);
    // Symmetric about perihelion.
    const a = Math.hypot(...heliocentricEcliptic(el, el.tp - 40));
    const b = Math.hypot(...heliocentricEcliptic(el, el.tp + 40));
    assert.ok(Math.abs(a - b) < 1e-9, `e=${e}: ${a} vs ${b}`);
    assert.ok(a > 0.8);
  }
});

test("comets: an elliptic orbit returns to perihelion after one period", () => {
  const el: CometElements = { e: 0.6, q: 1, i: 10, node: 0, peri: 0, tp: 2460000.5 };
  const a = el.q / (1 - el.e);
  const period = (2 * Math.PI * Math.pow(a, 1.5)) / 0.01720209895;
  const p0 = heliocentricEcliptic(el, el.tp);
  const p1 = heliocentricEcliptic(el, el.tp + period);
  assert.ok(Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]) < 1e-7);
});

test("comets: interpolation wraps RA and stays inside the ephemeris", () => {
  const day = 86_400_000;
  const eph: CometPoint[] = [
    { t: 0, ra: 23.9, dec: 10, r: 1, delta: 1, mag: 8 },
    { t: day, ra: 0.1, dec: 12, r: 1.1, delta: 0.9, mag: 7 },
  ];
  const mid = cometAt(eph, day / 2)!;
  assert.ok(Math.abs(mid.ra - 0) < 1e-9 || Math.abs(mid.ra - 24) < 1e-9);
  assert.equal(mid.dec, 11);
  assert.equal(mid.mag, 7.5);
  assert.equal(cometAt(eph, 3 * day), null);
  assert.equal(cometKey("C/2023 A3"), "C2023A3");
  assert.equal(cometKey("12P"), "12P");
});
