/**
 * Observing forecast for any coordinates.
 *
 * Weather: Open-Meteo best-match NWP (hourly, 8 days + yesterday so the current night is
 * complete). Best match picks the highest-resolution model that covers the site — e.g. UKMO 2 km
 * over the UK, DWD ICON-EU/D2 over Europe, DMI HARMONIE over Iceland, NOAA HRRR then GFS over the
 * US, ECMWF IFS 9 km over Australia — and falls back to global models after day 2–5.
 * Extras, all optional and fail-soft:
 *  • ECMWF IFS (9 km), NOAA GFS and DWD ICON cloud cover in one call, to measure how far
 *    independent models agree with the main forecast (per-hour spread, nightly confidence);
 *  • CAMS aerosol optical depth from the Open-Meteo Air Quality API (transparency);
 *  • 7Timer ASTRO seeing classes as a second opinion (and transparency when CAMS is missing).
 * Every hour slot [t, t + 1 h] averages the instantaneous model fields at its two hour marks and
 * takes the "preceding hour" fields (gusts, rain chance) stamped t + 1 h. Everything is scored
 * with shared/astro/conditions and summarised per night with shared/astro/night ("the night of D"
 * is anchored to local solar time at the site).
 */
import {
  A,
  HOUR_MS,
  type Agreement,
  type NightInfo,
  type PressureLevel,
  type Site,
  CLEAR_CLOUD_MAX,
  CONFIDENCE_MODEL,
  DEFAULT_BORTLE,
  addDays,
  bodyAltAz,
  bulkRichardson,
  clamp,
  cloudAgreement,
  currentNightDate,
  dewRisk,
  effectiveCloud,
  estimateSeeing,
  estimateTransparency,
  fogRisk,
  formatDuration,
  hourScores,
  nightOf,
  nightScore,
  observerOf,
  scaleLabel,
  slotInstant,
  slotPreceding,
  slotWind,
  sqmForBortle,
  verdictOf,
} from "@shared/astro";
import type { CloudModelId, FogRisk, ForecastHour, ForecastResponse, ModelView, NightForecast } from "@shared/forecast";
import { HttpError, TTLCache, USER_AGENT, fetchWithTimeout } from "../http";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY = "https://air-quality-api.open-meteo.com/v1/air-quality";
const SEVEN_TIMER = "https://www.7timer.info/bin/astro.php";

const UPSTREAM_TTL = 30 * 60_000;
const FAILURE_TTL = 10 * 60_000; // don't retry a failing optional source on every request
const RESPONSE_TTL = 10 * 60_000;
const PARTIAL_RESPONSE_TTL = 60_000; // computed while an optional source was still loading
const OPTIONAL_BUDGET_MS = 1100; // wait at most this long (from request start) for the optional sources
const NIGHTS = 7;
/**
 * Requests snap to grid cells so nearby requests share upstream calls. Weather uses ~1 km cells:
 * best match runs 1–3 km models over Europe, the UK and the US, and a 5 km snap could move a
 * coastal or hilltop site into the sea or a valley (other weather, another elevation). CAMS
 * (0.4°) and 7Timer (GFS) are coarse, so they share 0.1° cells.
 */
const WEATHER_CELL = 0.01;
const COARSE_CELL = 0.1;

const OM_VARS = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "relative_humidity_2m",
  "dew_point_2m",
  "temperature_2m",
  "wind_speed_10m",
  "wind_gusts_10m",
  "precipitation_probability",
  "visibility",
  "wind_speed_200hPa",
  "wind_speed_250hPa",
  "wind_speed_300hPa",
  "wind_direction_250hPa",
  "wind_speed_500hPa",
  "wind_direction_500hPa",
  "wind_speed_850hPa",
  "wind_direction_850hPa",
  "temperature_250hPa",
  "temperature_500hPa",
  "temperature_850hPa",
  "geopotential_height_250hPa",
  "geopotential_height_500hPa",
  "geopotential_height_850hPa",
] as const;
type OmVar = (typeof OM_VARS)[number];

/** Independent global models for the cloud cross-check (one extra Open-Meteo call, 12 variables). */
const CHECK_MODELS: { id: CloudModelId; om: string; label: string }[] = [
  { id: "ecmwf", om: "ecmwf_ifs", label: "ECMWF" },
  { id: "gfs", om: "gfs_seamless", label: "GFS" },
  { id: "icon", om: "icon_seamless", label: "ICON" },
];
const CLOUD_VARS = ["cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high"] as const;
type CloudVar = (typeof CLOUD_VARS)[number];

interface Weather {
  times: number[]; // epoch ms, hourly
  timezone: string;
  utcOffsetSeconds: number;
  elevation: number | null;
  v: Record<OmVar, (number | null)[]>;
}

interface ModelClouds {
  index: Map<number, number>; // epoch ms → array index
  series: Partial<Record<CloudModelId, Record<CloudVar, (number | null)[]>>>;
}

interface AodData {
  byTime: Map<number, number>; // epoch ms → AOD at 550 nm
  lastT: number; // last hour with a CAMS value
  tail: number; // mean of the last 24 h of CAMS values (persisted beyond the CAMS horizon)
}

interface SevenTimerPoint {
  t: number;
  seeing: number | null; // class 1..8
  transparency: number | null; // class 1..8
}

// ------------------------------------------------------------------------------------
// Upstream fetching (cached per cell, de-duplicated while in flight)
// ------------------------------------------------------------------------------------

const weatherCache = new TTLCache<Weather>(UPSTREAM_TTL, 600);
const modelsCache = new TTLCache<ModelClouds | null>(UPSTREAM_TTL, 600);
const aodCache = new TTLCache<AodData | null>(UPSTREAM_TTL, 400);
const sevenTimerCache = new TTLCache<SevenTimerPoint[] | null>(UPSTREAM_TTL, 400);
const responseCache = new TTLCache<ForecastResponse>(RESPONSE_TTL, 500);
const inflight = new Map<string, Promise<unknown>>();

