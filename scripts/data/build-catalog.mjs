#!/usr/bin/env node
// Builds shared/data/catalog.json (CatalogObject[]) from OpenNGC, the Wikipedia Caldwell/Messier
// tables, Harris (2010) globular-cluster photometry, and WDS/ORB6/SIMBAD for double stars.
//
//   node scripts/data/build-catalog.mjs            # uses scripts/data/.cache, downloads what is missing
//   node scripts/data/build-catalog.mjs --refresh  # re-download every source
import fs from 'node:fs';
import path from 'node:path';
import {
  cached, wikiRevision, wikiRevisions, parseDelimited, hmsToHours, dmsToDeg, separationDeg, round, fmtRA, fmtDec,
  makeConstellationFinder, GREEK, parseIauConstellationTable, writeJsonCompact, OUT_DIR,
} from './lib/common.mjs';
import * as CUR from './curation.mjs';
import { buildDoubleStars } from './lib/doubles.mjs';

const OPENNGC_COMMIT = '75ca7ff090e1d0081a5b08be70eb3bc45ccd9e06'; // 2026-09-27 (after release v20260501)
const OPENNGC_RAW = `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${OPENNGC_COMMIT}/database_files`;
const SB_ARCSEC2_TO_ARCMIN2 = 2.5 * Math.log10(3600); // 8.8907

const log = (...a) => console.log(...a);
const warn = (...a) => console.log('  WARN', ...a);

// ---------------------------------------------------------------------------
// 1. Sources
log('Loading sources…');
const ngcRows = parseDelimited(await cached('NGC.csv', `${OPENNGC_RAW}/NGC.csv`));
const addRows = parseDelimited(await cached('addendum.csv', `${OPENNGC_RAW}/addendum.csv`));
const harrisText = await cached('harris-mwgc.dat', 'https://physics.mcmaster.ca/~harris/mwgc.dat');
const boundaries = await cached('cds-VI-42-data.dat', 'https://cdsarc.cds.unistra.fr/ftp/VI/42/data.dat');
const wikiCaldwell = await wikiRevision(`wiki-caldwell-${CUR.WIKI_REVISIONS.caldwell.revid}.json`, CUR.WIKI_REVISIONS.caldwell.revid);
const wikiMessier = await wikiRevision(`wiki-messier-${CUR.WIKI_REVISIONS.messier.revid}.json`, CUR.WIKI_REVISIONS.messier.revid);
const wikiIau = await wikiRevision(`wiki-iau-${CUR.WIKI_REVISIONS.iauConstellations.revid}.json`, CUR.WIKI_REVISIONS.iauConstellations.revid);

const findCon = makeConstellationFinder(boundaries);
const IAU = parseIauConstellationTable(wikiIau.wikitext);
if (IAU.length !== 88) throw new Error(`Expected 88 IAU constellations, got ${IAU.length}`);
const CON_NAME = Object.fromEntries(IAU.map((c) => [c.abbr, c.name]));
const CON_GEN = Object.fromEntries(IAU.map((c) => [c.abbr, c.genitive]));

const allRows = [...ngcRows.map((r) => ({ ...r, _src: 'NGC.csv' })), ...addRows.map((r) => ({ ...r, _src: 'addendum.csv' }))];
const rowByName = new Map(allRows.map((r) => [r.Name, r]));
const num = (s) => (s === '' || s == null ? null : Number(s));
log(`  OpenNGC: ${ngcRows.length} + ${addRows.length} rows (commit ${OPENNGC_COMMIT.slice(0, 7)})`);

// ---------------------------------------------------------------------------
// 2. Harris (2010) Milky Way globular clusters: positions (Part I) and integrated V_t (Part II)
const harris = (() => {
  const lines = harrisText.split(/\r?\n/);
  const p1 = lines.findIndex((l) => l.includes('Part I:'));
  const p2 = lines.findIndex((l) => l.includes('Part II:'));
  const p3 = lines.findIndex((l) => l.includes('Part III:'));
  const byId = new Map();
  for (const l of lines.slice(p1, p2)) {
    const m = l.slice(25, 50).match(/^(\d\d) (\d\d) ([\d.]+)\s+([+-]\d\d) (\d\d) ([\d.]+)/);
    if (!m) continue;
    const id = l.slice(0, 12).trim();
    const name = l.slice(12, 25).trim();
    const ra = +m[1] + +m[2] / 60 + +m[3] / 3600;
    const sg = m[4].startsWith('-') ? -1 : 1;
    const dec = sg * (Math.abs(+m[4]) + +m[5] / 60 + +m[6] / 3600);
    const rSunKpc = num(l.slice(66, 73).trim());
    byId.set(id, { id, name, ra, dec, rSunKpc });
  }
  for (const l of lines.slice(p2, p3)) {
    const id = l.slice(0, 12).trim();
    const vt = l.slice(40, 46).trim();
    if (byId.has(id) && /^-?\d+\.\d+$/.test(vt)) byId.get(id).vt = +vt;
  }
  const list = [...byId.values()];
  if (byId.get('NGC 104')?.vt !== 3.95 || byId.get('NGC 6838')?.vt !== 8.19) throw new Error('Harris parse check failed');
  return { byId, list };
})();
log(`  Harris 2010: ${harris.list.length} clusters, ${harris.list.filter((h) => h.vt != null).length} with V_t`);

