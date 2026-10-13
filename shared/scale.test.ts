import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogScale, deepScale, doubleScale, earthMoonScale, nice, planetScale, satelliteScale, starScale } from "./scale";

test("planets against Earth", () => {
  const j = planetScale("jupiter", 2026)!;
  assert.equal(j.headline, "1,320 Earths could fit inside Jupiter");
  assert.match(j.lines.join(" "), /318 Earths/);
  assert.match(j.lines.join(" "), /bulges at its equator/);
  assert.match(planetScale("saturn", 2026)!.lines.join(" "), /float/);
  assert.match(planetScale("venus", 2026)!.lines.join(" "), /longer than its year/);
  assert.match(planetScale("mercury", 2026)!.headline, /Earth could hold 18 planets the size of Mercury/);
  assert.match(planetScale("neptune", 2026)!.lines.join(" "), /just once, completing that first lap in 2011/);
  assert.match(planetScale("mars", 2026)!.lines.join(" "), /almost the same as ours/);
});

test("the Moon and the planets' moons", () => {
  const m = earthMoonScale();
  assert.match(m.headline, /About 49 Moons would fill Earth — and it would take 81/);
  assert.match(m.lines.join(" "), /would just about fit in the gap/);
  assert.match(satelliteScale("ganymede", "Ganymede", "Jupiter")!.headline, /Bigger than the planet Mercury — the largest moon/);
  assert.match(satelliteScale("deimos", "Deimos", "Mars")!.lines.join(" "), /almost jump off it/);
  assert.match(satelliteScale("phobos", "Phobos", "Mars")!.lines.join(" "), /thrown ball would leave it/);
});

test("stars against the Sun", () => {
  const b = starScale({ name: "Betelgeuse", r: 640, mass: 14, lum: 65000, color: "#f90" })!;
  assert.equal(b.headline, "In the Sun’s place, it would swallow the orbits of Mercury, Venus, Earth and Mars");
  assert.match(b.lines.join(" "), /thinner than the air you breathe/);
  assert.match(b.lines.join(" "), /Light takes 50 minutes to cross it/);
  assert.equal(b.visual?.kind, "orbits");
  assert.match(starScale({ name: "Vega", r: 2.73, lum: 47.2, color: "#fff" })!.headline, /2.7 times as wide as the Sun — and 47 times as bright/);
  assert.match(starScale({ name: "Proxima Centauri", r: 0.154, mass: 0.122, color: "#f60" })!.headline, /barely 1.5 times the width of Jupiter/);
  assert.match(starScale({ name: "Arcturus", r: 25.4, color: "#fa0" })!.headline, /16,000 Suns could fit inside it/);
});

test("double stars and the deep sky", () => {
  assert.match(doubleScale("Albireo", 34.6, 430).headline, /at least 4,560 times/);
  const m13 = deepScale({ name: "M 13", type: "globular_cluster", sizeLy: 140, mass: 480000, rhoc: 3.35, vesc: 32.4, tdiss: 26.4 })!;
  assert.match(m13.headline, /About 480,000 Suns’ worth of stars/);
  assert.match(m13.lines.join(" "), /2 light-months away/);
  assert.match(m13.lines.join(" "), /longer than the universe has existed/);
  assert.match(deepScale({ name: "Pleiades", type: "open_cluster", sizeLy: 14, age: 115e6, members: 1721 })!.headline, /when dinosaurs still walked the Earth/);
  assert.match(deepScale({ name: "Andromeda", type: "galaxy", sizeLy: 129000, stars: 1e12 })!.headline, /1.3 times as wide as our Milky Way/);
  const ring = deepScale({ name: "Ring Nebula", type: "planetary_nebula", sizeLy: 1.06 })!;
  assert.equal(ring.headline, "Wide enough to stretch about a quarter of the way from the Sun to its nearest star");
  assert.match(ring.lines.join(" "), /1,110 Solar Systems, out to Neptune, side by side/);
  assert.equal(nice(1321.4), "1,320");
  assert.equal(nice(2.6e8), "260 million");
});

