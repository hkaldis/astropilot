import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOONS,
  galileanEvents,
  galileanPositions,
  galileanShadowAt,
  isMoonId,
  moonsOf,
  poleAngle,
  satelliteDetectability,
  seriesEvents,
  seriesPositions,
  type MoonSeriesSet,
} from "./moons";

const at = (iso: string) => Date.parse(iso);

test("catalog: twenty moons, each tied to a planet that has them", () => {
  assert.equal(MOONS.length, 20);
  assert.deepEqual(
    moonsOf("jupiter").map((m) => m.id),
    ["io", "europa", "ganymede", "callisto"],
  );
  assert.equal(moonsOf("saturn").length, 8);
  assert.equal(moonsOf("uranus").length, 5);
  assert.ok(isMoonId("Titan") && !isMoonId("jupiter"));
});

test("Galilean positions and brightness match JPL Horizons", () => {
  // Horizons, 2026-10-05 00:00 UT: offsets from Jupiter (arcsec east, north) and V magnitude.
  const ref = { io: [48.052, -17.916, 6.109], ganymede: [233.364, -88.388, 5.604] } as const;
  const pos = galileanPositions(at("2026-10-05T00:00:00Z"));
  for (const [id, [x, y, mag]] of Object.entries(ref)) {
    const p = pos.find((m) => m.id === id)!;
    assert.ok(Math.hypot(p.dx - x, p.dy - y) < 0.6, `${id} position off by ${Math.hypot(p.dx - x, p.dy - y).toFixed(2)}″`);
    assert.ok(Math.abs(p.mag! - mag) < 0.15, `${id} magnitude ${p.mag} vs ${mag}`);
  }
});

test("Galilean events: transits, shadows, eclipses and occultations in order and on time", () => {
  const evs = galileanEvents(at("2026-10-05T00:00:00Z"), at("2026-10-07T00:00:00Z"));
  const find = (moon: string, kind: string) => evs.find((e) => e.moon === moon && e.kind === kind)!;
  // Horizons (5-minute samples): Io in front of Jupiter 16:30–18:50, eclipsed from 12:35–12:40 on the 6th,
  // behind the planet from 13:35–13:40 until 15:55–16:00.
  const tr = find("io", "transit");
  assert.ok(Math.abs(tr.start! - at("2026-10-05T16:30:00Z")) < 5 * 60_000);
  assert.ok(Math.abs(tr.end! - at("2026-10-05T18:48:00Z")) < 5 * 60_000);
  const ec = find("io", "eclipse");
  assert.ok(ec.start! > at("2026-10-06T12:30:00Z") && ec.start! < at("2026-10-06T12:45:00Z"));
  const oc = find("io", "occultation");
  assert.ok(oc.start! > at("2026-10-06T13:30:00Z") && oc.end! < at("2026-10-06T16:05:00Z"));
  // Before opposition the shadow leads the moon onto the disk.
  const sh = find("io", "shadow");
  assert.ok(sh.start! < tr.start! && sh.end! < tr.end!);
  assert.ok(galileanShadowAt(at("2026-10-05T16:00:00Z")) && !galileanShadowAt(at("2026-10-05T03:00:00Z")));
});

test("Iapetus-style series: interpolation, hidden states and events", () => {
  // A moon on a circle of 100″, one sample every 15 minutes, transit then occultation codes.
  const n = 40;
  const step = 15 * 60_000;
  const x = Array.from({ length: n }, (_, i) => 100 * Math.cos((i / n) * 2 * Math.PI));
  const y = Array.from({ length: n }, (_, i) => 100 * Math.sin((i / n) * 2 * Math.PI));
  const vis = "*".repeat(10) + "t".repeat(5) + "*".repeat(10) + "O".repeat(5) + "*".repeat(10);
  const set: MoonSeriesSet = { planet: "saturn", t0: 0, step, moons: [{ id: "titan", x, y, mag: x.map(() => 8.3), vis }] };
  const mid = seriesPositions(set, 2.5 * step)![0];
  const truth = 100 * Math.cos((2.5 / n) * 2 * Math.PI);
  assert.ok(Math.abs(mid.dx - truth) < 0.05, `interpolated ${mid.dx} vs ${truth}`);
  assert.equal(seriesPositions(set, 12 * step)![0].transit, true);
  assert.equal(seriesPositions(set, 27 * step)![0].occulted, true);
  assert.equal(seriesPositions(set, -1), null);
  const evs = seriesEvents(set, 0, (n - 1) * step);
  assert.deepEqual(
    evs.map((e) => e.kind),
    ["transit", "occultation"],
  );
  assert.equal(evs[0].start, 9.5 * step);
});

