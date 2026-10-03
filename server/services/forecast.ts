/**
 * Observing forecast for any coordinates.
 *
 * Weather: Open-Meteo best-match NWP (hourly, 8 days + yesterday so the current night is
 * complete), CAMS aerosol optical depth from the Open-Meteo Air Quality API (transparency) and
 * 7Timer ASTRO's seeing/transparency classes as a second opinion. Both extras fail soft.
 * Everything is scored with shared/astro/conditions and summarised per night with
 * shared/astro/night ("the night of D" is anchored to local solar time at the site).
 */
import {
  A,
  HOUR_MS,
  type NightInfo,
  type PressureLevel,
  type Site,
  CLEAR_CLOUD_MAX,
  DEFAULT_BORTLE,
  addDays,
  bodyAltAz,
  bulkRichardson,
  clamp,
  currentNightDate,
  dewRisk,
  estimateSeeing,
  estimateTransparency,
  formatDuration,
  hourScores,
  nightOf,
  nightScore,
  observerOf,
  scaleLabel,
  sqmForBortle,
  verdictOf,
} from "@shared/astro";
import type { ForecastHour, ForecastResponse, NightForecast } from "@shared/forecast";
import { HttpError, TTLCache, USER_AGENT, fetchWithTimeout } from "../http";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY = "https://air-quality-api.open-meteo.com/v1/air-quality";
const SEVEN_TIMER = "https://www.7timer.info/bin/astro.php";

const UPSTREAM_TTL = 30 * 60_000;
const FAILURE_TTL = 10 * 60_000; // don't retry a failing optional source on every request
const RESPONSE_TTL = 10 * 60_000;
const PARTIAL_RESPONSE_TTL = 60_000; // computed while 7Timer/CAMS were still loading
const OPTIONAL_BUDGET_MS = 1100; // wait at most this long (from request start) for CAMS / 7Timer
const NIGHTS = 7;

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

interface Weather {
  times: number[]; // epoch ms
  timezone: string;
  utcOffsetSeconds: number;
  elevation: number | null;
  v: Record<OmVar, (number | null)[]>;
}

interface SevenTimerPoint {
  t: number;
  seeing: number | null; // class 1..8
  transparency: number | null; // class 1..8
}

// ------------------------------------------------------------------------------------
// Upstream fetching (cached per 0.05° cell, de-duplicated while in flight)
// ------------------------------------------------------------------------------------

const weatherCache = new TTLCache<Weather>(UPSTREAM_TTL, 400);
const aodCache = new TTLCache<Map<number, number> | null>(UPSTREAM_TTL, 400);
const sevenTimerCache = new TTLCache<SevenTimerPoint[] | null>(UPSTREAM_TTL, 400);
const responseCache = new TTLCache<ForecastResponse>(RESPONSE_TTL, 500);
const inflight = new Map<string, Promise<unknown>>();

const cell = (x: number) => Math.round(x / 0.05) * 0.05;

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
      v[name] = Array.isArray(arr) ? arr.map((x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null)) : times.map(() => null);
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

