/** Bright comets: GET /api/comets (orbits from JPL SBDB, ephemerides from JPL Horizons). */
import type { Express } from "express";
import { ah, HttpError, rateLimit } from "../http";
import { getComets } from "../services/comets";

export function registerComets(app: Express) {
  app.get(
    "/api/comets",
    rateLimit({ windowMs: 60_000, max: 30, message: "Too many requests. Please wait a minute." }),
    ah(async (_req, res) => {
      try {
        const data = await getComets();
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.json(data);
      } catch {
        throw new HttpError(503, "Comet data is temporarily unavailable.");
      }
    }),
  );
  // Warm the cache shortly after boot so the first visitor doesn't wait for JPL.
  setTimeout(() => void getComets().catch(() => undefined), 20_000).unref?.();
}
