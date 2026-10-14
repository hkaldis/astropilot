/**
 * Cross-checks the app's physical data for the planets, our Moon and the planets' moons against NASA/JPL:
 *
 *   NASA NSSDCA planetary fact sheets (index table, per-planet sheets, Moon, Sun, satellite sheets)
 *   JPL SSD planetary physical parameters        https://ssd.jpl.nasa.gov/planets/phys_par.html
 *   JPL SSD satellite physical parameters        https://ssd.jpl.nasa.gov/sats/phys_par/   (GM → mass, G = 6.6743e-11)
 *   JPL SSD satellite mean orbital elements      https://ssd.jpl.nasa.gov/sats/elem/
 *   JPL SSD satellite discovery circumstances    https://ssd.jpl.nasa.gov/sats/discovery.html
 *   JPL Horizons (API)                           moons' APmag at their planet's 2025–27 oppositions
 *   NASA Science, Mercury facts                  Mercury's day/night temperature range (not on the NSSDCA sheet)
 *
 * Read-only for the app: it imports shared/bodies.ts, shared/astro/planets.ts, shared/astro/moons.ts and
 * shared/scale.ts, and writes only
 *   shared/data/xcheck/bodies.json               reference values with sources
 *   scripts/crosscheck/bodies-report.md          every field compared, discrepancies, derived claims
 *   scripts/crosscheck/bodies-corrections.json   exact proposed replacements
 *
 * Usage (repo root):  npx tsx scripts/crosscheck/bodies.ts [--offline]
 * Pages are cached raw under .local/crosscheck-cache (fetched once, ≥ 1.1 s apart; Horizons ≥ 1.5 s); a re-run
 * is served from the cache, and --offline refuses to touch the network.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AU_KM, AU_PER_LY, BODY_PHYSICS, EARTH, LY_KM, NEPTUNE_AU, SUN, escapeOf, gravityOf } from "../../shared/bodies";
import { SOLAR_SYSTEM } from "../../shared/astro/planets";
import { MOONS } from "../../shared/astro/moons";
import { earthMoonScale, nice, planetScale, satelliteScale } from "../../shared/scale";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(ROOT, ".local", "crosscheck-cache");
const OUT_JSON = join(ROOT, "shared", "data", "xcheck", "bodies.json");
const OUT_MD = join(ROOT, "scripts", "crosscheck", "bodies-report.md");
const OUT_FIX = join(ROOT, "scripts", "crosscheck", "bodies-corrections.json");
const OFFLINE = process.argv.includes("--offline");
const G = 6.6743e-11; // CODATA 2018 — what JPL uses to turn GM into mass

// ------------------------------------------------------------------------------------------------ fetching

let lastFetch = 0;
let fetched = 0;
let fromCache = 0;
async function cached(file: string, url: string, gapMs = 1100): Promise<string> {
  const path = join(CACHE, file);
  if (existsSync(path)) {
    fromCache++;
    return readFileSync(path, "utf8");
  }
  if (OFFLINE) throw new Error(`not cached: ${file} (${url})`);
  const wait = lastFetch + gapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: { "User-Agent": "AstroPilot-crosscheck/1.0" } });
  lastFetch = Date.now();
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, text);
  fetched++;
  return text;
}

const NSSDC = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/";
const SOURCES: Record<string, { file: string; url: string; title: string }> = {
  nssdcIndex: { file: "nssdc-factsheet-index.html", url: NSSDC, title: "NASA NSSDCA Planetary Fact Sheet — metric table" },
  nssdcNotes: { file: "nssdc-planetfact_notes.html", url: `${NSSDC}planetfact_notes.html`, title: "NASA NSSDCA notes on the fact sheets" },
  jplPlanets: { file: "jpl-planets-phys_par.html", url: "https://ssd.jpl.nasa.gov/planets/phys_par.html", title: "JPL SSD Planetary Physical Parameters" },
  jplSats: { file: "jpl-sats-phys_par.html", url: "https://ssd.jpl.nasa.gov/sats/phys_par/", title: "JPL SSD Planetary Satellite Physical Parameters" },
  jplElem: { file: "jpl-sats-elem.html", url: "https://ssd.jpl.nasa.gov/sats/elem/", title: "JPL SSD Planetary Satellite Mean Elements" },
  jplDisc: { file: "jpl-sats-discovery.html", url: "https://ssd.jpl.nasa.gov/sats/discovery.html", title: "JPL SSD Planetary Satellite Discovery Circumstances" },
  nasaMercury: { file: "nasa-science-mercury-facts.html", url: "https://science.nasa.gov/mercury/facts/", title: "NASA Science — Mercury: Facts" },
};
const SHEETS = ["mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "sun", "joviansat", "saturniansat", "uraniansat", "neptuniansat"];
const SHEET_TITLE: Record<string, string> = { joviansat: "Jovian satellite", saturniansat: "Saturnian satellite", uraniansat: "Uranian satellite", neptuniansat: "Neptunian satellite" };
for (const s of SHEETS) SOURCES[`nssdc_${s}`] = { file: `nssdc-${s}fact.html`, url: `${NSSDC}${s}fact.html`, title: `NASA NSSDCA ${SHEET_TITLE[s] ?? s[0].toUpperCase() + s.slice(1)} fact sheet` };

// ------------------------------------------------------------------------------------------------ parsing

const ENT: Record<string, string> = { nbsp: " ", plusmn: "±", times: "×", amp: "&", lt: "<", gt: ">", quot: '"', mdash: "—", ndash: "–", deg: "°", minus: "−", pm: "±" };
const decode = (s: string) => s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : (ENT[e.toLowerCase()] ?? m)));
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
/** The page as text, tags removed (superscripts run into their base: "10<sup>24</sup>" → "1024"). */
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ");

/** Table rows as arrays of cell texts; copes with JPL's unclosed <td>s. */
function rows(html: string): string[][] {
  return html
    .split(/<tr\b[^>]*>/i)
    .slice(1)
    .map((tr) => tr.split(/<\/tr>/i)[0].split(/<t[hd]\b[^>]*>/i).slice(1).map((c) => clean(c.replace(/<\/t[hd]>[\s\S]*$/i, ""))));
}
function tableById(html: string, marker: string): string {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error(`table ${marker} not found`);
  return html.slice(i, html.indexOf("</table>", i));
}
function num(s: string | undefined): number {
  if (!s) return NaN;
  const m = s.replace(/,/g, "").replace(/−/g, "-").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  return m ? Number(m[0]) : NaN;
}

/** An NSSDCA per-body value: first data cell of the row whose label matches, else the number after the label in the text. */
function sheetValue(html: string, label: RegExp): number {
  const r = rows(html).find((c) => c.length > 1 && label.test(c[0]));
  if (r) return num(r[1]);
  const t = text(html);
  const m = new RegExp(label.source, "m").exec(t);
  return m ? num(t.slice(m.index + m[0].length, m.index + m[0].length + 80)) : NaN;
}

const L = {
  mass: /^\s*Mass \(10\s?24 kg\)/,
  eqR: /^\s*Equatorial radius( \(1 bar level\))? \(km\)/,
  polR: /^\s*Polar radius( \(1 bar level\))? \(km\)/,
  meanR: /^\s*Volumetric mean radius \(km\)/,
  density: /^\s*Mean density \(kg\/m\s?3\)/,
  gMean: /^\s*(Surface gravity|Gravity)( \(mean[^)]*\))? \(m\/s\s?2\)/,
  gEq: /^\s*(Surface acceleration|Acceleration)( \(eq[^)]*\))? \(m\/s\s?2\)/,
  gPole: /^\s*(Surface acceleration|Acceleration) \(pole[^)]*\) \(m\/s\s?2\)/,
  escape: /^\s*Escape velocity \(km\/s\)/,
  gm: /^\s*GM \(x 10\s?6 km\s?3\/s\s?2\)/,
  sidOrbit: /^\s*(Sidereal orbit|Revolution) period \(days\)/,
  synodic: /^\s*Synodic period \(days\)/,
  rotation: /^\s*Sidereal rotation period \(hrs\)/,
  lod: /^\s*Length of day \(hrs\)/,
  obliquity: /^\s*Obliquity to orbit \(deg\)/,
  aAU: /Semimajor axis \(AU\)/,
  aKm: /^\s*Semimajor axis \(10\s?6 km\)/,
};

// --------------------------------------------------------------------------------------------- reference model

type Val = number | string | boolean | number[];
interface Ref {
  v: Val;
  src: string;
  note?: string;
  alt?: { v: Val; src: string }[];
}
const REF: Record<string, Record<string, Ref>> = {};
const put = (body: string, field: string, r: Ref) => ((REF[body] ??= {})[field] = r);
const sig = (x: number, n = 5) => Number(x.toPrecision(n));

