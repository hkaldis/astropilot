/**
 * A polite JPL Horizons client for the reference fixtures (scripts/reference/fetch-horizons.ts).
 *
 * - Strictly one request at a time (a lock file across processes) and at least 2 s between requests.
 * - Retries 503s and network errors with growing back-off; gives up after 8 tries.
 * - Every successful answer is cached on disk (.local/reference-cache, git-ignored), so re-running the
 *   generator never queries Horizons again for the same thing.
 * - Only coordinates, dates and object codes are ever sent.
 *
 * API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(ROOT, ".local", "reference-cache");
const LAST = join(CACHE, ".last");
const LOCK = join(CACHE, ".lock");
const GAP_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lock() {
  for (;;) {
    try {
      closeSync(openSync(LOCK, "wx"));
      return;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 120_000) unlinkSync(LOCK); // stale lock from a killed run
      } catch {}
      await sleep(300);
    }
  }
}
const unlock = () => {
  try {
    unlinkSync(LOCK);
  } catch {}
};

export let requests = 0;
export let cacheHits = 0;

/** One Horizons query (text format). Values are quoted for the API; TLIST is passed as is. */
export async function horizons(params: Record<string, string>): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const q = (v: string) => `'${v}'`;
  const p = new URLSearchParams({
    format: "text",
    OBJ_DATA: q("NO"),
    MAKE_EPHEM: q("YES"),
    CSV_FORMAT: q("YES"),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, k === "TLIST" ? v : q(v)])),
  });
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${p}`;
  const file = join(CACHE, `${createHash("sha1").update(url).digest("hex")}.txt`);
  if (existsSync(file)) {
    cacheHits++;
    return readFileSync(file, "utf8");
  }
  await lock();
  try {
    let backoff = 3000;
    for (let i = 0; i < 8; i++) {
      const last = existsSync(LAST) ? Number(readFileSync(LAST, "utf8")) || 0 : 0;
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      writeFileSync(LAST, String(Date.now()));
      let r: Response;
      try {
        r = await fetch(url);
      } catch {
        await sleep(backoff);
        backoff *= 1.6;
        continue;
      }
      writeFileSync(LAST, String(Date.now()));
      requests++;
      if (r.status === 503) {
        await sleep(backoff);
        backoff *= 1.6;
        continue;
      }
      const text = await r.text();
      if (!r.ok) throw new Error(`Horizons HTTP ${r.status}: ${text.slice(0, 400)}`);
      if (text.includes("$$SOE")) writeFileSync(file, text);
      return text;
    }
    throw new Error("Horizons busy after 8 tries");
  } finally {
    unlock();
  }
}

/** The CSV table between $$SOE and $$EOE, with its header. */
export function table(text: string): { head: string[]; rows: string[][] } {
  const a = text.indexOf("$$SOE");
  const b = text.indexOf("$$EOE");
  if (a < 0) throw new Error(text.slice(0, 1500));
  const headLine = text.slice(0, a).split("\n").reverse().find((l) => l.includes("Date__")) ?? "";
  return {
    head: headLine.split(",").map((c) => c.trim()),
    rows: text
      .slice(a + 5, b)
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.split(",").map((c) => c.trim())),
  };
}

const MON: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** "2026-Oct-05 21:30" or "2026-Oct-05 21:30:12.345" (UT) → epoch ms. */
export function parseTime(s: string): number {
  const m = s.trim().match(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
  if (!m) throw new Error(`bad Horizons time "${s}"`);
  return Date.parse(`${m[1]}-${MON[m[2]]}-${m[3]}T${m[4]}:${m[5]}:${(m[6] ?? "00").padStart(2, "0")}Z`);
}

/** Epoch ms → Horizons "YYYY-MM-DD HH:MM" (UT, whole minutes). */
export const hzTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export interface RefSite {
  name: string;
  lat: number;
  lon: number;
  elevation: number;
  timezone: string;
}

/** Topocentric observer on the WGS-84 ellipsoid (longitude east, latitude, height in km). */
export const topo = (s: { lat: number; lon: number; elevation: number }) => ({ CENTER: "coord@399", COORD_TYPE: "GEODETIC", SITE_COORD: `${s.lon},${s.lat},${s.elevation / 1000}` });
