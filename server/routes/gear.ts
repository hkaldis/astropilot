/** "My gear" — telescopes, eyepieces, Barlows/reducers, filters and cameras (per user). */
import type { Express, Request } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { telescopes, eyepieces, barlows, filters, cameras } from "@shared/schema";
import type { ApiBarlow, ApiCamera, ApiEyepiece, ApiFilter, ApiGear, ApiTelescope, GearKind } from "@shared/api";
import {
  CAMERA_TYPE_IDS,
  FILTER_TYPE_IDS,
  GEAR_LIMITS as L,
  TELESCOPE_TYPE_IDS,
  normalizeTelescopeType,
} from "@shared/data/gear-presets";
import { ah, parse, requireAuth, userId, idParam, HttpError } from "../http";

// ------------------------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------------------------

const name = z
  .string({ required_error: "Give it a name", invalid_type_error: "Give it a name" })
  .trim()
  .min(1, "Give it a name")
  .max(L.name, `Keep the name under ${L.name} characters`);

const num = (label: string, min: number, max: number, unit: string) =>
  z
    .number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(min, `${label} must be between ${min} and ${max}${unit}`)
    .max(max, `${label} must be between ${min} and ${max}${unit}`);

const aperture = z
  .number({ required_error: "Aperture is required", invalid_type_error: "Aperture must be a number" })
  .finite()
  .superRefine((v, ctx) => {
    if (v < L.aperture.min)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          v > 0 && v < 25
            ? `Aperture is in millimetres — an ${Math.round(v)}-inch telescope is ${Math.round(v * 25.4)} mm`
            : `Aperture must be between ${L.aperture.min} and ${L.aperture.max} mm`,
      });
    else if (v > L.aperture.max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Aperture must be between ${L.aperture.min} and ${L.aperture.max} mm` });
  });

const telescopeFields = {
  name,
  aperture,
  focalLength: num("Focal length", L.focalLength.min, L.focalLength.max, " mm"),
  type: z.enum(TELESCOPE_TYPE_IDS, { errorMap: () => ({ message: "Choose a telescope type" }) }).nullable(),
  obstructionRatio: num("Central obstruction", L.obstruction.min, L.obstruction.max, "%").nullable(),
};

const eyepieceFields = {
  name,
  focalLength: num("Eyepiece focal length", L.eyepieceFocal.min, L.eyepieceFocal.max, " mm"),
  apparentFov: num("Apparent field", L.afov.min, L.afov.max, "°").nullable(),
};

const barlowFields = {
  name,
  factor: num("Factor", L.barlowFactor.min, L.barlowFactor.max, "×"),
};

const filterFields = {
  name,
  type: z.enum(FILTER_TYPE_IDS, { errorMap: () => ({ message: "Choose a filter type" }) }),
};

const cameraFields = {
  name,
  type: z.enum(CAMERA_TYPE_IDS, { errorMap: () => ({ message: "Choose a camera type" }) }),
  sensorSize: z.string().trim().max(L.sensor, `Keep the sensor size under ${L.sensor} characters`).nullable(),
};

function checkFRatio(t: { aperture: number; focalLength: number }) {
  const f = t.focalLength / t.aperture;
  if (f < L.fRatio.min || f > L.fRatio.max)
    throw new HttpError(400, `That's an f/${f < 1 ? f.toFixed(2) : f.toFixed(1)} focal ratio — check the aperture and focal length (both in mm).`);
}

// ------------------------------------------------------------------------------------
// Row → API mapping
// ------------------------------------------------------------------------------------

type TelescopeRow = typeof telescopes.$inferSelect;
type EyepieceRow = typeof eyepieces.$inferSelect;
type BarlowRow = typeof barlows.$inferSelect;
type FilterRow = typeof filters.$inferSelect;
type CameraRow = typeof cameras.$inferSelect;

