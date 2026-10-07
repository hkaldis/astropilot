/** Public observing-conditions endpoints: forecast, space weather (aurora) and space-station passes. */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { HttpError, ah, rateLimit } from "../http";
import { getForecast, getForecastRelayed } from "../services/forecast";
import { isValidTimeZone } from "../services/geoLookup";
import { getSpaceWeather } from "../services/spaceWeather";
import { STATIONS, getStationPasses } from "../services/satellites";

/** Like http.parse, but for schemas whose input (query strings) differs from their output. */
function parseQuery<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

/** The global error handler hides 5xx messages; an upstream outage deserves a specific one. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  ah(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError && e.status >= 500 && !res.headersSent) {
        res.status(e.status).json({ ...e.extra, message: e.message });
        return;
      }
      throw e;
    }
  });

const range = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(min, `${label} must be between ${min} and ${max}`)
    .max(max, `${label} must be between ${min} and ${max}`);

/** Required number from a query string ("lat=" or "lat=abc" are errors, never 0). */
const qnum = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a single number` })
    .trim()
    .min(1, `${label} is required`)
    .transform(Number)
    .pipe(range(label, min, max));

/** Optional number from a query string (missing or empty → undefined). */
const qnumOpt = (label: string, min: number, max: number) =>
  z
    .string({ invalid_type_error: `${label} must be a single number` })
    .trim()
    .optional()
    .transform((s) => (s ? Number(s) : undefined))
    .pipe(range(label, min, max).optional());

const forecastQuery = z.object({
  lat: qnum("lat", -90, 90),
  lon: qnum("lon", -180, 180),
  bortle: qnumOpt("bortle", 1, 9),
  sqm: qnumOpt("sqm", 14, 23),
  elev: qnumOpt("elev", -500, 9000),
  // An unknown zone is ignored (the server looks one up) rather than refused.
  tz: z
    .string({ invalid_type_error: "tz must be a single value" })
    .trim()
    .max(64)
    .optional()
    .transform((s) => (s && isValidTimeZone(s) ? s : undefined)),
  units: z.enum(["metric", "imperial"], { message: "units must be metric or imperial" }).optional(),
  timeFormat: z.enum(["24h", "12h"], { message: "timeFormat must be 24h or 12h" }).optional(),
});

/** lat/lon are optional for space weather, but must come as a pair. */
const spaceWeatherQuery = z
  .object({ lat: qnumOpt("lat", -90, 90), lon: qnumOpt("lon", -180, 180) })
  .refine((q) => (q.lat === undefined) === (q.lon === undefined), { message: "Pass both lat and lon, or neither" });

const stationIds = Object.keys(STATIONS) as [keyof typeof STATIONS, ...(keyof typeof STATIONS)[]];
/** "iss", "tiangong", "all" or a comma list ("iss,tiangong"). */
const satParam = (fallback: "iss" | "all") =>
  z
    .string({ invalid_type_error: "sat must be a single value" })
    .trim()
    .optional()
    .transform((s) => (!s ? fallback : s.toLowerCase()))
    .transform((s) => (s === "all" ? [...stationIds] : [...new Set(s.split(",").map((x) => x.trim()))]))
    .pipe(z.array(z.enum(stationIds, { message: `sat must be one of ${stationIds.join(", ")} or all` })).min(1));

const passesQuery = (fallback: "iss" | "all") =>
  z.object({
    lat: qnum("lat", -90, 90),
    lon: qnum("lon", -180, 180),
    elev: qnumOpt("elev", -500, 9000),
    sat: satParam(fallback),
  });
const issQuery = passesQuery("iss");
const stationsQuery = passesQuery("all");

export function registerForecast(app: Express) {
  const limit = (max: number) => rateLimit({ windowMs: 60_000, max, message: "Too many requests — please wait a moment." });

  app.get(
    "/api/forecast",
    limit(60),
    handle(async (req, res) => {
      const q = parseQuery(forecastQuery, req.query);
      const data = await getForecast(q);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(data);
    }),
  );

  // The browser fetched the weather from Open-Meteo itself (our server was turned away; see the 503's
  // `relay`) and sends it here to be turned into the forecast. Same query as GET /api/forecast.
  app.post(
    "/api/forecast/relay",
    limit(20),
    handle(async (req, res) => {
      const q = parseQuery(forecastQuery, req.query);
      const data = await getForecastRelayed(q, req.body?.weather, req.body?.models);
      res.setHeader("Cache-Control", "private, no-store");
      res.json(data);
    }),
  );

  app.get(
    "/api/space-weather",
    limit(60),
    handle(async (req, res) => {
      const q = parseQuery(spaceWeatherQuery, req.query);
      const data = await getSpaceWeather(q);
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(data);
    }),
  );

  // ISS by default (unchanged behaviour); ?sat=tiangong or ?sat=all for the Chinese station too.
  app.get(
    "/api/iss/passes",
    limit(30),
    handle(async (req, res) => {
      const q = parseQuery(issQuery, req.query);
      const data = await getStationPasses(q.sat, q);
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(data);
    }),
  );

  // All crewed stations by default, merged and sorted by start time; each pass names its station.
  app.get(
    "/api/satellites/passes",
    limit(30),
    handle(async (req, res) => {
      const q = parseQuery(stationsQuery, req.query);
      const data = await getStationPasses(q.sat, q);
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(data);
    }),
  );
}
