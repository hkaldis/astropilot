// Double stars for catalog.json.
// Sources: WDS summary (latest measures, magnitudes, spectral types, J2000 positions),
// ORB6 ephemerides/orbits (separation & PA predicted for DOUBLE_EPOCH when a good orbit exists),
// d3-celestial stars/starnames (HIP number, proper names, Bayer & Flamsteed designations), matched
// by position to each WDS primary and to each companion's position computed from (sep, PA).
import { cached, separationDeg, round, SUPERSCRIPT } from './common.mjs';
import { DOUBLE_STARS, DOUBLE_EPOCH, M40_PAIR, TRAPEZIUM } from '../curation.mjs';

const WDS_URL = 'https://www.astro.gsu.edu/wds/Webtextfiles/wdsweb_summ2.txt';
const ORB6_EPHEM_URL = 'https://www.astro.gsu.edu/wds/orb6/orb6ephem.txt';
const ORB6_ORBITS_URL = 'https://www.astro.gsu.edu/wds/orb6/orb6orbits.txt';
const D3_COMMIT = 'b56735c22935b7bde41a944a74e0f780ca0c6dfa';
const D3 = (f) => `https://raw.githubusercontent.com/ofrohn/d3-celestial/${D3_COMMIT}/data/${f}`;
const GREEK_NAME = { α: 'Alpha', β: 'Beta', γ: 'Gamma', δ: 'Delta', ε: 'Epsilon', ζ: 'Zeta', η: 'Eta', θ: 'Theta', ι: 'Iota', κ: 'Kappa', λ: 'Lambda', μ: 'Mu', ν: 'Nu', ξ: 'Xi', ο: 'Omicron', π: 'Pi', ρ: 'Rho', σ: 'Sigma', τ: 'Tau', υ: 'Upsilon', φ: 'Phi', χ: 'Chi', ψ: 'Psi', ω: 'Omega' };
const MAX_ORBIT_GRADE = 3; // ORB6 grades 1 (definitive) .. 3 (reliable); worse orbits -> use the latest measure

const num = (s) => {
  const t = String(s ?? '').trim();
  return t === '' || t === '.' || Number.isNaN(Number(t)) ? null : Number(t);
};
const norm = (s) => s.replace(/\s+/g, '');
/** "STF1744" -> "STF 1744", "STFA 43" -> "STFA 43", "H 3   7" -> "H 3 7" */
const displayCode = (disc) => disc.trim().replace(/\s+/g, ' ').replace(/^([A-Z]+)(\d)/, '$1 $2');

function parseWdsLine(l) {
  return {
    wds: l.slice(0, 10), disc: l.slice(10, 17).trim(), comp: l.slice(17, 22).trim(),
    first: num(l.slice(23, 27)), last: num(l.slice(28, 32)), nobs: num(l.slice(33, 37)),
    paFirst: num(l.slice(38, 41)), paLast: num(l.slice(42, 45)),
    sepFirst: num(l.slice(46, 51)), sepLast: num(l.slice(52, 57)),
    m1: num(l.slice(58, 63)), m2: num(l.slice(64, 69)), spec: l.slice(70, 79).trim(),
    notes: l.slice(107, 111).trim(), coords: l.slice(112, 130).trim(),
  };
}

function parsePreciseCoords(s) {
  const m = s.match(/^(\d\d)(\d\d)(\d\d(?:\.\d+)?)([+-])(\d\d)(\d\d)(\d\d(?:\.\d+)?)$/);
  if (!m) return null;
  const ra = +m[1] + +m[2] / 60 + +m[3] / 3600;
  const dec = (m[4] === '-' ? -1 : 1) * (+m[5] + +m[6] / 60 + +m[7] / 3600);
  return { ra, dec };
}

const COLOR = { O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'orange-red' };
/** "K3II+B9.5" -> "spectral types K3 II (orange) and B9.5 (blue-white)" (both parts required) */
function spectralText(spec) {
  const parts = spec.split('+').map((p) => p.trim().replace(/^(d|sg|g)(?=[OBAFGKM])/, ''));
  if (parts.length !== 2) return '';
  const fmt = (p) => {
    const m = p.match(/^([OBAFGKM])(\d+(?:\.\d+)?)?(.*)$/);
    if (!m) return null;
    const lum = m[3].match(/^(Iab|Ia|Ib|III-IV|II-III|IIb|III|II|IV|V|I)(?![a-z])/)?.[1] ?? m[3].match(/^(Iab|Ia|Ib|III|II|IV|V|I)/)?.[1];
    return `${m[1]}${m[2] ?? ''}${lum ? ` ${lum}` : ''} (${COLOR[m[1]]})`;
  };
  const a = fmt(parts[0]), b = fmt(parts[1]);
  return a && b ? `spectral types ${a} and ${b}` : '';
}

