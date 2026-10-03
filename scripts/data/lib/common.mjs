// Shared helpers for the AstroPilot data build scripts (no third-party deps).
// Node >= 20 (global fetch). Raw downloads are cached in scripts/data/.cache/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_SCRIPTS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CACHE_DIR = path.join(DATA_SCRIPTS_DIR, '.cache');
export const REPO_ROOT = path.resolve(DATA_SCRIPTS_DIR, '..', '..');
export const OUT_DIR = path.join(REPO_ROOT, 'shared', 'data');

// Generic UA (Wikipedia asks for a descriptive one). Deliberately contains no personal data.
const USER_AGENT = 'AstroPilot-data-build/1.0 (static catalog generator; Node.js)';

const REFRESH = process.argv.includes('--refresh');

/**
 * Return the text of a cached source file, downloading it first when missing
 * (or when the script runs with --refresh). `request` is a URL string or
 * { url, method, body, headers }.
 */
export async function cached(fileName, request) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, fileName);
  if (!REFRESH && fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file, 'utf8');
  const req = typeof request === 'string' ? { url: request } : request;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(req.url, {
        method: req.method || 'GET',
        body: req.body,
        headers: { 'User-Agent': USER_AGENT, ...(req.headers || {}) },
      });
      if (res.status === 429 || res.status === 503) {
        const wait = Math.min(60, Number(res.headers.get('retry-after')) || 5 * attempt);
        lastErr = new Error(`HTTP ${res.status} for ${req.url}`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${req.url}`);
      const text = await res.text();
      if (!text.length) throw new Error(`empty response for ${req.url}`);
      fs.writeFileSync(file, text);
      console.log(`  downloaded ${fileName} (${text.length} bytes)`);
      return text;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`Could not download ${fileName}: ${lastErr?.message}`);
}

/** Several pinned Wikipedia revisions in ONE request (avoids API rate limits): Map(revid -> {title, wikitext}). */
export async function wikiRevisions(cacheName, revids) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=ids|content&rvslots=main&format=json&formatversion=2&revids=${revids.join('|')}`;
  const json = JSON.parse(await cached(cacheName, url));
  const out = new Map();
  for (const p of json.query?.pages || []) {
    for (const r of p.revisions || []) out.set(r.revid, { title: p.title, wikitext: r.slots?.main?.content ?? '' });
  }
  for (const id of revids) if (!out.has(id)) throw new Error(`Wikipedia revision ${id} missing from ${cacheName}`);
  return out;
}

/** Wikipedia wikitext for a pinned revision (deterministic). */
export async function wikiRevision(cacheName, revid) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&oldid=${revid}&prop=wikitext&format=json&formatversion=2`;
  const json = JSON.parse(await cached(cacheName, url));
  if (!json.parse?.wikitext) throw new Error(`No wikitext in ${cacheName}`);
  return { title: json.parse.title, revid: json.parse.revid ?? revid, wikitext: json.parse.wikitext };
}

// ---------------------------------------------------------------------------
// CSV (OpenNGC uses ';' separators and "..." quoting for fields containing ';')
export function splitDelimited(line, sep = ';') {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseDelimited(text, sep = ';') {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split(sep);
  return lines.slice(1).map((line, i) => {
    const cells = splitDelimited(line, sep);
    if (cells.length !== header.length) throw new Error(`Row ${i + 2}: ${cells.length} fields, expected ${header.length}`);
    const row = {};
    header.forEach((h, j) => (row[h] = cells[j].trim()));
    return row;
  });
}

// ---------------------------------------------------------------------------
// Angles
export const DEG = Math.PI / 180;

/** "HH:MM:SS.ss" -> decimal hours */
export function hmsToHours(s) {
  const [h, m, x] = s.split(':').map(Number);
  return h + (m || 0) / 60 + (x || 0) / 3600;
}

/** "+DD:MM:SS.s" -> decimal degrees */
export function dmsToDeg(s) {
  const t = s.trim();
  const sign = t.startsWith('-') ? -1 : 1;
  const [d, m, x] = t.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (d + (m || 0) / 60 + (x || 0) / 3600);
}

/** Angular separation in degrees between two (RA hours, Dec degrees) positions. */
export function separationDeg(ra1h, de1, ra2h, de2) {
  const a1 = ra1h * 15 * DEG, a2 = ra2h * 15 * DEG, d1 = de1 * DEG, d2 = de2 * DEG;
  // haversine form is stable for small angles
  const s = Math.sin((d2 - d1) / 2) ** 2 + Math.cos(d1) * Math.cos(d2) * Math.sin((a2 - a1) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / DEG;
}

export const round = (x, d) => {
  const f = 10 ** d;
  const r = Math.round(x * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** Format sexagesimal for reports. */
export function fmtRA(h) {
  let s = Math.round(h * 36000) / 10; // tenths of a second
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const mm = Math.floor(s / 60); s -= mm * 60;
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}m${s.toFixed(1).padStart(4, '0')}s`;
}
export function fmtDec(d) {
  const sign = d < 0 ? '−' : '+';
  let s = Math.round(Math.abs(d) * 3600);
  const dd = Math.floor(s / 3600); s -= dd * 3600;
  const mm = Math.floor(s / 60); s -= mm * 60;
  return `${sign}${String(dd).padStart(2, '0')}°${String(mm).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}

// ---------------------------------------------------------------------------
// IAU constellation from position: Roman (1987), PASP 99, 695 — CDS catalogue VI/42.
// Port of the published FORTRAN program (Herget precession to the 1875.0 equinox,
// then a scan of the boundary table ordered by decreasing southern declination).
function precessHerget(raHours, decDeg, epoch1, epoch2) {
  const ra1 = raHours * 15 * DEG, dec1 = decDeg * DEG;
  const a0 = Math.cos(dec1);
  const x1 = [a0 * Math.cos(ra1), a0 * Math.sin(ra1), Math.sin(dec1)];
  const csr = DEG / 3600;
  const t = 0.001 * (epoch2 - epoch1);
  const st = 0.001 * (epoch1 - 1900);
  const A = csr * t * (23042.53 + st * (139.75 + 0.06 * st) + t * (30.23 - 0.27 * st + 18.0 * t));
  const B = csr * t * t * (79.27 + 0.66 * st + 0.32 * t) + A;
  const C = csr * t * (20046.85 - st * (85.33 + 0.37 * st) + t * (-42.67 - 0.37 * st - 41.8 * t));
  const sA = Math.sin(A), cA = Math.cos(A), sB = Math.sin(B), cB = Math.cos(B), sC = Math.sin(C), cC = Math.cos(C);
  const R = [
    [cA * cB * cC - sA * sB, -cA * sB - sA * cB * cC, -cB * sC],
    [sA * cB + cA * sB * cC, cA * cB - sA * sB * cC, -sB * sC],
    [cA * sC, -sA * sC, cC],
  ];
  const x2 = R.map((r) => r[0] * x1[0] + r[1] * x1[1] + r[2] * x1[2]);
  let ra2 = Math.atan2(x2[1], x2[0]);
  if (ra2 < 0) ra2 += 2 * Math.PI;
  return [ra2 / DEG / 15, Math.asin(x2[2]) / DEG];
}

export function makeConstellationFinder(dataDat) {
  const rows = dataDat
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [ral, rau, decl, con] = l.trim().split(/\s+/);
      return { ral: +ral, rau: +rau, decl: +decl, con };
    });
  const find = (raHours, decDeg, equinox = 2000) => {
    const [ra, dec] = precessHerget(raHours, decDeg, equinox, 1875);
    for (const r of rows) if (r.decl <= dec && r.ral <= ra && ra < r.rau) return r.con;
    return null;
  };
  // Self-test with the examples published in the VI/42 ReadMe (equinox 1950).
  const tests = [
    [9.0, 65.0, 'UMa'], [23.5, -20.0, 'Aqr'], [5.12, 9.12, 'Ori'], [9.4555, -19.9, 'Hya'],
    [12.8888, 22.0, 'Com'], [15.6687, -12.1234, 'Lib'], [19.0, -40.0, 'CrA'], [6.2222, -81.1234, 'Men'],
  ];
  for (const [ra, de, want] of tests) {
    const got = find(ra, de, 1950);
    if (got !== want) throw new Error(`Constellation finder self-test failed: ${ra},${de} -> ${got}, want ${want}`);
  }
  return find;
}

// ---------------------------------------------------------------------------
// Greek letters as used by SIMBAD ("alf", "bet", ...) and OpenNGC common names.
export const GREEK = {
  alf: ['α', 'Alpha'], alpha: ['α', 'Alpha'], bet: ['β', 'Beta'], beta: ['β', 'Beta'],
  gam: ['γ', 'Gamma'], gamma: ['γ', 'Gamma'], del: ['δ', 'Delta'], delta: ['δ', 'Delta'],
  eps: ['ε', 'Epsilon'], epsilon: ['ε', 'Epsilon'], zet: ['ζ', 'Zeta'], zeta: ['ζ', 'Zeta'],
  eta: ['η', 'Eta'], tet: ['θ', 'Theta'], theta: ['θ', 'Theta'], iot: ['ι', 'Iota'], iota: ['ι', 'Iota'],
  kap: ['κ', 'Kappa'], kappa: ['κ', 'Kappa'], lam: ['λ', 'Lambda'], lambda: ['λ', 'Lambda'],
  'mu.': ['μ', 'Mu'], mu: ['μ', 'Mu'], 'nu.': ['ν', 'Nu'], nu: ['ν', 'Nu'], ksi: ['ξ', 'Xi'], xi: ['ξ', 'Xi'],
  omi: ['ο', 'Omicron'], omicron: ['ο', 'Omicron'], 'pi.': ['π', 'Pi'], pi: ['π', 'Pi'], rho: ['ρ', 'Rho'],
  sig: ['σ', 'Sigma'], sigma: ['σ', 'Sigma'], tau: ['τ', 'Tau'], ups: ['υ', 'Upsilon'], upsilon: ['υ', 'Upsilon'],
  phi: ['φ', 'Phi'], chi: ['χ', 'Chi'], psi: ['ψ', 'Psi'], ome: ['ω', 'Omega'], omega: ['ω', 'Omega'],
};
export const SUPERSCRIPT = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// ---------------------------------------------------------------------------
// Wikipedia "IAU designated constellations" table -> [{ abbr, name, genitive }]
export function parseIauConstellationTable(wikitext) {
  const start = wikitext.indexOf('{| class="wikitable sortable');
  const end = wikitext.indexOf('\n|}', start);
  const body = wikitext.slice(start, end);
  const rows = body.split(/\n\|-[^\n]*\n/).slice(1);
  const out = [];
  const clean = (s) =>
    s
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/\{\{br\}\}[\s\S]*$/, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/data-sort-value="[^"]*"\s*\|/g, '')
      .replace(/''/g, '')
      .trim();
  for (const r of rows) {
    if (!r.startsWith('|') || r.startsWith('|}')) continue;
    const first = r.split('\n')[0];
    const cells = first.replace(/^\|\s*/, '').split('||').map(clean);
    if (cells.length < 4) continue;
    const [name, abbr, , genitive] = cells;
    if (!/^[A-Z][A-Za-z]{2}$/.test(abbr)) continue;
    out.push({ abbr, name, genitive });
  }
  return out;
}

/** Write compact JSON (no pretty-printing) and return the file size in bytes. */
export function writeJsonCompact(file, data) {
  const text = JSON.stringify(data) + '\n';
  fs.writeFileSync(file, text);
  return Buffer.byteLength(text, 'utf8');
}
