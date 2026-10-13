/**
 * Data sanity: the object catalog (shared/data/catalog.json) and the object facts behind the About and
 * "How big is it?" sections (shared/data/objectFacts.json) — every entry within physically sane bounds,
 * and a table of well-known published values, each with its source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import catalogJson from "./data/catalog.json";
import factsJson from "./data/objectFacts.json";
import { constellationOf, separation } from "./astro/core";
import { SOLAR_SYSTEM } from "./astro/planets";
import type { CatalogObject, ObjectType } from "./data/types";
import type { ObjectFacts } from "./stories";

const CATALOG = catalogJson as unknown as CatalogObject[];
const FACTS = factsJson as unknown as Record<string, ObjectFacts>;
const BY_ID = new Map(CATALOG.map((o) => [o.id, o]));

const TYPES = new Set<ObjectType>([
  "galaxy",
  "galaxy_group",
  "open_cluster",
  "globular_cluster",
  "cluster_nebula",
  "planetary_nebula",
  "emission_nebula",
  "reflection_nebula",
  "dark_nebula",
  "supernova_remnant",
  "double_star",
  "asterism",
  "star_cloud",
  "star",
]);

// ------------------------------------------------------------------------------------ catalog

test("catalog: unique ids, known types, J2000 positions on the sphere, constellation matches the position", () => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const o of CATALOG) {
    if (seen.has(o.id)) problems.push(`${o.id}: duplicate id`);
    seen.add(o.id);
    if (!/^[A-Za-z0-9-]+$/.test(o.id)) problems.push(`${o.id}: id is not URL-safe`);
    if (!TYPES.has(o.type)) problems.push(`${o.id}: unknown type ${o.type}`);
    if (!(o.ra >= 0 && o.ra < 24)) problems.push(`${o.id}: RA ${o.ra} h`);
    if (!(o.dec >= -90 && o.dec <= 90)) problems.push(`${o.id}: Dec ${o.dec}°`);
    if (!o.name || !o.designations?.length) problems.push(`${o.id}: no name or designations`);
    // IAU boundaries (astronomy-engine's Constellation, from Roman 1987).
    if (constellationOf(o.ra, o.dec) !== o.con) problems.push(`${o.id}: con ${o.con}, position is in ${constellationOf(o.ra, o.dec)}`);
  }
  assert.deepEqual(problems, []);
});

test("catalog: magnitudes, sizes and double-star figures are plausible", () => {
  const problems: string[] = [];
  for (const o of CATALOG) {
    // Sirius (−1.46) is the brightest; the faintest galaxies listed are ~15.
    if (o.mag !== undefined && !(o.mag >= -1.5 && o.mag <= 16)) problems.push(`${o.id}: mag ${o.mag}`);
    if (o.mag === undefined && (o.type === "star" || o.type === "double_star" || o.type === "globular_cluster" || o.type === "galaxy")) problems.push(`${o.id}: no magnitude`);
    if (o.size) {
      const [a, b] = o.size;
      // From a few arcseconds (small planetaries) to the ~11° of the largest nebulae/clouds.
      if (!(a > 0 && a <= 700)) problems.push(`${o.id}: size ${a}′`);
      if (b !== undefined && !(b > 0 && b <= a)) problems.push(`${o.id}: minor axis ${b}′ vs major ${a}′`);
    }
    if (o.type === "double_star" && !(o.sep !== undefined && o.sep > 0 && o.sep < 3600)) problems.push(`${o.id}: separation ${o.sep}″`);
    if (o.mag2 !== undefined && o.mag !== undefined && o.mag2 < o.mag - 0.01) problems.push(`${o.id}: companion ${o.mag2} brighter than primary ${o.mag}`);
    if (o.bv !== undefined && !(o.bv > -0.5 && o.bv < 6)) problems.push(`${o.id}: B−V ${o.bv}`);
    if (o.vary && !(o.vary[0] < o.vary[1])) problems.push(`${o.id}: variability range ${o.vary}`);
  }
  assert.deepEqual(problems, []);
});

test("catalog: all 110 Messier objects, once each", () => {
  const m = CATALOG.filter((o) => o.m !== undefined).map((o) => o.m!);
  assert.equal(new Set(m).size, 110);
  assert.deepEqual([...m].sort((a, b) => a - b), Array.from({ length: 110 }, (_, i) => i + 1));
});

test("catalog: positions and magnitudes of well-known objects agree with SIMBAD", () => {
  // [id, RA h, Dec °, V mag or null, tolerance ′] — SIMBAD (ICRS J2000) coordinates and V magnitudes.
  const REF: [string, number, number, number | null, number][] = [
    ["sirius", 6 + 45 / 60 + 8.917 / 3600, -(16 + 42 / 60 + 58.02 / 3600), -1.46, 1], // SIMBAD α CMa
    ["vega", 18 + 36 / 60 + 56.336 / 3600, 38 + 47 / 60 + 1.28 / 3600, 0.03, 1], // SIMBAD α Lyr
    ["betelgeuse", 5 + 55 / 60 + 10.305 / 3600, 7 + 24 / 60 + 25.43 / 3600, null, 1], // SIMBAD α Ori (variable)
    ["canopus", 6 + 23 / 60 + 57.11 / 3600, -(52 + 41 / 60 + 44.4 / 3600), -0.74, 1], // SIMBAD α Car
    ["arcturus", 14 + 15 / 60 + 39.67 / 3600, 19 + 10 / 60 + 56.7 / 3600, -0.05, 1], // SIMBAD α Boo
    ["polaris", 2 + 31 / 60 + 49.09 / 3600, 89 + 15 / 60 + 50.8 / 3600, 2.0, 1], // SIMBAD α UMi (V 1.98)
    ["M31", 0 + 42 / 60 + 44.33 / 3600, 41 + 16 / 60 + 7.5 / 3600, 3.4, 1], // SIMBAD M 31 (nucleus); V 3.44 (de Vaucouleurs RC3)
    ["M13", 16 + 41 / 60 + 41.24 / 3600, 36 + 27 / 60 + 35.5 / 3600, 5.8, 1], // Harris (2010) catalogue centre; V 5.8
    ["M42", 5 + 35 / 60 + 17.3 / 3600, -(5 + 23 / 60 + 28 / 3600), 4.0, 2], // SIMBAD M 42; V 4.0 (SEDS)
    ["M57", 18 + 53 / 60 + 35.08 / 3600, 33 + 1 / 60 + 45.0 / 3600, 8.8, 1], // SIMBAD M 57; V 8.8 (SEDS)
  ];
  const off: string[] = [];
  for (const [id, ra, dec, mag, tol] of REF) {
    const o = BY_ID.get(id);
    if (!o) {
      off.push(`${id}: missing`);
      continue;
    }
    const sep = separation(o.ra, o.dec, ra, dec) * 60;
    if (sep > tol) off.push(`${id}: ${sep.toFixed(2)}′ from SIMBAD`);
    if (mag !== null && Math.abs((o.mag ?? 99) - mag) > 0.1) off.push(`${id}: mag ${o.mag} vs ${mag}`);
  }
  assert.deepEqual(off, []);
});

// ------------------------------------------------------------------------------------ object facts

test("facts: every entry belongs to a catalog object, and every figure is physically sane", () => {
  const problems: string[] = [];
  const range = (id: string, k: string, v: number | undefined, lo: number, hi: number) => {
    if (v !== undefined && !(Number.isFinite(v) && v >= lo && v <= hi)) problems.push(`${id}: ${k} ${v} outside ${lo}–${hi}`);
  };
  for (const [id, f] of Object.entries(FACTS)) {
    const o = BY_ID.get(id);
    if (!o) {
      problems.push(`${id}: not in the catalog`);
      continue;
    }
    const star = o.type === "star" || o.type === "double_star";
    // Distance: Proxima Centauri (4.2 ly) is the nearest; nothing listed is beyond a billion light-years.
    range(id, "d", f.d, 4, 1e9);
    if (star) range(id, "d (star)", f.d, 4, 20_000); // naked-eye stars are within our corner of the Galaxy
    // NGC 6397 (7,800 ly) … the outer halo, and NGC 1049 in the Fornax dwarf galaxy (~630,000 ly).
    if (o.type === "globular_cluster") range(id, "d (globular)", f.d, 5_000, 1_000_000);
    if (o.type === "galaxy") range(id, "d (galaxy)", f.d, 25_000, 1e9); // the Sagittarius dwarf (~70,000 ly) and beyond
    range(id, "r", f.r, 0.05, 2_000); // R☉: red dwarfs (Proxima 0.15) to hypergiants (VY CMa ~1,400)
    range(id, "lum", f.lum, 1e-3, 1e7); // L☉: up to η Carinae (~5×10⁶)
    range(id, "teff", f.teff, 2_000, 60_000); // K: carbon stars (~2,300) to O stars and Wolf–Rayets
    range(id, "mass", f.mass, star ? 0.07 : 1, star ? 200 : 1e13); // M☉: stars from the hydrogen-burning limit; galaxies to ~10¹³
    range(id, "age", f.age, 1e5, 1.38e10); // younger than the Universe
    range(id, "members", f.members, 1, 100_000);
    range(id, "stars", f.stars, 1e6, 1e13);
    range(id, "rhoc", f.rhoc, 0, 8); // log10 M☉/pc³ (Baumgardt)
    range(id, "vesc", f.vesc, 0, 150); // km/s
    range(id, "tdiss", f.tdiss, 0, 5_000); // Gyr left (NGC 2419, far out in the halo, ~1,600)
  }
  assert.deepEqual(problems, []);
});

test("facts: distances, sizes and masses of well-known objects agree with published values", () => {
  // [id, field, low, high, source]
  const REF: [string, keyof ObjectFacts, number, number, string][] = [
    ["M31", "d", 2.3e6, 2.7e6, "McConnachie et al. 2005, MNRAS 356, 979: 785 ± 25 kpc = 2.56 Mly"],
    ["M42", "d", 1_250, 1_450, "Menten et al. 2007, A&A 474, 515: 414 ± 7 pc = 1,350 ly (Kounkel et al. 2017: 388 pc)"],
    ["M45", "d", 420, 465, "Melis et al. 2014, Science 345, 1029 (VLBI): 136.2 ± 1.2 pc = 444 ly"],
    ["M13", "d", 22_000, 25_000, "Harris 2010 catalogue: 7.1 kpc = 23,200 ly; Baumgardt & Vasiliev 2021: 7.42 kpc"],
    ["NGC5139", "d", 15_500, 19_000, "Harris 2010: 5.2 kpc = 17,000 ly; Baumgardt & Vasiliev 2021: 5.43 kpc = 17,700 ly"],
    ["M1", "d", 5_000, 8_000, "Kaplan et al. 2008, ApJ 677, 1201: 2.0 ± 0.5 kpc = 6,500 ly"],
    ["M57", "d", 2_200, 2_800, "O'Dell et al. 2009: ~700 pc = 2,300 ly; Gaia EDR3 central star: 787 ± 18 pc = 2,570 ly"],
    ["sirius", "d", 8.4, 8.8, "van Leeuwen 2007 (Hipparcos): 379.21 mas = 8.60 ly"],
    ["vega", "d", 24.5, 25.5, "van Leeuwen 2007 (Hipparcos): 130.23 mas = 25.04 ly"],
    ["proxima-centauri", "d", 4.1, 4.35, "Gaia DR3: 768.07 mas = 4.246 ly"],
    ["polaris", "d", 390, 480, "van Leeuwen 2007: 7.54 mas = 433 ly; Bond et al. 2018 (HST): 446 ly"],
    ["betelgeuse", "d", 400, 750, "Joyce et al. 2020, ApJ 902, 63: 168 pc = 548 ly; Harper et al. 2017: 222 pc = 724 ly"],
    ["alpha-centauri", "d", 4.25, 4.5, "Kervella et al. 2016, A&A 594, A107: 747.1 mas = 4.37 ly"],
    ["arcturus", "d", 35.5, 38, "van Leeuwen 2007: 88.83 mas = 36.7 ly"],
    ["sirius", "mass", 1.95, 2.15, "Bond et al. 2017, ApJ 840, 70: Sirius A 2.063 ± 0.023 M☉"],
    ["sirius", "r", 1.65, 1.77, "Davis et al. 2011, A&A 526, L1 (interferometry): 1.711 ± 0.013 R☉"],
    ["proxima-centauri", "r", 0.14, 0.17, "Boyajian et al. 2012, ApJ 757, 112: 0.1542 ± 0.0045 R☉"],
    ["betelgeuse", "r", 600, 1_000, "Joyce et al. 2020: 764 (+116/−62) R☉; earlier interferometry ~640–890 R☉"],
    ["NGC5139", "mass", 3.0e6, 4.5e6, "Baumgardt & Hilker 2018, MNRAS 478, 1520: 3.64 × 10⁶ M☉"],
    ["M13", "mass", 4.0e5, 6.5e5, "Baumgardt & Hilker 2018: 4.5–4.8 × 10⁵ M☉"],
    ["M45", "age", 100e6, 135e6, "Stauffer et al. 1998, ApJ 499, L199 (lithium depletion): 125 ± 8 Myr; Gaia 2018 isochrones ~110 Myr"],
  ];
  const off = REF.filter(([id, k, lo, hi]) => {
    const v = FACTS[id]?.[k] as number | undefined;
    return v === undefined || !(v >= lo && v <= hi);
  }).map(([id, k, lo, hi, src]) => `${id}.${k} = ${FACTS[id]?.[k]} not in ${lo}–${hi} (${src})`);
  assert.deepEqual(off, []);
});

test("solar system radii match the NASA Planetary Fact Sheet (equatorial, 1 bar)", () => {
  // https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (km)
  const NASA: Record<string, number> = { moon: 1737.4, mercury: 2440.5, venus: 6051.8, mars: 3396.2, jupiter: 71492, saturn: 60268, uranus: 25559, neptune: 24764 };
  for (const p of SOLAR_SYSTEM) assert.ok(Math.abs(p.radiusKm / NASA[p.id] - 1) < 0.001, `${p.id}: ${p.radiusKm} km vs ${NASA[p.id]}`);
});

/**
 * A star's luminosity, radius and temperature must agree: L/L☉ = (R/R☉)² (T/5772 K)⁴ (Stefan–Boltzmann). Real
 * stars scatter within a factor ~2 (rapid rotators, binaries quoted as one, different papers). A factor of 4+
 * means a wrong figure from the Wikipedia infobox import (radius 1 for Avior, Imai, Markeb; Gamma Centauri's
 * radius = its luminosity; Hadar 0.77 R☉ — really ~9), which "How big is it?" would show as is. build_facts.py
 * (`consistent_star`) now repairs them, letting each star's own brightness and distance decide which figure is wrong.
 */
test("facts: star luminosity, radius and temperature agree (Stefan–Boltzmann)", () => {
  // η Carinae is a luminous blue variable inside its own wind: no single radius or temperature describes it.
  const SKIP = new Set(["eta-carinae"]);
  const off: string[] = [];
  for (const [id, f] of Object.entries(FACTS)) {
    if (SKIP.has(id) || !f.r || !f.teff || !f.lum) continue;
    const sb = f.r ** 2 * (f.teff / 5772) ** 4;
    const q = f.lum / sb;
    if (q > 4 || q < 1 / 4) off.push(`${id}: L ${f.lum} but R ${f.r}, T ${f.teff} K give ${sb < 10 ? sb.toFixed(1) : Math.round(sb)}`);
  }
  assert.deepEqual(off, []);
});