const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;
const NAME: Record<string, string> = Object.fromEntries([...SOLAR_SYSTEM.map((p) => [p.id, p.name]), ["earth", "Earth"], ["sun", "Sun"], ...MOONS.map((m) => [m.id, m.name])]);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Opposition dates (UT day) of 2025–27 from the app's planetaryEvents(); fixed here so the Horizons cache keys stay put. */
const OPPOSITIONS: Record<string, string[]> = {
  mars: ["2025-01-16", "2027-02-19"],
  jupiter: ["2026-01-10", "2027-02-11"],
  saturn: ["2025-09-21", "2026-10-04"],
  uranus: ["2025-11-21", "2026-11-25"],
  neptune: ["2025-09-23", "2026-09-26"],
};

async function horizonsMag(naif: number, date: string) {
  const q: Record<string, string> = {
    format: "text",
    COMMAND: `'${naif}'`,
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'500@399'",
    START_TIME: `'${date} 00:00'`,
    STOP_TIME: `'${date} 00:01'`,
    STEP_SIZE: "'1'",
    QUANTITIES: "'9,19,20,24'",
  };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
  const t = await cached(`hz-${naif}-${date}.txt`, url, 1500);
  const line = (t.split("$$SOE")[1] ?? "").split("$$EOE")[0].split("\n").find((l) => l.trim());
  const tok = line?.trim().split(/\s+/) ?? [];
  const h = t.match(/V\(1,0\)\s*=\s*([-+]?\d+(?:\.\d+)?)/);
  const p = t.match(/Orbital period\s*[~=]\s*([\d.]+)\s*d/);
  return { mag: num(tok[2]), r: num(tok[4]), delta: num(tok[6]), phase: num(tok[8]), H: h ? Number(h[1]) : NaN, P: p ? Number(p[1]) : NaN, url };
}

// --------------------------------------------------------------------------------------------- comparisons

type Verdict = "ok" | "fix" | "definitional" | "note";
interface Check {
  path: string;
  body: string;
  field: string;
  app: Val | undefined;
  ref: Val;
  src: string;
  tol: string;
  delta: string;
  pass: boolean;
  verdict: Verdict;
  note?: string;
  proposal?: { v: Val; src: string; was: Val | undefined; note?: string };
}
const CHECKS: Check[] = [];

/**
 * Differences outside tolerance that come from a definition, not an error: noted, no correction proposed.
 * And notes on values inside tolerance that are still worth knowing.
 */
const DEFINITIONAL: Record<string, string> = {};
const NOTES: Record<string, string> = {
  "BODY_PHYSICS.jupiter.gravity": "JPL 'equatorial gravity' is GM/R_eq² without spin. NSSDCA gives 25.92 (GM/R_mean²) and 23.12 at the 1-bar equator including spin (27.01 at the pole); what a person would feel ranges 23.1–27.0. 24.79 sits inside: keep.",
  "BODY_PHYSICS.saturn.gravity": "JPL GM/R_eq² (no spin). NSSDCA: 8.96 at the 1-bar equator including spin, 12.14 at the pole, 11.19 mean. 10.44 sits inside the felt range: keep.",
  "BODY_PHYSICS.uranus.gravity": "JPL GM/R_eq² (no spin). NSSDCA effective 1-bar equator 8.69, mean 9.01.",
  "BODY_PHYSICS.neptune.gravity": "JPL GM/R_eq² (no spin). NSSDCA effective 1-bar equator 11.00, mean 11.27.",
  "BODY_PHYSICS.jupiter.escapeKms": "NSSDCA √(2GM/R_eq) = 59.5; JPL √(2GM/R_mean) = 60.20 (+1.2%). App follows NSSDCA, consistent with its equatorial gravity.",
  "BODY_PHYSICS.saturn.escapeKms": "NSSDCA √(2GM/R_eq) = 35.5; JPL √(2GM/R_mean) = 36.09 (+1.7%). App follows NSSDCA.",
  "BODY_PHYSICS.mars.tempC": "NSSDCA table mean −65 °C; the Mars sheet's Viking-era 'average' is ~214 K (−59 °C). Both NASA; keep −65.",
  "BODY_PHYSICS.jupiter.tempC": "NSSDCA 'mean temperature' −110 °C; at the 1-bar level 165 K (−108 °C). The app's 'at the cloud tops' label fits either.",
  "BODY_PHYSICS.saturn.tempC": "1-bar level 134 K (−139 °C).",
  "BODY_PHYSICS.uranus.tempC": "1-bar level 76 K (−197 °C).",
  "BODY_PHYSICS.neptune.tempC": "1-bar level 72 K (−201 °C).",
  "BODY_PHYSICS.saturn.rotationH": "System III radio period (IAU/JPL). Ring seismology (Mankovich et al. 2019) gives 10 h 33.6 min ≈ 10.561 h, 0.9% shorter — still within the IAU convention the app uses.",
  "BODY_PHYSICS.ganymede.radiusKm": "Within 1%, but JPL's current mean radius is 2631.2 ±1.7 km (Archinal 2018); 2634.1 is an older figure. Optional refresh (moons.ts too).",
  "MOONS.ganymede.radiusKm": "Within 1%; JPL 2631.2 (see BODY_PHYSICS.ganymede.radiusKm).",
  "BODY_PHYSICS.hyperion.massKg": "Within 1% (+0.9%): JPL GM 0.37049 → 5.551e18 kg; 5.6e18 is a rounding.",
  "SOLAR_SYSTEM.moon.radiusKm": "The Moon's entry holds the mean radius; NSSDCA equatorial is 1738.1 (0.04% larger). Within tolerance.",
  "SOLAR_SYSTEM.mercury.radiusKm": "Holds the mean radius 2439.7 where the field is documented as equatorial (JPL 2440.53). Within tolerance.",
  "MOONS.hyperion.discovered.by": "JPL credits W.C. Bond, his son G.P. Bond and W. Lassell; the app names William Bond and Lassell. Optional: 'William and George Bond, William Lassell'.",
  "MOONS.phobos.mag": "11.5 sits between NSSDCA's mean-opposition V0 (11.3) and Horizons at the 2025 and 2027 oppositions (11.9, 12.1 — both far, aphelic oppositions); at a close perihelic opposition (Δ ≈ 0.38 AU) it reaches about 10.4.",
  "MOONS.deimos.mag": "NSSDCA mean-opposition V0 12.40; Horizons 13.0 and 13.15 at the distant 2025 and 2027 oppositions.",
  "MOONS.titan.mag": "Horizons 8.28 / 8.22 at the 2025–26 oppositions; 8.4 is 0.15 mag faint but within tolerance.",
  "MOONS.iapetus.mag": "Iapetus swings ~1.7 mag between its bright (west of Saturn) and dark faces; Horizons' single-H model gives a mid value. The app adds ±0.85 via iapetusBrightness().",
};

function rel(path: string, body: string, field: string, app: number | undefined, ref: Ref, tol: number, propose?: (v: number) => number) {
  const r = ref.v as number;
  const d = app === undefined ? NaN : (app - r) / Math.abs(r);
  const pass = app !== undefined && Math.abs(d) <= tol;
  add({ path, body, field, app, ref: r, src: ref.src, tol: `${tol * 100}%`, delta: Number.isFinite(d) ? `${d >= 0 ? "+" : ""}${(d * 100).toFixed(2)}%` : "—", pass }, propose ? propose(r) : r);
}
function absDiff(path: string, body: string, field: string, app: number | undefined, ref: Ref, tol: number, unit: string, proposal?: Val) {
  const r = ref.v as number;
  const d = app === undefined ? NaN : app - r;
  const pass = app !== undefined && Math.abs(d) <= tol + 1e-9;
  add({ path, body, field, app, ref: r, src: ref.src, tol: `±${tol} ${unit}`, delta: Number.isFinite(d) ? `${d >= 0 ? "+" : ""}${+d.toFixed(2)} ${unit}` : "—", pass }, proposal ?? r);
}
function exact(path: string, body: string, field: string, app: Val | undefined, ref: Ref, same?: (a: Val | undefined, r: Val) => boolean) {
  const pass = same ? same(app, ref.v) : app === ref.v;
  add({ path, body, field, app, ref: ref.v, src: ref.src, tol: "exact", delta: pass ? "=" : "≠", pass }, ref.v);
}
function add(c: Omit<Check, "verdict">, proposeValue: Val) {
  let verdict: Verdict = c.pass ? "ok" : "fix";
  let note = NOTES[c.path];
  if (!c.pass && DEFINITIONAL[c.path]) {
    verdict = "definitional";
    note = DEFINITIONAL[c.path];
  } else if (c.pass && note) verdict = "note";
  const chk: Check = { ...c, verdict, note };
  if (verdict === "fix") chk.proposal = { v: proposeValue, src: c.src, was: c.app };
  CHECKS.push(chk);
}