const fmtMag = (m) => (Math.abs(m) < 10 ? m.toFixed(1) : m.toFixed(1));
const fmtSep = (s) => (s < 10 ? String(round(s, 2)) : String(round(s, 1)));

export async function buildDoubleStars({ findCon, CON_NAME, CON_GEN }) {
  const notes = [];
  // ---- WDS summary (only the systems we need)
  const wanted = new Set([...DOUBLE_STARS.map((d) => d.wds), M40_PAIR.wds, TRAPEZIUM.wds]);
  const wdsLines = new Map();
  for (const l of (await cached('wds-wdsweb_summ2.txt', WDS_URL)).split(/\r?\n/)) {
    const id = l.slice(0, 10);
    if (!wanted.has(id)) continue;
    if (!wdsLines.has(id)) wdsLines.set(id, []);
    wdsLines.get(id).push(parseWdsLine(l));
  }
  const pair = (wds, disc, comp) => {
    const hit = (wdsLines.get(wds) || []).find((p) => norm(p.disc) === norm(disc) && p.comp === comp);
    if (!hit) throw new Error(`WDS ${wds} ${disc} ${comp} not found`);
    if (hit.sepLast == null || hit.paLast == null || hit.m1 == null || hit.m2 == null) throw new Error(`WDS ${wds} ${disc} ${comp} incomplete`);
    return hit;
  };

  // ---- ORB6 ephemerides (θ, ρ tabulated for 5 years) and orbits (period, grade)
  const ephemText = await cached('wds-orb6ephem.txt', ORB6_EPHEM_URL);
  const ephemLines = ephemText.split(/\r?\n/);
  const yearLine = ephemLines.find((l) => /\b20\d\d\.0\b.*\b20\d\d\.0\b/.test(l));
  const years = (yearLine.match(/20\d\d\.\d/g) || []).map(Number);
  const yi = years.indexOf(DOUBLE_EPOCH);
  if (yi < 0) throw new Error(`ORB6 ephemeris does not tabulate ${DOUBLE_EPOCH} (has ${years.join(', ')})`);
  const ephem = [];
  for (const l of ephemLines) {
    if (!/^\d{5}[+-]\d{4} /.test(l)) continue;
    const rest = l.slice(25).trim().split(/\s+/);
    const grade = num(rest[0]);
    const vals = rest.slice(2, 2 + 2 * years.length).map(num);
    ephem.push({ wds: l.slice(0, 10), code: norm(l.slice(11, 25)), grade, ref: rest[1], theta: vals[2 * yi], rho: vals[2 * yi + 1] });
  }
  const orbits = [];
  for (const l of (await cached('wds-orb6orbits.txt', ORB6_ORBITS_URL)).split(/\r?\n/)) {
    if (!/^\d{6}\.\d\d[+-]\d{6}/.test(l)) continue;
    orbits.push({ wds: l.slice(19, 29), code: norm(l.slice(30, 44)), P: num(l.slice(81, 92)), Pu: l.slice(92, 93), grade: num(l.slice(233, 234)), ref: l.slice(237, 245).trim() });
  }
  const orbitFor = (p) => {
    const code = norm(p.disc + p.comp);
    const cands = ephem
      .filter((e) => e.wds === p.wds && e.code === code && e.grade != null && e.grade <= MAX_ORBIT_GRADE && e.rho != null && e.theta != null)
      .sort((a, b) => a.grade - b.grade || b.ref.localeCompare(a.ref));
    if (!cands.length) return null;
    const e = cands[0];
    const o = orbits.find((x) => x.wds === p.wds && x.code === code && x.ref === e.ref);
    const years = o && o.P != null ? (o.Pu === 'y' ? o.P : o.Pu === 'c' ? o.P * 100 : o.Pu === 'd' ? o.P / 365.25 : null) : null;
    return { ...e, periodYears: years };
  };

  // ---- d3-celestial stars (positions, HIP) and star names (proper / Bayer / Flamsteed)
  const d3Stars = JSON.parse(await cached('d3-stars.6.json', D3('stars.6.json'))).features.map((f) => ({
    hip: f.id, ra: (((f.geometry.coordinates[0] % 360) + 360) % 360) / 15, dec: f.geometry.coordinates[1], mag: f.properties.mag,
  }));
  const d3Names = JSON.parse(await cached('d3-starnames.json', D3('starnames.json')));
  const nearestStar = (ra, dec, tolArcsec) => {
    let best = null;
    for (const s of d3Stars) {
      if (Math.abs(s.dec - dec) > tolArcsec / 3600 + 0.001) continue;
      const x = separationDeg(ra, dec, s.ra, s.dec) * 3600;
      if (x <= tolArcsec && (!best || x < best.x)) best = { ...s, x };
    }
    return best;
  };
  /** Position of the secondary from the primary's position, separation (″) and PA (°). */
  const offsetPos = (ra, dec, sepArcsec, paDeg) => {
    const r = Math.PI / 180, d = (sepArcsec / 3600) * r, t = paDeg * r, de = dec * r, a = ra * 15 * r;
    const de2 = Math.asin(Math.sin(de) * Math.cos(d) + Math.cos(de) * Math.sin(d) * Math.cos(t));
    const a2 = a + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(de), Math.cos(d) - Math.sin(de) * Math.sin(de2));
    return { ra: ((((a2 / r) % 360) + 360) % 360) / 15, dec: de2 / r };
  };
  const bayerParts = (b) => {
    const m = b.match(/^(.)(\d*)$/u);
    return m ? { letter: m[1], idx: m[2] ? SUPERSCRIPT[+m[2]] : '' } : null;
  };
  function designationsForHips(hips, { noSystemBayer = false } = {}) {
    const names = [], systemBayer = [], compBayer = [], flam = [], cons = new Set();
    for (const hip of hips) {
      const n = d3Names[String(hip)];
      if (!n) continue;
      if (n.name) names.push(n.name);
      if (n.c) cons.add(n.c);
      const b = n.bayer && bayerParts(n.bayer);
      if (b && n.c) {
        const word = GREEK_NAME[b.letter] || b.letter;
        if (b.idx) compBayer.push(`${b.letter}${b.idx} ${n.c}`, `${word}${b.idx} ${CON_GEN[n.c]}`);
        if (!noSystemBayer) systemBayer.push(`${b.letter} ${n.c}`, `${word} ${CON_GEN[n.c]}`);
      }
      if (n.flam && n.c) flam.push(`${n.flam} ${n.c}`, `${n.flam} ${CON_GEN[n.c]}`);
    }
    return { names, bayer: [...systemBayer, ...compBayer], flam, cons };
  }

  function pairSentence(p, { subject = 'Its components' } = {}) {
    const orbit = orbitFor(p);
    const sep = orbit ? orbit.rho : p.sepLast;
    const pa = orbit ? orbit.theta : p.paLast;
    const spec = spectralText(p.spec);
    const when = orbit
      ? `predicted for ${DOUBLE_EPOCH.toFixed(1)} from its ${orbit.periodYears >= 100 ? Math.round(orbit.periodYears) : round(orbit.periodYears, 1)}-year orbit`
      : `measured ${p.last}`;
    const text = `${subject} (magnitudes ${fmtMag(p.m1)} and ${fmtMag(p.m2)}${spec ? `; ${spec}` : ''}) lie ${fmtSep(sep)}″ apart at PA ${Math.round(pa)}° (${when}).`;
    return { text, sep: sep < 10 ? round(sep, 2) : round(sep, 1), pa: Math.round(pa) % 360, orbit };
  }
  const extraVals = (p) => ({ m1: fmtMag(p.m1), m2: fmtMag(p.m2), sep: fmtSep(p.sepLast), sepArcmin: round(p.sepLast / 60, 1), pa: p.paLast });

  // ---- Build the double-star entries
  const objects = [];
  for (const d of DOUBLE_STARS) {
    const p = pair(d.wds, d.pair[0], d.pair[1]);
    const pos = parsePreciseCoords(p.coords);
    if (!pos) throw new Error(`${d.id}: no WDS precise coordinates`);
    const con = findCon(pos.ra, pos.dec);
    // Identify HIP stars: the primary, and each companion of the main/extra pairs.
    const usedPairs = [p, ...(d.extras || []).flatMap((e) => e.pairs.map(([disc, comp]) => pair(d.wds, disc, comp)))];
    const hips = [];
    const primaryStar = nearestStar(pos.ra, pos.dec, 15);
    if (!primaryStar) throw new Error(`${d.id}: no HIP star within 15″ of the WDS position`);
    if (primaryStar.x > 5) notes.push(`  NOTE ${d.id}: HIP ${primaryStar.hip} is ${primaryStar.x.toFixed(1)}″ from the WDS position`);
    hips.push(primaryStar.hip);
    for (const up of usedPairs) {
      const prim = parsePreciseCoords(up.coords) || pos;
      const p1 = nearestStar(prim.ra, prim.dec, 15);
      if (p1 && !hips.includes(p1.hip)) hips.push(p1.hip);
      const sec = offsetPos(prim.ra, prim.dec, up.sepLast, up.paLast);
      const s2 = nearestStar(sec.ra, sec.dec, Math.max(15, 0.03 * up.sepLast));
      if (s2 && !hips.includes(s2.hip)) hips.push(s2.hip);
    }
    const ids = designationsForHips(hips, { noSystemBayer: !!d.noSystemBayer });

    const desig = [];
    const add = (x) => { if (x && !desig.some((y) => y.toLowerCase() === x.toLowerCase())) desig.push(x); };
    add(d.name);
    (d.aliases || []).forEach(add);
    ids.names.forEach(add);
    ids.bayer.forEach(add);
    ids.flam.forEach(add);
    add(displayCode(p.disc));
    for (const e of d.extras || []) for (const [disc] of e.pairs) add(displayCode(disc));
    add(`HIP ${primaryStar.hip}`);
    if (ids.cons.size && !ids.cons.has(con)) notes.push(`  NOTE ${d.id}: boundary constellation ${con} vs designation ${[...ids.cons].join('/')}`);

    const ps = pairSentence(p, { subject: d.subject || (d.pairLabel ? `${d.pairLabel}'s components` : 'Its components') });
    let desc = `${d.note} ${ps.text}`;
    for (const e of d.extras || []) desc += ` ${e.text(...e.pairs.map(([disc, comp]) => extraVals(pair(d.wds, disc, comp))))}`;

    objects.push({
      id: d.id, name: d.name, designations: desig, type: 'double_star',
      ra: round(pos.ra, 4) >= 24 ? 0 : round(pos.ra, 4), dec: round(pos.dec, 3),
      mag: round(p.m1, 2), con, sep: ps.sep, mag2: round(p.m2, 2), pa: ps.pa, desc,
    });
    notes.push(`  ${d.id.padEnd(20)} ${displayCode(p.disc)} ${p.comp.padEnd(5)} sep ${String(ps.sep).padStart(6)}″ PA ${String(ps.pa).padStart(3)}°  ${ps.orbit ? `ORB6 ${ps.orbit.ref} grade ${ps.orbit.grade} @${DOUBLE_EPOCH}` : `WDS last ${p.last}`}  mags ${p.m1}/${p.m2}  ${con}`);
  }

  // ---- M40 (Winnecke 4): fields + data sentence
  const m40 = pair(M40_PAIR.wds, M40_PAIR.pair[0], M40_PAIR.pair[1]);
  const m40s = pairSentence(m40);
  const fields = { M40: { mag: round(m40.m1, 2), sep: m40s.sep, mag2: round(m40.m2, 2), pa: m40s.pa } };
  const descExtras = { M40: m40s.text };

  // ---- M42: the Trapezium (θ¹ Orionis)
  const tp = TRAPEZIUM.pairs.map((c) => pair(TRAPEZIUM.wds, TRAPEZIUM.disc, c));
  const starMag = { A: tp[0].m1, B: tp[0].m2, C: tp[1].m2, D: tp[2].m2 };
  const mags = Object.values(starMag);
  const maxSep = Math.max(...tp.map((x) => x.sepLast));
  descExtras.M42 = `At its heart lies the Trapezium (θ¹ Orionis): four stars of magnitude ${fmtMag(Math.min(...mags))}–${fmtMag(Math.max(...mags))} within about ${Math.round(maxSep)}″ of one another, easily split in small telescopes.`;

  notes.unshift(`Double stars (${objects.length}; orbit epoch ${DOUBLE_EPOCH}):`);
  return { objects, fields, descExtras, notes };
}
