/**
 * Geomagnetic activity (NOAA SWPC planetary K-index, observed + 3-day forecast) and a
 * rule-of-thumb aurora outlook for an observer.
 *
 * Aurora rule of thumb: the equatorward edge of the auroral oval sits at about
 * |geomagnetic latitude| ≈ 66.5° − 2.05°·Kp (Kp 0 → 66.5°, Kp 5 → 56.3°, Kp 9 → 48°), the classic
 * SWPC table; aurora can be seen low on the poleward horizon from ~3° further equatorward.
 * Geomagnetic latitude uses the eccentric (offset) dipole from IGRF degree-1/2 terms, which
 * tracks corrected geomagnetic latitude far better than a centred dipole over Europe and
 * Australasia (London ≈ 50°, Edinburgh ≈ 55°, Minneapolis ≈ 50°, Hobart ≈ −54°, Reykjavík ≈ 64°).
 */
import { DEG, HOUR_MS } from "@shared/astro";
import type { KpPoint, SpaceWeather } from "@shared/forecast";
import { HttpError, USER_AGENT, fetchWithTimeout } from "../http";

const KP_OBSERVED = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const KP_FORECAST = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
const TTL = 15 * 60_000;
const STALE_MAX = 6 * HOUR_MS; // serve old data this long if NOAA is down

export const AURORA_MODEL = {
  ovalEdgeAtKp0: 66.5, // |geomagnetic latitude| of the oval's equatorward edge at Kp 0
  ovalEdgePerKp: 2.05, // degrees equatorward per unit Kp
  horizonOffset: 3, // aurora visible low on the poleward horizon this much further equatorward
  stormKp: 5, // G1 threshold
} as const;

/** Geomagnetic north pole (dipole axis), IGRF-14 epoch 2025. */
const POLE_LAT = 80.8;
const POLE_LON = -72.7;
/** Eccentric-dipole centre offset (km, Earth-fixed x/y/z), from IGRF g/h degree 1–2 (≈590 km toward 22.7°N 137°E). */
const ED_OFFSET = [-398, 372, 228];
const EARTH_R = 6371.2;

const POLE = [Math.cos(POLE_LAT * DEG) * Math.cos(POLE_LON * DEG), Math.cos(POLE_LAT * DEG) * Math.sin(POLE_LON * DEG), Math.sin(POLE_LAT * DEG)];

/** Approximate geomagnetic latitude (deg, eccentric dipole). Negative in the southern hemisphere. */
export function geomagneticLatitude(lat: number, lon: number): number {
  const p = [
    EARTH_R * Math.cos(lat * DEG) * Math.cos(lon * DEG) - ED_OFFSET[0],
    EARTH_R * Math.cos(lat * DEG) * Math.sin(lon * DEG) - ED_OFFSET[1],
    EARTH_R * Math.sin(lat * DEG) - ED_OFFSET[2],
  ];
  const n = Math.hypot(p[0], p[1], p[2]);
  const s = (p[0] * POLE[0] + p[1] * POLE[1] + p[2] * POLE[2]) / n;
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

export function ovalEdge(kp: number): number {
  return AURORA_MODEL.ovalEdgeAtKp0 - AURORA_MODEL.ovalEdgePerKp * kp;
}

/** Kp needed to see aurora low on the poleward horizon from |geomagnetic latitude|. */
export function kpNeededFor(absGeomagLat: number): number {
  return Math.max(0, (AURORA_MODEL.ovalEdgeAtKp0 - AURORA_MODEL.horizonOffset - absGeomagLat) / AURORA_MODEL.ovalEdgePerKp);
}

interface KpData {
  points: KpPoint[]; // sorted by t
  fetchedAt: number;
}

let cache: KpData | null = null;
let inflight: Promise<KpData> | null = null;

async function getJson(url: string): Promise<any> {
  const res = await fetchWithTimeout(url, { timeoutMs: 8000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** NOAA time tags are UTC without a zone ("2026-10-03T21:00:00"); older products use "2026-10-03 21:00:00.000". */
function parseTag(tag: unknown): number | null {
  if (typeof tag !== "string") return null;
  const s = tag.trim().replace(" ", "T").replace(/(\.\d+)?Z?$/, "");
  const t = Date.parse(`${s}Z`);
  return Number.isFinite(t) ? t : null;
}

/** Rows are objects ({time_tag, kp|Kp, observed}) in current products, or arrays with a header row in older ones. */
function rowsOf(json: unknown): Record<string, unknown>[] {
  if (!Array.isArray(json) || json.length === 0) return [];
  if (Array.isArray(json[0])) {
    const header = (json[0] as unknown[]).map((h) => String(h));
    return json.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r as unknown[])[i]])));
  }
  return json.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

