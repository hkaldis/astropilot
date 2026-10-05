/**
 * Comets worth looking for: JPL's Small-Body Database supplies orbits and magnitude parameters for every
 * comet near perihelion; the predicted brightest get a daily ephemeris from JPL Horizons (perturbed orbit,
 * light-time, total magnitude). If Horizons is unreachable we fall back to two-body motion from the
 * elements (`shared/astro/comets.ts`), which is good to a few arcminutes over a couple of years.
 */
import { DAY_MS } from "@shared/astro/core";
import { cometFromElements, cometKey, type CometElements, type CometInfo, type CometPoint } from "@shared/astro/comets";
import { TTLCache, fetchWithTimeout, USER_AGENT } from "../http";

/** Comets predicted brighter than this (now or within the next two months) are listed. */
export const COMET_MAG_LIMIT = Number(process.env.COMET_MAG_LIMIT) || 13.5;
const MAX_COMETS = 12;
const EPHEM_BEFORE_DAYS = 2;
const EPHEM_AFTER_DAYS = 60;
export const COMET_ATTRIBUTION = "Comet orbits and ephemerides: NASA/JPL Small-Body Database and Horizons";

interface Candidate extends CometElements {
  designation: string;
  name: string;
}

const cache = new TTLCache<{ updated: string; comets: CometInfo[] }>(12 * 60 * 60 * 1000, 2);
let stale: { updated: string; comets: CometInfo[] } | null = null;
let inFlight: Promise<{ updated: string; comets: CometInfo[] }> | null = null;

const jdOf = (ms: number) => ms / DAY_MS + 2440587.5;

