/**
 * Place search and reverse geocoding (public, no sign-in needed).
 *  - Search: Open-Meteo Geocoding (GeoNames: towns, with elevation and time zone) together with Photon
 *    (OpenStreetMap: lakes, peaks, parks, observatories, viewpoints — where people actually observe).
 *    Photon is built for search-as-you-type; Nominatim's policy forbids that, so it isn't used here.
 *  - Reverse: Nominatim (OpenStreetMap) for the name, Open-Meteo for time zone + elevation.
 *    Nominatim's usage policy: ≤ 1 request/s for the whole app, a real User-Agent, cache results.
 * Upstream failures degrade gracefully ("Near 37.98°, 23.73°").
 */
import type { Express } from "express";
import { z } from "zod";
import type { GeoPlace } from "@shared/api";
import { ah, parse, rateLimit, TTLCache, fetchWithTimeout, USER_AGENT, HttpError } from "../http";
import { isValidTimeZone, lookupTzElevation, plausibleElevation } from "../services/geoLookup";
import { skyBrightnessAt } from "../services/lightPollution";

const DAY = 24 * 60 * 60 * 1000;

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
/** "Royal Borough of Greenwich" → "Greenwich", "Municipality of Athens" → "Athens", "Regional Unit of West Attica" → "West Attica". */
const ADMIN_PREFIX = /^(?:(?:Royal|London|Metropolitan)\s+)?(?:Borough|City|Municipality|Municipal Unit|Regional Unit|Region|Prefecture|Province|Town|Village|Township|County|Commune|District)\s+of\s+(?:the\s+)?/i;

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
    if (region) region = region.replace(ADMIN_PREFIX, "").trim() || region;
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

