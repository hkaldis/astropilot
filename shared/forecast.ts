/**
 * Observing-forecast API contracts (server ⇄ client).
 *   GET /api/forecast?lat=&lon=&bortle=&units=metric|imperial&timeFormat=24h|12h → ForecastResponse
 *       (units / timeFormat only change the wording of headline and details)
 *   GET /api/space-weather?lat=&lon=         → SpaceWeather
 *   GET /api/iss/passes?lat=&lon=&elev=[&sat=iss|tiangong|all] → IssPass[] (default: ISS only)
 *   GET /api/satellites/passes?lat=&lon=&elev=[&sat=…]        → IssPass[] (default: all stations)
 *       (every pass above 10° in the next 10 days, visible or not)
 * The scoring model behind the numbers lives in shared/astro/conditions.ts.
 */

export type DewRisk = "low" | "moderate" | "high";
export type FogRisk = "low" | "moderate" | "high";
export type Verdict = "excellent" | "good" | "fair" | "poor" | "bad";
export type Confidence = "high" | "medium" | "low";
/** Independent global models used to cross-check the main (best-match) cloud forecast. */
export type CloudModelId = "ecmwf" | "gfs" | "icon";

export interface ForecastHour {
  // Every hour describes the slot [t, t + 1 h]: instantaneous model fields are averaged between
  // the two hour marks; gusts and rain chance are the model's values for that hour.
  t: number; // epoch ms (hour start)
  cloud: number; // total cloud cover, %
  cloudLow: number; // %
  cloudMid: number; // %
  cloudHigh: number; // %
  humidity: number; // % at 2 m
  dewPoint: number; // °C at 2 m
  temp: number; // °C at 2 m
  wind: number; // km/h at 10 m
  gust: number; // km/h at 10 m
  jet: number | null; // km/h at 250 hPa
  precipProb: number; // %
  aod: number | null; // aerosol optical depth (550 nm) if available
  seeing: number; // 1..5 (5 = excellent, ≈ <1″), estimated
  seeingArcsec: number; // estimated FWHM in arcsec
  transparency: number; // 1..5 (5 = excellent)
  dewRisk: DewRisk;
  sunAlt: number; // deg
  moonAlt: number; // deg
  moonIllum: number; // 0..1
  dark: boolean; // Sun below −12° at mid-hour (Sun/Moon values are for the middle of the hour)
  score: number; // 0..100 overall observing quality this hour (weather + sky darkness; Moon NOT included)
  dsoScore: number; // 0..100 for faint deep-sky (includes Moon & twilight penalty)
  planetScore: number; // 0..100 for planets/Moon/doubles (seeing-weighted, Moon irrelevant)
  fogRisk?: FogRisk; // radiation fog / low stratus risk (air near saturation, light wind, low visibility)
  cloudModels?: Partial<Record<CloudModelId, number>>; // total cloud %, same slot, from each cross-check model
  cloudSpread?: number; // range (max − min) of total cloud across the main forecast and cloudModels, % points
}

/** One model's view of a night's dark window (the main forecast first). */
export interface ModelView {
  id: "main" | CloudModelId;
  label: string; // "Main forecast", "ECMWF", "GFS", "ICON"
  clearDarkHours: number; // dark hours with effective cloud < 30 % in this model
  cloud: number; // mean total cloud over the window, %
  sameAsMain?: boolean; // this model *is* the main forecast here (e.g. ICON over Europe) — not counted twice
}

export interface NightForecast {
  date: string; // "YYYY-MM-DD" — the night of (local solar evening date)
  darkStart: number | null;
  darkEnd: number | null;
  darkness: "astronomical" | "nautical" | "civil" | "none";
  sunset: number | null;
  sunrise: number | null;
  moon: {
    illumination: number; // 0..1 at solar midnight
    phaseName: string;
    elongation: number; // 0..360 (0 new, 180 full)
    rise: number | null;
    set: number | null;
    upDarkHours: number; // hours the Moon is above the horizon during the dark window
  };
  // Night scores weight each hour by its overlap with the dark window (darkStart–darkEnd; sunset–sunrise
  // when there is no darkness). For the current night, once darkness has begun, the scores, verdict,
  // clearDarkHours, bestWindow, headline and details describe only what is left of it.
  score: number; // 0..100 for the night: 65 % mean over the window + 35 % best 3-hour stretch
  dsoScore: number;
  planetScore: number; // window widened to civil dusk–dawn (planets are fine in nautical twilight)
  verdict: Verdict;
  clearDarkHours: number; // dark hours with effective cloud < 30%
  bestWindow: { start: number; end: number; score: number } | null; // best continuous stretch of dark, clear-ish hours
  headline: string; // e.g. "Clear and steady after 22:00"
  details: string[]; // 2–4 short bullets: cloud timing, model disagreement, Moon timing, seeing/transparency, dew/fog/wind warnings
  hasData: boolean; // false if beyond forecast range
  // Forecast confidence from the agreement of independent models (ECMWF, GFS, ICON) with the main
  // forecast over the same window; absent when the cross-check models are unavailable.
  confidence?: Confidence;
  confidenceReason?: string; // e.g. "ECMWF and ICON expect more cloud than the main forecast"
  modelViews?: ModelView[];
  fogRisk?: FogRisk; // highest fog risk during the usable (not overcast) dark hours
}