// ------------------------------------------------------------------------------------------------ main

async function main() {
  const page: Record<string, string> = {};
  for (const [k, s] of Object.entries(SOURCES)) page[k] = await cached(s.file, s.url);

  // ---- JPL planets
  const jplP: Record<string, { eqR: [number, number]; meanR: [number, number]; mass: [number, number]; density: [number, number]; rotD: number; orbY: number; V10: number; g: number; vesc: number }> = {};
  for (const r of rows(tableById(page.jplPlanets, 'class="planet-phys-par"'))) {
    const name = r[0]?.toLowerCase();
    if (!name || !["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"].includes(name)) continue;
    const v = (i: number) => num(r[i].split("[")[0]);
    const s = (i: number) => num(r[i].split("±")[1]);
    jplP[name] = { eqR: [v(1), s(1)], meanR: [v(2), s(2)], mass: [v(3), s(3)], density: [v(4), s(4)], rotD: v(5), orbY: v(6), V10: v(7), g: v(9), vesc: v(10) };
  }
  if (Object.keys(jplP).length !== 8) throw new Error(`JPL planets: parsed ${Object.keys(jplP).length} rows`);

  // ---- NSSDCA index (mean temperature row, among others)
  const idxRows = rows(page.nssdcIndex);
  const head = idxRows.find((r) => r.includes("MERCURY"))!.filter((c) => /^[A-Z]+$/.test(c)).map((c) => c.toLowerCase());
  const indexRow = (label: RegExp) => {
    const r = idxRows.find((c) => label.test(c[0]) && c.length === head.length + 1);
    return Object.fromEntries(head.map((h, i) => [h, num(r?.[i + 1])])) as Record<string, number>;
  };
  const idxTemp = indexRow(/^Mean Temperature/);
  const idxDay = indexRow(/^Length of Day/);
  const idxDiam = indexRow(/^Diameter/);

  // ---- NSSDCA per-planet sheets
  const sheet = (id: string) => page[`nssdc_${id}`];
  const nss = (id: string, key: keyof typeof L) => sheetValue(sheet(id), key === "aAU" ? L.aAU : L[key]);
  const nssSrc = (id: string, what: string) => `NSSDCA ${id}fact.html: ${what}`;
  const jplSrc = (what: string) => `JPL SSD planets/phys_par: ${what}`;

  // ---- JPL satellites
  const satPhys: Record<string, { planet: string; code: number; gm: number; sgm: number; gmRef: string; r: number; sr: number; rho: number }> = {};
  for (const r of rows(tableById(page.jplSats, 'id="sat_phys_par"'))) {
    if (r.length < 12 || !/^\d+$/.test(r[2])) continue;
    satPhys[r[1].toLowerCase()] = { planet: r[0].toLowerCase(), code: +r[2], gm: num(r[3]), sgm: num(r[4]), gmRef: r[5], r: num(r[6]), sr: num(r[7]), rho: num(r[9]) };
  }
  const satElem: Record<string, { planet: string; code: number; ephem: string; frame: string; a: number; e: number; i: number; P: number }> = {};
  for (const r of rows(tableById(page.jplElem, 'id="sat_elem"'))) {
    if (r.length < 19 || !/^\d+$/.test(r[3])) continue;
    satElem[r[2].toLowerCase()] = { planet: r[1].toLowerCase(), code: +r[3], ephem: r[4], frame: r[5], a: num(r[7]), e: num(r[8]), i: num(r[11]), P: num(r[13]) };
  }
  const disc: Record<string, { planet: string; numeral: string; year: number; by: string }> = {};
  let discPlanet = "";
  for (const r of rows(tableById(page.jplDisc, 'class="sat-discovery'))) {
    const m = r.length === 1 && r[0].match(/Satellites of\s+(\w+)/);
    if (m) discPlanet = m[1].toLowerCase();
    else if (r.length >= 5) disc[r[1].toLowerCase()] = { planet: discPlanet, numeral: r[0], year: num(r[3]), by: r[4] };
  }
  /** NSSDCA satellite sheets: first row named "Io (I)" is the bulk table, the second the orbit table. */
  const nssSat = (sheetId: string, name: string) => {
    const rs = rows(page[`nssdc_${sheetId}`]).filter((r) => new RegExp(`^${name} \\(`).test(r[0]));
    return { bulk: rs[0], orbit: rs[1] };
  };
  const SAT_SHEET: Record<string, string> = { jupiter: "joviansat", saturn: "saturniansat", uranus: "uraniansat", neptune: "neptuniansat" };
  const marsRows = rows(sheet("mars"));
  const marsSat = (label: RegExp) => marsRows.find((r) => label.test(r[0]) && r.length >= 3);

  // ---- Earth and the Sun
  put("earth", "radiusKm", { v: jplP.earth.meanR[0], src: jplSrc(`mean radius ${jplP.earth.meanR[0]} km`), alt: [{ v: nss("earth", "meanR"), src: nssSrc("earth", "volumetric mean radius") }] });
  put("earth", "massKg", { v: sig(jplP.earth.mass[0] * 1e24, 6), src: jplSrc(`mass ${jplP.earth.mass[0]}e24 kg`), alt: [{ v: nss("earth", "mass") * 1e24, src: nssSrc("earth", "mass") }] });
  put("earth", "gravity", { v: jplP.earth.g, src: jplSrc("equatorial gravity"), alt: [{ v: nss("earth", "gMean"), src: nssSrc("earth", "surface gravity (mean)") }, { v: nss("earth", "gEq"), src: nssSrc("earth", "surface acceleration (eq), incl. spin") }] });
  put("earth", "density", { v: jplP.earth.density[0], src: jplSrc("bulk density"), alt: [{ v: nss("earth", "density") / 1000, src: nssSrc("earth", "mean density") }] });
  put("earth", "rotationH", { v: sig(jplP.earth.rotD * 24, 6), src: jplSrc(`sidereal rotation ${jplP.earth.rotD} d × 24`), alt: [{ v: nss("earth", "rotation"), src: nssSrc("earth", "sidereal rotation period") }] });
  put("earth", "solarDayH", { v: nss("earth", "lod"), src: nssSrc("earth", "length of day") });
  put("earth", "orbitDays", { v: nss("earth", "sidOrbit"), src: nssSrc("earth", "sidereal orbit period"), alt: [{ v: sig(jplP.earth.orbY * 365.25, 7), src: jplSrc(`sidereal orbital period ${jplP.earth.orbY} y × 365.25`) }] });
  put("earth", "tempC", { v: idxTemp.earth, src: "NSSDCA planetary fact table: mean temperature" });
  put("earth", "escapeKms", { v: nss("earth", "escape"), src: nssSrc("earth", "escape velocity"), alt: [{ v: jplP.earth.vesc, src: jplSrc("escape velocity") }] });
  put("sun", "radiusKm", { v: nss("sun", "meanR"), src: nssSrc("sun", "volumetric mean radius") });
  put("sun", "massKg", { v: nss("sun", "mass") * 1e24, src: nssSrc("sun", "mass (10^24 kg)") });

  // ---- the planets
  for (const id of PLANETS) {
    const j = jplP[id];
    put(id, "radiusKm", { v: j.meanR[0], src: jplSrc(`mean radius ${j.meanR[0]} ±${j.meanR[1]} km`), alt: [{ v: nss(id, "meanR"), src: nssSrc(id, "volumetric mean radius") }] });
    put(id, "equatorialRadiusKm", { v: j.eqR[0], src: jplSrc(`equatorial radius ${j.eqR[0]} ±${j.eqR[1]} km`), alt: [{ v: nss(id, "eqR"), src: nssSrc(id, "equatorial radius") }] });
    put(id, "polarRadiusKm", { v: nss(id, "polR"), src: nssSrc(id, "polar radius") });
    put(id, "massKg", { v: sig(j.mass[0] * 1e24, 6), src: jplSrc(`mass ${j.mass[0]} ±${j.mass[1]} ×10^24 kg`), alt: [{ v: nss(id, "mass") * 1e24, src: nssSrc(id, "mass") }] });
    put(id, "gravity", {
      v: j.g,
      src: jplSrc("equatorial gravity (GM/R_eq², no spin)"),
      alt: [
        { v: nss(id, "gMean"), src: nssSrc(id, "gravity (mean)") },
        { v: nss(id, "gEq"), src: nssSrc(id, "acceleration at the equator, incl. spin") },
        ...(Number.isFinite(sheetValue(sheet(id), L.gPole)) ? [{ v: sheetValue(sheet(id), L.gPole), src: nssSrc(id, "acceleration at the pole") }] : []),
      ],
    });
    put(id, "density", { v: j.density[0], src: jplSrc(`bulk density ${j.density[0]} ±${j.density[1]} g/cm³`), alt: [{ v: nss(id, "density") / 1000, src: nssSrc(id, "mean density") }] });
    put(id, "rotationH", { v: sig(j.rotD * 24, 6), src: jplSrc(`sidereal rotation ${j.rotD} d × 24`), alt: [{ v: nss(id, "rotation"), src: nssSrc(id, "sidereal rotation period (hrs)") }] });
    put(id, "solarDayH", { v: nss(id, "lod"), src: nssSrc(id, "length of day (hrs)"), alt: [{ v: idxDay[id], src: "NSSDCA planetary fact table: length of day" }] });
    put(id, "orbitDays", { v: nss(id, "sidOrbit"), src: nssSrc(id, "sidereal orbit period (days)"), alt: [{ v: sig(j.orbY * 365.25, 7), src: jplSrc(`sidereal orbital period ${j.orbY} y × 365.25`) }] });
    put(id, "escapeKms", { v: nss(id, "escape"), src: nssSrc(id, "escape velocity (at R_eq / 1 bar)"), alt: [{ v: j.vesc, src: jplSrc("escape velocity (at R_mean)") }] });
    put(id, "obliquityDeg", { v: nss(id, "obliquity"), src: nssSrc(id, "obliquity to orbit") });
    put(id, "aAU", { v: nss(id, "aAU"), src: nssSrc(id, "mean orbital elements (J2000): semimajor axis") });
    const t = text(sheet(id));
    const bar = t.match(/Temperature at 1 bar: (\d+) K \((-?\d+) C\)/);
    const avg = t.match(/Average temperature: ~?\s*(\d+) K \((-?\d+) C\)/);
    const alt: { v: Val; src: string }[] = [];
    if (bar) alt.push({ v: +bar[2], src: nssSrc(id, `temperature at 1 bar ${bar[1]} K`) });
    if (avg) alt.push({ v: +avg[2], src: nssSrc(id, `average temperature ${avg[1]} K`) });
    if (id === "mercury") {
      const mt = text(page.nasaMercury);
      const hi = mt.match(/highs of (\d+)°F \((\d+)°C\)/);
      const lo = mt.match(/as low as -(\d+)°F \(-(\d+)°C\)/);
      put(id, "tempC", {
        v: [-num(lo?.[2]), num(hi?.[2])],
        src: `NASA Science mercury/facts: daytime highs ${hi?.[1]} °F (${hi?.[2]} °C), night lows −${lo?.[1]} °F (−${lo?.[2]} °C)`,
        alt: [{ v: idxTemp.mercury, src: "NSSDCA planetary fact table: mean temperature (day/night average)" }, ...alt],
      });
    } else put(id, "tempC", { v: idxTemp[id], src: "NSSDCA planetary fact table: mean temperature (giants: 1-bar level)", alt });
  }

  // ---- our Moon
  {
    const m = sheet("moon");
    const sp = satPhys.moon;
    const t = text(m);
    const rng = t.match(/Diurnal temperature range \(equator\): (\d+) K to (\d+) K/)!;
    put("moon", "radiusKm", { v: sp.r, src: `JPL SSD sats/phys_par: Moon mean radius ${sp.r} ±${sp.sr} km`, alt: [{ v: sheetValue(m, L.meanR), src: nssSrc("moon", "volumetric mean radius") }] });
    put("moon", "equatorialRadiusKm", { v: sheetValue(m, L.eqR), src: nssSrc("moon", "equatorial radius") });
    put("moon", "massKg", { v: sig((sp.gm * 1e9) / G, 5), src: `JPL SSD sats/phys_par: GM ${sp.gm} km³/s² (${sp.gmRef}) / G`, alt: [{ v: sheetValue(m, L.mass) * 1e24, src: nssSrc("moon", "mass") }] });
    put("moon", "gravity", { v: sheetValue(m, L.gMean), src: nssSrc("moon", "surface gravity"), alt: [{ v: sig((sp.gm * 1e9) / (sp.r * 1000) ** 2, 4), src: "JPL GM / R²" }] });
    put("moon", "density", { v: sp.rho, src: "JPL SSD sats/phys_par: mean density", alt: [{ v: sheetValue(m, L.density) / 1000, src: nssSrc("moon", "mean density") }] });
    put("moon", "rotationH", { v: sheetValue(m, L.rotation), src: nssSrc("moon", "sidereal rotation period") });
    put("moon", "solarDayH", { v: idxDay.moon, src: "NSSDCA planetary fact table: length of day", alt: [{ v: sig(sheetValue(m, L.synodic) * 24, 5), src: nssSrc("moon", "synodic period × 24") }] });
    put("moon", "orbitDays", { v: sheetValue(m, L.sidOrbit), src: nssSrc("moon", "revolution period (sidereal)"), alt: [{ v: satElem.moon.P, src: "JPL SSD sats/elem: P" }] });
    put("moon", "tempC", { v: [+rng[1] - 273, +rng[2] - 273], src: nssSrc("moon", `diurnal temperature range (equator) ${rng[1]} K to ${rng[2]} K`), alt: [{ v: idxTemp.moon, src: "NSSDCA planetary fact table: mean temperature" }] });
    put("moon", "escapeKms", { v: sheetValue(m, L.escape), src: nssSrc("moon", "escape velocity"), alt: [{ v: sig(Math.sqrt((2 * sp.gm) / sp.r), 4), src: "JPL √(2GM/R)" }] });
    put("moon", "aKm", { v: satElem.moon.a, src: `JPL SSD sats/elem: Moon a (${satElem.moon.ephem})`, alt: [{ v: sheetValue(m, L.aKm) * 1e6, src: nssSrc("moon", "semimajor axis") }] });
    put("moon", "synodicDays", { v: sheetValue(m, L.synodic), src: nssSrc("moon", "synodic period") });
  }

  // ---- the planets' moons
  const hz: Record<string, { date: string; mag: number; delta: number; phase: number; H: number }[]> = {};
  for (const mm of MOONS) {
    const id = mm.id;
    const sp = satPhys[id];
    const el = satElem[id];
    const dc = disc[id];
    if (!sp || !el || !dc) throw new Error(`JPL tables lack ${id}`);
    const massKg = (sp.gm * 1e9) / G;
    put(id, "radiusKm", { v: sp.r, src: `JPL SSD sats/phys_par: mean radius ${sp.r} ±${sp.sr} km` });
    put(id, "massKg", { v: sig(massKg, 5), src: `JPL SSD sats/phys_par: GM ${sp.gm} ±${sp.sgm} km³/s² (${sp.gmRef}) / G=6.6743e-11` });
    put(id, "density", { v: sp.rho, src: "JPL SSD sats/phys_par: mean density" });
    put(id, "gravity", { v: sig((sp.gm * 1e9) / (sp.r * 1000) ** 2, 4), src: "derived: JPL GM / R²" });
    put(id, "escapeMs", { v: sig(Math.sqrt((2 * sp.gm * 1e9) / (sp.r * 1000)), 4), src: "derived: √(2·JPL GM / R)" });
    put(id, "aKm", { v: el.a, src: `JPL SSD sats/elem: a (${el.ephem}, ${el.frame} frame)` });
    put(id, "periodDays", { v: el.P, src: `JPL SSD sats/elem: sidereal period P (${el.ephem})` });
    put(id, "retrograde", { v: el.i > 90, src: `JPL SSD sats/elem: i = ${el.i}° to the ${el.frame} plane` });
    put(id, "parent", { v: el.planet, src: "JPL SSD sats/elem: planet" });
    put(id, "naif", { v: el.code, src: "JPL SSD sats/elem: code" });
    put(id, "designation", { v: `${cap(dc.planet)} ${dc.numeral}`, src: "JPL SSD sats/discovery: IAU number" });
    put(id, "discovered.year", { v: dc.year, src: "JPL SSD sats/discovery: year discovered" });
    put(id, "discovered.by", { v: dc.by, src: "JPL SSD sats/discovery: discoverer(s)" });
    // NSSDCA as a second opinion
    const alt = (field: string, v: number, what: string) => REF[id][field].alt = [...(REF[id][field].alt ?? []), { v, src: what }];
    if (mm.parent === "mars") {
      const col = id === "phobos" ? 1 : 2;
      alt("massKg", num(marsSat(/^Mass \(10\s?15 kg\)/)?.[col]) * 1e15, "NSSDCA marsfact.html: satellites — mass");
      alt("aKm", num(marsSat(/^Semimajor axis/)?.[col]), "NSSDCA marsfact.html: satellites — semimajor axis");
      alt("periodDays", num(marsSat(/^Sidereal orbit period/)?.[col]), "NSSDCA marsfact.html: satellites — sidereal orbit period");
    } else {
      const s = nssSat(SAT_SHEET[mm.parent], NAME[id]);
      if (s.bulk) {
        alt("massKg", num(s.bulk[1]) * 1e20, `NSSDCA ${SAT_SHEET[mm.parent]}fact.html: mass`);
        if (/^[\d,.]+$/.test(s.bulk[2])) alt("radiusKm", num(s.bulk[2]), `NSSDCA ${SAT_SHEET[mm.parent]}fact.html: radius`);
      }
      if (s.orbit) {
        alt("aKm", num(s.orbit[1]) * 1000, `NSSDCA ${SAT_SHEET[mm.parent]}fact.html: semi-major axis`);
        alt("periodDays", num(s.orbit[3]), `NSSDCA ${SAT_SHEET[mm.parent]}fact.html: orbital period${/R/.test(s.orbit[3]) ? " (R = retrograde)" : ""}`);
      }
    }
    // Brightness at the planet's oppositions, from Horizons
    hz[id] = [];
    let hzPeriod = NaN;
    for (const date of OPPOSITIONS[mm.parent]) {
      const h = await horizonsMag(mm.naif, date);
      hz[id].push({ date, mag: h.mag, delta: h.delta, phase: h.phase, H: h.H });
      if (Number.isFinite(h.P)) hzPeriod = h.P;
    }
    // JPL's mean-element P is the Keplerian period of a fitted orbit. Where it disagrees with the period in JPL's own
    // Horizons header (the resonant Galilean moons: Europa 3.525 vs 3.55 d), the observed mean period is used.
    const hzP = hzPeriod;
    if (Number.isFinite(hzP) && Math.abs(el.P - hzP) / hzP > 0.002) {
      const nssP = REF[id].periodDays.alt?.find((a) => a.src.startsWith("NSSDCA"));
      if (nssP) {
        REF[id].periodDays = {
          v: nssP.v,
          src: `${nssP.src} (JPL Horizons header: ~${hzP} d)`,
          note: `JPL sats/elem P = ${el.P} d is the Keplerian period of the fitted mean elements; for the Laplace-resonant Galilean moons it is not the observed mean period (${nssP.v} d).`,
          alt: [{ v: el.P, src: `JPL SSD sats/elem: P (${el.ephem}, ${el.frame}) — mean-element period` }, { v: hzP, src: "JPL Horizons header: orbital period" }],
        };
      }
    } else if (Number.isFinite(hzP)) REF[id].periodDays.alt = [...(REF[id].periodDays.alt ?? []), { v: hzP, src: "JPL Horizons header: orbital period" }];
    const mags = hz[id].map((h) => h.mag).filter(Number.isFinite);
    const H = hz[id].find((h) => Number.isFinite(h.H))?.H;
    const aP = REF[mm.parent].aAU.v as number;
    const meanOpp = H !== undefined ? +(H + 5 * Math.log10(aP * (aP - 1))).toFixed(2) : undefined;
    const hzRef = { v: +(mags.reduce((s, x) => s + x, 0) / mags.length).toFixed(2), src: `JPL Horizons APmag at opposition: ${hz[id].map((h) => `${h.date} ${h.mag.toFixed(2)}`).join(", ")}` };
    const altMag: { v: Val; src: string }[] = meanOpp !== undefined ? [{ v: meanOpp, src: `Horizons V(1,0)=${H} at mean opposition (a=${aP} AU, Δ=a−1)` }] : [];
    if (mm.parent === "mars") {
      const v0 = num(marsSat(/^Apparent visual magnitude/)?.[id === "phobos" ? 1 : 2]);
      // Mars's oppositions range from 0.37 to 0.68 AU: the NSSDCA mean-opposition V0 is the "typical" value.
      put(id, "mag", { v: v0, src: "NSSDCA marsfact.html: apparent visual magnitude V0 at mean opposition", alt: [hzRef, ...altMag] });
    } else put(id, "mag", { ...hzRef, alt: altMag });
  }

  // ---- constants
  const hzHeader = readFileSync(join(CACHE, `hz-501-${OPPOSITIONS.jupiter[0]}.txt`), "utf8");
  const auKm = num(hzHeader.match(/1 au=\s*([\d.]+) km/)?.[1]);
  const cKms = num(hzHeader.match(/c=\s*([\d.]+) km\/s/)?.[1]);
  put("constants", "AU_KM", { v: auKm, src: "JPL Horizons header: 1 au = 149597870.700 km (IAU 2012)" });
  put("constants", "LY_KM", { v: sig(cKms * 365.25 * 86400, 8), src: `c = ${cKms} km/s (Horizons header) × Julian year` });
  put("constants", "AU_PER_LY", { v: sig((cKms * 365.25 * 86400) / auKm, 7), src: "LY_KM / AU_KM" });
  put("constants", "NEPTUNE_AU", { v: REF.neptune.aAU.v, src: REF.neptune.aAU.src });
  put("constants", "TWO_AU_S", { v: sig(auKm / cKms, 7), src: "light time for 1 au = AU_KM / c (scale.ts TWO_AU_S)" });

  // ------------------------------------------------------------------------------------------- compare
  const bp = (id: string) => (id === "earth" ? EARTH : BODY_PHYSICS[id]);
  for (const id of ["earth", "moon", ...PLANETS]) {
    const app = bp(id);
    const R = REF[id];
    const P = id === "earth" ? "EARTH" : `BODY_PHYSICS.${id}`;
    rel(`${P}.radiusKm`, id, "radiusKm (mean)", app.radiusKm, R.radiusKm, 0.01);
    rel(`${P}.massKg`, id, "massKg", app.massKg, R.massKg, 0.01, (v) => sig(v, 4));
    rel(`${P}.gravity`, id, "gravity m/s²", app.gravity, R.gravity, 0.01);
    rel(`${P}.density`, id, "density g/cm³", app.density, R.density, 0.01);
    rel(`${P}.rotationH`, id, "rotationH (sidereal)", app.rotationH, R.rotationH, 0.005);
    rel(`${P}.solarDayH`, id, "solarDayH", app.solarDayH, R.solarDayH, 0.005);
    rel(`${P}.orbitDays`, id, "orbitDays (sidereal)", app.orbitDays, R.orbitDays, 0.005);
    rel(`${P}.escapeKms`, id, "escapeKms", app.escapeKms, R.escapeKms, 0.02);
    const t = app.tempC;
    const rt = R.tempC.v;
    if (Array.isArray(t) && Array.isArray(rt)) {
      absDiff(`${P}.tempC[0]`, id, "tempC min °C", t[0], { ...R.tempC, v: rt[0] }, 5, "K", rt as number[]);
      absDiff(`${P}.tempC[1]`, id, "tempC max °C", t[1], { ...R.tempC, v: rt[1] }, 5, "K", rt as number[]);
    } else absDiff(`${P}.tempC`, id, "tempC °C", t as number, R.tempC, 5, "K");
  }
  rel("SUN.radiusKm", "sun", "radiusKm", SUN.radiusKm, REF.sun.radiusKm, 0.01);
  rel("SUN.massKg", "sun", "massKg", SUN.massKg, REF.sun.massKg, 0.01, (v) => sig(v, 5));
  for (const p of SOLAR_SYSTEM) rel(`SOLAR_SYSTEM.${p.id}.radiusKm`, p.id, "radiusKm (equatorial)", p.radiusKm, REF[p.id].equatorialRadiusKm, 0.01);
  // moons.ts private constants (read from source)
  const moonsSrc = readFileSync(join(ROOT, "shared", "astro", "moons.ts"), "utf8");
  const record = (name: string) => Object.fromEntries([...(moonsSrc.match(new RegExp(`const ${name}[^=]*= \\{([^}]+)\\}`))?.[1] ?? "").matchAll(/(\w+): ([\d_.]+)/g)].map((m) => [m[1], Number(m[2].replace(/_/g, ""))]));
  const eqR = record("EQ_RADIUS_KM");
  const polR = record("POLAR_RADIUS_KM");
  for (const id of Object.keys(eqR)) rel(`moons.ts EQ_RADIUS_KM.${id}`, id, "equatorial radius (moons.ts)", eqR[id], REF[id].equatorialRadiusKm, 0.01);
  for (const id of Object.keys(polR)) rel(`moons.ts POLAR_RADIUS_KM.${id}`, id, "polar radius (moons.ts)", polR[id], REF[id].polarRadiusKm, 0.01);

  for (const m of MOONS) {
    const R = REF[m.id];
    const app = BODY_PHYSICS[m.id];
    rel(`BODY_PHYSICS.${m.id}.radiusKm`, m.id, "radiusKm (mean)", app?.radiusKm, R.radiusKm, 0.01);
    rel(`BODY_PHYSICS.${m.id}.massKg`, m.id, "massKg", app?.massKg, R.massKg, 0.01, (v) => sig(v, 4));
    if (app) {
      rel(`derived gravityOf(${m.id})`, m.id, "surface gravity (derived)", sig(gravityOf(app), 4), R.gravity, 0.01);
      rel(`derived escapeOf(${m.id})`, m.id, "escape m/s (derived)", sig(escapeOf(app), 4), R.escapeMs, 0.02);
    }
    rel(`MOONS.${m.id}.radiusKm`, m.id, "radiusKm (moons.ts)", m.radiusKm, R.radiusKm, 0.01);
    rel(`MOONS.${m.id}.aKm`, m.id, "aKm", m.aKm, R.aKm, 0.01);
    rel(`MOONS.${m.id}.periodDays`, m.id, "periodDays", m.periodDays, R.periodDays, 0.005, (v) => sig(v, 5));
    exact(`MOONS.${m.id}.retrograde`, m.id, "retrograde", !!m.retrograde, R.retrograde);
    exact(`MOONS.${m.id}.parent`, m.id, "parent", m.parent, R.parent);
    exact(`MOONS.${m.id}.naif`, m.id, "naif", m.naif, R.naif);
    exact(`MOONS.${m.id}.designation`, m.id, "designation", m.designation, R.designation);
    exact(`MOONS.${m.id}.discovered.year`, m.id, "discovered.year", m.discovered.year, R["discovered.year"]);
    // Discoverers: every surname JPL lists must appear in the app's credit.
    exact(`MOONS.${m.id}.discovered.by`, m.id, "discovered.by (surnames)", m.discovered.by, R["discovered.by"], (a, r) => {
      const sur = String(r).split(/,\s*|\s+and\s+/).map((n) => n.trim().split(/[.\s]+/).pop()!.toLowerCase());
      return sur.every((s) => String(a).toLowerCase().includes(s));
    });
    absDiff(`MOONS.${m.id}.mag`, m.id, "mag (typical opposition)", m.mag, R.mag, 0.3, "mag", +(R.mag.v as number).toFixed(1));
  }
  rel("AU_KM", "constants", "AU_KM", AU_KM, REF.constants.AU_KM, 1e-9);
  rel("LY_KM", "constants", "LY_KM", LY_KM, REF.constants.LY_KM, 1e-4);
  rel("AU_PER_LY", "constants", "AU_PER_LY", AU_PER_LY, REF.constants.AU_PER_LY, 1e-4);
  rel("NEPTUNE_AU", "constants", "NEPTUNE_AU", NEPTUNE_AU, REF.constants.NEPTUNE_AU, 0.005);
  rel("scale.ts TWO_AU_S", "constants", "TWO_AU_S (light s per au)", 499.005, REF.constants.TWO_AU_S, 1e-4);

  // ------------------------------------------------------------------------------------ derived claims
  interface Claim {
    claim: string;
    app: string;
    ref: string;
    src: string;
    ok: boolean;
    note?: string;
  }
  const claims: Claim[] = [];
  const claim = (c: Claim) => claims.push(c);
  const rv = (b: string, f: string) => REF[b][f].v as number;
  const lines = (id: string) => planetScale(id, 2026)!.lines.join(" ");
  const RE = rv("earth", "radiusKm");
  const ME = rv("earth", "massKg");

  const jupVol = (rv("jupiter", "radiusKm") / RE) ** 3;
  const jHead = planetScale("jupiter", 2026)!.headline;
  claim({ claim: "Jupiter's volume in Earths (headline)", app: jHead, ref: `${jupVol.toFixed(2)} → "${nice(jupVol)}"`, src: "JPL mean radii 69911 / 6371.0084; NSSDCA volume ratio 1321.33", ok: jHead.startsWith(`${nice(jupVol)} Earths`) });
  const jupM = rv("jupiter", "massKg") / ME;
  claim({ claim: "Jupiter's mass in Earths", app: lines("jupiter").match(/as much as ([\d,]+) Earths/)?.[1] ?? "?", ref: `${jupM.toFixed(2)} → "${nice(jupM)}"`, src: "JPL masses (NSSDCA ratio 317.83)", ok: lines("jupiter").includes(`${nice(jupM)} Earths`) });
  claim({ claim: "Saturn would float (density < 1 g/cm³)", app: /float/.test(lines("saturn")) ? "floats" : "—", ref: `${rv("saturn", "density")} g/cm³`, src: REF.saturn.density.src, ok: rv("saturn", "density") < 1 && /float/.test(lines("saturn")) });
  const merc = (RE / rv("mercury", "radiusKm")) ** 3;
  claim({ claim: "Earth could hold N Mercurys", app: planetScale("mercury", 2026)!.headline, ref: `${merc.toFixed(2)} → "${nice(merc)}"`, src: "JPL mean radii", ok: planetScale("mercury", 2026)!.headline.includes(` ${nice(merc)} planets`) });
  const venRot = Math.abs(rv("venus", "rotationH")) / 24;
  const venYr = rv("venus", "orbitDays");
  claim({ claim: "Venus turns once more slowly than it orbits (and backwards)", app: lines("venus").match(/takes longer than its year: ([^.]+)/)?.[1] ?? "?", ref: `${venRot.toFixed(3)} d rotation vs ${venYr} d orbit; solar day ${(rv("venus", "solarDayH") / 24).toFixed(2)} d`, src: "JPL rotation −243.018 d; NSSDCA sidereal orbit", ok: venRot > venYr && rv("venus", "rotationH") < 0 && /longer than its year/.test(lines("venus")) });
  const nepDisc = Date.UTC(1846, 8, 23);
  const nepLap = new Date(nepDisc + rv("neptune", "orbitDays") * 86_400_000);
  const nepLaps = (Date.UTC(2026, 9, 14) - nepDisc) / (rv("neptune", "orbitDays") * 86_400_000);
  claim({ claim: "Neptune: first lap since discovery completed in 2011; 'just once' by 2026", app: lines("neptune").match(/since its discovery[^.]+/)?.[0] ?? "?", ref: `found 23 Sep 1846 + ${rv("neptune", "orbitDays")} d = ${nepLap.toISOString().slice(0, 10)}; ${nepLaps.toFixed(3)} laps by 2026-10-14`, src: "NSSDCA neptunefact: discovery date, sidereal orbit period", ok: nepLap.getUTCFullYear() === 2011 && /completing that first lap in 2011/.test(lines("neptune")) && nepLaps < 2 });
  const uraDisc = Date.UTC(1781, 2, 13);
  const uraLaps = (Date.UTC(2026, 9, 14) - uraDisc) / (rv("uranus", "orbitDays") * 86_400_000);
  claim({ claim: "Uranus: gone round 'twice' since 1781", app: lines("uranus").match(/gone round only (\w+)/)?.[1] ?? "?", ref: `${uraLaps.toFixed(3)} laps since 13 Mar 1781 (3rd lap ends ${new Date(uraDisc + 3 * rv("uranus", "orbitDays") * 86_400_000).toISOString().slice(0, 10)})`, src: "NSSDCA uranusfact: discovery date, sidereal orbit period", ok: Math.floor(uraLaps) === 2 && /only twice/.test(lines("uranus")) });
  claim({ claim: "Uranus tipped by 98°; each pole 42 years of light", app: "98°, 42 years", ref: `obliquity ${rv("uranus", "obliquityDeg")}°, half-orbit ${(rv("uranus", "orbitDays") / 365.25 / 2).toFixed(1)} yr`, src: "NSSDCA uranusfact", ok: Math.round(rv("uranus", "obliquityDeg")) === 98 && Math.round(rv("uranus", "orbitDays") / 365.25 / 2) === 42 });
  for (const id of ["mars", "jupiter", "saturn"]) {
    const d = rv(id, "solarDayH");
    const h = Math.floor(d);
    const min = Math.round((d - h) * 60);
    const want = `${h} h ${min} min`;
    claim({ claim: `${cap(id)}'s day as shown`, app: lines(id).match(/(\d+ h \d+ min)/)?.[1] ?? "?", ref: `${d} h → ${want}`, src: REF[id].solarDayH.src, ok: lines(id).includes(want) });
  }
  const mn = earthMoonScale();
  const moonVol = (RE / rv("moon", "radiusKm")) ** 3;
  const moonMass = ME / rv("moon", "massKg");
  claim({ claim: "About 49 Moons fill Earth; 81 to match its mass", app: mn.headline, ref: `${moonVol.toFixed(2)} by volume; ${moonMass.toFixed(2)} by mass (GM 398600.436/4902.800 = ${(398600.436 / 4902.8).toFixed(2)})`, src: "JPL radii and GMs", ok: mn.headline.includes(`About ${Math.round(moonVol)} Moons`) && mn.headline.includes(`take ${Math.round(moonMass)}`) });
  claim({ claim: "Moon is 1.2% of Earth's mass", app: mn.stats.find((s) => s.label === "Mass")!.value, ref: `${((100 * rv("moon", "massKg")) / ME).toFixed(2)}%`, src: "JPL", ok: mn.stats.find((s) => s.label === "Mass")!.value.startsWith(`${+((100 * rv("moon", "massKg")) / ME).toFixed(1)}%`) });
  const aMoon = rv("moon", "aKm");
  claim({ claim: "Earth–Moon distance 384,400 km ≈ 30 Earths side by side", app: "384,400 km; about 30 Earths", ref: `a = ${aMoon} km; ${(aMoon / (2 * RE)).toFixed(1)} Earth diameters`, src: "JPL sats/elem Moon a; NSSDCA moonfact 0.3844×10⁶ km", ok: aMoon === 384_400 && Math.round(aMoon / (2 * RE)) === 30 });
  const sumMean = PLANETS.reduce((s, p) => s + 2 * rv(p, "radiusKm"), 0);
  const sumEq = PLANETS.reduce((s, p) => s + 2 * rv(p, "equatorialRadiusKm"), 0);
  const appSum = Number(mn.lines.join(" ").match(/together they are ([\d,]+) km/)?.[1].replace(/,/g, ""));
  const gapMean = aMoon - RE - rv("moon", "radiusKm");
  const perigee = 363_300;
  const apogee = 405_500;
  claim({
    claim: "All planets lined up 'just about fit in the gap' (sum of diameters)",
    app: `${appSum.toLocaleString("en-US")} km`,
    ref: `${Math.round(sumMean).toLocaleString("en-US")} km (JPL mean diameters); ${Math.round(sumEq).toLocaleString("en-US")} km equatorial. Surface-to-surface gap ${Math.round(gapMean).toLocaleString("en-US")} km at 384,400; ${Math.round(perigee - RE - rv("moon", "radiusKm")).toLocaleString("en-US")} at mean perigee, ${Math.round(apogee - RE - rv("moon", "radiusKm")).toLocaleString("en-US")} at mean apogee`,
    src: "JPL mean/equatorial radii; NSSDCA moonfact perigee 0.3633, apogee 0.4055 ×10⁶ km",
    ok: Math.abs(appSum - sumMean) / sumMean < 0.01,
    note: `Sum matches. But the claim is marginal: centre-to-centre ${appSum.toLocaleString("en-US")} < 384,400, yet the planets overshoot the surface-to-surface gap (${Math.round(gapMean).toLocaleString("en-US")} km) by ${Math.round(sumMean - gapMean).toLocaleString("en-US")} km at the mean distance, and by ${Math.round(sumEq - gapMean).toLocaleString("en-US")} km using equatorial widths. They fit with room only near apogee. 'Just about' is fair; 'would fit when the Moon is at its farthest' would be exact.`,
  });
  claim({ claim: "Moon's day 29.5 Earth days", app: mn.stats.find((s) => s.label === "Day")!.value, ref: `${(rv("moon", "solarDayH") / 24).toFixed(2)} d (synodic ${rv("moon", "synodicDays")} d)`, src: REF.moon.solarDayH.src, ok: (rv("moon", "solarDayH") / 24).toFixed(1) === "29.5" });
  claim({ claim: "Moon temperature hard-coded in earthMoonScale() stats", app: mn.stats.find((s) => s.label === "Temperature")!.value, ref: `${(REF.moon.tempC.v as number[]).join(" to ")} °C`, src: REF.moon.tempC.src, ok: false, note: "Hard-coded string in shared/scale.ts (not read from BODY_PHYSICS.moon.tempC): change both together." });
  for (const id of ["ganymede", "titan", "callisto"]) {
    const s = satelliteScale(id, NAME[id], "")!;
    const bigger = rv(id, "radiusKm") > rv("mercury", "radiusKm");
    const half = rv(id, "massKg") < 0.5 * rv("mercury", "massKg");
    claim({ claim: `${NAME[id]}: wider than Mercury${bigger ? ", under half its mass" : ""}`, app: s.headline, ref: `R ${rv(id, "radiusKm")} vs Mercury ${rv("mercury", "radiusKm")} km; mass ratio ${(rv(id, "massKg") / rv("mercury", "massKg")).toFixed(3)}`, src: "JPL", ok: bigger === /Bigger than the planet Mercury/.test(s.headline) && (!bigger || half === /less than half of Mercury/.test(s.lines.join(" "))) });
  }
  const largest = MOONS.reduce((a, b) => (rv(b.id, "radiusKm") > rv(a.id, "radiusKm") ? b : a));
  claim({ claim: "Ganymede is the largest moon", app: satelliteScale("ganymede", "Ganymede", "Jupiter")!.headline, ref: `largest JPL mean radius: ${largest.name} ${rv(largest.id, "radiusKm")} km`, src: "JPL sats/phys_par", ok: largest.id === "ganymede" });
  for (const [id, re, lo, hi] of [["phobos", /thrown ball/, 7, 30], ["deimos", /almost jump off/, 0, 7]] as const) {
    const v = rv(id, "escapeMs");
    const s = satelliteScale(id, NAME[id], "Mars")!.lines.join(" ");
    claim({ claim: `${NAME[id]}: escape speed wording`, app: s.match(/escape speed is just (\d+ m\/s)/)?.[1] ?? "?", ref: `${v} m/s`, src: REF[id].escapeMs.src, ok: v >= lo && v < hi && re.test(s) && s.includes(`${Math.round(v)} m/s`), note: Math.round(v) !== Math.round(escapeOf(BODY_PHYSICS[id])) ? `rounds to ${Math.round(v)} m/s with JPL values` : undefined });
  }
  for (const id of PLANETS) {
    const app = Math.round((70 * gravityOf(BODY_PHYSICS[id])) / 9.81);
    const jpl = Math.round((70 * rv(id, "gravity")) / 9.81);
    const eff = REF[id].gravity.alt!.find((a) => /equator, incl/.test(a.src))!.v as number;
    claim({ claim: `${cap(id)}: '70 kg would feel like N kg'`, app: `${app} kg`, ref: `${jpl} kg (JPL g ${rv(id, "gravity")}); ${Math.round((70 * eff) / 9.81)} kg with NSSDCA spin-included equatorial ${eff}`, src: "JPL / NSSDCA", ok: app === jpl, note: Math.round((70 * eff) / 9.81) !== jpl ? "definitional: felt weight at the giants' equator is lower once spin is included" : undefined });
  }
  const scaleSrc = readFileSync(join(ROOT, "shared", "scale.ts"), "utf8");
  for (const m of scaleSrc.matchAll(/\{ label: "(\w+)", au: ([\d.]+) \}/g)) {
    const id = m[1].toLowerCase();
    const a = id === "earth" ? 1.00000011 : rv(id, "aAU");
    claim({ claim: `scale.ts ORBITS ${m[1]} au`, app: m[2], ref: String(a), src: id === "earth" ? "NSSDCA earthfact: semimajor axis (AU)" : REF[id].aAU.src, ok: Math.abs(+m[2] - a) / a < 0.005 });
  }
  claim({ claim: "Object page planet 'Diameter' uses the mean radius", app: `Jupiter ${Math.round(2 * BODY_PHYSICS.jupiter.radiusKm).toLocaleString("en-US")} km`, ref: `NSSDCA table 'Diameter' is equatorial: ${idxDiam.jupiter.toLocaleString("en-US")} km`, src: "NSSDCA planetary fact table", ok: true, note: "Definitional (mean vs equatorial; 2.2% for Jupiter, 3.4% for Saturn). Fine as long as it is consistent; NASA's headline diameters are equatorial." });

  // -------------------------------------------------------------------------------------------- output
  const sources = Object.fromEntries(
    Object.entries(SOURCES).map(([k, s]) => [k, { ...s, fetched: statSync(join(CACHE, s.file)).mtime.toISOString().slice(0, 10) }]),
  );
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        about: "Reference values for the app's planets, Moon and planets' moons from NASA/JPL (scripts/crosscheck/bodies.ts). Each field: v = value, src = where, alt = other NASA/JPL values.",
        G,
        sources: { ...sources, horizons: { url: "https://ssd.jpl.nasa.gov/api/horizons.api", title: "JPL Horizons API (moon APmag at oppositions)", files: "hz-<naif>-<date>.txt" } },
        horizonsOppositions: OPPOSITIONS,
        bodies: REF,
        horizonsMagnitudes: hz,
      },
      null,
      1,
    ) + "\n",
  );

  const fixes = CHECKS.filter((c) => c.verdict === "fix");
  const corrections: Record<string, { v: Val; src: string; was: Val | undefined; note?: string }> = {};
  for (const c of fixes) {
    let key = c.path.replace(/\[\d\]$/, "");
    if (key.startsWith("derived ")) continue; // follows from mass/radius fixes
    corrections[key] = { ...c.proposal!, was: key.endsWith("tempC") ? (c.body === "earth" ? EARTH : BODY_PHYSICS[c.body]).tempC as Val : c.app };
  }
  // The hard-coded Moon temperature string follows BODY_PHYSICS.moon.tempC.
  if (corrections["BODY_PHYSICS.moon.tempC"]) {
    const [lo, hi] = corrections["BODY_PHYSICS.moon.tempC"].v as number[];
    corrections["shared/scale.ts earthMoonScale() stats Temperature value"] = { v: `−${-lo} to ${hi} °C`, was: "−173 to 127 °C", src: REF.moon.tempC.src, note: "hard-coded string; keep in step with BODY_PHYSICS.moon.tempC" };
  }
  for (const c of Object.values(corrections)) if (Array.isArray(c.v) && c.v.length === 2 && typeof c.v[0] === "number") c.note ??= "range [night min, day max] °C";
  writeFileSync(OUT_FIX, JSON.stringify(corrections, null, 1) + "\n");

  // ---- report
  const fmt = (v: Val | undefined): string => (v === undefined ? "—" : Array.isArray(v) ? `[${v.join(", ")}]` : typeof v === "number" ? (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4).replace(/\.?0+e/, "e") : String(v)) : String(v));
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const md: string[] = [];
  const counts = (v: Verdict) => CHECKS.filter((c) => c.verdict === v).length;
  md.push(
    "# Physical data cross-check: planets, the Moon, planets' moons",
    "",
    `Generated by \`npx tsx scripts/crosscheck/bodies.ts\` from pages cached in \`.local/crosscheck-cache/\`. Reference values with sources: \`shared/data/xcheck/bodies.json\`; proposed replacements: \`scripts/crosscheck/bodies-corrections.json\`.`,
    "",
    `**${CHECKS.length} fields compared: ${counts("ok")} ok, ${counts("note")} ok with a note, ${counts("definitional")} definitional, ${counts("fix")} to fix. ${claims.length} derived claims checked: ${claims.filter((c) => c.ok).length} hold${claims.some((c) => !c.ok) ? `, ${claims.filter((c) => !c.ok).length} need attention` : ""}.**`,
    "",
    "Tolerances: radius, mass, density, gravity 1%; rotation, day and orbital periods 0.5%; escape speed 2%; moon orbit radius 1%; temperatures ±5 K; moon magnitudes ±0.3 mag; designations, parents, NAIF codes, discovery years and discoverer surnames exact. Masses from JPL GM use G = 6.6743e-11.",
    "",
    "## Sources",
    "",
    ...Object.values(sources).map((s) => `- ${s.title} — <${s.url}> (cached ${s.fetched})`),
    `- JPL Horizons API — moons' APmag at their planet's oppositions (${Object.entries(OPPOSITIONS).map(([p, d]) => `${p} ${d.join(", ")}`).join("; ")}), geocentric; cached as \`hz-<naif>-<date>.txt\`.`,
    "",
    "Not available from these sources: the JPL satellite physical-parameter page no longer lists magnitudes or albedos (GM, mean radius and density only), so moon magnitudes come from Horizons (and NSSDCA's mean-opposition V0 for Phobos and Deimos). NSSDCA gives no day/night range for Mercury, so that comes from NASA Science.",
    "",
    "## Discrepancies (proposed corrections)",
    "",
    "| field | app | reference | Δ | source |",
    "|---|---|---|---|---|",
    ...fixes.map((c) => `| \`${c.path}\` | ${fmt(c.app)} | ${fmt(c.ref)} | ${c.delta} | ${esc(c.src)} |`),
    "",
    ...fixNotes(fixes),
    "",
    "## Definitional differences and notes (no change needed)",
    "",
    ...CHECKS.filter((c) => c.verdict === "definitional" || c.verdict === "note").map((c) => `- \`${c.path}\` app ${fmt(c.app)}, ref ${fmt(c.ref)} (${c.delta}): ${c.note}`),
    "",
    "## Derived claims",
    "",
    "| claim | app | reference | verdict |",
    "|---|---|---|---|",
    ...claims.map((c) => `| ${esc(c.claim)} | ${esc(c.app)} | ${esc(c.ref)} <br>_${esc(c.src)}_ | ${c.ok ? "holds" : "**check**"}${c.note ? ` — ${esc(c.note)}` : ""} |`),
    "",
    "## Moon magnitudes (Horizons APmag at opposition)",
    "",
    "| moon | app | Horizons (each opposition) | ref used | Δ |",
    "|---|---|---|---|---|",
    ...MOONS.map((m) => {
      const c = CHECKS.find((x) => x.path === `MOONS.${m.id}.mag`)!;
      return `| ${m.name} | ${m.mag} | ${hz[m.id].map((h) => `${h.date}: ${Number.isFinite(h.mag) ? h.mag.toFixed(2) : "n.a."}`).join("; ")} | ${fmt(c.ref)} | ${c.delta}${c.verdict === "fix" ? " **fix**" : ""} |`;
    }),
    "",
    "## Every field",
    "",
  );
  const bodies = [...new Set(CHECKS.map((c) => c.body))];
  for (const b of bodies) {
    md.push(`### ${NAME[b] ?? cap(b)}`, "", "| field | app | reference | Δ (tol) | verdict | source |", "|---|---|---|---|---|---|");
    for (const c of CHECKS.filter((x) => x.body === b)) md.push(`| ${c.field} \`${c.path}\` | ${fmt(c.app)} | ${fmt(c.ref)} | ${c.delta} (${c.tol}) | ${c.verdict === "fix" ? "**fix**" : c.verdict} | ${esc(c.src)} |`);
    md.push("");
  }
  writeFileSync(OUT_MD, md.join("\n"));

  console.log(`${CHECKS.length} checks: ${counts("ok")} ok, ${counts("note")} noted, ${counts("definitional")} definitional, ${counts("fix")} fix; ${claims.filter((c) => !c.ok).length}/${claims.length} claims flagged. Network ${fetched}, cache ${fromCache}.`);
  for (const c of fixes) console.log(`  FIX ${c.path}: ${fmt(c.app)} → ${fmt(c.ref)} (${c.delta})`);
  for (const c of claims.filter((x) => !x.ok)) console.log(`  CLAIM ${c.claim}: ${c.app} vs ${c.ref}`);
}