function parseKp(json: unknown, defaultObserved: boolean): KpPoint[] {
  const out: KpPoint[] = [];
  for (const r of rowsOf(json)) {
    const t = parseTag(r.time_tag);
    const kp = Number(r.kp ?? r.Kp);
    if (t === null || !Number.isFinite(kp) || kp < 0 || kp > 9) continue;
    const status = typeof r.observed === "string" ? r.observed : null;
    out.push({ t, kp: Math.round(kp * 100) / 100, observed: status ? status !== "predicted" : defaultObserved });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function loadKp(): Promise<KpData> {
  const [fc, obs] = await Promise.allSettled([getJson(KP_FORECAST), getJson(KP_OBSERVED)]);
  const forecast = fc.status === "fulfilled" ? parseKp(fc.value, false) : [];
  const observed = obs.status === "fulfilled" ? parseKp(obs.value, true) : [];
  if (fc.status === "rejected") console.warn(`[space-weather] Kp forecast failed: ${(fc.reason as Error)?.message}`);
  if (obs.status === "rejected") console.warn(`[space-weather] Kp observed failed: ${(obs.reason as Error)?.message}`);
  // The forecast product carries last week's observations, a nowcast ("estimated") and predictions;
  // measured values from the observed product win wherever both exist.
  const byT = new Map<number, KpPoint>();
  for (const p of forecast) byT.set(p.t, p);
  for (const p of observed) byT.set(p.t, p);
  const points = [...byT.values()].sort((a, b) => a.t - b.t);
  if (points.length === 0) throw new Error("no Kp data");
  return { points, fetchedAt: Date.now() };
}

async function kpData(): Promise<KpData> {
  if (cache && Date.now() - cache.fetchedAt < TTL) return cache;
  if (!inflight) {
    inflight = loadKp()
      .then((d) => (cache = d))
      .finally(() => (inflight = null));
  }
  try {
    return await inflight;
  } catch {
    if (cache && Date.now() - cache.fetchedAt < STALE_MAX) return cache;
    throw new HttpError(502, "Space-weather data from NOAA is unavailable right now. Please try again later.");
  }
}

const kpText = (kp: number) => `Kp ${Math.round(kp)}`;

function auroraNote(kpMax: number, gm: number | null): { likely: boolean; note: string } {
  const M = AURORA_MODEL;
  const edge = ovalEdge(kpMax);
  const view = edge - M.horizonOffset;
  // NOAA's G scale counts "5−" (4.67) as G1, so classify on the rounded Kp.
  const k = Math.round(kpMax);
  if (gm === null) {
    if (k >= M.stormKp) {
      return { likely: true, note: `G${Math.min(5, k - 4)} storm expected: aurora may be seen down to about ${Math.round(view)}° geomagnetic latitude.` };
    }
    if (k >= 4) return { likely: false, note: `Unsettled (${kpText(kpMax)}): aurora active at high latitudes.` };
    return { likely: false, note: "Quiet — aurora only near the poles tonight." };
  }
  const a = Math.abs(gm);
  const horizon = gm >= 0 ? "northern" : "southern";
  if (a >= 62 && a >= edge - 4) return { likely: true, note: `You're near the auroral zone — aurora is likely whenever it's dark and clear (${kpText(kpMax)} expected).` };
  if (a >= edge) return { likely: true, note: `${kpText(kpMax)} expected: aurora may be overhead from your latitude after dark.` };
  if (a >= view) return { likely: true, note: `${kpText(kpMax)} expected: aurora possible low on the ${horizon} horizon from your latitude.` };
  const need = kpNeededFor(a);
  if (need > 9) return { likely: false, note: k >= M.stormKp ? `${kpText(kpMax)} storm, but you're too far from the auroral zone to see it.` : "Quiet — aurora only near the poles tonight." };
  const needText = `Kp ${Math.ceil(need)}`;
  if (k < 4) return { likely: false, note: `Quiet — aurora only near the poles tonight; you'd need ${needText}+ to see it from here.` };
  return { likely: false, note: `${kpText(kpMax)} expected — not quite enough here; you'd need ${needText}+.` };
}

export async function getSpaceWeather(q: { lat?: number; lon?: number } = {}): Promise<SpaceWeather> {
  const data = await kpData();
  const now = Date.now();
  const pts = data.points;
  const past = pts.filter((p) => p.observed && p.t <= now);
  const kpNow = past.length ? past[past.length - 1].kp : pts[0].kp;
  // Intervals overlapping the next 24 h (each Kp value covers 3 hours from its time tag).
  const next = pts.filter((p) => p.t + 3 * HOUR_MS > now && p.t < now + 24 * HOUR_MS);
  const kpMax24h = next.length ? Math.max(...next.map((p) => p.kp)) : kpNow;
  const gm = q.lat !== undefined && q.lon !== undefined ? geomagneticLatitude(q.lat, q.lon) : null;
  // "Tonight" includes right now: judge by the larger of the current and the forecast Kp, so the note
  // never calls an active Kp 4 "quiet".
  const kpTonight = Math.max(kpNow, kpMax24h);
  const { likely, note } = auroraNote(kpTonight, gm);
  const edge = ovalEdge(kpTonight);
  return {
    kpNow,
    kpMax24h,
    forecast: pts.filter((p) => p.t + 3 * HOUR_MS > now - 24 * HOUR_MS).map((p) => ({ t: p.t, kp: p.kp, observed: p.observed })),
    aurora: {
      likely,
      minGeomagLat: Math.round(edge * 10) / 10,
      note,
      geomagLat: gm === null ? null : Math.round(gm * 10) / 10,
      viewLat: Math.round((edge - AURORA_MODEL.horizonOffset) * 10) / 10,
    },
    updatedAt: data.fetchedAt,
  };
}
