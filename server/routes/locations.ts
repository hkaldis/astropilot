/** Saved observing locations (per user): coordinates, sky darkness, time zone, elevation. */
import type { Express } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { locations } from "@shared/schema";
import type { ApiLocation } from "@shared/api";
import { bortleForSqm } from "@shared/astro/visibility";
import { ah, parse, requireAuth, userId, idParam, HttpError } from "../http";
import { isValidTimeZone, lookupTzElevation } from "./geo";

type LocationRow = typeof locations.$inferSelect;

const MAX_LOCATIONS = 100;

const fields = {
  name: z
    .string({ required_error: "Give the location a name", invalid_type_error: "Give the location a name" })
    .trim()
    .min(1, "Give the location a name")
    .max(100, "Keep the name under 100 characters"),
  latitude: z
    .number({ required_error: "Latitude is required", invalid_type_error: "Latitude must be a number" })
    .finite()
    .min(-90, "Latitude must be between -90° and 90°")
    .max(90, "Latitude must be between -90° and 90°"),
  longitude: z
    .number({ required_error: "Longitude is required", invalid_type_error: "Longitude must be a number" })
    .finite()
    .min(-180, "Longitude must be between -180° and 180°")
    .max(180, "Longitude must be between -180° and 180°"),
  bortle: z
    .number({ required_error: "Choose the sky's Bortle class", invalid_type_error: "Bortle class must be a number" })
    .int("Bortle class is a whole number from 1 to 9")
    .min(1, "Bortle class is a whole number from 1 to 9")
    .max(9, "Bortle class is a whole number from 1 to 9"),
  sqm: z
    .number({ invalid_type_error: "SQM must be a number" })
    .finite()
    .min(16, "SQM readings range from about 16 (city centre) to 22 (pristine sky)")
    .max(22.5, "SQM readings range from about 16 (city centre) to 22 (pristine sky)")
    .nullable(),
  elevation: z
    .number({ invalid_type_error: "Elevation must be a number" })
    .finite()
    .min(-450, "Elevation must be between -450 and 9000 m")
    .max(9000, "Elevation must be between -450 and 9000 m")
    .nullable(),
  timezone: z.string().trim().max(64).refine(isValidTimeZone, "Unknown time zone").nullable(),
  notes: z.string().max(2000, "Keep notes under 2000 characters").nullable(),
  isFavorite: z.boolean(),
};

const createSchema = z.object({
  name: fields.name,
  latitude: fields.latitude,
  longitude: fields.longitude,
  bortle: fields.bortle,
  sqm: fields.sqm.optional(),
  elevation: fields.elevation.optional(),
  timezone: fields.timezone.optional(),
  notes: fields.notes.optional(),
  isFavorite: fields.isFavorite.optional(),
});