function toTelescope(r: TelescopeRow): ApiTelescope {
  // Legacy rows may store the obstruction as a fraction (0.25) instead of a percentage.
  const obs = r.obstructionRatio;
  return {
    id: r.id,
    name: r.name,
    aperture: r.aperture,
    focalLength: r.focalLength,
    type: normalizeTelescopeType(r.type, r.name),
    obstructionRatio: obs === null || obs === undefined ? null : obs > 0 && obs <= 1 ? Math.round(obs * 1000) / 10 : obs,
  };
}
const toEyepiece = (r: EyepieceRow): ApiEyepiece => ({ id: r.id, name: r.name, focalLength: r.focalLength, apparentFov: r.apparentFov });
const toBarlow = (r: BarlowRow): ApiBarlow => ({ id: r.id, name: r.name, factor: r.factor });
const toFilter = (r: FilterRow): ApiFilter => ({ id: r.id, name: r.name, type: r.type });
const toCamera = (r: CameraRow): ApiCamera => ({ id: r.id, name: r.name, type: r.type, sensorSize: r.sensorSize });

// ------------------------------------------------------------------------------------
// Per-kind configuration
// ------------------------------------------------------------------------------------

/** Column in `observations` that references each kind (all FKs are ON DELETE NO ACTION). */
const OBS_COLUMN: Record<GearKind, string> = {
  telescopes: "telescope_id",
  eyepieces: "eyepiece_id",
  barlows: "barlow_id",
  filters: "filter_id",
  cameras: "camera_id",
};

const LABEL: Record<GearKind, string> = {
  telescopes: "Telescope",
  eyepieces: "Eyepiece",
  barlows: "Barlow or reducer",
  filters: "Filter",
  cameras: "Camera",
};

const TABLES = { telescopes, eyepieces, barlows, filters, cameras } as const;

const KINDS = Object.keys(TABLES) as GearKind[];

function kindParam(req: Request): GearKind {
  const k = req.params.kind as GearKind;
  if (!KINDS.includes(k)) throw new HttpError(404, "Unknown kind of equipment. Use telescopes, eyepieces, barlows, filters or cameras.");
  return k;
}

/** Unknown keys (including any `userId` or `id` a client sends) are stripped, never stored. */
const shape = <T extends z.ZodRawShape>(fields: T) => z.object(fields);

/** Create: required fields required, optional ones default to null. */
const CREATE = {
  telescopes: shape({ ...telescopeFields, type: telescopeFields.type.optional(), obstructionRatio: telescopeFields.obstructionRatio.optional() }),
  eyepieces: shape({ ...eyepieceFields, apparentFov: eyepieceFields.apparentFov.optional() }),
  barlows: shape(barlowFields),
  filters: shape(filterFields),
  cameras: shape({ ...cameraFields, sensorSize: cameraFields.sensorSize.optional() }),
};

const nonEmpty = (o: object) => Object.keys(o).length > 0;
const PATCH = {
  telescopes: shape(telescopeFields).partial().refine(nonEmpty, "Nothing to update"),
  eyepieces: shape(eyepieceFields).partial().refine(nonEmpty, "Nothing to update"),
  barlows: shape(barlowFields).partial().refine(nonEmpty, "Nothing to update"),
  filters: shape(filterFields).partial().refine(nonEmpty, "Nothing to update"),
  cameras: shape(cameraFields).partial().refine(nonEmpty, "Nothing to update"),
};

function toApi(kind: GearKind, row: any) {
  switch (kind) {
    case "telescopes":
      return toTelescope(row);
    case "eyepieces":
      return toEyepiece(row);
    case "barlows":
      return toBarlow(row);
    case "filters":
      return toFilter(row);
    case "cameras":
      return toCamera(row);
  }
}

/** Strip Drizzle-incompatible undefineds and coerce empty sensor strings to null. */
function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = k === "sensorSize" && v === "" ? null : v;
  return out as T;
}

async function loadGear(uid: string): Promise<ApiGear> {
  const [t, e, b, f, c] = await Promise.all([
    db.select().from(telescopes).where(eq(telescopes.userId, uid)).orderBy(asc(telescopes.id)),
    db.select().from(eyepieces).where(eq(eyepieces.userId, uid)).orderBy(asc(eyepieces.focalLength), asc(eyepieces.id)),
    db.select().from(barlows).where(eq(barlows.userId, uid)).orderBy(asc(barlows.factor), asc(barlows.id)),
    db.select().from(filters).where(eq(filters.userId, uid)).orderBy(asc(filters.id)),
    db.select().from(cameras).where(eq(cameras.userId, uid)).orderBy(asc(cameras.id)),
  ]);
  return {
    telescopes: t.map(toTelescope),
    eyepieces: e.map(toEyepiece),
    barlows: b.map(toBarlow),
    filters: f.map(toFilter),
    cameras: c.map(toCamera),
  };
}

