import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ForecastResponse, NightForecast } from "@shared/forecast";
import { nightOf, currentNightDate, addDays, nightFrames, formatDate, formatTime, tzOffsetHours, HOUR_MS, type NightInfo, type NightFrames } from "@shared/astro";
import type { ObservingSite, Preferences } from "@shared/api";
import { ApiError, api, apiGet, withParams } from "@/lib/api";
import { store } from "@/lib/storage";

/**
 * The last forecast this browser received, kept so the next visit shows it at once while a fresh one loads
 * (one entry: the place in use). Older than this, it isn't worth showing even for a moment.
 */
const LAST_FORECAST = "ap.lastForecast";
const SHOW_REMEMBERED_MS = 3 * HOUR_MS;
let remembered: { key: string; data: ForecastResponse } | null | undefined;
function rememberedForecast(key: string): ForecastResponse | undefined {
  if (remembered === undefined) remembered = store.get<{ key: string; data: ForecastResponse } | null>(LAST_FORECAST, null);
  const r = remembered;
  return r && r.key === key && Date.now() - r.data.generatedAt < SHOW_REMEMBERED_MS ? r.data : undefined;
}

/**
 * When our server's weather source turns it away (Open-Meteo's free quota is per IP address, and a
 * shared host's address is shared with other sites), it says which request it would have made; this
 * browser makes it instead and the server turns the answer into the forecast, exactly as before.
 */