function fetchAod(lat: number, lon: number): Promise<Map<number, number> | null> {
  return optional(aodCache, `aq:${lat.toFixed(2)},${lon.toFixed(2)}`, async () => {
    const url =
      `${AIR_QUALITY}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
      `&hourly=aerosol_optical_depth&timezone=GMT&forecast_days=7&past_days=1&timeformat=unixtime`;
    const j = await getJson(url, 6000);
    const times: number[] = j?.hourly?.time ?? [];
    const aod: (number | null)[] = j?.hourly?.aerosol_optical_depth ?? [];
    const m = new Map<number, number>();
    times.forEach((t, i) => {
      const x = aod[i];
      if (typeof x === "number" && Number.isFinite(x) && x >= 0) m.set(t * 1000, x);
    });
    if (m.size === 0) throw new Error("no AOD values");
    return m;
  });
}

function fetchSevenTimer(lat: number, lon: number): Promise<SevenTimerPoint[] | null> {
  return optional(sevenTimerCache, `7t:${lat.toFixed(2)},${lon.toFixed(2)}`, async () => {
    const url = `${SEVEN_TIMER}?lon=${lon.toFixed(3)}&lat=${lat.toFixed(3)}&ac=0&unit=metric&output=json&tzshift=0`;
    const j = await getJson(url, 6000);
    const init = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(j?.init ?? ""));
    if (!init || !Array.isArray(j.dataseries)) throw new Error("unexpected 7Timer format");
    const t0 = Date.UTC(+init[1], +init[2] - 1, +init[3], +init[4]);
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
  eff: number; // effective cloud %
  seeingValue: number; // continuous 1..5
  transparencyValue: number;
  jetCore: number | null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function buildSlots(wx: Weather, aod: Map<number, number> | null, seven: SevenTimerPoint[] | null, site: Site, sqm: number, fromMs: number): Slot[] {
  const obs = observerOf(site);
  const v = wx.v;
  const highSite = (site.elevation ?? 0) > 1200; // 850 hPa is at or below the ground
  const slots: Slot[] = [];
  for (let i = 0; i < wx.times.length; i++) {
    const t = wx.times[i];
    if (t < fromMs) continue;
    const cloud = v.cloud_cover[i];
    if (cloud === null) continue;
    const at = (name: OmVar, fallback: number) => v[name][i] ?? fallback;
    const cloudLow = at("cloud_cover_low", 0);
    const cloudMid = at("cloud_cover_mid", 0);
    const cloudHigh = at("cloud_cover_high", 0);
    const temp = at("temperature_2m", 10);
    const dewPoint = at("dew_point_2m", temp - 5);
    const humidity = at("relative_humidity_2m", 70);
    const wind = at("wind_speed_10m", 0);
    const gust = Math.max(wind, at("wind_gusts_10m", wind));
    const precipProb = at("precipitation_probability", 0);
    const jet = v.wind_speed_250hPa[i];
    const jetLevels = [v.wind_speed_200hPa[i], jet, v.wind_speed_300hPa[i]].filter((x): x is number => x !== null);
    const jetCore = jetLevels.length ? Math.max(...jetLevels) : null;
    const level = (hPa: 250 | 500 | 850): PressureLevel => ({
      hPa,
      height: v[`geopotential_height_${hPa}hPa`][i],
      temp: v[`temperature_${hPa}hPa`][i],
      speed: v[`wind_speed_${hPa}hPa`][i],
      dir: v[`wind_direction_${hPa}hPa`][i],
    });
    const st = sevenTimerAt(seven, t);
    const seeing = estimateSeeing({
      jet: jetCore,
      wind,
      gust,
      riUpper: bulkRichardson(level(500), level(250)),
      riLower: highSite ? null : bulkRichardson(level(850), level(500)),
      sevenTimer: st?.seeing ?? null,
    });
    const aodHere = aod?.get(t) ?? null;
    const transparency = estimateTransparency({
      humidity,
      cloudHigh,
      aod: aodHere,
      visibility: v.visibility[i],
      elevation: site.elevation,
      sevenTimer: st?.transparency ?? null,
    });

    // Sun and Moon at the middle of the hour the slot represents.
    const mid = t + HOUR_MS / 2;
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

    slots.push({
      h: {
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
        aod: aodHere === null ? null : Math.round(aodHere * 1000) / 1000,
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
      },
      eff: sc.effCloud,
      seeingValue: seeing.value,
      transparencyValue: transparency.value,
      jetCore,
    });
  }
  return slots;
}

// ------------------------------------------------------------------------------------
// Night summaries
// ------------------------------------------------------------------------------------

interface Ctx {
  tz: string;
  units: "metric" | "imperial";
  time: (ms: number) => string;
  observer: A.Observer;
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

function summarizeNight(date: string, n: NightInfo, slots: Slot[], ctx: Ctx, now: number): NightForecast {
  const [nightStart, we] = nightWindow(n);
  // Once tonight's dark window has begun, judge only what is left of it ("is it still worth it?").
  const ongoing = now > nightStart + 15 * 60_000 && now < we - 15 * 60_000;
  const ws = ongoing ? now : nightStart;
  const windowHours = (we - ws) / HOUR_MS;
  const win = within(slots, ws, we);
  const covered = win.reduce((a, x) => a + x.w, 0);
  const hasData = windowHours > 0 && covered >= 0.5 * windowHours;

  // Planets are fine from the end of civil twilight.
  const pa = n.civilDusk ?? n.sunset ?? ws;
  const pb = n.civilDawn ?? n.sunrise ?? we;
  const planetWin = within(slots, Math.min(pa, ws), Math.max(pb, we));

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
  const { headline, details } = describe(n, win, ws, we, clearDarkHours / Math.max(covered, 1e-6), bestWindow, ctx, ongoing);

  return {
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
  };
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

function describe(
  n: NightInfo,
  win: InWindow[],
  ws: number,
  we: number,
  clearFrac: number,
  best: NightForecast["bestWindow"],
  ctx: Ctx,
  ongoing: boolean,
): { headline: string; details: string[] } {
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
    headline = veiled
      ? `Thin high cloud ${allNight}`
      : steady && !hazy
        ? `Clear and steady ${allNight}`
        : turbulent
          ? `Clear ${allNight}, but turbulent`
          : hazy
            ? `Clear ${allNight}, but hazy`
            : brightMoon
              ? `Clear ${allNight} under a bright Moon`
              : `Clear ${allNight}`;
  } else if (mostlyClear) {
    headline = veiled ? "Mostly thin high cloud" : `Mostly clear${quality}`;
  } else {
    const b = best!;
    const sky = veiled ? "Thin high cloud" : `Clear${quality}`;
    if (fromDusk && !toDawn) headline = `${sky} until ${t(b.end)}`;
    else if (!fromDusk && toDawn) headline = `${sky} after ${t(b.start)}`;
    else headline = `${sky} ${t(b.start)}–${t(b.end)}`;
  }

  // ---- details
  const details: string[] = [];
  const cirrusNote = (xs: InWindow[]) => (thinCloud(xs) ? " (mostly thin high cloud)" : "");
  if (cloudy) {
    const kind = meanLowMid >= 50 ? "mostly low and mid-level" : cirrusVeil ? "thin high cloud" : "";
    details.push(
      `Cloud around ${pct(meanTotal)}${kind ? ` (${kind})` : ""} ${ongoing ? "for the rest of the night" : "through the night"}` +
        (maxPrecip >= 30 ? `, ${pct(maxPrecip)} chance of rain` : ""),
    );
  } else if (allClear) {
    const lo = Math.min(...win.map((x) => x.s.h.cloud));
    const hi = Math.max(...win.map((x) => x.s.h.cloud));
    // The headline already says "clear": use this line for when the dark sky is usable.
    const range = lo === hi ? pct(hi) : `${lo}–${pct(hi)}`;
    const dur = formatDuration((we - ws) / HOUR_MS);
    if (ongoing) details.push(hi <= 10 ? `No cloud until darkness ends at ${t(we)} (${dur} left)` : `Cloud ${range}${cirrusNote(win)} until darkness ends at ${t(we)}`);
    else details.push(hi <= 10 ? `No cloud from ${t(ws)} to ${t(we)} — ${dur} of darkness` : `Cloud ${range}${cirrusNote(win)} from ${t(ws)} to ${t(we)}`);
  } else if (mostlyClear) {
    let worst = win[0];
    for (const x of win) if (x.s.eff > worst.s.eff) worst = x;
    details.push(`Mostly clear${cirrusNote(win)}; cloud up to ${pct(worst.s.h.cloud)} around ${t(Math.max(ws, worst.s.h.t))}`);
  } else {
    const b = best!;
    const before = win.filter((x) => x.s.h.t + HOUR_MS <= b.start + 1000);
    const after = win.filter((x) => x.s.h.t >= b.end - 1000);
    const during = win.filter((x) => !before.includes(x) && !after.includes(x));
    const clearPart = `≤${pct(Math.max(5, ...during.map((x) => x.s.h.cloud)))}${cirrusNote(during)}`;
    let peak: InWindow | null = null;
    for (const x of after) if (!peak || x.s.h.cloud > peak.s.h.cloud) peak = x;
    const later = peak ? `, then ${pct(peak.s.h.cloud)} by ${t(Math.max(peak.s.h.t, ws))}` : "";
    let text: string;
    if (before.length && after.length) text = `Cloud ${pct(wmean(before, (s) => s.h.cloud))} ${dusk}, ${clearPart} ${t(b.start)}–${t(b.end)}${later}`;
    else if (before.length) text = `Cloud ${pct(wmean(before, (s) => s.h.cloud))} ${dusk}, clearing to ${clearPart} from ${t(b.start)}`;
    else text = `Cloud ${clearPart} until ${t(b.end)}${later}`;
    if (maxPrecip >= 40) text += `; ${pct(maxPrecip)} chance of showers`;
    details.push(text);
  }

  details.push(moonDetail(n, ctx, ws, we, ongoing));

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
    details.push(`Seeing ~${seeingArcsec.toFixed(1)}″ (${scaleLabel(seeingValue)}${cause}); transparency ${scaleLabel(transValue)}`);
  }

  const warnings: string[] = [];
  if (n.darkness === "nautical") warnings.push("The sky only reaches nautical darkness — faint galaxies and nebulae will suffer");
  const usable = cloudy ? [] : win.filter((x) => x.s.eff < 60);
  const dew = usable.find((x) => x.s.h.dewRisk === "high");
  if (dew) warnings.push(`Dew risk high from ${t(Math.max(ws, dew.s.h.t))} — use a dew heater or shield`);
  const gusts = Math.max(0, ...win.map((x) => x.s.h.gust));
  if (gusts >= 40 && !cloudy) warnings.push(`Gusts to ${speed(gusts, ctx)} — expect shake at high power`);
  const tMin = Math.min(...win.map((x) => x.s.h.temp));
  if (tMin <= 0 && !cloudy) warnings.push(`Down to ${temperature(tMin, ctx)} — frost likely, dress warmly`);
  if (!dew && !cloudy && usable.some((x) => x.s.h.dewRisk === "moderate") && warnings.length === 0) warnings.push("Some dew risk later — keep optics capped between views");
  for (const w of warnings) if (details.length < 4) details.push(w);

  return { headline, details };
}

// ------------------------------------------------------------------------------------
// Public entry point
// ------------------------------------------------------------------------------------

export interface ForecastQuery {
  lat: number;
  lon: number;
  bortle?: number;
  units?: "metric" | "imperial";
}

function timeFormatter(tz: string) {
  const make = (timeZone: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
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

export async function getForecast(q: ForecastQuery): Promise<ForecastResponse> {
  const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const lat = round5(clamp(q.lat, -90, 90));
  const lon = round5(q.lon >= -180 && q.lon <= 180 ? q.lon : ((((q.lon + 180) % 360) + 360) % 360) - 180);
  const bortle = clamp(Math.round(q.bortle ?? DEFAULT_BORTLE), 1, 9);
  const units = q.units ?? "metric";
  const responseKey = `${lat.toFixed(3)},${lon.toFixed(3)},${bortle},${units}`;
  const cached = responseCache.get(responseKey);
  if (cached) return cached;

  const started = Date.now();
  const clat = clamp(cell(lat), -90, 90);
  const clon = cell(lon);

  // Optional sources load in parallel and keep loading in the background if they miss the budget.
  let aod: Map<number, number> | null = null;
  let seven: SevenTimerPoint[] | null = null;
  let aodDone = false;
  let sevenDone = false;
  const aodP = fetchAod(clat, clon).then((x) => ((aod = x), (aodDone = true)));
  const sevenP = fetchSevenTimer(clat, clon).then((x) => ((seven = x), (sevenDone = true)));
  const wx = await fetchWeather(clat, clon);
  const remaining = started + OPTIONAL_BUDGET_MS - Date.now();
  if (!aodDone || !sevenDone) await Promise.race([Promise.allSettled([aodP, sevenP]), sleep(Math.max(0, remaining))]);

  const site: Site = { lat, lon, elevation: wx.elevation ?? 0 };
  const now = Date.now();
  const tonight = currentNightDate(now, site);
  const nights = Array.from({ length: NIGHTS }, (_, i) => {
    const date = addDays(tonight, i);
    return { date, info: nightOf(date, site) };
  });
  const fromMs = Math.floor(nights[0].info.noon / HOUR_MS) * HOUR_MS;
  const slots = buildSlots(wx, aod, seven, site, sqmForBortle(bortle), fromMs);
  const ctx: Ctx = { tz: wx.timezone, units, time: timeFormatter(wx.timezone), observer: observerOf(site) };

  const sources = ["Open-Meteo (best-match NWP)"];
  if (aod) sources.push("Open-Meteo Air Quality (CAMS)");
  if (seven) sources.push("7Timer ASTRO");

  const response: ForecastResponse = {
    site: { lat, lon, timezone: wx.timezone, utcOffsetSeconds: wx.utcOffsetSeconds, elevation: wx.elevation },
    generatedAt: now,
    sources,
    hours: slots.map((s) => s.h),
    nights: nights.map(({ date, info }) => summarizeNight(date, info, slots, ctx, now)),
  };
  responseCache.set(responseKey, response, aodDone && sevenDone ? RESPONSE_TTL : PARTIAL_RESPONSE_TTL);
  return response;
}