/** Why each proposed correction is right — explanations for the reviewer, keyed by path prefix. */
function fixNotes(fixes: Check[]): string[] {
  const WHY: Record<string, string> = {
    "BODY_PHYSICS.phobos.radiusKm": "JPL's mean radius (IAU WGCCRE, Archinal et al. 2018) is 11.08 ±0.04 km, which also matches the volume of NSSDCA's 13.0 × 11.4 × 9.1 km ellipsoid (11.05 km); 11.27 matches no current NASA/JPL figure. Shown on the object page (diameter 23 → 22 km) and drives gravity and escape speed.",
    "MOONS.phobos.radiusKm": "Same as BODY_PHYSICS.phobos.radiusKm (moons.ts rounds to 11.3).",
    "derived gravityOf(phobos)": "Follows from the Phobos radius fix (gravityOf uses mass/R²); shown as 0.00057 g now, 0.00059 g after.",
    "derived gravityOf(deimos)": "Follows from the Deimos mass fix; shown as 0.00026 g either way.",
    "BODY_PHYSICS.deimos.massKg": "JPL GM 0.0000962 ±0.0000028 km³/s² (MAR097) → 1.441e15 kg; 1.476e15 corresponds to GM ≈ 0.0000985, an earlier estimate. (NSSDCA's Mars sheet still lists 2.4e15 kg, long superseded.)",
    "BODY_PHYSICS.moon.tempC": "NSSDCA Moon sheet: equatorial diurnal range 95–390 K = −178 to 117 °C. The app's 100–400 K (−173 to 127 °C) runs 10 K hot at noon.",
    "BODY_PHYSICS.mercury.tempC": "NASA Science Mercury facts: 430 °C by day, −180 °C at night (800 °F / −290 °F). The app's −173 °C is −280 °F.",
  };
  const out: string[] = [];
  for (const c of fixes) {
    const k = Object.keys(WHY).find((p) => c.path.startsWith(p));
    if (k && !out.some((l) => l.includes(`\`${k}\``))) out.push(`- \`${k}\`: ${WHY[k]}`);
    else if (!k) out.push(`- \`${c.path}\`: outside tolerance (${c.delta}); reference ${String(c.ref)} from ${c.src}.`);
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