function harrisFor(row) {
  const m = row.Name.match(/^(NGC|IC)0*(\d+)$/);
  if (m) {
    const h = harris.byId.get(`${m[1]} ${m[2]}`);
    if (h) return h;
  }
  const ra = hmsToHours(row.RA), dec = dmsToDeg(row.Dec);
  let best = null;
  for (const h of harris.list) {
    const d = separationDeg(ra, dec, h.ra, h.dec) * 60;
    if (d < 2 && (!best || d < best.d)) best = { h, d };
  }
  return best?.h ?? null;
}

// ---------------------------------------------------------------------------
// 3. Wikipedia tables (Caldwell: C -> NGC/name/mag; Messier: M -> names/mag)
const stripWiki = (s) =>
  s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{efn[\s\S]*?\}\}/g, '')
    .replace(/\{\{hs\|[^}]*\}\}/g, '')
    .replace(/\{\{wbr\}\}/g, '')
    .replace(/\{\{br\}\}/g, ', ')
    .replace(/\{\{sdash[^}]*\}\}/g, '')
    .replace(/\{\{dsv\|[^}]*\}\}\s*\|/g, '')
    .replace(/\{\{shy\|([^}]*)\}\}/g, (m, a) => a.replace(/\|/g, ''))
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/''/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/scope="row"\s*\|/g, '')
    .replace(/style="[^"]*"\s*\|/g, '')
    .trim();

function tableRows(wikitext, marker) {
  const start = wikitext.indexOf(marker);
  if (start < 0) throw new Error(`table marker not found: ${marker}`);
  const end = wikitext.indexOf('\n|}', start);
  return wikitext
    .slice(start, end)
    .split(/\n\|-[^\n]*\n/)
    .slice(1)
    .map((r) => r.split('\n').filter((l) => /^[!|]/.test(l)).map((l) => stripWiki(l.replace(/^[!|]\s?/, ''))));
}

/** "Omega, Swan, Horseshoe, Lobster, or Checkmark Nebula" -> ["Omega Nebula", "Swan Nebula", …] */
function splitNames(s) {
  if (!s || s === '-' || s === '–') return [];
  const pieces = s.split(/\s*,\s*(?:or\s+)?|\s+or\s+|\//).map((x) => x.trim()).filter(Boolean);
  const typeWord = /\b(Nebula|Galaxy|Galaxies|Cluster|Globular)$/;
  const last = pieces[pieces.length - 1];
  const suffix = last && last.split(' ').length > 1 && typeWord.test(last) ? last.match(typeWord)[1] : null;
  return pieces
    .map((p) => (suffix && !typeWord.test(p) && !/\b[A-Z]$/.test(p) ? `${p} ${suffix}` : p))
    .filter((p) => !p.includes('#'));
}

/** strict numeric cell parser: "8.4" -> 8.4; "-", "–", "" -> null */
const numCell = (s) => { const t = String(s ?? '').trim(); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
const caldwellTable = new Map();
for (const c of tableRows(wikiCaldwell.wikitext, '!Caldwell number')) {
  const m = c[0]?.match(/^C(\d+)$/);
  if (!m) continue;
  // cells: number, NGC, common name, image, type, distance, constellation, magnitude
  caldwellTable.set(+m[1], { ngc: c[1], names: splitNames(c[2]), type: c[4], con: c[6], mag: numCell(c[7]) });
}
if (caldwellTable.size !== 109) throw new Error(`Caldwell table: ${caldwellTable.size} rows`);

const messierTable = new Map();
const rawMessierRows = (() => {
  const start = wikiMessier.wikitext.indexOf('{|class="wikitable plainrowheaders sortable');
  const end = wikiMessier.wikitext.indexOf('\n|}', start);
  return wikiMessier.wikitext.slice(start, end).split(/\n\|-[^\n]*\n/).slice(1);
})();
const wikiMessierPos = new Map();
for (const r of rawMessierRows) {
  const m = r.match(/M(\d+)\]\]/) || r.match(/\|\s*M(\d+)/);
  const ra = r.match(/\{\{RA\|(\d+)\|([\d.]+)(?:\|([\d.]+))?\}\}/);
  const de = r.match(/\{\{DEC\|([+\-−]?\d+)\|(\d+)\|?([\d.]*)\}\}/);
  if (!m || !ra || !de) continue;
  const sg = /^[-−]/.test(de[1]) ? -1 : 1;
  wikiMessierPos.set(+m[1], { ra: +ra[1] + +ra[2] / 60 + (+ra[3] || 0) / 3600, dec: sg * (Math.abs(parseInt(de[1].replace('−', '-'), 10)) + +de[2] / 60 + (+de[3] || 0) / 3600) });
}
for (const c of tableRows(wikiMessier.wikitext, '{|class="wikitable plainrowheaders sortable')) {
  const m = c[0]?.match(/M(\d+)/);
  if (!m) continue;
  messierTable.set(+m[1], { ngc: c[1], names: splitNames(c[2]), type: c[4], mag: numCell(c[7]) });
}
if (messierTable.size !== 110) throw new Error(`Messier table: ${messierTable.size} rows`);
log(`  Wikipedia: Caldwell rev ${CUR.WIKI_REVISIONS.caldwell.revid}, Messier rev ${CUR.WIKI_REVISIONS.messier.revid}`);

