/**
 * Time zone and terrain height for a point. From our server; when its source (Open-Meteo, which limits
 * requests per server address) turns it away, this browser asks Open-Meteo directly.
 */
import { apiGet, withParams } from "./api";

export interface Zone {
  timezone: string | null;
  elevation: number | null;
}

const validZone = (tz: unknown): tz is string => {
  if (typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
/** Geocoders say 9999 for "unknown"; nobody observes above 9,000 m or below the Dead Sea shore. */
const plausible = (m: unknown) => (typeof m === "number" && Number.isFinite(m) && m > -450 && m < 9000 ? Math.round(m) : null);

export async function lookupZone(lat: number, lon: number): Promise<Zone> {
  try {
    return await apiGet<Zone>(withParams("/api/geo/zone", { lat: lat.toFixed(4), lon: lon.toFixed(4) }));
  } catch {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto&forecast_days=1&current=temperature_2m`,
      { credentials: "omit" },
    );
    if (!r.ok) throw new Error(`Time zone lookup failed (HTTP ${r.status})`);
    const j = await r.json();
    return { timezone: validZone(j?.timezone) ? j.timezone : null, elevation: plausible(j?.elevation) };
  }
}