const snap = (x: number, step: number) => Math.round(x / step) * step;

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Optional upstream: resolves to null on any failure and remembers the failure for a while. */
async function optional<T>(cache: TTLCache<T | null>, key: string, load: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  return once(key, async () => {
    try {
      const v = await load();
      cache.set(key, v);
      return v;
    } catch (e) {
      console.warn(`[forecast] optional source failed (${key.split(":")[0]}): ${(e as Error).message}`);
      cache.set(key, null, FAILURE_TTL);
      return null;
    }
  });
}

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const res = await fetchWithTimeout(url, { timeoutMs, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON (HTTP ${res.status})`);
  }
  if (!res.ok || body?.error) throw new Error(body?.reason ? String(body.reason) : `HTTP ${res.status}`);
  return body;
}

const numOrNull = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Last good weather per cell, served when Open-Meteo is briefly unavailable. */
const lastGoodWeather = new Map<string, { w: Weather; at: number }>();
const STALE_WEATHER_MAX = 6 * HOUR_MS;

function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const key = `om:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = weatherCache.get(key);
  if (hit) return Promise.resolve(hit);
  return once(key, async () => {
    const url =
      `${OPEN_METEO}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
      `&hourly=${OM_VARS.join(",")}&timezone=auto&forecast_days=8&past_days=1&timeformat=unixtime&wind_speed_unit=kmh`;
    let j: any;
    try {
      j = await getJson(url, 8000).catch(async (e) => {
        if ((e as Error).name === "AbortError") throw e;
        await sleep(400); // one retry for transient "overloaded"/5xx answers
        return getJson(url, 8000);
      });
    } catch (e) {
      console.warn(`[forecast] Open-Meteo failed: ${(e as Error).message}`);
      const stale = lastGoodWeather.get(key);
      if (stale && Date.now() - stale.at < STALE_WEATHER_MAX) {
        weatherCache.set(key, stale.w, 2 * 60_000); // don't hammer a struggling upstream
        return stale.w;
      }
      throw new HttpError(502, "The weather service isn't responding right now. Please try again in a minute.");
    }
    const times: unknown = j?.hourly?.time;
    if (!Array.isArray(times) || times.length === 0) throw new HttpError(502, "The weather service returned no forecast for this place.");
    const v = {} as Weather["v"];
    for (const name of OM_VARS) {
      const arr = j.hourly[name];
      v[name] = Array.isArray(arr) ? arr.map(numOrNull) : times.map(() => null);
    }
    const w: Weather = {
      times: times.map((s: number) => s * 1000),
      timezone: typeof j.timezone === "string" ? j.timezone : "UTC",
      utcOffsetSeconds: Number.isFinite(j.utc_offset_seconds) ? j.utc_offset_seconds : 0,
      elevation: Number.isFinite(j.elevation) ? j.elevation : null,
      v,
    };
    weatherCache.set(key, w);
    lastGoodWeather.delete(key);
    lastGoodWeather.set(key, { w, at: Date.now() });
    if (lastGoodWeather.size > 300) lastGoodWeather.delete(lastGoodWeather.keys().next().value!);
    return w;
  });
}

/** Total + layer cloud from the cross-check models, in one request (suffixed keys per model). */
function fetchModels(lat: number, lon: number): Promise<ModelClouds | null> {
  return optional(modelsCache, `mm:${lat.toFixed(2)},${lon.toFixed(2)}`, async () => {
    const url =
      `${OPEN_METEO}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=${CLOUD_VARS.join(",")}` +
      `&models=${CHECK_MODELS.map((m) => m.om).join(",")}&timezone=auto&forecast_days=8&past_days=1&timeformat=unixtime`;
    const j = await getJson(url, 6000);
    const times: unknown = j?.hourly?.time;
    if (!Array.isArray(times) || times.length === 0) throw new Error("no times");
    const index = new Map<number, number>(times.map((s: number, i: number) => [s * 1000, i]));
    const series: ModelClouds["series"] = {};
    for (const m of CHECK_MODELS) {
      const rec = {} as Record<CloudVar, (number | null)[]>;
      let any = false;
      for (const name of CLOUD_VARS) {
        const arr = j.hourly[`${name}_${m.om}`];
        rec[name] = Array.isArray(arr) ? arr.map(numOrNull) : times.map(() => null);
        any ||= rec[name].some((x) => x !== null);
      }
      if (any) series[m.id] = rec;
    }
    if (Object.keys(series).length === 0) throw new Error("no model data");
    return { index, series };
  });
}

function fetchAod(lat: number, lon: number): Promise<AodData | null> {
  return optional(aodCache, `aq:${lat.toFixed(1)},${lon.toFixed(1)}`, async () => {
    const url =
      `${AIR_QUALITY}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
      `&hourly=aerosol_optical_depth&timezone=GMT&forecast_days=7&past_days=1&timeformat=unixtime`;
    const j = await getJson(url, 6000);
    const times: number[] = j?.hourly?.time ?? [];
    const aod: (number | null)[] = j?.hourly?.aerosol_optical_depth ?? [];
    const byTime = new Map<number, number>();
    times.forEach((t, i) => {
      const x = aod[i];
      if (typeof x === "number" && Number.isFinite(x) && x >= 0) byTime.set(t * 1000, x);
    });
    if (byTime.size === 0) throw new Error("no AOD values");
    // CAMS runs ~4.5 days ahead; beyond that, persist the last day's aerosol load (it changes over
    // days) rather than switching the last nights to a generic humidity-based guess.
    const ts = [...byTime.keys()].sort((a, b) => a - b);
    const lastT = ts[ts.length - 1];
    const tailVals = ts.filter((t) => t > lastT - 24 * HOUR_MS).map((t) => byTime.get(t)!);
    return { byTime, lastT, tail: tailVals.reduce((a, b) => a + b, 0) / tailVals.length };
  });
}

function fetchSevenTimer(lat: number, lon: number): Promise<SevenTimerPoint[] | null> {
  return optional(sevenTimerCache, `7t:${lat.toFixed(1)},${lon.toFixed(1)}`, async () => {
    const url = `${SEVEN_TIMER}?lon=${lon.toFixed(2)}&lat=${lat.toFixed(2)}&ac=0&unit=metric&output=json&tzshift=0`;
    const j = await getJson(url, 6000);
    const init = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(j?.init ?? ""));
    if (!init || !Array.isArray(j.dataseries)) throw new Error("unexpected 7Timer format");
    const t0 = Date.UTC(+init[1], +init[2] - 1, +init[3], +init[4]); // GFS run time, UTC
    const cls = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 8 ? x : null);
    const pts = j.dataseries
      .filter((d: any) => Number.isFinite(d?.timepoint))
      .map((d: any) => ({ t: t0 + d.timepoint * HOUR_MS, seeing: cls(d.seeing), transparency: cls(d.transparency) }));
    if (pts.length === 0) throw new Error("empty 7Timer series");
    return pts;
  });
}

