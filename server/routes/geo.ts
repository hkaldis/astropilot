/**
 * Place search and reverse geocoding (public, no sign-in needed).
 *  - Search: Open-Meteo Geocoding (GeoNames) — names, admin region, country, elevation, time zone.
 *  - Reverse: Nominatim (OpenStreetMap) for the name, Open-Meteo for time zone + elevation.
 *    Nominatim's usage policy: ≤ 1 request/s for the whole app, a real User-Agent, cache results.
 * Upstream failures degrade gracefully ("Near 37.98°, 23.73°").
 */
import type { Express } from "express";
import { z } from "zod";
import type { GeoPlace } from "@shared/api";
import { ah, parse, rateLimit, TTLCache, fetchWithTimeout, USER_AGENT, HttpError } from "../http";

const DAY = 24 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------
// Time zone + elevation (Open-Meteo forecast API, keyless)
// ------------------------------------------------------------------------------------

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
      const elevation = typeof j?.elevation === "number" && Number.isFinite(j.elevation) ? Math.round(j.elevation) : null;
      const v = { timezone, elevation };
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

// ------------------------------------------------------------------------------------
// Nominatim reverse geocoding — globally throttled to 1 request per ~1.1 s
// ------------------------------------------------------------------------------------

const NOMINATIM_GAP_MS = 1100;
const NOMINATIM_MAX_WAIT_MS = 6000;
let nominatimNextSlot = 0;

/** Reserve the next free Nominatim slot and wait for it; false if the queue is too long. */
async function nominatimSlot(): Promise<boolean> {
  const now = Date.now();
  const start = Math.max(now, nominatimNextSlot);
  if (start - now > NOMINATIM_MAX_WAIT_MS) return false;
  nominatimNextSlot = start + NOMINATIM_GAP_MS;
  if (start > now) await new Promise((r) => setTimeout(r, start - now));
  return true;
}

interface PlaceName {
  name: string | null;
  region: string | null;
  country: string | null;
}

const reverseCache = new TTLCache<PlaceName>(DAY, 5000);

const PLACE_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "city_district",
  "borough",
  "municipality",
  "quarter",
  "neighbourhood",
  "isolated_dwelling",
  "locality",
]);
/** "Royal Borough of Greenwich" → "Greenwich", "Municipality of Athens" → "Athens". */
const ADMIN_PREFIX = /^(?:(?:Royal|London|Metropolitan)\s+)?(?:Borough|City|Municipality|Municipal Unit|Town|Village|Township|County|Commune|District)\s+of\s+/i;