const MAX_ITEMS_PER_KIND = 200;

// ------------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------------

export function registerGear(app: Express) {
  app.get(
    "/api/gear",
    requireAuth,
    ah(async (req, res) => res.json(await loadGear(userId(req)))),
  );

  app.post(
    "/api/gear/:kind",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const kind = kindParam(req);
      const body = clean(parse(CREATE[kind] as z.ZodType<Record<string, unknown>>, req.body ?? {}));
      if (kind === "telescopes") checkFRatio(body as { aperture: number; focalLength: number });
      const table = TABLES[kind];
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.userId, uid));
      if (n >= MAX_ITEMS_PER_KIND) throw new HttpError(400, `You can save up to ${MAX_ITEMS_PER_KIND} ${kind}. Remove some you no longer use first.`);
      // userId always comes from the session, never from the body (the schema strips it).
      const [row] = await db
        .insert(table)
        .values({ ...(body as any), userId: uid })
        .returning();
      res.status(201).json(toApi(kind, row));
    }),
  );

  app.patch(
    "/api/gear/:kind/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const kind = kindParam(req);
      const id = idParam(req);
      const body = clean(parse(PATCH[kind] as z.ZodType<Record<string, unknown>>, req.body ?? {}));
      const table = TABLES[kind];
      const where = and(eq(table.id, id), eq(table.userId, uid));
      if (kind === "telescopes" && ("aperture" in body || "focalLength" in body)) {
        const [cur] = await db.select().from(telescopes).where(and(eq(telescopes.id, id), eq(telescopes.userId, uid)));
        if (!cur) throw new HttpError(404, `${LABEL[kind]} not found`);
        checkFRatio({ aperture: (body.aperture as number) ?? cur.aperture, focalLength: (body.focalLength as number) ?? cur.focalLength });
      }
      const [row] = await db
        .update(table)
        .set(body as any)
        .where(where)
        .returning();
      if (!row) throw new HttpError(404, `${LABEL[kind]} not found`);
      res.json(toApi(kind, row));
    }),
  );

  app.delete(
    "/api/gear/:kind/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const kind = kindParam(req);
      const id = idParam(req);
      const table = TABLES[kind];
      const col = sql.raw(OBS_COLUMN[kind]);
      try {
        await db.transaction(async (tx) => {
          const [owned] = await tx
            .select({ id: table.id })
            .from(table)
            .where(and(eq(table.id, id), eq(table.userId, uid)))
            .for("update");
          if (!owned) throw new HttpError(404, `${LABEL[kind]} not found`);

          // Keep the observing log: detach the item from this user's observations instead of blocking the delete.
          await tx.execute(sql`
            UPDATE observations SET ${col} = NULL
            WHERE ${col} = ${id}
              AND session_id IN (SELECT id FROM observation_sessions WHERE user_id = ${uid})`);
          if (kind === "cameras") {
            await tx.execute(sql`
              UPDATE observation_photos SET camera_id = NULL
              WHERE camera_id = ${id}
                AND observation_id IN (
                  SELECT o.id FROM observations o
                  JOIN observation_sessions s ON s.id = o.session_id
                  WHERE s.user_id = ${uid})`);
          }
          if (kind === "telescopes") {
            // Forget it as the default telescope (preferences JSON and the legacy column).
            await tx.execute(sql`
              UPDATE users SET preferences = preferences || '{"defaultTelescopeId": null}'::jsonb
              WHERE id = ${uid} AND preferences->>'defaultTelescopeId' = ${String(id)}`);
            await tx.execute(sql`UPDATE users SET favorite_telescope_id = NULL WHERE id = ${uid} AND favorite_telescope_id = ${id}`);
          }
          await tx.delete(table).where(and(eq(table.id, id), eq(table.userId, uid)));
        });
      } catch (e: any) {
        if (e?.code === "23503") throw new HttpError(409, `This ${LABEL[kind].toLowerCase()} is still referenced by other records, so it can't be deleted.`);
        throw e;
      }
      res.status(204).end();
    }),
  );
}
