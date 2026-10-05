/** Moons of Mars, Saturn, Uranus and Neptune: GET /api/moons?planet=&from=&to= (from JPL Horizons). */
import type { Express } from "express";
import { z } from "zod";
import { ah, HttpError, parse, rateLimit } from "../http";
import { HORIZON_PLANETS, SERVED, getMoonSeries, warmMoons } from "../services/moons";

const DAY = 86_400_000;
const query = z
  .object({
    planet: z.enum(HORIZON_PLANETS, { message: `planet must be one of ${HORIZON_PLANETS.join(", ")} (Jupiter's moons are computed in the app)` }),
    from: z.coerce.number({ invalid_type_error: "from must be a time in ms" }).finite(),
    to: z.coerce.number({ invalid_type_error: "to must be a time in ms" }).finite(),
  })
  .refine((q) => q.to > q.from && q.to - q.from <= 3 * DAY, { message: "to must be after from, at most 3 days later" })
  // Tonight is what the app asks for; the stored window always covers a day and a half back to three days ahead.
  .refine((q) => q.from >= Date.now() - SERVED.before && q.to <= Date.now() + SERVED.after, { message: "from and to must fall between a day and a half ago and three days ahead" });

export function registerMoons(app: Express) {
  app.get(
    "/api/moons",
    rateLimit({ windowMs: 60_000, max: 60, message: "Too many requests. Please wait a minute." }),
    ah(async (req, res) => {
      const q = parse(query, req.query);
      try {
        const data = await getMoonSeries(q.planet, q.from, q.to);
        res.setHeader("Cache-Control", "public, max-age=1800");
        res.json(data);
      } catch (e) {
        if (e instanceof HttpError) {
          res.status(e.status).json({ message: e.message });
          return;
        }
        throw e;
      }
    }),
  );
  warmMoons();
}