async function fetchCandidates(now: number): Promise<Candidate[]> {
  const jd = jdOf(now);
  const params = new URLSearchParams({
    fields: "full_name,pdes,prefix,e,q,i,om,w,tp,M1,K1",
    "sb-kind": "c",
    "full-prec": "true",
    "sb-cdata": JSON.stringify({ AND: ["q|LT|5", `tp|RG|${(jd - 500).toFixed(1)}|${(jd + 500).toFixed(1)}`] }),
  });
  const r = await fetchWithTimeout(`https://ssd-api.jpl.nasa.gov/sbdb_query.api?${params}`, { timeoutMs: 20_000, headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`SBDB HTTP ${r.status}`);
  const j = (await r.json()) as { fields: string[]; data: (string | null)[][] };
  const idx = (k: string) => j.fields.indexOf(k);
  const num = (v: string | null) => (v === null || v === "" ? NaN : Number(v));
  const out: Candidate[] = [];
  for (const row of j.data ?? []) {
    const M1 = num(row[idx("M1")]);
    const el = { e: num(row[idx("e")]), q: num(row[idx("q")]), i: num(row[idx("i")]), node: num(row[idx("om")]), peri: num(row[idx("w")]), tp: num(row[idx("tp")]) };
    if (!Number.isFinite(M1) || Object.values(el).some((x) => !Number.isFinite(x))) continue;
    const prefix = String(row[idx("prefix")] ?? "");
    const pdes = String(row[idx("pdes")] ?? "").trim();
    if (prefix === "D" || prefix === "X") continue; // defunct or uncertain
    const designation = /^\d+$/.test(pdes) ? `${pdes}${prefix || "P"}` : prefix && !pdes.includes("/") && !/^\d+[PCD]$/.test(pdes) ? `${prefix}/${pdes}` : pdes;
    const K1 = num(row[idx("K1")]);
    out.push({ ...el, M1, K1: Number.isFinite(K1) ? K1 : null, designation, name: String(row[idx("full_name")] ?? designation).trim() });
  }
  return out;
}

async function horizonsEphemeris(designation: string, startMs: number, stopMs: number): Promise<CometPoint[] | null> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const q = (v: string) => `'${v}'`;
  const params = new URLSearchParams({
    format: "json",
    COMMAND: q(`DES=${designation};CAP;NOFRAG`),
    OBJ_DATA: q("NO"),
    MAKE_EPHEM: q("YES"),
    EPHEM_TYPE: q("OBSERVER"),
    CENTER: q("500@399"),
    START_TIME: q(day(startMs)),
    STOP_TIME: q(day(stopMs)),
    STEP_SIZE: q("1 d"),
    QUANTITIES: q("1,9,19,20"),
    ANG_FORMAT: q("DEG"),
    CSV_FORMAT: q("YES"),
  });
  const r = await fetchWithTimeout(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, { timeoutMs: 20_000, headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) return null;
  const text = String(((await r.json()) as { result?: string }).result ?? "");
  const start = text.indexOf("$$SOE");
  const end = text.indexOf("$$EOE");
  if (start < 0 || end < 0) return null;
  // Header row (just above the first line of asterisks before $$SOE) names the columns.
  const head = text.slice(0, start).split("\n").reverse().find((l) => l.includes("R.A.") && l.includes("delta")) ?? "";
  const cols = head.split(",").map((c) => c.trim());
  const at = (name: string) => cols.findIndex((c) => c.startsWith(name));
  const iRa = at("R.A.");
  const iDec = at("DEC");
  const iT = at("T-mag");
  const iR = cols.findIndex((c) => c === "r");
  const iD = cols.findIndex((c) => c === "delta");
  if ([iRa, iDec, iR, iD].some((i) => i < 0)) return null;
  const points: CometPoint[] = [];
  for (const line of text.slice(start + 5, end).trim().split("\n")) {
    const f = line.split(",").map((c) => c.trim());
    const t = Date.parse(`${f[0].replace(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}:\d{2})$/, "$2 $3 $1 $4")} UTC`);
    const ra = Number(f[iRa]) / 15;
    const dec = Number(f[iDec]);
    const mag = iT >= 0 && f[iT] !== "n.a." ? Number(f[iT]) : NaN;
    if (!Number.isFinite(t) || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    points.push({ t, ra, dec, r: Number(f[iR]), delta: Number(f[iD]), mag: Number.isFinite(mag) ? mag : null });
  }
  return points.length ? points : null;
}

function elementsEphemeris(c: Candidate, startMs: number, stopMs: number): CometPoint[] {
  const out: CometPoint[] = [];
  for (let t = startMs; t <= stopMs; t += DAY_MS) out.push(cometFromElements(c, t));
  return out;
}

async function build(): Promise<{ updated: string; comets: CometInfo[] }> {
  const now = Date.now();
  const day0 = Math.floor(now / DAY_MS) * DAY_MS;
  const candidates = await fetchCandidates(now);
  const scored = candidates
    .map((c) => {
      const mags = [0, 30, 60].map((d) => cometFromElements(c, now + d * DAY_MS).mag ?? 99);
      return { c, best: Math.min(...mags), nowMag: mags[0] };
    })
    .filter((x) => x.best <= COMET_MAG_LIMIT)
    .sort((a, b) => a.best - b.best)
    .slice(0, MAX_COMETS);
  const startMs = day0 - EPHEM_BEFORE_DAYS * DAY_MS;
  const stopMs = day0 + EPHEM_AFTER_DAYS * DAY_MS;
  const comets: CometInfo[] = [];
  for (const { c } of scored) {
    let ephemeris: CometPoint[] | null = null;
    try {
      ephemeris = await horizonsEphemeris(c.designation, startMs, stopMs);
    } catch (e: any) {
      console.warn(`[comets] Horizons failed for ${c.designation}: ${e?.name === "AbortError" ? "timeout" : e?.message ?? e}`);
    }
    comets.push({
      id: cometKey(c.designation),
      designation: c.designation,
      name: c.name,
      q: c.q,
      e: c.e,
      perihelion: (c.tp - 2440587.5) * DAY_MS,
      source: ephemeris ? "horizons" : "elements",
      ephemeris: ephemeris ?? elementsEphemeris(c, startMs, stopMs),
    });
  }
  return { updated: new Date(now).toISOString(), comets };
}

/** Bright comets with ephemerides for the next two months (cached 12 h; stale data is kept if JPL is down). */
export async function getComets(): Promise<{ updated: string; comets: CometInfo[]; attribution: string }> {
  const hit = cache.get("all");
  if (hit) return { ...hit, attribution: COMET_ATTRIBUTION };
  inFlight ??= build()
    .then((v) => {
      cache.set("all", v);
      stale = v;
      return v;
    })
    .catch((e) => {
      console.warn(`[comets] unavailable: ${e?.message ?? e}`);
      if (stale) {
        cache.set("all", stale, 30 * 60 * 1000);
        return stale;
      }
      throw e;
    })
    .finally(() => {
      inFlight = null;
    });
  return { ...(await inFlight), attribution: COMET_ATTRIBUTION };
}
