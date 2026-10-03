/**
 * Observing-forecast API contracts (server ⇄ client).
 *   GET /api/forecast?lat=&lon=&bortle=      → ForecastResponse
 *   GET /api/space-weather?lat=&lon=         → SpaceWeather
 *   GET /api/iss/passes?lat=&lon=&elev=      → IssPass[]
 * The scoring model behind the numbers lives in shared/astro/conditions.ts.
 */

export type DewRisk = "low" | "moderate" | "high";
export type Verdict = "excellent" | "good" | "fair" | "poor" | "bad";

export interface ForecastHour {
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
  details: string[]; // 2–4 short bullets: cloud timing, seeing/transparency, Moon timing, dew/wind warnings
  hasData: boolean; // false if beyond forecast range
}

export interface ForecastResponse {
  site: { lat: number; lon: number; timezone: string; utcOffsetSeconds: number; elevation: number | null };
  generatedAt: number;
  sources: string[]; // e.g. ["Open-Meteo (best-match NWP)", "Open-Meteo Air Quality (CAMS)", "7Timer ASTRO"]
  hours: ForecastHour[]; // hourly, from local solar noon of the current night's date through the forecast end (~8 days)
  nights: NightForecast[]; // tonight + next 6
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
// ISS passes
// ---------------------------------------------------------------------------------------

/**
 * One ISS pass above 10°. For a visible pass, start/max/end describe the *visible* part (as
 * Heavens-Above and NASA's Spot the Station do): from when it is ≥ 10° up, sunlit and the sky is
 * dark, until it drops below 10° or vanishes into Earth's shadow. For other passes they describe
 * the whole pass above 10°.
 */
export interface IssPass {
  start: number; // epoch ms
  max: number; // epoch ms of the highest (visible) point
  end: number; // epoch ms
  maxAlt: number; // deg
  startAz: number; // deg
  maxAz: number; // deg
  endAz: number; // deg
  startDir: string; // compass point, e.g. "WSW"
  endDir: string;
  visible: boolean; // observer in darkness (Sun < −6°) while the ISS is sunlit, at some point above 10°
  magnitude?: number | null; // estimated at the brightest visible point; null when not visible
  passStart?: number; // epoch ms, whole pass above 10° (equals start for non-visible passes)
  passEnd?: number;
  peakAlt?: number; // culmination altitude of the whole pass, deg
}