// Verify curated aliases against their pinned Wikipedia revisions (one batched request).
const aliasRevids = [...new Set(CUR.CURATED_ALIASES.map((a) => a.wiki.revid))].sort((a, b) => a - b);
const aliasPages = await wikiRevisions(`wiki-aliases-${aliasRevids.length}-${aliasRevids.at(-1)}.json`, aliasRevids);
for (const a of CUR.CURATED_ALIASES) {
  const w = aliasPages.get(a.wiki.revid);
  const plain = stripWiki(w.wikitext).replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\s+/g, ' ');
  for (const needle of [a.name, a.designation]) {
    if (!plain.includes(needle)) throw new Error(`Curated alias check failed: "${needle}" not in Wikipedia "${w.title}" rev ${a.wiki.revid}`);
  }
}
log(`  Curated aliases verified against Wikipedia: ${CUR.CURATED_ALIASES.length}`);

// ---------------------------------------------------------------------------
// 4. Helpers for names / designations
const pad = (n, w) => String(n).padStart(w, '0');

/** OpenNGC row name -> display designation ("NGC0224" -> "NGC 224") */
function displayDesignation(name) {
  let m;
  if ((m = name.match(/^(NGC|IC)0*(\d+)([A-Z]{0,2})(?: (NED)0*(\d+))?$/))) return `${m[1]} ${m[2]}${m[3]}${m[4] ? ` NED${m[5]}` : ''}`;
  if ((m = name.match(/^M0*(\d+)$/))) return `M ${m[1]}`;
  if ((m = name.match(/^C0*(\d+)$/))) return `C ${m[1]}`;
  if ((m = name.match(/^B0*(\d+)$/))) return `B ${m[1]}`;
  if ((m = name.match(/^Mel0*(\d+)$/))) return `Mel ${m[1]}`;
  if ((m = name.match(/^Cl0*(\d+)$/))) return `Cr ${m[1]}`;
  if ((m = name.match(/^H0*(\d+)$/))) return `Harvard ${m[1]}`;
  if ((m = name.match(/^ESO0*(\d+)-0*(\d+)$/))) return `ESO ${m[1]}-${m[2]}`;
  if ((m = name.match(/^(PGC|UGC|HCG|MWSC)0*(\d+)$/))) return `${m[1]} ${m[2]}`;
  throw new Error(`Unhandled OpenNGC name ${name}`);
}
/** OpenNGC row name -> URL-safe id ("NGC0224" -> "NGC224", "ESO056-115" -> "ESO56-115") */
function baseId(name) {
  if (CUR.ID_OVERRIDES[name]) return CUR.ID_OVERRIDES[name];
  return displayDesignation(name).replace(/^Harvard /, 'Harvard').replace(/ NED/, '-NED').replace(/ /g, '');
}

const GREEK_WORDS = Object.keys(GREEK).filter((k) => !k.endsWith('.'));
const greekRe = new RegExp(`\\b(${GREEK_WORDS.join('|')})\\s+([A-Za-z]{3})\\b`, 'gi');

/** Light display normalisation of a common name (expands catalogue abbreviations). */
function cleanName(raw) {
  let s = raw.trim().replace(/\s+/g, ' ').replace(/^the\s+/i, '');
  s = s.replace(greekRe, (m, g, abbr) => (CON_GEN[abbr] ? `${GREEK[g.toLowerCase()][1]} ${CON_GEN[abbr]}` : m));
  s = s.replace(/\b(\d+)\s+([A-Za-z]{3})\b/g, (m, n, abbr) => (CON_GEN[abbr] ? `${n} ${CON_GEN[abbr]}` : m));
  s = s.replace(/\b([R-Z])\s+([A-Za-z]{3})\b/g, (m, l, abbr) => (CON_GEN[abbr] ? `${l} ${CON_GEN[abbr]}` : m));
  s = s.replace(/\bSgr\b/g, 'Sagittarius');
  s = s.replace(new RegExp(`(^|\\s)(${GREEK_WORDS.join('|')})(?=\\s[A-Z])`, 'g'), (m, sp, g) => sp + g[0].toUpperCase() + g.slice(1));
  s = s.replace(/\b(nebula|galaxy|galaxies|cluster)\b/g, (w) => w[0].toUpperCase() + w.slice(1));
  return s;
}

