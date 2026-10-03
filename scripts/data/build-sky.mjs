#!/usr/bin/env node
// Builds the sky-chart data in shared/data/ from d3-celestial (BSD-3-Clause, Olaf Frohn):
//   stars.json, starnames.json, constellation-lines.json, constellation-labels.json, milkyway.json
// and shared/data/constellations-meta.ts (IAU names/genitives from Wikipedia, cross-checked with d3-celestial).
//
//   node scripts/data/build-sky.mjs            # uses scripts/data/.cache, downloads what is missing
//   node scripts/data/build-sky.mjs --refresh  # re-download every source
import fs from 'node:fs';
import path from 'node:path';
import { cached, wikiRevision, separationDeg, round, fmtRA, fmtDec, parseIauConstellationTable, writeJsonCompact, makeConstellationFinder, OUT_DIR } from './lib/common.mjs';
import { WIKI_REVISIONS } from './curation.mjs';

// Pinned d3-celestial commit: last change to data/ (2021-12-02); identical to master as of 2026-10.
const D3_COMMIT = 'b56735c22935b7bde41a944a74e0f780ca0c6dfa';
const D3 = (f) => `https://raw.githubusercontent.com/ofrohn/d3-celestial/${D3_COMMIT}/data/${f}`;
const MAX_STAR_MAG = 6.0;
const STARNAME_MAX_MAG = 3.0; // "brighter than mag 3.0"
const MW_MIN_STEP_DEG = 0.3; // drop Milky Way points closer than this to the previous kept point

const log = (...a) => console.log(...a);
const errors = [];