async function reverseName(lat: number, lon: number): Promise<PlaceName | null> {
  // ~1 km precision is plenty for a town name and avoids sending a precise position upstream.
  const qLat = lat.toFixed(2);
  const qLon = lon.toFixed(2);
  const key = `${qLat},${qLon}`;
  const hit = reverseCache.get(key);
  if (hit) return hit;
  if (!(await nominatimSlot())) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${qLat}&lon=${qLon}&zoom=10&addressdetails=1&accept-language=en`;
    const r = await fetchWithTimeout(url, { timeoutMs: 8000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json();
    if (j?.error) {
      // e.g. "Unable to geocode" over open water: a valid answer, cache it.
      const none = { name: null, region: null, country: null };
      reverseCache.set(key, none);
      return none;
    }
    const a = j?.address ?? {};
    // The matched feature itself is the most specific name when it is a settlement or district.
    const own = PLACE_TYPES.has(j?.addresstype) && typeof j?.name === "string" ? j.name : null;
    const raw: string | null = own ?? a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.suburb ?? a.county ?? j?.name ?? null;
    const name = raw ? raw.replace(ADMIN_PREFIX, "").trim() || raw : null;
    let region: string | null = a.state ?? a.region ?? a.province ?? a.state_district ?? a.county ?? null;
    if (region && region === name) region = null;
    const v = { name, region, country: a.country ?? null };
    reverseCache.set(key, v);
    return v;
  } catch (e: any) {
    console.warn(`[geo] Nominatim reverse failed: ${e?.name === "AbortError" ? "timeout" : e?.message ?? "error"}`);
    return null;
  }
}

export function nearLabel(lat: number, lon: number) {
  return `Near ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

async function reversePlace(lat: number, lon: number): Promise<GeoPlace> {
  const [name, tz] = await Promise.all([reverseName(lat, lon), lookupTzElevation(lat, lon)]);
  return {
    name: name?.name ?? nearLabel(lat, lon),
    region: name?.region ?? null,
    country: name?.country ?? null,
    latitude: lat,
    longitude: lon,
    elevation: tz?.elevation ?? null,
    timezone: tz?.timezone ?? null,
  };
}

// ------------------------------------------------------------------------------------
// Search (Open-Meteo Geocoding)
// ------------------------------------------------------------------------------------

const searchCache = new TTLCache<GeoPlace[]>(DAY, 3000);

/** "37.98, 23.73", "-33.86 151.21", "37.98N 23.73E" → coordinates, else null. */
export function parseCoordinates(q: string): { lat: number; lon: number } | null {
  const m = q
    .trim()
    .match(/^([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;/\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lon = parseFloat(m[3]);
  if (m[2]?.toUpperCase() === "S") lat = -Math.abs(lat);
  if (m[4]?.toUpperCase() === "W") lon = -Math.abs(lon);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return { lat, lon };
}

async function searchPlaces(q: string): Promise<GeoPlace[]> {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  let j: any;
  try {
    const r = await fetchWithTimeout(url, { timeoutMs: 7000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    j = await r.json();
  } catch (e: any) {
    console.warn(`[geo] Open-Meteo geocoding failed: ${e?.name === "AbortError" ? "timeout" : e?.message ?? "error"}`);
    // 424: an upstream dependency failed. (5xx messages are replaced by generic text on the client.)
    throw new HttpError(424, "Place search is unavailable right now. Try again in a minute, or use your current position.");
  }
  const results: GeoPlace[] = (Array.isArray(j?.results) ? j.results : [])
    .filter((p: any) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && typeof p?.name === "string")
    .map((p: any) => ({
      name: p.name,
      region: typeof p.admin1 === "string" && p.admin1 !== p.name ? p.admin1 : null,
      country: typeof p.country === "string" ? p.country : null,
      latitude: p.latitude,
      longitude: p.longitude,
      elevation: Number.isFinite(p.elevation) ? Math.round(p.elevation) : null,
      timezone: typeof p.timezone === "string" && isValidTimeZone(p.timezone) ? p.timezone : null,
    }));
  searchCache.set(key, results);
  return results;
}

// ------------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------------

const searchQuery = z.object({
  q: z
    .string({ required_error: "Type a place to search for" })
    .trim()
    .min(2, "Type at least 2 characters")
    .max(100, "That search is too long"),
});

/** A coordinate from the query string; "", missing or repeated values are errors (never 0). */
const coord = (label: string, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v : NaN),
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .finite(`${label} must be a number`)
      .min(-max, `${label} must be between -${max} and ${max}`)
      .max(max, `${label} must be between -${max} and ${max}`),
  ) as unknown as z.ZodType<number>; // input is a query string; `parse` wants input = output

const coordQuery = z.object({ lat: coord("Latitude", 90), lon: coord("Longitude", 180) });

export function registerGeo(app: Express) {
  app.get(
    "/api/geo/search",
    rateLimit({ windowMs: 60_000, max: 60, message: "Too many searches — please wait a moment." }),
    ah(async (req, res) => {
      const { q } = parse(searchQuery, req.query);
      const coords = parseCoordinates(q);
      const places = coords ? [await reversePlace(coords.lat, coords.lon)] : await searchPlaces(q);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.json(places);
    }),
  );

  app.get(
    "/api/geo/reverse",
    rateLimit({ windowMs: 60_000, max: 20, message: "Too many location lookups — please wait a moment." }),
    ah(async (req, res) => {
      const { lat, lon } = parse(coordQuery, req.query);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.json(await reversePlace(lat, lon));
    }),
  );
}