test("with the planet's disk known, transits and occultations are timed at the limb, not the samples", () => {
  // Moons gliding 5″ per 15 minutes straight across a disk 10″ in radius: they cross the limb at
  // sample 8.46 and leave it at 12.46. The codes only say which side; eclipses keep the sample timing.
  const step = 15 * 60_000;
  const track = Array.from({ length: 21 }, (_, i) => -52.3 + 5 * i);
  const zero = track.map(() => 0);
  const mag = track.map(() => 10);
  const codes = (c: string) => "*".repeat(9) + c.repeat(4) + "*".repeat(8);
  const set: MoonSeriesSet = {
    planet: "saturn",
    t0: 0,
    step,
    disk: { radius: 10, polar: 9, pole: 0 },
    moons: [
      { id: "tethys", x: track, y: zero, mag, vis: codes("t") },
      { id: "dione", x: track.map((x) => -x), y: zero, mag, vis: codes("O") },
      { id: "rhea", x: track.map(() => 80), y: zero, mag, vis: "***uuu" + "*".repeat(15) },
    ],
  };
  const evs = seriesEvents(set, 0, 20 * step);
  const one = (moon: string) => evs.find((e) => e.moon === moon)!;
  for (const [moon, kind] of [["tethys", "transit"], ["dione", "occultation"]] as const) {
    const e = one(moon);
    assert.equal(e.kind, kind);
    assert.ok(Math.abs(e.start! - 8.46 * step) < 2000, `${moon} starts at ${e.start! / step}`);
    assert.ok(Math.abs(e.end! - 12.46 * step) < 2000, `${moon} ends at ${e.end! / step}`);
    assert.ok(!e.approx);
  }
  assert.deepEqual(one("rhea"), { moon: "rhea", kind: "eclipse", start: 2.5 * step, end: 5.5 * step, approx: true });
  // The slider agrees with the list: in front from the moment it crosses the limb.
  const tethysAt = (f: number) => seriesPositions(set, f * step)!.find((p) => p.id === "tethys")!;
  assert.equal(tethysAt(8.4).transit, false);
  assert.equal(tethysAt(8.5).transit, true);
  assert.equal(tethysAt(12.5).transit, false);
  // Just inside the sphere but beyond the flattened pole: no transit.
  const polar: MoonSeriesSet = { ...set, moons: [{ ...set.moons[0], y: track.map(() => 9.5), x: track.map((x) => x / 5) }] };
  assert.equal(seriesEvents(polar, 0, 20 * step).filter((e) => e.kind === "transit").length, 0);
});

test("visibility beside a bright planet follows observers' experience", () => {
  const sky = { sqmZenith: 20.5, alt: 45 };
  const titan = satelliteDetectability(8.4, 180, 0.6, "Saturn", { ...sky, apertureMm: 100 });
  assert.equal(titan.difficulty, "easy");
  const mimas = satelliteDetectability(12.9, 30, 0.6, "Saturn", { ...sky, apertureMm: 250 });
  assert.ok(["challenging", "very hard"].includes(mimas.difficulty), mimas.difficulty);
  assert.ok(mimas.glare > 1, "Saturn's glare should matter for Mimas");
  const io = satelliteDetectability(5.0, 120, -2.5, "Jupiter", { ...sky, apertureMm: 50 });
  assert.equal(io.difficulty, "easy");
  const ioEye = satelliteDetectability(5.0, 120, -2.5, "Jupiter", { ...sky, apertureMm: 7 });
  assert.ok(["very hard", "out of reach", "challenging"].includes(ioEye.difficulty), ioEye.difficulty);
  const phobos = satelliteDetectability(11.3, 20, -2.0, "Mars", { ...sky, apertureMm: 200 });
  assert.ok(["very hard", "out of reach"].includes(phobos.difficulty), phobos.difficulty);
  assert.ok((phobos.needsMm ?? 0) > 200);
});

test("pole angle: Saturn's axis points close to celestial north from Earth", () => {
  const pa = poleAngle("saturn", 0.3, 1.0)!;
  assert.ok(pa < 15 || pa > 345, `Saturn pole PA ${pa}`);
  assert.equal(poleAngle("venus", 0, 0), null);
});