log('Loading sources…');
const stars = JSON.parse(await cached('d3-stars.6.json', D3('stars.6.json')));
const starnames = JSON.parse(await cached('d3-starnames.json', D3('starnames.json')));
const lines = JSON.parse(await cached('d3-constellations.lines.json', D3('constellations.lines.json')));
const consts = JSON.parse(await cached('d3-constellations.json', D3('constellations.json')));
const mw = JSON.parse(await cached('d3-mw.json', D3('mw.json')));
await cached('d3-LICENSE', 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/LICENSE');
const wikiIau = await wikiRevision(`wiki-iau-${WIKI_REVISIONS.iauConstellations.revid}.json`, WIKI_REVISIONS.iauConstellations.revid);
const findCon = makeConstellationFinder(await cached('cds-VI-42-data.dat', 'https://cdsarc.cds.unistra.fr/ftp/VI/42/data.dat'));

/**
 * d3-celestial stores equatorial J2000 positions as GeoJSON [lon, lat] with lon = RA in degrees
 * wrapped to (−180°, 180°]. Convert to RA in hours (0..24) and Dec in degrees.
 */
const toRaHours = (lon) => (((lon % 360) + 360) % 360) / 15;
const raRound = (h, d) => { const r = round(h, d); return r >= 24 ? round(r - 24, d) : r; };

// ---------------------------------------------------------------------------
// stars.json
const starTuples = [];
const byHip = new Map();
for (const f of stars.features) {
  const [lon, lat] = f.geometry.coordinates;
  const mag = f.properties.mag;
  const bvRaw = f.properties.bv;
  const bv = bvRaw === '' || bvRaw == null ? null : Number(bvRaw);
  if (bv != null && !Number.isFinite(bv)) throw new Error(`bad bv for HIP ${f.id}: ${bvRaw}`);
  const ra = toRaHours(lon);
  byHip.set(String(f.id), { hip: f.id, ra, dec: lat, mag, bv });
  if (mag > MAX_STAR_MAG) continue;
  const t = [raRound(ra, 3), round(lat, 3), round(mag, 2)];
  if (bv != null) t.push(round(bv, 2));
  starTuples.push({ t, mag, hip: f.id });
}
starTuples.sort((a, b) => a.mag - b.mag || a.hip - b.hip);
const starsOut = starTuples.map((s) => s.t);

log('\nCoordinate convention checks (d3-celestial → RA hours / Dec):');
for (const [name, hip, wantRa, wantDec] of [['Vega', 91262, 18.615, 38.78], ['Sirius', 32349, 6.752, -16.716]]) {
  const s = byHip.get(String(hip));
  const ok = Math.abs(s.ra - wantRa) < 0.002 && Math.abs(s.dec - wantDec) < 0.01;
  log(`  ${name.padEnd(7)} HIP ${hip}: RA ${s.ra.toFixed(4)}h (${fmtRA(s.ra)})  Dec ${s.dec.toFixed(3)}° (${fmtDec(s.dec)})  expected ≈ ${wantRa}h ${wantDec}°  ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) errors.push(`${name} position check failed`);
}

// ---------------------------------------------------------------------------
// starnames.json — proper-named stars brighter than mag 3.0 (English "name" field)
const named = [];
for (const [hip, n] of Object.entries(starnames)) {
  if (!n.name) continue;
  const s = byHip.get(hip);
  if (!s || !(s.mag < STARNAME_MAX_MAG)) continue;
  named.push({ name: n.name, ra: raRound(s.ra, 4), dec: round(s.dec, 3), mag: round(s.mag, 2), _hip: +hip });
}
named.sort((a, b) => a.mag - b.mag || a._hip - b._hip);
const starnamesOut = named.map(({ _hip, ...rest }) => rest);
for (const want of ['Sirius', 'Vega', 'Polaris', 'Betelgeuse', 'Rigel', 'Arcturus', 'Antares', 'Deneb', 'Altair', 'Canopus']) {
  if (!starnamesOut.some((s) => s.name === want)) errors.push(`starnames: ${want} missing`);
}

// ---------------------------------------------------------------------------
// constellation-lines.json — { abbr: [[ [ra,dec], … ], …] } (Serpens' two parts merged under "Ser")
const linesOut = {};
let vertexCount = 0;
let vertexMatched = 0;
const brightIndex = [...byHip.values()];
for (const f of lines.features) {
  const abbr = f.id;
  if (f.geometry.type !== 'MultiLineString') throw new Error(`unexpected geometry ${f.geometry.type} for ${abbr}`);
  const polys = f.geometry.coordinates.map((line) => line.map(([lon, lat]) => [raRound(toRaHours(lon), 3), round(lat, 3)]));
  (linesOut[abbr] ||= []).push(...polys);
  for (const line of f.geometry.coordinates) for (const [lon, lat] of line) {
    vertexCount++;
    const ra = toRaHours(lon);
    if (brightIndex.some((s) => Math.abs(s.dec - lat) < 0.02 && separationDeg(s.ra, s.dec, ra, lat) < 0.02)) vertexMatched++;
  }
}

// ---------------------------------------------------------------------------
// constellation-labels.json — [{ abbr, name, ra, dec }]
// Names follow the IAU list (d3 uses e.g. "Corona Austrina"); Serpens keeps its two part names.
const iauNameOf = Object.fromEntries(parseIauConstellationTable(wikiIau.wikitext).map((c) => [c.abbr, c.name]));
const labelsOut = consts.features.map((f) => ({
  abbr: f.id,
  name: f.id === 'Ser' ? f.properties.name : iauNameOf[f.id],
  ra: raRound(toRaHours(f.geometry.coordinates[0]), 3),
  dec: round(f.geometry.coordinates[1], 3),
}));

// ---------------------------------------------------------------------------
// constellations-meta.ts — names & genitives (Wikipedia IAU table), cross-checked against d3-celestial
const iau = parseIauConstellationTable(wikiIau.wikitext);
if (iau.length !== 88) errors.push(`IAU table has ${iau.length} rows`);
const d3Meta = new Map();
for (const f of consts.features) if (!d3Meta.has(f.id)) d3Meta.set(f.id, f.properties);
const metaDiffs = [];
for (const c of iau) {
  const d = d3Meta.get(c.abbr);
  if (!d) { errors.push(`d3-celestial lacks ${c.abbr}`); continue; }
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const d3Name = c.abbr === 'Ser' ? 'Serpens' : d.name;
  if (norm(d3Name) !== norm(c.name)) metaDiffs.push(`${c.abbr}: name "${c.name}" vs d3 "${d3Name}"`);
  if (norm(d.gen) !== norm(c.genitive)) metaDiffs.push(`${c.abbr}: genitive "${c.genitive}" vs d3 "${d.gen}"`);
}
for (const abbr of Object.keys(linesOut)) if (!iau.some((c) => c.abbr === abbr)) errors.push(`lines: unknown constellation ${abbr}`);
if (Object.keys(linesOut).length !== 88) errors.push(`constellation lines for ${Object.keys(linesOut).length} constellations`);
// Each label anchor should fall inside its own constellation (IAU boundaries, Roman 1987).
const labelOutside = labelsOut.filter((l) => findCon(l.ra, l.dec) !== l.abbr).map((l) => `${l.abbr}@${l.ra},${l.dec}→${findCon(l.ra, l.dec)}`);

const tsLines = [
  '// Generated by scripts/data/build-sky.mjs — do not edit by hand.',
  `// Source: Wikipedia "IAU designated constellations" (rev ${WIKI_REVISIONS.iauConstellations.revid}, CC BY-SA 4.0), which follows the IAU list;`,
  '// cross-checked against d3-celestial constellations.json.',
  '',
  '/** The 88 IAU constellations: 3-letter abbreviation -> official name. */',
  'export const CONSTELLATION_NAMES: Record<string, string> = {',
  ...iau.map((c) => `  ${JSON.stringify(c.abbr)}: ${JSON.stringify(c.name)},`),
  '};',
  '',
  '/** Genitive forms used in star designations, e.g. "Cyg" -> "Cygni" (as in "Beta Cygni"). */',
  'export const CONSTELLATION_GENITIVES: Record<string, string> = {',
  ...iau.map((c) => `  ${JSON.stringify(c.abbr)}: ${JSON.stringify(c.genitive)},`),
  '};',
  '',
];
fs.writeFileSync(path.join(OUT_DIR, 'constellations-meta.ts'), tsLines.join('\n'));

// ---------------------------------------------------------------------------
// milkyway.json — { levels: [{ level, polys: [[ [ra,dec], … ], …] }] }
// Each mw.json level is one GeoJSON polygon whose rings (outer boundary + holes) must be filled
// together with the even-odd rule; we keep every ring as one entry of `polys`.
let ptsIn = 0, ptsOut = 0, ringsDropped = 0;
const levels = [];
const galacticLat = (raH, decD) => {
  // IAU J2000 north galactic pole: RA 192.85948°, Dec 27.12825°
  const a = raH * 15 * Math.PI / 180, d = decD * Math.PI / 180;
  const ap = 192.85948 * Math.PI / 180, dp = 27.12825 * Math.PI / 180;
  return Math.asin(Math.sin(d) * Math.sin(dp) + Math.cos(d) * Math.cos(dp) * Math.cos(a - ap)) * 180 / Math.PI;
};
const bStats = [];
for (const f of [...mw.features].sort((a, b) => a.id.localeCompare(b.id))) {
  const level = Number(f.id.replace(/\D/g, ''));
  const polys = [];
  const rings = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(1) : f.geometry.coordinates;
  for (const ring of rings) {
    ptsIn += ring.length;
    const kept = [];
    let last = null;
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const ra = toRaHours(lon);
      const isLast = i === ring.length - 1;
      if (!last || isLast || separationDeg(last[0], last[1], ra, lat) >= MW_MIN_STEP_DEG) {
        kept.push([ra, lat]);
        last = [ra, lat];
      }
    }
    if (kept.length < 4) { ringsDropped++; continue; }
    ptsOut += kept.length;
    polys.push(kept.map(([ra, dec]) => [raRound(ra, 3), round(dec, 2)]));
    for (const [ra, dec] of kept) bStats.push(Math.abs(galacticLat(ra, dec)));
  }
  levels.push({ level, polys });
}
const mwOut = { levels };
bStats.sort((a, b) => a - b);
const medianB = bStats[Math.floor(bStats.length / 2)];
if (!(medianB < 25)) errors.push(`Milky Way points not concentrated near the galactic plane (median |b|=${medianB.toFixed(1)}°) — coordinate frame?`);

// ---------------------------------------------------------------------------
if (errors.length) {
  console.error(`\nVALIDATION FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
const sizes = {
  'stars.json': writeJsonCompact(path.join(OUT_DIR, 'stars.json'), starsOut),
  'starnames.json': writeJsonCompact(path.join(OUT_DIR, 'starnames.json'), starnamesOut),
  'constellation-lines.json': writeJsonCompact(path.join(OUT_DIR, 'constellation-lines.json'), linesOut),
  'constellation-labels.json': writeJsonCompact(path.join(OUT_DIR, 'constellation-labels.json'), labelsOut),
  'milkyway.json': writeJsonCompact(path.join(OUT_DIR, 'milkyway.json'), mwOut),
};
log('\nOutputs:');
log(`  stars.json                ${starsOut.length} stars (mag ≤ ${MAX_STAR_MAG}; ${starsOut.filter((t) => t.length === 3).length} without B−V) ${(sizes['stars.json'] / 1024).toFixed(1)} KB`);
log(`  starnames.json            ${starnamesOut.length} named stars (mag < ${STARNAME_MAX_MAG}) ${(sizes['starnames.json'] / 1024).toFixed(1)} KB`);
log(`  constellation-lines.json  ${Object.keys(linesOut).length} constellations, ${Object.values(linesOut).reduce((n, p) => n + p.length, 0)} polylines; ${vertexMatched}/${vertexCount} vertices coincide with a catalogued star  ${(sizes['constellation-lines.json'] / 1024).toFixed(1)} KB`);
log(`  constellation-labels.json ${labelsOut.length} labels (Serpens has two)  ${(sizes['constellation-labels.json'] / 1024).toFixed(1)} KB`);
log(`  milkyway.json             ${levels.length} levels, ${levels.reduce((n, l) => n + l.polys.length, 0)} rings, ${ptsIn} → ${ptsOut} points (step ${MW_MIN_STEP_DEG}°, ${ringsDropped} tiny rings dropped), median |b| ${medianB.toFixed(1)}°  ${(sizes['milkyway.json'] / 1024).toFixed(1)} KB`);
log(`  constellations-meta.ts    ${iau.length} names/genitives`);
if (metaDiffs.length) log(`  name/genitive spelling differences vs d3-celestial (Wikipedia/IAU kept):\n    ${metaDiffs.join('\n    ')}`);
if (labelOutside.length) log(`  label anchors outside their constellation boundary: ${labelOutside.join(', ')}`);
if (sizes['milkyway.json'] > 150 * 1024) log('  WARN milkyway.json exceeds 150 KB');