/** Towns and cities from GeoNames (Open-Meteo), with their elevation and time zone. */
async function searchTowns(q: string): Promise<GeoPlace[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  const r = await fetchWithTimeout(url, { timeoutMs: 7000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j: any = await r.json();
  const results: GeoPlace[] = (Array.isArray(j?.results) ? j.results : [])
    .filter((p: any) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && typeof p?.name === "string")
    .map((p: any) => ({
      name: p.name,
      region: typeof p.admin1 === "string" && p.admin1 !== p.name ? p.admin1 : null,
      country: typeof p.country === "string" ? p.country : null,
      latitude: p.latitude,
      longitude: p.longitude,
      // GeoNames has no height for some places and says 9999 (Tromsø, for one).
      elevation: plausibleElevation(p.elevation),
      timezone: typeof p.timezone === "string" && isValidTimeZone(p.timezone) ? p.timezone : null,
    }));
  // Fill a missing height or zone from the terrain model, so a picked place is never left without one.
  await Promise.all(
    results
      .filter((p) => p.elevation === null || p.timezone === null)
      .map(async (p) => {
        const geo = await lookupTzElevation(p.latitude, p.longitude);
        p.elevation ??= geo?.elevation ?? null;
        p.timezone ??= geo?.timezone ?? null;
      }),
  );
  return results;
}

/** OpenStreetMap features worth observing from (keys, or key=value), as Photon reports them. */
const FEATURES: Record<string, Record<string, string> | true> = {
  place: { city: "City", town: "Town", village: "Village", hamlet: "Hamlet", locality: "Locality", isolated_dwelling: "Hamlet", island: "Island", islet: "Island", suburb: "District", neighbourhood: "District", quarter: "District" },
  natural: true,
  leisure: { park: "Park", nature_reserve: "Nature reserve", garden: "Park", recreation_ground: "Park" },
  boundary: { national_park: "National park", protected_area: "Protected area" },
  man_made: { observatory: "Observatory", tower: "Tower", lighthouse: "Lighthouse" },
  tourism: { viewpoint: "Viewpoint", camp_site: "Campsite", caravan_site: "Campsite", alpine_hut: "Mountain hut", wilderness_hut: "Mountain hut", picnic_site: "Picnic site", attraction: "Attraction" },
  landuse: { winter_sports: "Ski area", recreation_ground: "Park", meadow: "Meadow" },
  mountain_pass: true,
  historic: true,
};
const NATURAL: Record<string, string> = { peak: "Peak", volcano: "Volcano", ridge: "Ridge", saddle: "Mountain pass", plateau: "Plateau", beach: "Beach", bay: "Bay", cape: "Cape", wood: "Forest", heath: "Heath", grassland: "Meadow", spring: "Spring", glacier: "Glacier", valley: "Valley", wetland: "Wetland" };
const LAKE_WORD = /\b(lake|lac|lago|see|lakes|reservoir|loch|λίμνη|limni)\b/i;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** What an OpenStreetMap feature is, in words; null when it isn't a place to observe from. */
export function featureKind(key: string, value: string, name: string): string | null {
  const rule = FEATURES[key];
  if (!rule) return null;
  if (key === "natural") return value === "water" ? (LAKE_WORD.test(name) ? "Lake" : "Water") : (NATURAL[value] ?? sentence(value));
  if (key === "mountain_pass") return "Mountain pass";
  if (key === "historic") return "Historic site";
  return rule === true ? sentence(value) : (rule[value] ?? null);
}

/** Lakes, peaks, parks, observatories and the like from OpenStreetMap (Photon). */
async function searchFeatures(q: string): Promise<GeoPlace[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=en`;
  const r = await fetchWithTimeout(url, { timeoutMs: 6000, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j: any = await r.json();
  const out: GeoPlace[] = [];
  for (const f of Array.isArray(j?.features) ? j.features : []) {
    const p = f?.properties ?? {};
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    if (typeof p.name !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const kind = featureKind(String(p.osm_key ?? ""), String(p.osm_value ?? ""), p.name);
    if (!kind) continue;
    out.push({
      name: p.name,
      region: typeof p.state === "string" && p.state !== p.name ? p.state : null,
      country: typeof p.country === "string" ? p.country : null,
      latitude: Math.round(lat * 1e5) / 1e5,
      longitude: Math.round(lon * 1e5) / 1e5,
      // Looked up for the exact spot when it's picked or saved.
      elevation: null,
      timezone: null,
      kind: ["City", "Town", "Village", "Hamlet", "Locality", "District"].includes(kind) ? null : kind,
    });
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]+/g, " ").trim();
const kmBetween = (a: GeoPlace, b: GeoPlace) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  return 6371 * Math.hypot(dLat, dLon);
};
/** The same place twice: a town both catalogs know, or one feature mapped twice (a park and its boundary). */
const samePlace = (a: GeoPlace, b: GeoPlace) => {
  const d = kmBetween(a, b);
  const na = fold(a.name);
  const nb = fold(b.name);
  return d < 0.5 || (d < 5 && (na === nb || na.includes(nb) || nb.includes(na)) && !!a.kind === !!b.kind);
};
/** A search that names a kind of feature: those results go first. */
const FEATURE_QUERY = /\b(lake|lac|lago|mount|mt|mountain|peak|hill|park|reserve|observatory|beach|bay|cape|forest|pass|ski|island|viewpoint|camp|campsite|plateau|valley|dam|reservoir|λίμνη|όρος)\b/i;

const townCache = new TTLCache<GeoPlace[]>(DAY, 3000);

/** Towns alone: the quick first answer while the slower feature search (Photon, ~1–4 s) runs. */
async function cachedTowns(q: string): Promise<GeoPlace[]> {
  const key = q.toLowerCase();
  const hit = townCache.get(key);
  if (hit) return hit;
  const towns = await searchTowns(q);
  townCache.set(key, towns);
  return towns;
}

async function searchPlaces(q: string): Promise<GeoPlace[]> {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;
  const [towns, features] = await Promise.allSettled([cachedTowns(q), searchFeatures(q)]);
  for (const [name, r] of [["Open-Meteo geocoding", towns], ["Photon", features]] as const)
    if (r.status === "rejected") console.warn(`[geo] ${name} failed: ${r.reason?.name === "AbortError" ? "timeout" : r.reason?.message ?? "error"}`);
  if (towns.status === "rejected" && features.status === "rejected") {
    // 424: an upstream dependency failed. (5xx messages are replaced by generic text on the client.)
    throw new HttpError(424, "Place search is unavailable right now. Try again in a minute, paste coordinates, or use your current position.");
  }
  const a = towns.status === "fulfilled" ? towns.value : [];
  const b = features.status === "fulfilled" ? features.value : [];
  // Towns first, in the order the quick answer showed them, then the features they don't already cover;
  // features first when the search names one ("Lake …", "Mount …"). Each place once — a town's own
  // entry wins, as it carries its elevation and time zone.
  const [first, second] = FEATURE_QUERY.test(q) ? [b, a] : [a, b];
  const merged: GeoPlace[] = [];
  for (const p of [...first, ...second]) {
    const dup = merged.findIndex((m) => samePlace(m, p));
    if (dup < 0) merged.push(p);
    else if (merged[dup].timezone === null && p.timezone !== null) merged[dup] = { ...p, kind: merged[dup].kind ?? p.kind };
  }
  const results = merged.slice(0, 12);
  // A partial answer (one source down) is kept briefly, a full one for a day.
  searchCache.set(key, results, towns.status === "fulfilled" && features.status === "fulfilled" ? undefined : 5 * 60_000);
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
  /** "towns": the quick GeoNames answer only. */
  scope: z.enum(["towns", "all"]).default("all"),
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
      const { q, scope } = parse(searchQuery, req.query);
      const coords = parseCoordinates(q);
      let places: GeoPlace[];
      if (coords) places = [await reversePlace(coords.lat, coords.lon)];
      else if (scope === "towns") {
        try {
          places = await cachedTowns(q);
        } catch (e: any) {
          console.warn(`[geo] Open-Meteo geocoding failed: ${e?.name === "AbortError" ? "timeout" : e?.message ?? "error"}`);
          places = []; // the full search still runs and answers with what it can
        }
      } else places = await searchPlaces(q);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.json(places);
    }),
  );

  app.get(
    "/api/geo/sky-brightness",
    rateLimit({ windowMs: 60_000, max: 60, message: "Too many lookups — please wait a moment." }),
    ah(async (req, res) => {
      const { lat, lon } = parse(coordQuery, req.query);
      const result = await skyBrightnessAt(lat, lon);
      if (!result) throw new HttpError(404, "No light-pollution data for this spot (outside the atlas, or the data source is unavailable).");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(result);
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

  // Time zone and terrain height alone (no place name), for a place picked without them.
  app.get(
    "/api/geo/zone",
    rateLimit({ windowMs: 60_000, max: 30, message: "Too many location lookups — please wait a moment." }),
    ah(async (req, res) => {
      const { lat, lon } = parse(coordQuery, req.query);
      const geo = await lookupTzElevation(lat, lon);
      if (!geo?.timezone) throw new HttpError(424, "Couldn't look up the time zone right now.");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(geo);
    }),
  );
}