async function getForecast(url: string): Promise<ForecastResponse> {
  try {
    return await apiGet<ForecastResponse>(url);
  } catch (e) {
    const relay = e instanceof ApiError ? (e.data?.relay as { weather?: unknown; models?: unknown } | undefined) : undefined;
    const ok = (u: unknown): u is string => typeof u === "string" && u.startsWith("https://api.open-meteo.com/");
    if (!relay || !ok(relay.weather)) throw e;
    const fetchJson = async (u: string) => {
      const r = await fetch(u, { credentials: "omit" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    let weather: unknown;
    try {
      weather = await fetchJson(relay.weather);
    } catch {
      throw e; // Open-Meteo is down for everyone: the server's message stands
    }
    const models = ok(relay.models) ? await fetchJson(relay.models).catch(() => null) : null;
    return api<ForecastResponse>("POST", url.replace("/api/forecast?", "/api/forecast/relay?"), { weather, models });
  }
}

/**
 * The forecast for a site; units and time format only change the wording of the headline and details.
 * The site's zone, elevation and sky brightness go along, so the forecast's nights, temperatures and
 * deep-sky scores match the rest of the app.
 */
export function useForecast(site: ObservingSite | null, prefs?: Pick<Preferences, "units" | "timeFormat">) {
  const key = site
    ? withParams("/api/forecast", {
        lat: site.lat.toFixed(3),
        lon: site.lon.toFixed(3),
        bortle: site.bortle,
        sqm: typeof site.sqm === "number" ? site.sqm.toFixed(2) : undefined,
        elev: typeof site.elevation === "number" ? Math.round(site.elevation) : undefined,
        tz: site.timezone ?? undefined,
        units: prefs?.units,
        timeFormat: prefs?.timeFormat,
      })
    : "forecast:none";
  const q = useQuery<ForecastResponse>({
    queryKey: [key],
    queryFn: () => getForecast(key),
    enabled: !!site,
    staleTime: 20 * 60_000,
    refetchInterval: 30 * 60_000,
    // The last visit's forecast for this request shows at once; it's refetched straight away when stale.
    initialData: () => (site ? rememberedForecast(key) : undefined),
    initialDataUpdatedAt: () => (site ? rememberedForecast(key)?.generatedAt : undefined),
    // Same place, new wording or sky class: keep showing the last answer while the new one loads.
    placeholderData: (prev) => (prev && site && Math.abs(prev.site.lat - site.lat) < 6e-4 && Math.abs(prev.site.lon - site.lon) < 6e-4 ? prev : undefined),
  });
  const data = q.isPlaceholderData ? undefined : q.data;
  useEffect(() => {
    if (!site || !data || (remembered?.key === key && remembered.data.generatedAt === data.generatedAt)) return;
    remembered = { key, data };
    store.set(LAST_FORECAST, remembered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data]);
  return q;
}

export interface NightContext {
  date: string;
  /** The current night's date (it lasts until sunrise). */
  tonight: string;
  night: NightInfo;
  frames: NightFrames;
  forecast: NightForecast | null;
  isTonight: boolean;
}

/**
 * Astronomy for the selected night (computed locally) merged with its weather forecast. `picked` is a
 * night date chosen by the user; null, or a night that has already ended, means the current night.
 */
export function useNightContext(site: ObservingSite | null, picked: string | null, now: number, forecast?: ForecastResponse): NightContext | null {
  // Recompute the night only when the date changes, not every minute.
  const tonight = site ? currentNightDate(now, site) : null;
  const date = tonight && picked && picked > tonight ? picked : tonight;
  const astro = useMemo(() => {
    if (!site || !date) return null;
    const night = nightOf(date, site);
    const frames = nightFrames(night, site, 10);
    return { night, frames };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lon, site?.elevation, site?.timezone, date]);
  if (!site || !tonight || !date || !astro) return null;
  const fc = forecast?.nights.find((n) => n.date === date) ?? null;
  return { date, tonight, night: astro.night, frames: astro.frames, forecast: fc, isTonight: date === tonight };
}

// ------------------------------------------------------------------------------------
// Times within a night
// ------------------------------------------------------------------------------------

/** Civil date (YYYY-MM-DD) of an instant in a time zone (the viewer's when the zone is unknown). */
export function localDate(ms: number, tz?: string): string {
  const off = tz ? tzOffsetHours(tz, ms) : null;
  if (off !== null) return new Date(ms + off * HOUR_MS).toISOString().slice(0, 10);
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface NightClock {
  tz?: string;
  hour12?: boolean;
  /** The night's date (its evening). */
  date: string;
  /** Today's date at the site when this is the current night, else null. */
  today: string | null;
}

export function nightClock(night: NightInfo, isTonight: boolean, now: number, tz?: string, hour12?: boolean): NightClock {
  return { tz, hour12, date: night.date, today: isTonight ? localDate(now, tz) : null };
}

/** "tomorrow " / "Tue " for a moment after the night's evening date, "" otherwise. */
export function dayHint(ms: number, c: NightClock): string {
  const d = localDate(ms, c.tz);
  if (d === c.date || d === c.today) return "";
  if (c.today !== null && d === addDays(c.today, 1)) return "tomorrow ";
  return `${formatDate(ms, { tz: c.tz, style: "weekday" })} `;
}

/** The part of the night that rise and set times are shown for: sunset to sunrise (noon to noon without them). */
export function nightSpan(night: NightInfo): [number, number] {
  return [night.sunset ?? night.noon, night.sunrise ?? night.nextNoon];
}

export interface NightEvent {
  t: number;
  /** Lower-case phrase before the time, e.g. "rises", or "highest 54°" with `at`. */
  verb: string;
  at?: boolean;
}

/**
 * Join events that happen during the night in time order ("sets 21:16 · rises tomorrow 05:40"). Only the
 * first event on the next calendar day carries the day hint: everything after it is on that day too.
 */
export function joinNightEvents(events: NightEvent[], night: NightInfo, c: NightClock): string {
  const [a, b] = nightSpan(night);
  let hinted = false;
  return events
    .filter((e) => e.t >= a && e.t <= b)
    .sort((x, y) => x.t - y.t)
    .map((e) => {
      const hint = hinted ? "" : dayHint(e.t, c);
      if (hint) hinted = true;
      return `${e.verb} ${hint}${e.at ? "at " : ""}${formatTime(e.t, c)}`;
    })
    .join(" · ");
}

/** Moonrise and moonset during the night; `upAllNight` / `downAllNight` when neither happens. */
export function moonEvents(night: NightInfo, frames: NightFrames) {
  const events: NightEvent[] = [];
  if (night.moon.rise !== null) events.push({ t: night.moon.rise, verb: "rises" });
  if (night.moon.set !== null) events.push({ t: night.moon.set, verb: "sets" });
  const [a, b] = nightSpan(night);
  const inside = events.filter((e) => e.t >= a && e.t <= b);
  // Without a rise or set inside the night the Moon stays where it is at the night's midpoint
  // (up = upper limb above the horizon, the rise/set convention).
  let i = 0;
  for (let k = 1; k < frames.times.length; k++) if (Math.abs(frames.times[k] - night.solarMidnight) < Math.abs(frames.times[i] - night.solarMidnight)) i = k;
  const up = (frames.moon[i]?.alt ?? -90) > -0.26;
  return { events: inside, upAllNight: inside.length === 0 && up, downAllNight: inside.length === 0 && !up };
}

/** "rises tomorrow 03:45", "sets 21:16 · rises tomorrow 05:40", "up all night" or "down all night". */
export function moonEventsText(night: NightInfo, frames: NightFrames, c: NightClock): string {
  const m = moonEvents(night, frames);
  if (m.upAllNight) return "up all night";
  if (m.downAllNight) return "down all night";
  return joinNightEvents(m.events, night, c);
}

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