const patchSchema = z
  .object(fields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Nothing to update");

/** Legacy rows may lack coordinates or hold impossible ones: report those as "no coordinates". */
function coords(r: LocationRow): { latitude: number | null; longitude: number | null } {
  const ok =
    typeof r.latitude === "number" && Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 90 &&
    typeof r.longitude === "number" && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180;
  return ok ? { latitude: r.latitude, longitude: r.longitude } : { latitude: null, longitude: null };
}

function toApi(r: LocationRow): ApiLocation {
  return {
    id: r.id,
    name: r.name,
    ...coords(r),
    bortle: Number.isFinite(r.bortle) ? Math.min(9, Math.max(1, Math.round(r.bortle))) : 5,
    sqm: r.sqm,
    elevation: r.elevation,
    timezone: r.timezone,
    notes: r.notes,
    isFavorite: !!r.isFavorite,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  };
}

const tidyNotes = (n: string | null | undefined) => (n === undefined ? undefined : n && n.trim() ? n.trim() : null);

/** Make `id` the user's single default location (favourite flag + preferences.defaultLocationId). */
async function setDefault(tx: any, uid: string, id: number) {
  await tx.update(locations).set({ isFavorite: false }).where(and(eq(locations.userId, uid), sql`${locations.id} <> ${id}`, eq(locations.isFavorite, true)));
  await tx.execute(sql`
    UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('defaultLocationId', ${id}::int),
                     favorite_location_id = ${id}
    WHERE id = ${uid}`);
}

/** Forget `id` as the default location wherever it is recorded. */
async function clearDefault(tx: any, uid: string, id: number) {
  await tx.execute(sql`
    UPDATE users SET preferences = preferences || '{"defaultLocationId": null}'::jsonb
    WHERE id = ${uid} AND preferences->>'defaultLocationId' = ${String(id)}`);
  await tx.execute(sql`UPDATE users SET favorite_location_id = NULL WHERE id = ${uid} AND favorite_location_id = ${id}`);
}

/**
 * Locations saved before AstroPilot 2 have no time zone or elevation. Fill them in (bounded:
 * a few rows, a few seconds) so times show in the site's zone; failures retry on a later load.
 */
async function backfill(rows: LocationRow[]) {
  const todo = rows.filter((r) => coords(r).latitude !== null && (r.timezone === null || r.elevation === null)).slice(0, 6);
  if (!todo.length) return;
  const work = Promise.all(
    todo.map(async (r) => {
      const geo = await lookupTzElevation(r.latitude!, r.longitude!);
      if (!geo) return;
      const set: Partial<LocationRow> = {};
      if (r.timezone === null && geo.timezone) set.timezone = geo.timezone;
      if (r.elevation === null && geo.elevation !== null) set.elevation = geo.elevation;
      if (!Object.keys(set).length) return;
      await db.update(locations).set(set).where(and(eq(locations.id, r.id), eq(locations.userId, r.userId)));
      Object.assign(r, set);
    }),
  ).catch((e) => console.warn("[locations] backfill failed:", e?.message));
  await Promise.race([work, new Promise((r) => setTimeout(r, 3000))]);
}

async function listLocations(uid: string) {
  return db
    .select()
    .from(locations)
    .where(eq(locations.userId, uid))
    .orderBy(sql`coalesce(${locations.isFavorite}, false) desc`, asc(locations.id));
}

const moved = (a: number | null, b: number | null) => a === null || b === null || Math.abs(a - b) > 1e-6;

export function registerLocations(app: Express) {
  app.get(
    "/api/locations",
    requireAuth,
    ah(async (req, res) => {
      const rows = await listLocations(userId(req));
      await backfill(rows);
      res.json(rows.map(toApi));
    }),
  );

  app.post(
    "/api/locations",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const body = parse(createSchema, req.body ?? {});
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(locations)
        .where(eq(locations.userId, uid));
      if (n >= MAX_LOCATIONS) throw new HttpError(400, `You can save up to ${MAX_LOCATIONS} locations. Remove some you no longer use first.`);

      let timezone = body.timezone ?? null;
      let elevation = body.elevation ?? null;
      if (timezone === null || elevation === null) {
        const geo = await lookupTzElevation(body.latitude, body.longitude);
        timezone ??= geo?.timezone ?? null;
        elevation ??= geo?.elevation ?? null;
      }
      const sqm = body.sqm ?? null;
      // A measured SQM reading is more precise than a Bortle estimate: derive the class from it.
      const bortle = sqm !== null ? bortleForSqm(sqm) : body.bortle;
      // The first saved location becomes the default.
      const isFavorite = body.isFavorite ?? n === 0;

      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(locations)
          .values({
            userId: uid,
            name: body.name,
            latitude: body.latitude,
            longitude: body.longitude,
            bortle,
            sqm,
            elevation,
            timezone,
            notes: tidyNotes(body.notes) ?? null,
            isFavorite,
          })
          .returning();
        if (isFavorite) await setDefault(tx, uid, r.id);
        return r;
      });
      res.status(201).json(toApi(row));
    }),
  );

  app.patch(
    "/api/locations/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = idParam(req);
      const body = parse(patchSchema, req.body ?? {});
      const [cur] = await db
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.userId, uid)));
      if (!cur) throw new HttpError(404, "Location not found");

      const set: Partial<LocationRow> = {};
      if (body.name !== undefined) set.name = body.name;
      if (body.notes !== undefined) set.notes = tidyNotes(body.notes) ?? null;
      if (body.latitude !== undefined) set.latitude = body.latitude;
      if (body.longitude !== undefined) set.longitude = body.longitude;
      if (body.timezone !== undefined) set.timezone = body.timezone;
      if (body.elevation !== undefined) set.elevation = body.elevation;

      // New coordinates → look up the time zone and elevation again (unless given explicitly).
      const lat = body.latitude ?? cur.latitude;
      const lon = body.longitude ?? cur.longitude;
      const coordsChanged =
        (body.latitude !== undefined && moved(body.latitude, cur.latitude)) || (body.longitude !== undefined && moved(body.longitude, cur.longitude));
      if (coordsChanged && lat !== null && lon !== null) {
        const needTz = body.timezone === undefined || body.timezone === null;
        const needElev = body.elevation === undefined || body.elevation === null;
        if (needTz || needElev) {
          const geo = await lookupTzElevation(lat, lon);
          // If the lookup fails the old values may be wrong for the new place: clear them (GET retries).
          if (needTz) set.timezone = geo?.timezone ?? null;
          if (needElev) set.elevation = geo?.elevation ?? null;
        }
      }

      // Sky darkness: a measured SQM wins; an explicit new Bortle class discards a contradicting old reading.
      if (body.sqm !== undefined) {
        set.sqm = body.sqm;
        if (body.sqm !== null) set.bortle = bortleForSqm(body.sqm);
        else if (body.bortle !== undefined) set.bortle = body.bortle;
      } else if (body.bortle !== undefined) {
        set.bortle = body.bortle;
        if (cur.sqm !== null && bortleForSqm(cur.sqm) !== body.bortle) set.sqm = null;
      }
      if (body.isFavorite !== undefined) set.isFavorite = body.isFavorite;

      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .update(locations)
          .set(set)
          .where(and(eq(locations.id, id), eq(locations.userId, uid)))
          .returning();
        if (!r) throw new HttpError(404, "Location not found");
        if (body.isFavorite === true) await setDefault(tx, uid, id);
        if (body.isFavorite === false) await clearDefault(tx, uid, id);
        return r;
      });
      res.json(toApi(row));
    }),
  );

  app.delete(
    "/api/locations/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = idParam(req);
      try {
        await db.transaction(async (tx) => {
          const [owned] = await tx
            .select({ id: locations.id })
            .from(locations)
            .where(and(eq(locations.id, id), eq(locations.userId, uid)))
            .for("update");
          if (!owned) throw new HttpError(404, "Location not found");
          // These foreign keys have no ON DELETE action: detach sessions and saved conditions first
          // (they keep their own Bortle value), then delete. Watchlist windows cascade. Rows of other
          // users can only point here through old-app bugs; their dangling pointer is cleared too.
          await tx.execute(sql`UPDATE observation_sessions SET location_id = NULL WHERE location_id = ${id}`);
          await tx.execute(sql`UPDATE night_conditions SET location_id = NULL WHERE location_id = ${id}`);
          await clearDefault(tx, uid, id);
          await tx.delete(locations).where(and(eq(locations.id, id), eq(locations.userId, uid)));
        });
      } catch (e: any) {
        if (e?.code === "23503") throw new HttpError(409, "This location is still referenced by other records, so it can't be deleted.");
        throw e;
      }
      res.status(204).end();
    }),
  );
}