function identifiersToDesignations(ids) {
  const out = [];
  for (const raw of ids.split(',').map((x) => x.trim()).filter(Boolean)) {
    let m;
    if ((m = raw.match(/^Mel 0*(\d+)$/))) out.push(`Mel ${m[1]}`);
    else if ((m = raw.match(/^Cl 0*(\d+)$/))) out.push(`Cr ${m[1]}`);
    else if ((m = raw.match(/^SH 2-0*(\d+)$/i))) out.push(`Sh2-${m[1]}`);
    else if ((m = raw.match(/^UGC 0*(\d+)$/))) out.push(`UGC ${m[1]}`);
    else if ((m = raw.match(/^PGC 0*(\d+)$/))) out.push(`PGC ${m[1]}`);
    else if ((m = raw.match(/^ESO 0*(\d+)-0*(\d+)$/))) out.push(`ESO ${m[1]}-${m[2]}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Types and magnitudes
const TYPE_MAP = {
  G: 'galaxy', GPair: 'galaxy_group', GTrpl: 'galaxy_group', GGroup: 'galaxy_group',
  OCl: 'open_cluster', GCl: 'globular_cluster', 'Cl+N': 'cluster_nebula', PN: 'planetary_nebula',
  HII: 'emission_nebula', EmN: 'emission_nebula', Neb: 'emission_nebula', RfN: 'reflection_nebula',
  DrkN: 'dark_nebula', SNR: 'supernova_remnant', '*Ass': 'asterism', '**': 'double_star',
};
const DSO_TYPES = new Set(['G', 'GPair', 'GTrpl', 'GGroup', 'OCl', 'GCl', 'Cl+N', 'PN', 'HII', 'DrkN', 'EmN', 'Neb', 'RfN', 'SNR']);
const GALAXY_TYPES = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
const magNotes = [];
const clusterColourWarnings = new Set();

/** Effective magnitude of an OpenNGC row: { mag, magB, src } (see README "Magnitudes"). */
function effectiveMag(row) {
  const V = num(row['V-Mag']);
  const B = num(row['B-Mag']);
  if (row.Type === 'GCl') {
    const h = harrisFor(row);
    if (h?.vt != null) return { mag: h.vt, magB: false, src: 'harris', harris: h };
  }
  if (V != null && B != null) {
    const bv = B - V;
    // Galaxies: an integrated B−V outside −0.3..2.5 is impossible; OpenNGC's (HyperLEDA) V is then the faulty
    // value (e.g. NGC 253 V 11.11 vs B 7.94; Wikipedia Caldwell table: 7.1), so B is used. For star clusters it is not clear
    // which band is wrong, so V is kept (spec default) and the case is only reported.
    if (GALAXY_TYPES.has(row.Type) && (bv < -0.3 || bv > 2.5)) return { mag: B, magB: true, src: `B (V=${V} inconsistent, B−V=${bv.toFixed(2)})` };
    if ((row.Type === 'OCl' || row.Type === 'Cl+N') && bv < -0.4) clusterColourWarnings.add(`${row.Name} B=${B} V=${V}`);
  }
  if (V != null) return { mag: V, magB: false, src: 'V' };
  if (B != null) return { mag: B, magB: true, src: 'B' };
  return { mag: null, magB: false, src: 'none' };
}

// ---------------------------------------------------------------------------
// 6. Choose rows: Messier, Caldwell, bright/named NGC/IC
const dupsOf = new Map(); // master row name -> [dup row names]
for (const r of allRows) {
  if (r.Type !== 'Dup' || CUR.IGNORE_DUPS.has(r.Name)) continue;
  const targets = [
    ...r.NGC.split(',').filter(Boolean).map((n) => `NGC${pad(n.trim(), 4)}`),
    ...r.IC.split(',').filter(Boolean).map((n) => `IC${pad(n.trim(), 4)}`),
  ];
  for (const t of targets) {
    // targets may carry letter suffixes (e.g. "1530A")
    const key = rowByName.has(t) ? t : t.replace(/^(NGC|IC)0*(\d+)([A-Z])$/, (m, c, n, s) => `${c}${pad(n, 4)}${s}`);
    if (!rowByName.has(key)) { warn(`Dup ${r.Name} -> ${t} not found`); continue; }
    if (!dupsOf.has(key)) dupsOf.set(key, []);
    dupsOf.get(key).push(r.Name);
  }
}

const messierOf = new Map(); // row name -> M number
for (const r of allRows) if (r.M && r.Type !== 'Dup') messierOf.set(r.Name, +r.M);
for (const [name, m] of Object.entries(CUR.EXTRA_MESSIER)) messierOf.set(name, m);

const caldwellOf = new Map(); // row name -> C number
for (const r of allRows) {
  let m = r.Name.match(/^C0*(\d+)$/);
  if (m) caldwellOf.set(r.Name, +m[1]);
  for (const id of r.Identifiers.split(',').map((x) => x.trim())) {
    m = id.match(/^C 0*(\d+)$/);
    if (m) caldwellOf.set(r.Name, +m[1]);
  }
}
// Cross-check against the Wikipedia Caldwell table.
for (const [n, t] of caldwellTable) {
  const rowName = [...caldwellOf].find(([, c]) => c === n)?.[0];
  if (!rowName) throw new Error(`Caldwell ${n} has no OpenNGC row`);
  const wikiIds = (t.ngc.match(/\b(NGC|IC) \d+/g) || []);
  const ourIds = [baseId(rowName), ...(dupsOf.get(rowName) || []).map(baseId)].map((x) => x.replace(/^(NGC|IC)/, '$1 '));
  if (wikiIds.length && !wikiIds.some((w) => ourIds.includes(w)) && !rowName.startsWith('C')) warn(`C${n}: Wikipedia ${wikiIds.join('/')} vs OpenNGC ${rowName}`);
}

const mergedAway = new Map(); // part row name -> master row name
for (const { into, parts } of CUR.MERGES) for (const p of parts) mergedAway.set(p, into);

const curatedAliasById = new Map();
for (const a of CUR.CURATED_ALIASES) {
  if (!curatedAliasById.has(a.id)) curatedAliasById.set(a.id, []);
  curatedAliasById.get(a.id).push(a);
}

function finalId(row) {
  const m = messierOf.get(row.Name);
  if (m) return `M${m}`;
  return baseId(row.Name);
}

const selected = [];
for (const r of allRows) {
  if (mergedAway.has(r.Name)) continue;
  const isM = messierOf.has(r.Name);
  const isC = caldwellOf.has(r.Name);
  if (!isM && !isC) {
    if (!DSO_TYPES.has(r.Type)) continue;
    const em = effectiveMag(r);
    const bright = em.mag != null && (em.magB ? em.mag <= 11.0 : em.mag <= 10.5);
    const named = r['Common names'] !== '' || curatedAliasById.has(baseId(r.Name));
    if (!bright && !named) continue;
  }
  selected.push(r);
}
log(`  selected ${selected.length} OpenNGC rows`);

// ---------------------------------------------------------------------------
// 7. Build catalog objects
function typeFor(row, id) {
  if (CUR.TYPE_OVERRIDES[id]) return CUR.TYPE_OVERRIDES[id][0];
  const t = TYPE_MAP[row.Type];
  if (!t) throw new Error(`No type mapping for ${row.Name} (${row.Type})`);
  return t;
}

function galaxyKind(h) {
  if (!h || /^\S?\?$/.test(h)) return 'galaxy';
  if (/^E-S0/.test(h)) return 'elliptical/lenticular galaxy';
  if (/^E/.test(h)) return 'elliptical galaxy';
  if (/^S0/.test(h)) return 'lenticular galaxy';
  if (/^SBm/.test(h)) return 'barred Magellanic spiral galaxy';
  if (/^SB/.test(h)) return 'barred spiral galaxy';
  if (/^SABm/.test(h)) return 'weakly barred Magellanic spiral galaxy';
  if (/^SAB/.test(h)) return 'weakly barred spiral galaxy';
  if (/^Sm/.test(h)) return 'Magellanic spiral galaxy';
  if (/^S/.test(h)) return 'spiral galaxy';
  if (/^IB/.test(h)) return 'barred irregular galaxy';
  if (/^I/.test(h)) return 'irregular galaxy';
  return 'galaxy';
}
const KIND = {
  galaxy_group: { GPair: 'pair of galaxies', GTrpl: 'galaxy triplet', GGroup: 'group of galaxies' },
  open_cluster: 'open cluster', globular_cluster: 'globular cluster', cluster_nebula: 'star cluster with nebulosity',
  planetary_nebula: 'planetary nebula', emission_nebula: 'emission nebula', reflection_nebula: 'reflection nebula',
  dark_nebula: 'dark nebula', supernova_remnant: 'supernova remnant', double_star: 'double star', asterism: 'asterism',
  star_cloud: 'Milky Way star cloud',
};
const fmtNum = (x) => (x < 10 ? String(round(x, 1)) : String(Math.round(x)));
function sizePhrase(size) {
  if (!size) return '';
  const [a, b] = size;
  if (a >= 100) {
    const f = (x) => `${round(x / 60, 1).toFixed(1)}°`;
    return b != null && Math.abs(a - b) > 0.05 * a ? `about ${f(a)} × ${f(b)}` : `about ${f(a)} across`;
  }
  if (a < 1) {
    const f = (x) => `${Math.round(x * 60)}″`;
    return b != null && Math.abs(a - b) > 0.05 * a ? `about ${f(a)} × ${f(b)}` : `about ${f(a)} across`;
  }
  return b != null && Math.abs(a - b) > 0.05 * a ? `about ${fmtNum(a)}′ × ${fmtNum(b)}′` : `about ${fmtNum(a)}′ across`;
}
const article = (w) => (/^(8|11|18)(\.|\b)/.test(w) || /^[aeiou]/i.test(w) ? 'An' : 'A');
function lightYears(kpc) {
  const ly = kpc * 3261.56;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(ly)) - 1);
  return (Math.round(ly / p) * p).toLocaleString('en-US');
}

function generatedDescription(o, row, extra = {}) {
  const kind = o.type === 'galaxy' ? galaxyKind(o.hubble) : o.type === 'galaxy_group' ? KIND.galaxy_group[row?.Type] || 'group of galaxies' : KIND[o.type];
  const kindText = o.type === 'galaxy' && o.hubble && kind !== 'galaxy' ? `${kind} (${o.hubble})` : kind;
  const magText = o.mag != null ? `${o.mag.toFixed(1)}-magnitude${o.magB ? ' (B-band)' : ''} ` : '';
  const head = magText || kindText;
  let s = `${article(head)} ${magText}${kindText} in ${CON_NAME[o.con]}`;
  const sp = sizePhrase(o.size);
  if (sp) s += `, ${sp}`;
  s += '.';
  if (o.type === 'planetary_nebula' && row) {
    const cv = num(row['Cstar V-Mag']), cb = num(row['Cstar B-Mag']);
    if (cv != null) s += ` Its central star is magnitude ${round(cv, 1)}.`;
    else if (cb != null) s += ` Its central star is magnitude ${round(cb, 1)} (B-band).`;
  }
  if (extra.harris?.rSunKpc) s += ` It lies about ${lightYears(extra.harris.rSunKpc)} light-years away.`;
  return s;
}

const objects = [];
const idSeen = new Map();
const reports = { conMismatch: [], magVsWiki: [], caldwellMag: [] };

for (const r of selected) {
  const id = finalId(r);
  const m = messierOf.get(r.Name);
  const c = caldwellOf.get(r.Name);
  const em = effectiveMag(r);
  let mag = em.mag, magB = em.magB;
  if (CUR.MAG_OVERRIDES[id]) { mag = CUR.MAG_OVERRIDES[id][0]; magB = false; magNotes.push(`${id}: ${CUR.MAG_OVERRIDES[id][1]}`); }
  if (em.src.startsWith('B (')) magNotes.push(`${id}: ${em.src}`);
  const extra = c && CUR.CALDWELL_EXTRA[`C${c}`] && r.Name.startsWith('C') ? CUR.CALDWELL_EXTRA[`C${c}`] : null;
  if (extra?.mag != null && mag == null) { mag = extra.mag; magB = false; }
  if (mag == null && c && caldwellTable.get(c).mag != null) {
    mag = caldwellTable.get(c).mag; magB = false;
    magNotes.push(`${id}: no OpenNGC magnitude; ${mag} from Wikipedia Caldwell table`);
  }

  let ra = hmsToHours(r.RA), dec = dmsToDeg(r.Dec);
  if (extra?.ra != null) { ra = extra.ra; dec = extra.dec; }
  let con = r.Const === 'Se1' || r.Const === 'Se2' ? 'Ser' : r.Const;
  const conCalc = findCon(ra, dec);
  if (extra?.ra != null) con = conCalc;
  if (con !== conCalc) reports.conMismatch.push(`${id}: OpenNGC ${r.Const} vs boundaries ${conCalc}`);

  const maj = num(r.MajAx), min = num(r.MinAx);
  let size = maj != null ? (min != null ? [round(maj, 2), round(min, 2)] : [round(maj, 2)]) : undefined;
  if (extra?.size) size = extra.size;

  // --- designations
  const desig = [];
  const add = (d) => { if (d && !desig.some((x) => x.toLowerCase() === d.toLowerCase())) desig.push(d); };
  if (m) add(`M ${m}`);
  const canonical = displayDesignation(r.Name);
  const overriddenId = CUR.ID_OVERRIDES[r.Name];
  if (overriddenId && /^(NGC|IC)\d/.test(overriddenId)) add(overriddenId.replace(/^(NGC|IC)/, '$1 '));
  if (!r.Name.startsWith('C') && !r.Name.startsWith('M0')) add(canonical.replace(/ NED\d+$/, ''));
  for (const n of r.NGC.split(',').filter(Boolean)) add(`NGC ${+n.replace(/[A-Z]$/, '')}${n.match(/[A-Z]$/)?.[0] ?? ''}`);
  for (const n of r.IC.split(',').filter(Boolean)) add(`IC ${+n.replace(/[A-Z]$/, '')}${n.match(/[A-Z]$/)?.[0] ?? ''}`);
  for (const d of dupsOf.get(r.Name) || []) add(displayDesignation(d).replace(/ NED\d+$/, ''));
  const parts = CUR.MERGES.find((x) => x.into === r.Name)?.parts || [];
  for (const p of parts) add(displayDesignation(p).replace(/ NED\d+$/, ''));
  if (c) add(`C ${c}`);
  for (const d of identifiersToDesignations(r.Identifiers)) add(d);
  const harrisRef = em.src === 'harris' ? em.harris : r.Type === 'GCl' ? harrisFor(r) : null;
  if (harrisRef) {
    if (!/^(NGC|IC) /.test(harrisRef.id)) add(harrisRef.id);
    if (harrisRef.name && !/^M \d/.test(harrisRef.name)) add(cleanName(harrisRef.name));
  }

  // --- names (display name chosen below)
  const removed = new Set((CUR.REMOVED_NAMES[id] || []).map((x) => x.toLowerCase()));
  const openNames = [r, ...parts.map((p) => rowByName.get(p))]
    .flatMap((x) => x['Common names'].split(',').map((s) => s.trim()).filter(Boolean))
    .filter((n) => !removed.has(n.toLowerCase()))
    .map(cleanName);
  const caldwellNames = c ? caldwellTable.get(c).names.map(cleanName).filter((n) => !removed.has(n.toLowerCase())) : [];
  const messierNames = m ? messierTable.get(m).names.map(cleanName).filter((n) => !removed.has(n.toLowerCase())) : [];
  const aliasNames = (curatedAliasById.get(id) || []).map((a) => a.name);
  const displayCandidates = [];
  if (CUR.NAME_PREFERENCES[id]) displayCandidates.push(CUR.NAME_PREFERENCES[id]);
  displayCandidates.push(...caldwellNames, ...openNames, ...(curatedAliasById.get(id) || []).filter((a) => !a.aliasOnly).map((a) => a.name));
  const name = displayCandidates[0] || (m ? `M ${m}` : desig[0] || canonical);

  const o = { id, name, designations: [], type: typeFor(r, id), ra: round(ra, 4), dec: round(dec, 3), con };
  if (m) o.m = m;
  if (c) o.c = c;
  if (mag != null) o.mag = round(mag, 2);
  if (mag != null && magB) o.magB = true;
  if (size) o.size = size;
  const sbRaw = num(r.SurfBr);
  if (sbRaw != null && o.type === 'galaxy') o.sb = round(sbRaw - SB_ARCSEC2_TO_ARCMIN2, 2);
  if (o.type === 'galaxy' && r.Hubble) o.hubble = r.Hubble;

  o._names = [name, ...openNames, ...caldwellNames, ...aliasNames, ...messierNames];
  o._desigs = desig;
  o._row = r;
  o._harris = harrisRef;
  if (c && caldwellTable.get(c).mag != null && mag != null && Math.abs(caldwellTable.get(c).mag - mag) > 1.5)
    reports.caldwellMag.push(`C${c} ${id}: ours ${round(mag, 2)}${magB ? 'B' : ''} vs Wikipedia ${caldwellTable.get(c).mag}`);
  if (m && messierTable.get(m).mag != null && mag != null && Math.abs(messierTable.get(m).mag - mag) > 1.0)
    reports.magVsWiki.push(`M${m}: ours ${round(mag, 2)}${magB ? 'B' : ''} vs Wikipedia ${messierTable.get(m).mag}`);
  if (idSeen.has(id)) throw new Error(`Duplicate id ${id} (${r.Name} and ${idSeen.get(id)})`);
  idSeen.set(id, r.Name);
  objects.push(o);
}

// Double stars (WDS / ORB6 / SIMBAD) and the M40 / M42 extras.
const doubles = await buildDoubleStars({ findCon, CON_NAME, CON_GEN, objects });
for (const d of doubles.objects) {
  if (idSeen.has(d.id)) throw new Error(`Duplicate id ${d.id}`);
  idSeen.set(d.id, 'doubles');
  objects.push(d);
}

// Final names, designations, descriptions
const nameCount = new Map();
for (const o of objects) nameCount.set(o.name, (nameCount.get(o.name) || 0) + 1);
for (const o of objects) {
  if (!o._row) continue;
  const primary = o._desigs.find((d) => !/^M \d/.test(d)) || o._desigs[0];
  if (nameCount.get(o.name) > 1 && !/^M \d|^(NGC|IC) /.test(o.name)) o.name = `${o.name} (${o.m ? `M ${o.m}` : primary})`;
  const ds = [];
  const addD = (d) => { if (d && !ds.some((x) => x.toLowerCase() === d.toLowerCase())) ds.push(d); };
  o._desigs.forEach(addD);
  o._names.forEach(addD);
  o.designations = ds;
  if (CUR.SEED_DESCRIPTIONS[o.id]) o.desc = CUR.SEED_DESCRIPTIONS[o.id];
  else if (o.id === 'C14') {
    const a = rowByName.get('NGC0869'), b = rowByName.get('NGC0884');
    const sep = separationDeg(hmsToHours(a.RA), dmsToDeg(a.Dec), hmsToHours(b.RA), dmsToDeg(b.Dec)) * 60;
    o.desc = `Two bright open clusters, NGC 869 (h Persei, magnitude ${num(a['V-Mag'])}) and NGC 884 (χ Persei, magnitude ${num(b['V-Mag'])}), whose centers lie ${Math.round(sep)}′ apart in Perseus — a superb low-power sight.`;
  } else o.desc = generatedDescription(o, o._row, { harris: o.type === 'globular_cluster' ? o._harris : null });
  if (CUR.DESC_APPEND[o.id]) o.desc = `${o.desc} ${CUR.DESC_APPEND[o.id]}`;
  if (doubles.descExtras[o.id]) o.desc = `${o.desc} ${doubles.descExtras[o.id]}`;
  if (doubles.fields[o.id]) Object.assign(o, doubles.fields[o.id]);
}

for (const id of CUR.SHOWPIECES) {
  const o = objects.find((x) => x.id === id);
  if (!o) warn(`showpiece ${id} not in catalog`);
  else o.showpiece = true;
}

// ---------------------------------------------------------------------------
// 8. Order, strip internals, validate, write
const KEY_ORDER = ['id', 'name', 'designations', 'm', 'c', 'type', 'ra', 'dec', 'mag', 'magB', 'size', 'sb', 'con', 'hubble', 'sep', 'mag2', 'pa', 'desc', 'showpiece'];
function rank(o) {
  if (o.m) return [0, o.m, ''];
  if (o.c && /^C\d/.test(o.id)) return [1, o.c, ''];
  let mm = o.id.match(/^NGC(\d+)(.*)$/);
  if (mm) return [2, +mm[1], mm[2]];
  mm = o.id.match(/^IC(\d+)(.*)$/);
  if (mm) return [3, +mm[1], mm[2]];
  if (o.type === 'double_star') return [5, 0, o.id];
  return [4, 0, o.id];
}
objects.sort((a, b) => {
  const ra = rank(a), rb = rank(b);
  return ra[0] - rb[0] || ra[1] - rb[1] || (ra[2] < rb[2] ? -1 : ra[2] > rb[2] ? 1 : 0);
});
const out = objects.map((o) => Object.fromEntries(KEY_ORDER.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])));

// Validation
const errors = [];
const stubWarnings = [];
const VALID_TYPES = new Set(['galaxy', 'galaxy_group', 'open_cluster', 'globular_cluster', 'cluster_nebula', 'planetary_nebula', 'emission_nebula', 'reflection_nebula', 'dark_nebula', 'supernova_remnant', 'double_star', 'asterism', 'star_cloud']);
const ids = new Set();
for (const o of out) {
  if (ids.has(o.id)) errors.push(`duplicate id ${o.id}`);
  ids.add(o.id);
  if (!/^[A-Za-z0-9-]+$/.test(o.id)) errors.push(`id not URL-safe: ${o.id}`);
  if (!(o.ra >= 0 && o.ra < 24)) errors.push(`${o.id}: ra ${o.ra}`);
  if (!(o.dec >= -90 && o.dec <= 90)) errors.push(`${o.id}: dec ${o.dec}`);
  if (!CON_NAME[o.con]) errors.push(`${o.id}: bad constellation ${o.con}`);
  if (!VALID_TYPES.has(o.type)) errors.push(`${o.id}: bad type ${o.type}`);
  if (!o.name || !o.designations.length) errors.push(`${o.id}: missing name/designations`);
  if (o.type === 'double_star' && (o.sep == null || o.pa == null || o.mag2 == null)) (doubles.stub ? stubWarnings : errors).push(`${o.id}: double star without sep/pa/mag2`);
}
const messierCount = out.filter((o) => o.m).length;
const caldwellCount = out.filter((o) => o.c).length;
const mSet = new Set(out.filter((o) => o.m).map((o) => o.m));
const cSet = new Set(out.filter((o) => o.c).map((o) => o.c));
if (messierCount !== 110 || mSet.size !== 110) errors.push(`Messier count ${messierCount} (${mSet.size} unique)`);
if (caldwellCount !== 109 || cSet.size !== 109) errors.push(`Caldwell count ${caldwellCount} (${cSet.size} unique)`);

log('\nSpot checks (catalog vs reference J2000):');
const SPOT = [
  ['M31', '00h42m44.3s', '+41°16′09″', 0.7123083, 41.269167],
  ['M42', '05h35m17s', '−05°23′28″', 5.5880556, -5.391111],
  ['M13', '16h41m41s', '+36°27′35″', 16.694722, 36.459722],
  ['M57', '18h53m35s', '+33°01′45″', 18.893056, 33.029167],
  ['M45', '03h47m24s', '+24°07′', 3.79, 24.116667],
  ['NGC869', '02h19m', '+57°09′', 2.3166667, 57.15],
  ['NGC5139', '13h26m47s', '−47°28′46″', 13.446389, -47.479444],
  ['albireo', '19h30m43s', '+27°57′35″', 19.511944, 27.959722],
];
for (const [id, rs, ds, rh, dd] of SPOT) {
  const o = out.find((x) => x.id === id);
  if (!o) { (doubles.stub ? stubWarnings : errors).push(`spot check: ${id} missing`); log(`  ${id.padEnd(8)} MISSING`); continue; }
  const d = separationDeg(o.ra, o.dec, rh, dd) * 60;
  const tol = id === 'NGC869' || id === 'M45' ? 3 : 0.5; // reference given only to 1′
  log(`  ${id.padEnd(8)} ours ${fmtRA(o.ra)} ${fmtDec(o.dec)}  ref ${rs} ${ds}  Δ=${d.toFixed(2)}′ ${d <= tol ? 'OK' : 'CHECK'}`);
  if (d > tol) errors.push(`spot check ${id} off by ${d.toFixed(2)}′`);
}

log(`\nCounts: ${out.length} objects; Messier ${messierCount}; Caldwell ${caldwellCount}; showpieces ${out.filter((o) => o.showpiece).length}`);
const byType = {};
for (const o of out) byType[o.type] = (byType[o.type] || 0) + 1;
log('By type:', Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
log(`Without mag: ${out.filter((o) => o.mag == null).length} (${out.filter((o) => o.mag == null).map((o) => o.id).join(' ')})`);
log(`magB: ${out.filter((o) => o.magB).length}`);
log(`Constellations: OpenNGC 'Const' vs IAU boundaries (Roman 1987) — ${reports.conMismatch.length} mismatches${reports.conMismatch.length ? `:\n  ${reports.conMismatch.join('\n  ')}` : ''}`);
{
  const diffs = [];
  for (const o of out.filter((x) => x.m)) {
    const w = wikiMessierPos.get(o.m);
    if (w) diffs.push({ id: o.id, d: separationDeg(o.ra, o.dec, w.ra, w.dec) * 60, size: o.size?.[0] ?? 0 });
  }
  diffs.sort((a, b) => a.d - b.d);
  const med = diffs[Math.floor(diffs.length / 2)].d;
  const big = diffs.filter((x) => x.d > 3);
  log(`Messier positions vs Wikipedia/SEDS table (${diffs.length}): median Δ ${med.toFixed(2)}′, max Δ ${diffs.at(-1).d.toFixed(1)}′ (${diffs.at(-1).id}); >3′: ${big.map((x) => `${x.id} ${x.d.toFixed(1)}′ (size ${x.size}′)`).join(', ')}`);
}
{
  const kinds = {};
  for (const o of out.filter((x) => x.type === 'galaxy')) { const k = galaxyKind(o.hubble); kinds[k] = (kinds[k] || 0) + 1; }
  log(`Galaxy morphology wording: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  log(`  plain "galaxy" (no/uncertain Hubble type): ${out.filter((o) => o.type === 'galaxy' && galaxyKind(o.hubble) === 'galaxy').map((o) => `${o.id}(${o.hubble ?? '-'})`).join(' ')}`);
}
if (reports.magVsWiki.length) log(`Messier mags differing >1.0 from Wikipedia table:\n  ${reports.magVsWiki.join('\n  ')}`);
if (reports.caldwellMag.length) log(`Caldwell mags differing >1.5 from Wikipedia table:\n  ${reports.caldwellMag.join('\n  ')}`);
log(`Magnitude adjustments (${magNotes.length}):\n  ${magNotes.join('\n  ')}`);
if (clusterColourWarnings.size) log(`Clusters with impossible B−V (V kept, as OpenNGC gives it): ${[...clusterColourWarnings].join('; ')}`);
for (const n of doubles.notes) log(n);

if (stubWarnings.length) log(`\nPending (double-star module not built yet):\n  ${stubWarnings.join('\n  ')}`);
if (errors.length) {
  console.error(`\nVALIDATION FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
const file = path.join(OUT_DIR, 'catalog.json');
const bytes = writeJsonCompact(file, out);
log(`\nWrote ${path.relative(process.cwd(), file)} (${(bytes / 1024).toFixed(1)} KB, ${out.length} objects)`);