/** Nearest 7Timer point within ±1.5 h (its series is 3-hourly). */
function sevenTimerAt(series: SevenTimerPoint[] | null, t: number): SevenTimerPoint | null {
  if (!series) return null;
  let best: SevenTimerPoint | null = null;
  for (const p of series) if (Math.abs(p.t - t) <= 1.5 * HOUR_MS && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
  return best;
}

// ------------------------------------------------------------------------------------
// Hourly computation
// ------------------------------------------------------------------------------------

interface Slot {
  h: ForecastHour;
  cloudRaw: number; // total cloud % (unrounded)
  eff: number; // effective cloud %
  seeingValue: number; // continuous 1..5
  transparencyValue: number;
  jetCore: number | null;
  fog: FogRisk;
  modelEff: (number | null)[]; // effective cloud % per CHECK_MODELS entry (null = no data)
  modelTotal: (number | null)[]; // total cloud % per CHECK_MODELS entry
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function buildSlots(
  wx: Weather,
  aod: AodData | null,
  seven: SevenTimerPoint[] | null,
  models: ModelClouds | null,
  site: Site,
  sqm: number,
  fromMs: number,
): Slot[] {
  const obs = observerOf(site);
  const v = wx.v;
  const highSite = (site.elevation ?? 0) > 1200; // 850 hPa is at or below the ground
  const slots: Slot[] = [];
  for (let i = 0; i + 1 < wx.times.length; i++) {
    const t = wx.times[i];
    if (t < fromMs || wx.times[i + 1] - t !== HOUR_MS) continue;
    const inst = (name: OmVar) => slotInstant(v[name][i], v[name][i + 1]);
    const at = (name: OmVar, fallback: number) => inst(name) ?? fallback;
    const cloud = inst("cloud_cover");
    if (cloud === null) continue;
    const cloudLow = at("cloud_cover_low", 0);
    const cloudMid = at("cloud_cover_mid", 0);
    const cloudHigh = at("cloud_cover_high", 0);
    const temp = at("temperature_2m", 10);
    const dewPoint = at("dew_point_2m", temp - 5);
    const humidity = at("relative_humidity_2m", 70);
    const wind = at("wind_speed_10m", 0);
    // Gusts and rain chance are "preceding hour" values: the one stamped t + 1 h covers this slot.
    const gust = Math.max(wind, slotPreceding(v.wind_gusts_10m[i], v.wind_gusts_10m[i + 1]) ?? wind);
    const precipProb = slotPreceding(v.precipitation_probability[i], v.precipitation_probability[i + 1]) ?? 0;
    const visibility = inst("visibility");
    const jet = inst("wind_speed_250hPa");
    const jetLevels = [inst("wind_speed_200hPa"), jet, inst("wind_speed_300hPa")].filter((x): x is number => x !== null);
    const jetCore = jetLevels.length ? Math.max(...jetLevels) : null;
    const level = (hPa: 250 | 500 | 850): PressureLevel => {
      const s = v[`wind_speed_${hPa}hPa`];
      const d = v[`wind_direction_${hPa}hPa`];
      const w = slotWind({ speed: s[i], dir: d[i] }, { speed: s[i + 1], dir: d[i + 1] });
      return { hPa, height: inst(`geopotential_height_${hPa}hPa`), temp: inst(`temperature_${hPa}hPa`), speed: w.speed, dir: w.dir };
    };
    const mid = t + HOUR_MS / 2;
    const st = sevenTimerAt(seven, mid);
    const seeing = estimateSeeing({
      jet: jetCore,
      wind,
      gust,
      riUpper: bulkRichardson(level(500), level(250)),
      riLower: highSite ? null : bulkRichardson(level(850), level(500)),
      sevenTimer: st?.seeing ?? null,
    });
    const camsAod = aod ? slotInstant(aod.byTime.get(t), aod.byTime.get(t + HOUR_MS)) : null;
    const aodUsed = camsAod ?? (aod && t > aod.lastT ? aod.tail : null);
    const transparency = estimateTransparency({
      humidity,
      cloudHigh,
      aod: aodUsed,
      visibility,
      elevation: site.elevation,
      sevenTimer: st?.transparency ?? null,
    });

    // Sun and Moon at the middle of the hour the slot represents.
    const sunAlt = bodyAltAz(A.Body.Sun, mid, obs).alt;
    const moonAlt = bodyAltAz(A.Body.Moon, mid, obs).alt;
    const moonIllum = A.Illumination(A.Body.Moon, new Date(mid)).phase_fraction;

    const sc = hourScores({
      cloud,
      cloudLow,
      cloudMid,
      cloudHigh,
      precipProb,
      wind,
      gust,
      seeing: seeing.value,
      transparency: transparency.value,
      extinction: transparency.extinction,
      sunAlt,
      moonAlt,
      moonIllum,
      sqm,
    });

    // Cross-check models over the same slot.
    const modelEff: (number | null)[] = [];
    const modelTotal: (number | null)[] = [];
    const cloudModels: Partial<Record<CloudModelId, number>> = {};
    const ia = models?.index.get(t);
    const ib = models?.index.get(t + HOUR_MS);
    for (const m of CHECK_MODELS) {
      const s = models?.series[m.id];
      const mv = (name: CloudVar) => (s && ia !== undefined && ib !== undefined ? slotInstant(s[name][ia], s[name][ib]) : null);
      const total = mv("cloud_cover");
      modelTotal.push(total);
      modelEff.push(total === null ? null : effectiveCloud(mv("cloud_cover_low") ?? 0, mv("cloud_cover_mid") ?? 0, mv("cloud_cover_high") ?? 0, total));
      if (total !== null) cloudModels[m.id] = Math.round(total);
    }
    const totals = [cloud, ...modelTotal.filter((x): x is number => x !== null)];
    const fog = fogRisk(temp, dewPoint, wind, visibility);

    const hour: ForecastHour = {
      t,
      cloud: Math.round(cloud),
      cloudLow: Math.round(cloudLow),
      cloudMid: Math.round(cloudMid),
      cloudHigh: Math.round(cloudHigh),
      humidity: Math.round(humidity),
      dewPoint: r1(dewPoint),
      temp: r1(temp),
      wind: r1(wind),
      gust: r1(gust),
      jet: jet === null ? null : Math.round(jet),
      precipProb: Math.round(precipProb),
      aod: camsAod === null ? null : Math.round(camsAod * 1000) / 1000,
      seeing: seeing.scale,
      seeingArcsec: r2(seeing.arcsec),
      transparency: transparency.scale,
      dewRisk: dewRisk(temp, dewPoint, wind, cloud),
      sunAlt: r1(sunAlt),
      moonAlt: r1(moonAlt),
      moonIllum: Math.round(moonIllum * 1000) / 1000,
      dark: sunAlt < -12,
      score: sc.score,
      dsoScore: sc.dsoScore,
      planetScore: sc.planetScore,
      fogRisk: fog,
    };
    if (totals.length > 1) {
      hour.cloudModels = cloudModels;
      hour.cloudSpread = Math.round(Math.max(...totals) - Math.min(...totals));
    }
    slots.push({ h: hour, cloudRaw: cloud, eff: sc.effCloud, seeingValue: seeing.value, transparencyValue: transparency.value, jetCore, fog, modelEff, modelTotal });
  }
  return slots;
}

/** Clear or overcast in both — equal values that say nothing about whether two series are one model. */
const saturated = (a: number, b: number) => (a <= 1 && b <= 1) || (a >= 99 && b >= 99);

/**
 * Which cross-check models are the main forecast itself here (best match falls back to them —
 * e.g. ICON over most of Europe, GFS/HRRR over the US)? They must not count as a second opinion.
 * Judged over the next 3 days; checkModels() refines it per night (best match can switch model
 * with lead time).
 */
function sameAsMain(wx: Weather, models: ModelClouds | null, now: number): boolean[] {
  return CHECK_MODELS.map((m) => {
    const s = models?.series[m.id];
    if (!s || !models) return false;
    let n = 0;
    let eq = 0;
    wx.times.forEach((t, i) => {
      if (t < now || t > now + 72 * HOUR_MS) return;
      const j = models.index.get(t);
      const a = wx.v.cloud_cover[i];
      const b = j === undefined ? null : s.cloud_cover[j];
      if (a === null || b === null || saturated(a, b)) return;
      n++;
      if (Math.abs(a - b) < 0.5) eq++;
    });
    return n >= 12 && eq / n >= 0.85;
  });
}

// ------------------------------------------------------------------------------------
// Night summaries
// ------------------------------------------------------------------------------------

interface Ctx {
  tz: string;
  units: "metric" | "imperial";
  time: (ms: number) => string;
  observer: A.Observer;
  same: boolean[]; // per CHECK_MODELS entry: identical to the main forecast here
  now: number;
}

/** Exact moonrise (+1) / moonset (−1) near a boundary that night.ts sampled every 10 minutes. */
function exactMoonEvent(ctx: Ctx, approx: number, direction: 1 | -1): number {
  const ev = A.SearchRiseSet(A.Body.Moon, ctx.observer, direction, new Date(approx - 20 * 60_000), 40 / 1440);
  return ev ? ev.date.getTime() : approx;
}

interface InWindow {
  s: Slot;
  w: number; // hours of the slot inside the window (0..1)
}

function within(slots: Slot[], a: number, b: number): InWindow[] {
  const out: InWindow[] = [];
  for (const s of slots) {
    const w = (Math.min(s.h.t + HOUR_MS, b) - Math.max(s.h.t, a)) / HOUR_MS;
    if (w > 0.001) out.push({ s, w });
  }
  return out;
}

function wmean(xs: InWindow[], f: (s: Slot) => number): number {
  const tw = xs.reduce((a, x) => a + x.w, 0);
  return tw > 0 ? xs.reduce((a, x) => a + f(x.s) * x.w, 0) / tw : NaN;
}

/** The scoring window: the darkest part of the night that exists at this site and date. */
function nightWindow(n: NightInfo): [number, number] {
  if (n.darkStart !== null && n.darkEnd !== null) return [n.darkStart, n.darkEnd];
  if (n.sunset !== null && n.sunrise !== null) return [n.sunset, n.sunrise];
  return [n.solarMidnight - 1.5 * HOUR_MS, n.solarMidnight + 1.5 * HOUR_MS];
}

function bestWindowOf(win: InWindow[], ws: number, we: number): NightForecast["bestWindow"] {
  let best: { start: number; end: number; sum: number; dur: number } | null = null;
  let run: { start: number; end: number; sum: number; dur: number } | null = null;
  const close = () => {
    if (run && run.dur >= 0.5 && (!best || run.sum > best.sum)) best = run;
    run = null;
  };
  for (const { s, w } of win) {
    if (s.eff < CLEAR_CLOUD_MAX) {
      const start = Math.max(s.h.t, ws);
      const end = Math.min(s.h.t + HOUR_MS, we);
      if (run && start - run.end < 1000) {
        run.end = end;
        run.sum += s.h.score * w;
        run.dur += w;
      } else {
        close();
        run = { start, end, sum: s.h.score * w, dur: w };
      }
    } else close();
  }
  close();
  const b = best as { start: number; end: number; sum: number; dur: number } | null;
  return b ? { start: b.start, end: b.end, score: Math.round(b.sum / b.dur) } : null;
}

const temperature = (c: number, ctx: Ctx) => (ctx.units === "imperial" ? `${Math.round((c * 9) / 5 + 32)} °F` : `${Math.round(c)} °C`);
const speed = (kmh: number, ctx: Ctx) => (ctx.units === "imperial" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
const pct = (x: number) => `${Math.round(x)}%`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface ModelCheck {
  agreement: Agreement | null;
  reason: string | null;
  views: ModelView[];
}

/** Agreement of the cross-check models with the main forecast over the window. */
function checkModels(win: InWindow[], ctx: Ctx, leadHours: number): ModelCheck {
  // Only models that cover (nearly) the whole window — ICON stops at 7.5 days, for example.
  const total = win.reduce((a, x) => a + x.w, 0);
  const avail = CHECK_MODELS.map((m, k) => ({ m, k })).filter(({ k }) => win.reduce((a, x) => a + (x.s.modelEff[k] !== null ? x.w : 0), 0) >= 0.9 * total);
  if (avail.length === 0) return { agreement: null, reason: null, views: [] };
  // Is model k the main forecast over this window? Informative (not clear/overcast-in-both) hours decide.
  const same = (k: number) => {
    const xs = win.filter((x) => x.s.modelTotal[k] !== null && !saturated(x.s.cloudRaw, x.s.modelTotal[k] as number));
    if (xs.length < 4) return ctx.same[k];
    return xs.filter((x) => Math.abs((x.s.modelTotal[k] as number) - x.s.cloudRaw) < 0.01).length / xs.length >= 0.85;
  };
  const clear = (f: (s: Slot) => number | null) => r1(win.reduce((a, x) => a + ((f(x.s) ?? 100) < CLEAR_CLOUD_MAX ? x.w : 0), 0));
  const meanOf = (f: (s: Slot) => number | null) => {
    const xs = win.filter((x) => f(x.s) !== null);
    return Math.round(wmean(xs, (s) => f(s) as number));
  };
  const views: ModelView[] = [
    { id: "main", label: "Main forecast", clearDarkHours: clear((s) => s.eff), cloud: meanOf((s) => s.h.cloud) },
    ...avail.map(({ m, k }) => ({
      id: m.id,
      label: m.label,
      clearDarkHours: clear((s) => s.modelEff[k]),
      cloud: meanOf((s) => s.modelTotal[k]),
      ...(same(k) ? { sameAsMain: true } : {}),
    })),
  ];
  const independent = avail.filter(({ k }) => !same(k));
  if (independent.length === 0) return { agreement: null, reason: null, views };
  const agreement = cloudAgreement(
    win.map(({ s, w }) => ({ weight: w, effCloud: [s.eff, ...independent.map(({ k }) => s.modelEff[k])] })),
    leadHours,
  );
  if (!agreement) return { agreement: null, reason: null, views };
  const labels = independent.map(({ m }) => m.label);
  // Name a model as cloudier/clearer only when its plain numbers (shown in modelViews) agree.
  const main = views[0];
  const viewOf = (i: number) => views.find((x) => x.id === independent[i].m.id)!;
  const cloudier = labels.filter((_, i) => (agreement.bias[i + 1] ?? 0) < -CONFIDENCE_MODEL.bias && (viewOf(i).cloud > main.cloud || viewOf(i).clearDarkHours < main.clearDarkHours));
  const clearer = labels.filter((_, i) => (agreement.bias[i + 1] ?? 0) > CONFIDENCE_MODEL.bias && (viewOf(i).cloud < main.cloud || viewOf(i).clearDarkHours > main.clearDarkHours));
  const verb = (xs: string[]) => (xs.length === 1 ? "expects" : "expect");
  let reason: string;
  if (agreement.confidence === "high") reason = `${listJoin(labels)} ${labels.length === 1 ? "agrees" : "agree"} with the main forecast`;
  else if (agreement.cappedByLead) reason = `The models agree, but this night is ${Math.round(leadHours / 24)} days ahead — cloud forecasts often change`;
  else if (cloudier.length && !clearer.length) reason = `${listJoin(cloudier)} ${verb(cloudier)} more cloud than the main forecast`;
  else if (clearer.length && !cloudier.length) reason = `${listJoin(clearer)} ${verb(clearer)} less cloud than the main forecast`;
  else if (cloudier.length && clearer.length) reason = `The models disagree: ${listJoin(cloudier)} ${verb(cloudier)} more cloud, ${listJoin(clearer)} less`;
  else if (agreement.confidence === "medium") reason = "The models broadly agree, but differ on the timing of the cloud";
  else reason = "The models differ on when the cloud comes and goes";
  return { agreement, reason, views };
}

function summarizeNight(date: string, n: NightInfo, slots: Slot[], ctx: Ctx): NightForecast {
  const now = ctx.now;
  const [nightStart, we] = nightWindow(n);
  // Once tonight's dark window has begun, judge only what is left of it ("is it still worth it?").
  const ongoing = now > nightStart + 15 * 60_000 && now < we - 15 * 60_000;
  const ws = ongoing ? now : nightStart;
  const windowHours = (we - ws) / HOUR_MS;
  const win = within(slots, ws, we);
  const covered = win.reduce((a, x) => a + x.w, 0);
  const hasData = windowHours > 0 && covered >= 0.5 * windowHours;

  // Planets are fine from the end of civil twilight (and, like everything else, only what is left
  // of the night counts once it is under way).
  const pa = n.civilDusk ?? n.sunset ?? ws;
  const pb = n.civilDawn ?? n.sunrise ?? we;
  const planetWin = within(slots, ongoing ? now : Math.min(pa, ws), Math.max(pb, we));

  const moonUp = n.darkStart !== null && n.darkEnd !== null ? Math.max(0, n.darkHours - n.moonFreeHours) : 0;
  const moon = {
    illumination: Math.round(n.moon.illumination * 1000) / 1000,
    phaseName: n.moon.phaseName,
    elongation: r1(n.moon.elongation),
    rise: n.moon.rise,
    set: n.moon.set,
    upDarkHours: r2(moonUp),
  };

  const base = {
    date,
    darkStart: n.darkStart,
    darkEnd: n.darkEnd,
    darkness: n.darkness,
    sunset: n.sunset,
    sunrise: n.sunrise,
    moon,
  };

  if (!hasData) {
    return {
      ...base,
      score: 0,
      dsoScore: 0,
      planetScore: 0,
      verdict: "bad",
      clearDarkHours: 0,
      bestWindow: null,
      headline: "Beyond the forecast range",
      details: ["The weather forecast doesn't reach this night yet — check back in a day or two.", moonDetail(n, ctx, ws, we, false)],
      hasData: false,
    };
  }

  const score = nightScore(win.map(({ s, w }) => ({ score: s.h.score, weight: w })));
  const dsoScore = nightScore(win.map(({ s, w }) => ({ score: s.h.dsoScore, weight: w })));
  const planetScore = nightScore(planetWin.map(({ s, w }) => ({ score: s.h.planetScore, weight: w })));
  const clearDarkHours = win.filter((x) => x.s.eff < CLEAR_CLOUD_MAX).reduce((a, x) => a + x.w, 0);
  const bestWindow = bestWindowOf(win, ws, we);
  const check = checkModels(win, ctx, Math.max(0, (ws - now) / HOUR_MS));
  const { headline, details, fog } = describe(n, win, ws, we, clearDarkHours / Math.max(covered, 1e-6), bestWindow, ctx, ongoing, check);

  const out: NightForecast = {
    ...base,
    score,
    dsoScore,
    planetScore,
    verdict: verdictOf(score),
    clearDarkHours: r1(clearDarkHours),
    bestWindow,
    headline,
    details,
    hasData: true,
    fogRisk: fog,
  };
  if (check.agreement && check.reason) {
    out.confidence = check.agreement.confidence;
    out.confidenceReason = check.reason;
  }
  if (check.views.length > 1) out.modelViews = check.views;
  return out;
}

/** Moonlight during the dark window [ws, we] (the remaining part of it for an ongoing night). */
function moonDetail(n: NightInfo, ctx: Ctx, ws: number, we: number, ongoing: boolean): string {
  const p = Math.round(n.moon.illumination * 100);
  const lit = `${p}% lit`;
  if (n.darkStart === null || n.darkEnd === null) {
    return p < 5 ? "New Moon — no moonlight" : `Moon ${lit} (${n.moon.phaseName.toLowerCase()})`;
  }
  const rest = ongoing ? "for the rest of the night" : "all night";
  const free = n.moonFreeWindows
    .map(([a, b]) => [Math.max(a, ws), Math.min(b, we)] as [number, number])
    .filter(([a, b]) => b - a > 60_000);
  const up = (we - ws) / HOUR_MS - free.reduce((s, [a, b]) => s + (b - a), 0) / HOUR_MS;
  if (p < 4) return `New Moon — no moonlight ${rest}`;
  if (up < 0.2) return `Moon (${lit}) stays down ${ongoing ? "for the rest of the night" : "while it's dark"} — ideal for galaxies and nebulae`;
  if (free.length === 0) {
    return p >= 50
      ? `Moon ${lit} and up ${rest} — favour planets, doubles and bright clusters`
      : `Moon ${lit} and up ${rest} — faint galaxies will suffer`;
  }
  const near = (a: number, b: number) => Math.abs(a - b) < 10 * 60_000;
  const first = free[0];
  const last = free[free.length - 1];
  const faint = p < 15 ? " (a thin crescent, little harm)" : "";
  const rise = (x: number) => ctx.time(exactMoonEvent(ctx, x, 1));
  const set = (x: number) => ctx.time(exactMoonEvent(ctx, x, -1));
  if (near(first[0], ws) && !near(first[1], we)) return `Moon (${lit}) rises ${rise(first[1])} — deep-sky before then${faint}`;
  if (near(last[1], we) && !near(last[0], ws)) return `Moon (${lit}) sets ${set(last[0])} — darker sky after that${faint}`;
  const from = near(first[0], ws) ? ctx.time(first[0]) : set(first[0]);
  const to = near(first[1], we) ? ctx.time(first[1]) : rise(first[1]);
  return `Moon (${lit}) is down ${from}–${to}${faint}`;
}

/** "Clear" / "Mostly clear" / partly cloudy, from the mean effective cloud of the clear hours. */
function clearWord(meanEff: number): "Clear" | "Mostly clear" | "Partly cloudy" {
  return meanEff < 10 ? "Clear" : meanEff < 20 ? "Mostly clear" : "Partly cloudy";
}

function describe(
  n: NightInfo,
  win: InWindow[],
  ws: number,
  we: number,
  clearFrac: number,
  best: NightForecast["bestWindow"],
  ctx: Ctx,
  ongoing: boolean,
  check: ModelCheck,
): { headline: string; details: string[]; fog: FogRisk } {
  const t = ctx.time;
  const allNight = ongoing ? "for the rest of the night" : "all night";
  const dusk = ongoing ? "now" : "at dusk";
  const focus = best ? win.filter((x) => x.s.h.t + HOUR_MS > best.start && x.s.h.t < best.end) : win;
  const seeingValue = wmean(focus, (s) => s.seeingValue);
  const seeingArcsec = wmean(focus, (s) => s.h.seeingArcsec);
  const transValue = wmean(focus, (s) => s.transparencyValue);
  const meanEff = wmean(win, (s) => s.eff);
  const meanTotal = wmean(win, (s) => s.h.cloud);
  const meanHigh = wmean(win, (s) => s.h.cloudHigh);
  const meanLowMid = wmean(win, (s) => Math.max(s.h.cloudLow, s.h.cloudMid));
  const maxPrecip = Math.max(0, ...win.filter((x) => x.w >= 0.25).map((x) => x.s.h.precipProb));
  const cloudy = clearFrac < 0.1 || !best;
  const allClear = !cloudy && clearFrac >= 0.95;
  const fromDusk = !!best && best.start - ws < 45 * 60_000;
  const toDawn = !!best && we - best.end < 45 * 60_000;
  // One clear block at the start or end of the night reads better as "Clear until/after …".
  const clearHours = win.filter((x) => x.s.eff < CLEAR_CLOUD_MAX).reduce((a, x) => a + x.w, 0);
  const oneBlock = !!best && (best.end - best.start) / HOUR_MS >= 0.85 * clearHours && fromDusk !== toDawn;
  const mostlyClear = !cloudy && !allClear && !oneBlock && clearFrac >= 0.7;
  const steady = seeingValue >= 3.75;
  const turbulent = seeingValue < 2.5;
  const hazy = transValue < 2.5;
  const moonUpFrac = n.darkHours > 0 ? (n.darkHours - n.moonFreeHours) / n.darkHours : 0;
  const brightMoon = n.moon.illumination >= 0.6 && moonUpFrac >= 0.5;
  const cirrusVeil = meanHigh >= 50 && meanLowMid < 20;
  const thinCloud = (xs: InWindow[]) => wmean(xs, (s) => s.h.cloud - s.eff) >= 15; // cover is mostly cirrus
  const veiled = !cloudy && thinCloud(focus);
  const lowConfidence = check.agreement?.confidence === "low" && !!check.reason;

  // ---- headline
  let headline: string;
  const quality = steady && !hazy ? " and steady" : turbulent ? " but turbulent" : hazy ? " but hazy" : "";
  if (n.darkness === "none" || n.darkness === "civil") {
    headline = clearFrac >= 0.5 ? "Clear, but the sky never gets properly dark" : "Cloudy, and the sky never gets properly dark";
  } else if (cloudy) {
    if (maxPrecip >= 50) headline = "Cloudy, with rain likely";
    else if (cirrusVeil) headline = `Veiled by high cloud ${allNight}`;
    else if (meanEff >= 85) headline = `Overcast ${allNight}`;
    else if (meanEff >= 60) headline = "Mostly cloudy";
    else headline = `Patchy cloud ${allNight}`;
  } else if (allClear) {
    const word = clearWord(meanEff);
    headline = veiled
      ? `Thin high cloud ${allNight}`
      : word === "Partly cloudy"
        ? `Partly cloudy ${allNight}, with clear spells`
        : steady && !hazy
          ? `${word} and steady ${allNight}`
          : turbulent
            ? `${word} ${allNight}, but turbulent`
            : hazy
              ? `${word} ${allNight}, but hazy`
              : brightMoon
                ? `${word} ${allNight} under a bright Moon`
                : `${word} ${allNight}`;
  } else if (mostlyClear) {
    headline = veiled ? "Mostly thin high cloud" : `Mostly clear${quality}`;
  } else {
    const b = best!;
    const word = clearWord(wmean(focus, (s) => s.eff));
    const sky = veiled ? "Thin high cloud" : word === "Partly cloudy" ? "Breaks in the cloud" : `${word}${quality}`;
    if (fromDusk && !toDawn) headline = `${sky} until ${t(b.end)}`;
    else if (!fromDusk && toDawn) headline = `${sky} after ${t(b.start)}`;
    else headline = `${sky} ${t(b.start)}–${t(b.end)}`;
  }

  // ---- details (lower `prio` wins when there are more than four)
  const items: { text: string; prio: number }[] = [];
  const add = (text: string, prio: number) => items.push({ text, prio });
  const cirrusNote = (xs: InWindow[]) => {
    // On average, or at least the cloudiest hour, the cover is mostly cirrus.
    let peak: InWindow | null = null;
    for (const x of xs) if (!peak || x.s.h.cloud > peak.s.h.cloud) peak = x;
    return thinCloud(xs) || (peak && peak.s.h.cloud - peak.s.eff >= 20) ? " (mostly thin high cloud)" : "";
  };
  const range = (xs: InWindow[]) => {
    const lo = Math.min(...xs.map((x) => x.s.h.cloud));
    const hi = Math.max(...xs.map((x) => x.s.h.cloud));
    return lo === hi ? pct(hi) : `${lo}–${pct(hi)}`;
  };
  if (cloudy) {
    const kind = meanLowMid >= 50 ? "mostly low and mid-level" : cirrusVeil ? "thin high cloud" : "";
    add(
      `Cloud around ${pct(meanTotal)}${kind ? ` (${kind})` : ""} ${ongoing ? "for the rest of the night" : "through the night"}` +
        (maxPrecip >= 30 ? `, ${pct(maxPrecip)} chance of rain` : ""),
      1,
    );
  } else if (allClear) {
    const hi = Math.max(...win.map((x) => x.s.h.cloud));
    // The headline already says "clear": use this line for when the dark sky is usable.
    const dur = formatDuration((we - ws) / HOUR_MS);
    if (ongoing) add(hi <= 10 ? `No cloud until darkness ends at ${t(we)} (${dur} left)` : `Cloud ${range(win)}${cirrusNote(win)} until darkness ends at ${t(we)}`, 1);
    else add(hi <= 10 ? `No cloud from ${t(ws)} to ${t(we)} — ${dur} of darkness` : `Cloud ${range(win)}${cirrusNote(win)} from ${t(ws)} to ${t(we)}`, 1);
  } else if (mostlyClear) {
    let worst = win[0];
    for (const x of win) if (x.s.eff > worst.s.eff) worst = x;
    add(`Mostly clear; cloud up to ${pct(worst.s.h.cloud)} around ${t(Math.max(ws, worst.s.h.t))}${cirrusNote(win)}`, 1);
  } else {
    const b = best!;
    const before = win.filter((x) => x.s.h.t + HOUR_MS <= b.start + 1000);
    const after = win.filter((x) => x.s.h.t >= b.end - 1000);
    const during = win.filter((x) => !before.includes(x) && !after.includes(x));
    const clearPart = `${range(during)}${cirrusNote(during)}`;
    let peak: InWindow | null = null;
    for (const x of after) if (!peak || x.s.h.cloud > peak.s.h.cloud) peak = x;
    const later = peak ? `, then ${pct(peak.s.h.cloud)} by ${t(Math.max(peak.s.h.t, ws))}` : "";
    const beforeMean = wmean(before, (s) => s.h.cloud);
    // Only call it "clearing" when the cover really drops (low cloud giving way to thin cirrus can
    // keep the total about the same).
    const drop = beforeMean - Math.max(...during.map((x) => x.s.h.cloud));
    const turn = drop >= 15 ? "clearing to" : drop > 0 ? "easing to" : "then";
    let text: string;
    if (before.length && after.length) text = `Cloud ${pct(beforeMean)} ${dusk}, ${clearPart} ${t(b.start)}–${t(b.end)}${later}`;
    else if (before.length) text = `Cloud ${pct(beforeMean)} ${dusk}, ${turn} ${clearPart} from ${t(b.start)}`;
    else text = `Cloud ${clearPart} until ${t(b.end)}${later}`;
    if (maxPrecip >= 40) text += `; ${pct(maxPrecip)} chance of showers`;
    add(text, 1);
  }

  if (lowConfidence) {
    const r = check.reason!.startsWith("The ") ? `t${check.reason!.slice(1)}` : check.reason!; // keep model names capitalised
    add(`Uncertain: ${r} — check again nearer the time`, 2);
  }

  add(moonDetail(n, ctx, ws, we, ongoing), 4);

  if (!cloudy) {
    const jetMax = Math.max(0, ...focus.map((x) => x.s.jetCore ?? 0));
    const gustMax = Math.max(0, ...focus.map((x) => x.s.h.gust));
    // Name the cause only when it explains the result.
    const cause = steady
      ? jetMax < 90
        ? ", light winds aloft"
        : ""
      : jetMax >= 150
        ? `, jet stream ${speed(jetMax, ctx)} overhead`
        : gustMax >= 35
          ? ", gusty near the ground"
          : "";
    add(`Seeing ~${seeingArcsec.toFixed(1)}″ (${scaleLabel(seeingValue)}${cause}); transparency ${scaleLabel(transValue)}`, 5);
  }

  if (n.darkness === "nautical") add("The sky never gets fully dark (astronomical twilight at best) — faint galaxies and nebulae will suffer", 6);
  else if (n.darkness === "civil") add("The sky stays in twilight all night (nautical twilight at best) — only bright targets will show", 6);
  // Hours that matter for warnings: not overcast, and not a sliver at the edge of darkness.
  const usable = cloudy ? [] : win.filter((x) => x.s.eff < 60 && x.w >= 0.25);
  const rank = { low: 0, moderate: 1, high: 2 } as const;
  const fog = usable.reduce<FogRisk>((m, x) => (rank[x.s.fog] > rank[m] ? x.s.fog : m), "low");
  const fogHour = usable.find((x) => x.s.fog === "high" && x.s.h.t < we - 45 * 60_000);
  const dew = usable.find((x) => x.s.h.dewRisk === "high");
  if (fogHour) add(`Fog may form from ${t(Math.max(ws, fogHour.s.h.t))} (air near saturation, little wind) — the clear sky may not last, and dew will be heavy`, 3);
  else if (dew) add(`Dew risk high from ${t(Math.max(ws, dew.s.h.t))} — use a dew heater or shield`, 7);
  const gusts = Math.max(0, ...win.map((x) => x.s.h.gust));
  if (gusts >= 40 && !cloudy) add(`Gusts to ${speed(gusts, ctx)} — expect shake at high power`, 8);
  const tMin = Math.min(...win.map((x) => x.s.h.temp));
  if (tMin <= 0 && !cloudy) add(`Down to ${temperature(tMin, ctx)} — frost likely, dress warmly`, 9);
  if (!dew && !fogHour && !cloudy && usable.some((x) => x.s.h.dewRisk === "moderate") && items.length < 4) add("Some dew risk later — keep optics capped between views", 10);

  const keep = new Set([...items].sort((a, b) => a.prio - b.prio).slice(0, 4));
  return { headline, details: items.filter((x) => keep.has(x)).map((x) => x.text), fog };
}

// ------------------------------------------------------------------------------------
// Public entry point
// ------------------------------------------------------------------------------------

export interface ForecastQuery {
  lat: number;
  lon: number;
  bortle?: number;
  units?: "metric" | "imperial";
  timeFormat?: "24h" | "12h";
}

function timeFormatter(tz: string, hour12: boolean) {
  const make = (timeZone: string) =>
    hour12
      ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
      : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  let f: Intl.DateTimeFormat;
  try {
    f = make(tz);
  } catch {
    f = make("UTC");
  }
  return (ms: number) => f.format(ms);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });

/** An optional source that may still be loading when the response is assembled. */
function track<T>(p: Promise<T | null>) {
  const s = { value: null as T | null, done: false, promise: undefined as unknown as Promise<void> };
  s.promise = p.then((x) => {
    s.value = x;
    s.done = true;
  });
  return s;
}

export async function getForecast(q: ForecastQuery): Promise<ForecastResponse> {
  const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const lat = round5(clamp(q.lat, -90, 90));
  const lon = round5(q.lon >= -180 && q.lon <= 180 ? q.lon : ((((q.lon + 180) % 360) + 360) % 360) - 180);
  const bortle = clamp(Math.round(q.bortle ?? DEFAULT_BORTLE), 1, 9);
  const units = q.units ?? "metric";
  const timeFormat = q.timeFormat ?? "24h";
  // The current night is part of the key, so a forecast made just before sunrise isn't served after it.
  const responseKey = `${lat.toFixed(3)},${lon.toFixed(3)},${bortle},${units},${timeFormat},${currentNightDate(Date.now(), { lat, lon })}`;
  const cached = responseCache.get(responseKey);
  if (cached) return cached;

  const started = Date.now();
  const wlat = clamp(snap(lat, WEATHER_CELL), -90, 90);
  const wlon = snap(lon, WEATHER_CELL);
  const clat = clamp(snap(lat, COARSE_CELL), -90, 90);
  const clon = snap(lon, COARSE_CELL);

  // Optional sources load in parallel and keep loading in the background if they miss the budget.
  const aod = track(fetchAod(clat, clon));
  const seven = track(fetchSevenTimer(clat, clon));
  const models = track(fetchModels(wlat, wlon));
  const extras = [aod, seven, models];
  const wx = await fetchWeather(wlat, wlon);
  const remaining = started + OPTIONAL_BUDGET_MS - Date.now();
  if (extras.some((x) => !x.done)) await Promise.race([Promise.allSettled(extras.map((x) => x.promise)), sleep(Math.max(0, remaining))]);

  // The zone matters for night dates near the date line (they must match the client's).
  const site: Site = { lat, lon, elevation: wx.elevation ?? 0, timezone: wx.timezone };
  const now = Date.now();
  const tonight = currentNightDate(now, site);
  const nights = Array.from({ length: NIGHTS }, (_, i) => {
    const date = addDays(tonight, i);
    return { date, info: nightOf(date, site) };
  });
  const fromMs = Math.floor(nights[0].info.noon / HOUR_MS) * HOUR_MS;
  const slots = buildSlots(wx, aod.value, seven.value, models.value, site, sqmForBortle(bortle), fromMs);
  const ctx: Ctx = {
    tz: wx.timezone,
    units,
    time: timeFormatter(wx.timezone, timeFormat === "12h"),
    observer: observerOf(site),
    same: sameAsMain(wx, models.value, now),
    now,
  };

  const sources = ["Open-Meteo (best-match NWP)"];
  const attribution = [{ text: "Weather data by Open-Meteo.com (CC BY 4.0)", url: "https://open-meteo.com/" }];
  // The client joins sources with " · ", so list the models with commas.
  if (models.value) sources.push(`${listJoin(CHECK_MODELS.filter((m) => models.value!.series[m.id]).map((m) => m.label))} cross-check (Open-Meteo)`);
  if (aod.value) {
    sources.push("Open-Meteo Air Quality (CAMS)");
    attribution.push({ text: "Contains modified Copernicus Atmosphere Monitoring Service information", url: "https://atmosphere.copernicus.eu/" });
  }
  if (seven.value) {
    sources.push("7Timer ASTRO");
    attribution.push({ text: "7Timer! astronomical forecast", url: "https://www.7timer.info/" });
  }

  const response: ForecastResponse = {
    site: { lat, lon, timezone: wx.timezone, utcOffsetSeconds: wx.utcOffsetSeconds, elevation: wx.elevation },
    generatedAt: now,
    sources,
    hours: slots.map((s) => s.h),
    nights: nights.map(({ date, info }) => summarizeNight(date, info, slots, ctx)),
    attribution,
  };
  responseCache.set(responseKey, response, extras.every((x) => x.done) ? RESPONSE_TTL : PARTIAL_RESPONSE_TTL);
  return response;
}