export interface ForecastResponse {
  site: { lat: number; lon: number; timezone: string; utcOffsetSeconds: number; elevation: number | null };
  generatedAt: number;
  sources: string[]; // e.g. ["Open-Meteo (best-match NWP)", "Open-Meteo Air Quality (CAMS)", "7Timer ASTRO"]
  hours: ForecastHour[]; // hourly, from local solar noon of the current night's date through the forecast end (~8 days)
  nights: NightForecast[]; // tonight + next 6
  attribution?: { text: string; url: string }[]; // credits the data licences require (show with links)
}

// ---------------------------------------------------------------------------------------
// Space weather (NOAA SWPC planetary K-index)
// ---------------------------------------------------------------------------------------

export interface KpPoint {
  t: number; // epoch ms, start of the 3-hour interval (UTC)
  kp: number; // 0..9
  observed?: boolean; // true for measured values, false for NOAA predictions
}

export interface SpaceWeather {
  kpNow: number; // latest observed planetary Kp (NOAA SWPC)
  kpMax24h: number; // highest Kp expected over the next 24 h (forecast, falling back to observed)
  forecast: KpPoint[]; // 3-hourly, sorted by t: the last ~24 h observed + NOAA 3-day forecast
  aurora: {
    likely: boolean; // aurora plausibly visible from the given latitude in the next 24 h (no lat: storm-level Kp ≥ 5)
    minGeomagLat: number; // approx. equatorward edge of the auroral oval for kpMax24h, |geomagnetic latitude| in deg
    note: string; // one short sentence, specific to the latitude when given
    geomagLat?: number | null; // observer's geomagnetic latitude (deg), when lat/lon were given
    viewLat?: number; // |geomag lat| from which aurora may be seen low on the poleward horizon at kpMax24h
  };
  updatedAt: number; // epoch ms when the NOAA products were fetched (cached 15 min)
}

// ---------------------------------------------------------------------------------------
// Space-station passes (ISS, Tiangong)
// ---------------------------------------------------------------------------------------

export type StationId = "iss" | "tiangong";

/**
 * One space-station pass above 10°. For a visible pass, start/max/end describe the *visible* part
 * (as Heavens-Above and NASA's Spot the Station do): from when it is ≥ 10° up, sunlit and the sky
 * is dark, until it drops below 10° or vanishes into Earth's shadow. For other passes they
 * describe the whole pass above 10°.
 */
export interface IssPass {
  sat?: StationId; // which station (absent in old responses = "iss")
  name?: string; // "ISS" | "Tiangong"
  start: number; // epoch ms
  max: number; // epoch ms of the highest (visible) point
  end: number; // epoch ms
  maxAlt: number; // deg
  startAlt?: number; // deg, where the (visible) pass begins: 10°, or higher when it emerges from Earth's shadow
  endAlt?: number; // deg, where it ends: 10°, or higher when it vanishes into the shadow
  startAz: number; // deg
  maxAz: number; // deg
  endAz: number; // deg
  startDir: string; // compass point, e.g. "WSW"
  endDir: string;
  visible: boolean; // observer in darkness (Sun < −6°) while the ISS is sunlit, at some point above 10°
  magnitude?: number | null; // estimated at the brightest visible point; null when not visible
  hidden?: "daylight" | "shadow"; // why a pass isn't visible: the sky is too bright, or the station is in Earth's shadow
  track?: [number, number][]; // [az, alt] (deg, rounded) every ~30 s along the visible part; visible passes only
  passStart?: number; // epoch ms, whole pass above 10° (equals start for non-visible passes)
  passEnd?: number;
  peakAlt?: number; // culmination altitude of the whole pass, deg
}