test("each figure is said once, and doubles are told through their main star", () => {
  const vega = starScale({ name: "Vega", r: 2.73, lum: 47.2, mass: 2.1, color: "#fff" })!;
  assert.doesNotMatch(vega.lines.join(" "), /47 Suns|2.7 times/);
  const antares = catalogScale({ type: "double_star", sep: 2.7, bv: 1.8 }, "Antares", { d: 550, r: 680, mass: 13, lum: 75900 })!;
  assert.match(antares.headline, /swallow the orbits of Mercury, Venus, Earth and Mars/);
  assert.match(antares.lines.join(" "), /Its main star is 680 times as wide/);
  assert.match(antares.lines.join(" "), /companion star is at least 455 times/);
  assert.doesNotMatch(antares.lines.join(" "), /It has 13 times the Sun’s mass/);
  assert.match(catalogScale({ type: "double_star", sep: 10 }, "Pair", { d: 100 })!.headline, /The two stars are at least/);
  const gc = deepScale({ name: "NGC 6535", type: "globular_cluster", sizeLy: 22, mass: 20000, vesc: 10.4, tdiss: 0.8 })!.lines.join(" ");
  assert.match(gc, /about the speed a rocket needs/);
  assert.match(gc, /about 800 million years/);
  assert.match(deepScale({ name: "Andromeda", type: "galaxy", sizeLy: 129000 })!.lines.join(" "), /football pitch .* smaller than a bacterium/);
  assert.match(deepScale({ name: "Cat’s Eye", type: "planetary_nebula", sizeLy: 0.2 })!.lines[0], /2 months/);
});

test("deep-sky widths are laid against the distance to a star you can see", () => {
  const bars = (sizeLy: number, type = "emission_nebula") => {
    const s = deepScale({ name: "X", type, sizeLy })!;
    assert.equal(s.visual?.kind, "bars");
    return { s, v: s.visual as Extract<NonNullable<typeof s.visual>, { kind: "bars" }> };
  };
  assert.equal(bars(34.6).s.headline, "About as wide as the gap between the Sun and Arcturus");
  assert.equal(bars(52.8).s.headline, "1.4 times as wide as the gap between the Sun and Arcturus");
  assert.equal(bars(50).v.stick.to, "Arcturus");
  assert.equal(bars(17).s.headline, "About as wide as the gap between the Sun and Altair");
  assert.equal(bars(1860).v.stick.to, "Deneb");
  assert.match(bars(5000).s.headline, /of the Milky Way’s width/);
  assert.equal(bars(0.3, "planetary_nebula").v.obj.look, "ring");
  // A cluster keeps its own headline and gets the comparison as a line.
  const m13 = deepScale({ name: "M 13", type: "globular_cluster", sizeLy: 116, mass: 480000 })!;
  assert.match(m13.lines.join(" "), /It is 1.5 times as wide as the gap between the Sun and Regulus/);
  // Wide doubles against Voyager 1's journey, close ones against Neptune's orbit.
  assert.equal((doubleScale("Wide", 30, 1400).visual as { stick: { to: string } }).stick.to, "Voyager 1 today");
  assert.equal((doubleScale("Close", 1, 100).visual as { stick: { to: string } }).stick.to, "Neptune");
});

test("the yardstick stars' distances match the app's own figures", async () => {
  const { STAR_STICKS } = await import("./scale");
  const data = (await import("./data/objectFacts.json")).default as unknown as { facts?: Record<string, { d?: number }> } & Record<string, { d?: number }>;
  const facts = (data.facts ?? data) as Record<string, { d?: number }>;
  for (const s of STAR_STICKS) {
    const d = facts[s.id]?.d;
    assert.ok(d, `${s.id} has a distance`);
    assert.ok(Math.abs(d! - s.ly) / s.ly < 0.1, `${s.id}: ${s.ly} ly here, ${d} ly in the facts`);
  }
});
