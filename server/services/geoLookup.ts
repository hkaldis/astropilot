/**
 * Time zone and terrain elevation for a point (Open-Meteo forecast API, keyless), shared by place
 * search, saved locations and the forecast.
 */
import { TTLCache, fetchWithTimeout, USER_AGENT } from "../http";

const DAY = 24 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * An elevation (m) worth keeping: geocoders answer 9999 for "unknown", and nothing anyone observes
 * from is above 9,000 m or below the Dead Sea shore (−430 m).
 */
export function plausibleElevation(m: unknown): number | null {
  return typeof m === "number" && Number.isFinite(m) && m > -450 && m < 9000 ? Math.round(m) : null;
}

export interface TzElevation {
  timezone: string | null;
  elevation: number | null;
}

const tzCache = new TTLCache<TzElevation>(DAY, 5000);
const tzFailures = new TTLCache<true>(10 * 60_000, 1000);
const tzInFlight = new Map<string, Promise<TzElevation | null>>();

/** IANA time zone and terrain elevation (m, 90 m DEM) for a point. Null if Open-Meteo is unreachable. */
export function lookupTzElevation(lat: number, lon: number): Promise<TzElevation | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = tzCache.get(key);
  if (hit) return Promise.resolve(hit);
  if (tzFailures.get(key)) return Promise.resolve(null);
  const pending = tzInFlight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&timezone=auto&forecast_days=1&current=temperature_2m`;
      const r = await fetchWithTimeout(url, { timeoutMs: 6000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: any = await r.json();
      const timezone = typeof j?.timezone === "string" && isValidTimeZone(j.timezone) ? j.timezone : null;
      const v = { timezone, elevation: plausibleElevation(j?.elevation) };
      tzCache.set(key, v);
      return v;
    } catch (e: any) {
      console.warn(`[geo] Open-Meteo lookup failed: ${e?.name === "AbortError" ? "timeout" : e?.message ?? "error"}`);
      tzFailures.set(key, true);
      return null;
    } finally {
      tzInFlight.delete(key);
    }
  })();
  tzInFlight.set(key, p);
  return p;
}
