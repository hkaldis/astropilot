/**
 * Observing journal: sessions (nights), observations, stats, CSV export and photos.
 *
 * Security: every query is scoped to the signed-in user. Ids that arrive from the client
 * (sessions, observations, photos, locations, gear) are always checked for ownership; anything
 * that doesn't belong to the caller is reported as "not found" (404) so ids can't be probed.
 */
import express, { type Express, type Request, type Response } from "express";
import crypto from "crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  observationSessions,
  observations,
  observationPhotos,
  celestialObjects,
  locations,
  telescopes,
  eyepieces,
  barlows,
  filters,
  cameras,
  watchlistItems,
  messierProgress,
  type ObservationSession,
} from "@shared/schema";
import type { ApiObservation, ApiSession, JournalStats, SessionConditions } from "@shared/api";
import { evaluateAchievements, rankFor, type MemberLike, type ObservationEvent } from "@shared/achievements";
import { SOLAR_SYSTEM } from "@shared/astro/planets";
import { MOON_IDS } from "@shared/astro/moons";
import { nightDateOf, tzOffsetHours } from "@shared/astro/night";
import { A } from "@shared/astro/core";
import { ah, parse, requireAuth, userId, idParam, HttpError, rateLimit } from "../http";
import { catalog, resolveRef, ensureObjectRow, legacyRef, type CatalogEntry } from "../catalog";
import { isValidTimeZone } from "../services/geoLookup";
import { photosEnabled } from "./features";
import { newObjectPath, photoStore } from "../photoStore";
import { sessionSecret } from "../env";

const HOUR = 3_600_000;
const SAME_NIGHT_WINDOW_H = 14;
const ESTIMATED_SESSION_H = 1.5;
const MAX_SESSION_H = 24;
const MAX_PHOTOS_PER_OBSERVATION = 12;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000;

/* ------------------------------------------------------------------------------------------ */
/* Validation                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const MAX_INT = 2_147_483_647;
const idSchema = z.number().int().positive().max(MAX_INT, "Invalid id");
const optId = idSchema.nullable().optional();
const scale = (what: string) =>
  z
    .number({ invalid_type_error: `${what} must be a number from 1 to 5` })
    .int(`${what} must be a whole number from 1 to 5`)
    .min(1, `${what} must be from 1 to 5`)
    .max(5, `${what} must be from 1 to 5`)
    .nullable()
    .optional();

const when = (label: string, maxFutureH = 36) =>
  z
    .string({ invalid_type_error: `${label} must be a date` })
    .trim()
    .min(1, `${label} is required`)
    .refine((s) => !Number.isNaN(Date.parse(s)), `${label} isn't a valid date`)
    .transform((s) => new Date(s))
    .refine((d) => d.getTime() >= Date.UTC(1950, 0, 1), `${label} is too far in the past`)
    .refine((d) => d.getTime() <= Date.now() + maxFutureH * HOUR, `${label} can't be in the future`);

const conditionsSchema = z.object({
  seeing: scale("Seeing"),
  transparency: scale("Transparency"),
  temperatureC: z.number().min(-70, "Temperature looks wrong").max(60, "Temperature looks wrong").nullable().optional(),
  forecastScore: z.number().min(0).max(100).nullable().optional(),
  moonIllumination: z.number().min(0).max(1).nullable().optional(),
  sqmReading: z.number().min(10, "SQM readings range from 10 to 23").max(23, "SQM readings range from 10 to 23").nullable().optional(),
});

/** The zone a session's times were entered in; an unknown one is dropped rather than refused. */
const zoneSchema = z
  .string()
  .trim()
  .max(64)
  .nullable()
  .optional()
  .transform((s) => (s && isValidTimeZone(s) ? s : s === undefined ? undefined : null));

const sessionFields = {
  date: when("Start time"),
  endDate: when("End time").nullable().optional(),
  locationId: optId,
  title: z.string().trim().max(120, "Keep the title under 120 characters").nullable().optional(),
  notes: z.string().max(10_000, "Notes are too long (10,000 characters max)").nullable().optional(),
  conditions: conditionsSchema.nullable().optional(),
  bortle: z.number().int().min(1, "Bortle class is 1–9").max(9, "Bortle class is 1–9").optional(),
  timezone: zoneSchema,
};
const sessionCreateSchema = z.object(sessionFields);
const sessionPatchSchema = z.object(sessionFields).partial();

const observationFields = {
  ref: z.string({ required_error: "Choose an object" }).trim().min(1, "Choose an object").max(50),
  observedAt: when("Time", 3),
  telescopeId: optId,
  eyepieceId: optId,
  barlowId: optId,
  filterId: optId,
  cameraId: optId,
  magnification: z.number().positive("Magnification must be positive").max(3000, "Magnification looks wrong").nullable().optional(),
  rating: scale("Rating"),
  seeing: scale("Seeing"),
  transparency: scale("Transparency"),
  notes: z.string().max(10_000, "Notes are too long (10,000 characters max)").nullable().optional(),
};
const observationCreateSchema = z.object({
  ...observationFields,
  observedAt: observationFields.observedAt.optional(),
  sessionId: idSchema.optional(),
  timezone: zoneSchema,
  locationId: optId,
});
const observationPatchSchema = z.object({ ...observationFields, sessionId: idSchema }).partial();

/* ------------------------------------------------------------------------------------------ */
/* Helpers                                                                                     */
/* ------------------------------------------------------------------------------------------ */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Legacy rows can hold out-of-range values; the API promises 1–5 ratings and a 1–9 Bortle class. */
const scale5 = (v: number | null | undefined) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const bortleOf = (b: number | null | undefined) => (typeof b === "number" && Number.isFinite(b) ? Math.min(9, Math.max(1, Math.round(b))) : 5);

/** Route id that also fits a Postgres integer (anything larger can't exist → 404, not a DB error). */
function pid(req: Request, name = "id"): number {
  const n = idParam(req, name);
  if (n > MAX_INT) throw new HttpError(404, "Not found.");
  return n;
}

/** `parse` for schemas whose input type differs from their output (e.g. ISO string → Date). */
function parseBody<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  return parse(schema as unknown as z.ZodType<z.output<S>>, data);
}
const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Legacy `celestial_objects.category` → AstroPilot 2 object type. */
const LEGACY_TYPE: Record<string, string> = {
  nebula: "emission_nebula",
  mixed_nebula: "emission_nebula",
};

/** Planets, the Moon and the planets' moons: refs that aren't in the deep-sky catalog. */
const SOLAR_IDS = new Set<string>([...SOLAR_SYSTEM.map((p) => p.id), ...MOON_IDS]);
const PLANET_IDS = new Set<string>(SOLAR_SYSTEM.map((p) => p.id).filter((id) => id !== "moon"));

/** Catalog lookup that also understands designations ("NGC 224" → M31) for legacy rows. */
let desigIndex: { size: number; map: Map<string, CatalogEntry> } | null = null;
function catalogEntry(ref: string | null | undefined): CatalogEntry | undefined {
  if (!ref) return undefined;
  const cat = catalog();
  const key = ref.replace(/\s+/g, "").toUpperCase();
  const direct = cat.byId.get(key);
  if (direct) return direct;
  if (!desigIndex || desigIndex.size !== cat.list.length) {
    const map = new Map<string, CatalogEntry>();
    for (const o of cat.list) {
      const ds = Array.isArray(o.designations) ? (o.designations as string[]) : [];
      for (const d of ds) if (typeof d === "string") map.set(d.replace(/\s+/g, "").toUpperCase(), o);
      if (o.m) map.set(`M${o.m}`, o);
      if (o.c) map.set(`C${o.c}`, o);
    }
    desigIndex = { size: cat.list.length, map };
  }
  return desigIndex.map.get(key);
}

interface ObjectInfo {
  ref: string | null;
  name: string;
  type: string | null;
}

/** Resolve what an observation is of, for new rows (catalog_ref) and legacy rows (celestial_objects). */
function describeObject(catalogRef: string | null, legacy: { catalogId: string | null; name: string | null; category: string | null }): ObjectInfo {
  for (const candidate of [catalogRef, legacyRef(legacy.catalogId)]) {
    if (!candidate) continue;
    const r = resolveRef(candidate);
    if (r) return { ref: r.ref, name: r.name, type: r.type };
    const e = catalogEntry(candidate);
    if (e) return { ref: e.id, name: e.name, type: e.type };
  }
  const type = legacy.category ? (LEGACY_TYPE[legacy.category] ?? legacy.category) : null;
  return { ref: catalogRef, name: legacy.name ?? catalogRef ?? "Unknown object", type };
}

/** Key that identifies "the same object" across new and legacy rows. */
const objectKey = (info: ObjectInfo, objectId: number) => (info.ref ? info.ref.toUpperCase() : `obj:${objectId}`);

/**
 * The night an instant belongs to, as the date of the evening (YYYY-MM-DD). Anchored to local
 * solar time at the site when we know its longitude (anything before local noon counts towards
 * the previous evening), else to the site's time zone, else UTC.
 */
/**
 * Intl formatters are expensive to build (tens of µs each); stats and the CSV export format one
 * date per row, so reuse them per zone (null = invalid zone). Bounded by the number of IANA zones.
 */
const formatters = new Map<string, Intl.DateTimeFormat | null>();
function formatterFor(tz: string, withTime: boolean): Intl.DateTimeFormat | null {
  const key = `${withTime ? "t" : "d"}|${tz}`;
  let f = formatters.get(key);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
      });
    } catch {
      f = null;
    }
    if (formatters.size < 2000) formatters.set(key, f);
  }
  return f;
}

function nightKey(ms: number, lon: number | null | undefined, tz: string | null | undefined): string {
  const t = ms - 12 * HOUR;
  if (lon !== null && lon !== undefined && Number.isFinite(lon)) return nightDateOf(ms, { lat: 0, lon, timezone: tz });
  const f = tz ? formatterFor(tz, false) : null; // invalid zone: fall through to UTC
  if (f) return f.format(t);
  return new Date(t).toISOString().slice(0, 10);
}

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000);

/** Session conditions; legacy rows only had flat columns (seeing 0–3, moon illumination in %). */
function sessionConditions(s: ObservationSession): SessionConditions | null {
  const c = (s.conditions && typeof s.conditions === "object" ? s.conditions : {}) as SessionConditions;
  const out: SessionConditions = { ...c };
  if (out.seeing == null && s.seeing != null && s.seeing >= 0 && s.seeing <= 3) out.seeing = s.seeing + 2;
  if (out.moonIllumination == null && s.moonIllumination != null) out.moonIllumination = Math.max(0, Math.min(1, s.moonIllumination / 100));
  const clean = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null && v !== undefined)) as SessionConditions;
  return Object.keys(clean).length ? clean : null;
}

function toApiSession(s: ObservationSession, locationName: string | null, observationCount: number): ApiSession {
  return {
    id: s.id,
    title: s.title,
    date: s.date.toISOString(),
    endDate: iso(s.endDate),
    locationId: s.locationId,
    locationName,
    bortle: bortleOf(s.bortle),
    notes: s.notes,
    conditions: sessionConditions(s),
    timezone: s.timezone ?? null,
    observationCount,
  };
}

/**
 * Public URL for a stored photo. New and legacy rows store "/objects/<path>"; other legacy values
 * are passed through only when they are plain http(s) URLs (never e.g. `javascript:`).
 */
function photoUrl(imageUrl: string): string | null {
  if (imageUrl.startsWith("/objects/")) return `/api/photos/${imageUrl.slice("/objects/".length)}`;
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : null;
}

function moonIlluminationAt(d: Date): number | null {
  try {
    return Math.round(A.Illumination(A.Body.Moon, d).phase_fraction * 100) / 100;
  } catch {
    return null;
  }
}

function checkRange(start: Date, end: Date | null | undefined) {
  if (!end) return;
  if (end.getTime() <= start.getTime()) throw new HttpError(400, "The end time must be after the start time.");
  if (end.getTime() - start.getTime() > MAX_SESSION_H * HOUR) throw new HttpError(400, "A session can't be longer than 24 hours — split it into separate nights.");
}

/**
 * Widen a session's time range to include an observation at `at` (never beyond one night).
 * Returns the session columns to update.
 */
function fitSessionTo(session: ObservationSession, at: Date): Partial<typeof observationSessions.$inferInsert> {
  const start = Math.min(session.date.getTime(), at.getTime());
  const end = Math.max(session.endDate?.getTime() ?? 0, at.getTime(), session.date.getTime());
  if (end - start > MAX_SESSION_H * HOUR) {
    throw new HttpError(400, "That time is outside this session's night. Pick a time during the session, or log it without choosing a session.");
  }
  const patch: Partial<typeof observationSessions.$inferInsert> = {};
  if (at < session.date) patch.date = at;
  if (session.endDate && at > session.endDate) patch.endDate = at;
  return patch;
}

/* ------------------------------------------------------------------------------------------ */
/* Ownership checks                                                                            */
/* ------------------------------------------------------------------------------------------ */

async function ownedSession(uid: string, id: number) {
  const [s] = await db
    .select()
    .from(observationSessions)
    .where(and(eq(observationSessions.id, id), eq(observationSessions.userId, uid)));
  if (!s) throw new HttpError(404, "Session not found.");
  return s;
}

async function ownedLocation(uid: string, id: number) {
  const [l] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.userId, uid)));
  if (!l) throw new HttpError(404, "Location not found in your saved locations.");
  return l;
}

async function ownedObservation(uid: string, id: number) {
  const [row] = await db
    .select({ o: observations, s: observationSessions })
    .from(observations)
    .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
    .where(and(eq(observations.id, id), eq(observationSessions.userId, uid)));
  if (!row) throw new HttpError(404, "Observation not found.");
  return row;
}

interface GearIds {
  telescopeId?: number | null;
  eyepieceId?: number | null;
  barlowId?: number | null;
  filterId?: number | null;
  cameraId?: number | null;
}

/** Verify every referenced gear item belongs to the user; returns the optics for magnification. */
async function checkGear(uid: string, g: GearIds) {
  const missing = (what: string) => {
    throw new HttpError(404, `That ${what} isn't in your gear.`);
  };
  const [t, e, b] = await Promise.all([
    g.telescopeId
      ? db.select().from(telescopes).where(and(eq(telescopes.id, g.telescopeId), eq(telescopes.userId, uid))).then((r) => r[0] ?? missing("telescope"))
      : null,
    g.eyepieceId
      ? db.select().from(eyepieces).where(and(eq(eyepieces.id, g.eyepieceId), eq(eyepieces.userId, uid))).then((r) => r[0] ?? missing("eyepiece"))
      : null,
    g.barlowId
      ? db.select().from(barlows).where(and(eq(barlows.id, g.barlowId), eq(barlows.userId, uid))).then((r) => r[0] ?? missing("Barlow"))
      : null,
    g.filterId
      ? db.select({ id: filters.id }).from(filters).where(and(eq(filters.id, g.filterId), eq(filters.userId, uid))).then((r) => r[0] ?? missing("filter"))
      : null,
    g.cameraId
      ? db.select({ id: cameras.id }).from(cameras).where(and(eq(cameras.id, g.cameraId), eq(cameras.userId, uid))).then((r) => r[0] ?? missing("camera"))
      : null,
  ]);
  return { telescope: t || null, eyepiece: e || null, barlow: b || null };
}

/** Magnification and exit pupil from the actual optics, when a telescope and eyepiece are known. */
function optics(g: Awaited<ReturnType<typeof checkGear>>) {
  if (!g.telescope || !g.eyepiece || !(g.eyepiece.focalLength > 0)) return null;
  const mag = (g.telescope.focalLength * (g.barlow?.factor ?? 1)) / g.eyepiece.focalLength;
  return { magnification: Math.round(mag * 10) / 10, exitPupil: Math.round((g.telescope.aperture / mag) * 100) / 100 };
}

/* ------------------------------------------------------------------------------------------ */
/* Loading                                                                                     */
/* ------------------------------------------------------------------------------------------ */

async function loadObservations(uid: string, where: SQL | undefined): Promise<ApiObservation[]> {
  const rows = await db
    .select({
      o: observations,
      catalogId: celestialObjects.catalogId,
      name: celestialObjects.name,
      category: celestialObjects.category,
    })
    .from(observations)
    .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
    .leftJoin(celestialObjects, eq(celestialObjects.id, observations.objectId))
    .where(and(eq(observationSessions.userId, uid), where))
    .orderBy(asc(sql`coalesce(${observations.observedAt}, ${observations.createdAt})`), asc(observations.id));
  const ids = rows.map((r) => r.o.id);
  const photos = ids.length
    ? await db
        .select({ id: observationPhotos.id, observationId: observationPhotos.observationId, imageUrl: observationPhotos.imageUrl })
        .from(observationPhotos)
        .where(inArray(observationPhotos.observationId, ids))
        .orderBy(asc(observationPhotos.id))
    : [];
  const byObs = new Map<number, { id: number; url: string }[]>();
  for (const p of photos) {
    const url = photoUrl(p.imageUrl);
    if (!url) continue;
    const list = byObs.get(p.observationId) ?? [];
    list.push({ id: p.id, url });
    byObs.set(p.observationId, list);
  }
  return rows.map(({ o, catalogId, name, category }) => {
    const info = describeObject(o.catalogRef, { catalogId, name, category });
    return {
      id: o.id,
      sessionId: o.sessionId,
      ref: info.ref,
      objectName: info.name,
      objectType: info.type,
      observedAt: iso(o.observedAt),
      telescopeId: o.telescopeId,
      eyepieceId: o.eyepieceId,
      barlowId: o.barlowId,
      filterId: o.filterId,
      cameraId: o.cameraId,
      magnification: o.magnification,
      rating: scale5(o.visibilityRating),
      seeing: scale5(o.seeing),
      transparency: scale5(o.transparency),
      notes: o.notes,
      photos: byObs.get(o.id) ?? [],
      createdAt: iso(o.createdAt),
    };
  });
}

async function listSessions(uid: string): Promise<ApiSession[]> {
  // One query: sessions + location name + grouped observation counts (no N+1).
  const rows = await db
    .select({
      s: observationSessions,
      locationName: locations.name,
      count: sql<number>`count(${observations.id})::int`,
    })
    .from(observationSessions)
    .leftJoin(locations, and(eq(locations.id, observationSessions.locationId), eq(locations.userId, uid)))
    .leftJoin(observations, eq(observations.sessionId, observationSessions.id))
    .where(eq(observationSessions.userId, uid))
    .groupBy(observationSessions.id, locations.name)
    .orderBy(desc(observationSessions.date), desc(observationSessions.id));
  return rows.map((r) => toApiSession(r.s, r.locationName, Number(r.count) || 0));
}

async function loadSession(uid: string, id: number): Promise<ApiSession> {
  const [row] = await db
    .select({ s: observationSessions, locationName: locations.name })
    .from(observationSessions)
    .leftJoin(locations, and(eq(locations.id, observationSessions.locationId), eq(locations.userId, uid)))
    .where(and(eq(observationSessions.id, id), eq(observationSessions.userId, uid)));
  if (!row) throw new HttpError(404, "Session not found.");
  const obs = await loadObservations(uid, eq(observations.sessionId, id));
  return { ...toApiSession(row.s, row.locationName, obs.length), observations: obs };
}

/* ------------------------------------------------------------------------------------------ */
/* Stats                                                                                       */
/* ------------------------------------------------------------------------------------------ */

async function computeStats(uid: string): Promise<JournalStats> {
  const [sessionRows, obsRows, photoRows] = await Promise.all([
    db
      .select({
        id: observationSessions.id,
        date: observationSessions.date,
        endDate: observationSessions.endDate,
        bortle: observationSessions.bortle,
        lat: locations.latitude,
        lon: locations.longitude,
        // No location: the zone the session was logged in (as the app shows it), never the server's.
        tz: sql<string | null>`coalesce(${locations.timezone}, ${observationSessions.timezone})`,
      })
      .from(observationSessions)
      .leftJoin(locations, and(eq(locations.id, observationSessions.locationId), eq(locations.userId, uid)))
      .where(eq(observationSessions.userId, uid)),
    db
      .select({
        id: observations.id,
        sessionId: observations.sessionId,
        objectId: observations.objectId,
        catalogRef: observations.catalogRef,
        observedAt: observations.observedAt,
        notes: observations.notes,
        catalogId: celestialObjects.catalogId,
        name: celestialObjects.name,
        category: celestialObjects.category,
        scopeType: telescopes.type,
        scopeName: telescopes.name,
      })
      .from(observations)
      .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
      .leftJoin(celestialObjects, eq(celestialObjects.id, observations.objectId))
      .leftJoin(telescopes, and(eq(telescopes.id, observations.telescopeId), eq(telescopes.userId, uid)))
      .where(eq(observationSessions.userId, uid)),
    db
      .select({ observationId: observationPhotos.observationId, n: sql<number>`count(*)` })
      .from(observationPhotos)
      .innerJoin(observations, eq(observations.id, observationPhotos.observationId))
      .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
      .where(eq(observationSessions.userId, uid))
      .groupBy(observationPhotos.observationId),
  ]);
  const withPhotos = new Set(photoRows.filter((r) => Number(r.n) > 0).map((r) => r.observationId));

  const sessionsById = new Map(sessionRows.map((s) => [s.id, s]));
  const nights = new Set<string>();
  for (const s of sessionRows) nights.add(nightKey(s.date.getTime(), s.lon, s.tz));

  // Per-session observation time span (for sessions without an explicit end time).
  const span = new Map<number, { min: number; max: number }>();
  const seen = new Map<string, ObjectInfo>();
  const months = new Map<string, number>();
  const events: ObservationEvent[] = [];
  for (const o of obsRows) {
    const s = sessionsById.get(o.sessionId);
    const t = (o.observedAt ?? s?.date)?.getTime();
    const info = describeObject(o.catalogRef, { catalogId: o.catalogId, name: o.name, category: o.category });
    const key = objectKey(info, o.objectId);
    if (!seen.has(key)) seen.set(key, info);
    if (t === undefined) continue;
    const sp = span.get(o.sessionId);
    if (!sp) span.set(o.sessionId, { min: t, max: t });
    else {
      sp.min = Math.min(sp.min, t);
      sp.max = Math.max(sp.max, t);
    }
    const night = nightKey(t, s?.lon, s?.tz);
    months.set(night.slice(0, 7), (months.get(night.slice(0, 7)) ?? 0) + 1);
    const e = info.ref && !SOLAR_IDS.has(info.ref.toLowerCase()) ? catalogEntry(info.ref) : undefined;
    const scope = `${o.scopeType ?? ""} ${o.scopeName ?? ""}`;
    events.push({
      t,
      sessionId: o.sessionId,
      night,
      key,
      ref: info.ref,
      type: info.type,
      m: e?.m,
      c: e?.c,
      showpiece: e?.showpiece === true,
      con: e?.con,
      mag: e?.mag,
      sep: typeof e?.sep === "number" ? e.sep : undefined,
      dec: e?.dec,
      bortle: s?.bortle ?? null,
      siteLat: s?.lat ?? null,
      instrument: o.scopeType === null && o.scopeName === null ? null : /bino|\d+\s*[x×]\s*\d+/i.test(scope) ? "binoculars" : "telescope",
      notes: !!o.notes && o.notes.trim().length > 0,
      photos: withPhotos.has(o.id),
      sessionHours: s?.endDate && s.endDate > s.date ? (s.endDate.getTime() - s.date.getTime()) / HOUR : null,
    });
  }

  let hours = 0;
  for (const s of sessionRows) {
    let h: number;
    if (s.endDate && s.endDate > s.date) h = (s.endDate.getTime() - s.date.getTime()) / HOUR;
    else {
      const sp = span.get(s.id);
      h = Math.max(ESTIMATED_SESSION_H, sp ? (sp.max - sp.min) / HOUR : 0);
    }
    hours += Math.min(h, MAX_SESSION_H);
  }

  // Longest run of consecutive nights.
  const days = Array.from(nights).map(dayNumber).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const byType: Record<string, number> = {};
  const refs: string[] = [];
  const messier = new Set<number>();
  const caldwell = new Set<number>();
  const planets: string[] = [];
  for (const info of Array.from(seen.values())) {
    const type = info.type ?? "other";
    byType[type] = (byType[type] ?? 0) + 1;
    if (!info.ref) continue;
    refs.push(info.ref);
    const lower = info.ref.toLowerCase();
    if (SOLAR_IDS.has(lower)) {
      if (PLANET_IDS.has(lower)) planets.push(lower);
      continue;
    }
    const e = catalogEntry(info.ref);
    const m = e?.m ?? (/^M(\d{1,3})$/i.exec(info.ref) ? Number(info.ref.slice(1)) : undefined);
    const c = e?.c ?? (/^C(\d{1,3})$/i.exec(info.ref) ? Number(info.ref.slice(1)) : undefined);
    if (m && m >= 1 && m <= 110) messier.add(m);
    if (c && c >= 1 && c <= 109) caldwell.add(c);
  }

  const now = new Date();
  const perMonth: JournalStats["perMonth"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = d.toISOString().slice(0, 7);
    perMonth.push({ month, observations: months.get(month) ?? 0 });
  }

  const dates = sessionRows.map((s) => s.date.getTime());
  const planetOrder = SOLAR_SYSTEM.map((p) => p.id as string);
  return {
    sessions: sessionRows.length,
    observations: obsRows.length,
    uniqueObjects: seen.size,
    hoursObserved: Math.round(hours * 10) / 10,
    firstSession: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    lastSession: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    longestStreakNights: longest,
    byType,
    observedRefs: refs.sort(),
    messierSeen: Array.from(messier).sort((a, b) => a - b),
    caldwellSeen: Array.from(caldwell).sort((a, b) => a - b),
    planetsSeen: planets.sort((a, b) => planetOrder.indexOf(a) - planetOrder.indexOf(b)),
    perMonth,
    achievements: evaluateAchievements(events, catalog().list as unknown as MemberLike[]),
    rank: rankFor(seen.size),
  };
}

/** 1 January 00:00 of the current year in `tz` (UTC when unknown). */
function yearStartIn(tz: string | null | undefined, now = Date.now()): Date {
  const off = (ms: number) => (tz ? (tzOffsetHours(tz, ms) ?? 0) : 0) * HOUR;
  const y = new Date(now + off(now)).getUTCFullYear();
  const guess = Date.UTC(y, 0, 1);
  return new Date(guess - off(guess - off(guess)));
}

/** Distinct objects logged this calendar year (in the logger's zone), and whether `objectId` is new for the user. */
async function loggingSummary(uid: string, objectId: number, ref: string, newObservationId: number, tz?: string | null) {
  const yearStart = yearStartIn(tz).toISOString();
  const [row] = await db
    .select({
      year: sql<number>`count(distinct upper(coalesce(${observations.catalogRef}, ${celestialObjects.catalogId}, ${observations.objectId}::text))) filter (where coalesce(${observations.observedAt}, ${observationSessions.date}) >= ${yearStart}::timestamp)`,
      before: sql<number>`count(*) filter (where (${observations.objectId} = ${objectId} or upper(${observations.catalogRef}) = upper(${ref})) and ${observations.id} <> ${newObservationId})`,
    })
    .from(observations)
    .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
    .leftJoin(celestialObjects, eq(celestialObjects.id, observations.objectId))
    .where(eq(observationSessions.userId, uid));
  return { objectsThisYear: Number(row?.year ?? 0), firstTime: Number(row?.before ?? 0) === 0 };
}

/* ------------------------------------------------------------------------------------------ */
/* Deletion side effects                                                                       */
/* ------------------------------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Unlink rows in other tables that point at observations we're about to delete. */
async function detachObservations(tx: Tx, observationIds: number[]) {
  if (!observationIds.length) return [] as string[];
  await tx.update(watchlistItems).set({ observationId: null }).where(inArray(watchlistItems.observationId, observationIds));
  const photos = await tx
    .select({ imageUrl: observationPhotos.imageUrl })
    .from(observationPhotos)
    .where(inArray(observationPhotos.observationId, observationIds));
  return photos.map((p) => p.imageUrl);
}

/** Remove stored photo files after their rows are gone (best effort; never fails the request). */
export function deleteStoredPhotos(imageUrls: string[]) {
  const paths = imageUrls.filter((u) => u.startsWith("/objects/"));
  if (!paths.length || !photosEnabled()) return;
  void (async () => {
    try {
      const store = photoStore();
      for (const p of paths) {
        // Only delete when no other photo row still references the same object.
        const [still] = await db.select({ id: observationPhotos.id }).from(observationPhotos).where(eq(observationPhotos.imageUrl, p)).limit(1);
        if (!still) await store.delete(p).catch(() => undefined);
      }
    } catch (e: any) {
      console.warn("[journal] photo cleanup failed:", e?.message ?? e);
    }
  })();
}

/* ------------------------------------------------------------------------------------------ */
/* Photos                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function photoStorage() {
  if (!photosEnabled()) throw new HttpError(404, "Photo uploads aren't available on this server.");
  return photoStore();
}

interface UploadClaim {
  u: string; // user id
  o: number; // observation id
  p: string; // object path ("/objects/users/<uid>/<uuid>")
  e: number; // expiry (ms)
}

const tokenSecret = () => sessionSecret;

function signUpload(claim: UploadClaim): string {
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(`photo-upload.${body}`).digest("base64url");
  return `${body}.${sig}`;
}

function verifyUpload(token: string): UploadClaim | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", tokenSecret()).update(`photo-upload.${body}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadClaim;
    if (typeof claim.u !== "string" || typeof claim.o !== "number" || typeof claim.p !== "string" || typeof claim.e !== "number") return null;
    return claim;
  } catch {
    return null;
  }
}

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i; // types browsers can display

/** Serve a stored photo to its owner. Responds 404 for anything else (no existence leaks). */
async function servePhoto(req: Request, res: Response, rest: string) {
  if (!photosEnabled()) throw new HttpError(404, "Not found");
  const uid = userId(req);
  const objectPath = `/objects/${rest}`;
  const store = photoStorage();
  if (!(await store.stat(objectPath).catch(() => null))) throw new HttpError(404, "Photo not found.");
  // Owner per the storage's ACL (Replit), or per the photo row in the DB.
  let allowed = (await store.ownerOf?.(objectPath).catch(() => null)) === uid;
  if (!allowed) {
    const [row] = await db
      .select({ id: observationPhotos.id })
      .from(observationPhotos)
      .innerJoin(observations, eq(observations.id, observationPhotos.observationId))
      .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
      .where(and(eq(observationSessions.userId, uid), eq(observationPhotos.imageUrl, objectPath)))
      .limit(1);
    allowed = !!row;
  }
  if (!allowed) throw new HttpError(404, "Photo not found.");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("Content-Disposition", "inline");
  await store.send(objectPath, res, 86_400);
}

/* ------------------------------------------------------------------------------------------ */
/* CSV                                                                                         */
/* ------------------------------------------------------------------------------------------ */

function csvCell(v: unknown, freeText = false): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralise spreadsheet formulas in user-written text.
  if (freeText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localParts(ms: number, tz: string | null) {
  const f = tz ? formatterFor(tz, true) : null;
  if (f && tz) {
    const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, tz };
  }
  const d = new Date(ms).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16), tz: "UTC" };
}

/* ------------------------------------------------------------------------------------------ */
/* Routes                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export function registerJournal(app: Express) {
  const writeLimit = rateLimit({ windowMs: 60_000, max: 120, message: "You're logging very fast — please wait a moment." });
  const uploadLimit = rateLimit({ windowMs: 60_000, max: 30, message: "Too many uploads at once — please wait a moment." });

  /* ---------------- Sessions ---------------- */

  app.get(
    "/api/journal/sessions",
    requireAuth,
    ah(async (req, res) => res.json(await listSessions(userId(req)))),
  );

  app.get(
    "/api/journal/sessions/:id",
    requireAuth,
    ah(async (req, res) => res.json(await loadSession(userId(req), pid(req)))),
  );

  app.post(
    "/api/journal/sessions",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const body = parseBody(sessionCreateSchema, req.body);
      checkRange(body.date, body.endDate);
      const loc = body.locationId ? await ownedLocation(uid, body.locationId) : null;
      const conditions: SessionConditions = { ...(body.conditions ?? {}) };
      if (conditions.moonIllumination == null) conditions.moonIllumination = moonIlluminationAt(body.date);
      const [s] = await db
        .insert(observationSessions)
        .values({
          userId: uid,
          locationId: loc?.id ?? null,
          date: body.date,
          endDate: body.endDate ?? null,
          bortle: body.bortle ?? loc?.bortle ?? 5,
          title: blank(body.title),
          notes: blank(body.notes),
          conditions,
          timezone: body.timezone ?? null,
        })
        .returning();
      res.status(201).json(await loadSession(uid, s.id));
    }),
  );

  app.patch(
    "/api/journal/sessions/:id",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const body = parseBody(sessionPatchSchema, req.body);
      const current = await ownedSession(uid, id);
      const patch: Partial<typeof observationSessions.$inferInsert> = {};
      if (body.date !== undefined) patch.date = body.date;
      if (body.endDate !== undefined) patch.endDate = body.endDate;
      checkRange(patch.date ?? current.date, body.endDate !== undefined ? body.endDate : current.endDate);
      if (body.title !== undefined) patch.title = blank(body.title);
      if (body.notes !== undefined) patch.notes = blank(body.notes);
      if (body.locationId !== undefined) {
        if (body.locationId === null) patch.locationId = null;
        else {
          const loc = await ownedLocation(uid, body.locationId);
          patch.locationId = loc.id;
          if (body.bortle === undefined && loc.id !== current.locationId) patch.bortle = loc.bortle;
        }
      }
      if (body.bortle !== undefined) patch.bortle = body.bortle;
      if (body.timezone) patch.timezone = body.timezone;
      if (body.conditions !== undefined) {
        // Merge so a partial update (e.g. just seeing) keeps the rest of the snapshot.
        const merged = { ...(sessionConditions(current) ?? {}), ...(body.conditions ?? {}) } as Record<string, unknown>;
        patch.conditions = body.conditions === null ? null : Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null && v !== undefined));
      }
      if (Object.keys(patch).length) {
        await db
          .update(observationSessions)
          .set(patch)
          .where(and(eq(observationSessions.id, id), eq(observationSessions.userId, uid)));
      }
      res.json(await loadSession(uid, id));
    }),
  );

  app.delete(
    "/api/journal/sessions/:id",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const imageUrls = await db.transaction(async (tx) => {
        const [s] = await tx
          .select({ id: observationSessions.id })
          .from(observationSessions)
          .where(and(eq(observationSessions.id, id), eq(observationSessions.userId, uid)));
        if (!s) throw new HttpError(404, "Session not found.");
        const obs = await tx.select({ id: observations.id }).from(observations).where(eq(observations.sessionId, id));
        const urls = await detachObservations(
          tx,
          obs.map((o) => o.id),
        );
        // Any row still pointing at this session (the FK has no ON DELETE action) must let go of it.
        await tx.update(messierProgress).set({ bestSessionId: null }).where(eq(messierProgress.bestSessionId, id));
        // observations (and their photo rows) cascade with the session
        await tx.delete(observationSessions).where(and(eq(observationSessions.id, id), eq(observationSessions.userId, uid)));
        return urls;
      });
      deleteStoredPhotos(imageUrls);
      res.json({ ok: true });
    }),
  );

  /* ---------------- Observations ---------------- */

  app.post(
    "/api/journal/observations",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const body = parseBody(observationCreateSchema, req.body);
      const at = body.observedAt ?? new Date();
      const target = resolveRef(body.ref) ?? (catalogEntry(body.ref) ? resolveRef(catalogEntry(body.ref)!.id) : null);
      if (!target) throw new HttpError(400, `We couldn't find "${body.ref}" in the catalog.`);
      const [gear, loc] = await Promise.all([
        checkGear(uid, body),
        body.sessionId || !body.locationId ? Promise.resolve(null) : ownedLocation(uid, body.locationId),
      ]);
      const objectId = await ensureObjectRow(target.ref);
      const op = optics(gear);
      const magnification = body.magnification !== undefined && body.magnification !== null ? body.magnification : (op?.magnification ?? null);
      const exitPupil = gear.telescope && magnification ? Math.round((gear.telescope.aperture / magnification) * 100) / 100 : null;

      const { observationId, sessionId } = await db.transaction(async (tx) => {
        // Serialise find-or-create per user so two quick logs can't open two sessions.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${uid}))`);
        let session: ObservationSession | undefined;
        if (body.sessionId) {
          [session] = await tx
            .select()
            .from(observationSessions)
            .where(and(eq(observationSessions.id, body.sessionId), eq(observationSessions.userId, uid)));
          if (!session) throw new HttpError(404, "Session not found.");
        } else {
          // The user's session for the same night at this place: started within the last ~14 h.
          const candidates = await tx
            .select()
            .from(observationSessions)
            .where(
              and(
                eq(observationSessions.userId, uid),
                loc ? eq(observationSessions.locationId, loc.id) : isNull(observationSessions.locationId),
                gte(observationSessions.date, new Date(at.getTime() - SAME_NIGHT_WINDOW_H * HOUR)),
                lte(observationSessions.date, new Date(at.getTime() + HOUR)),
              ),
            )
            .orderBy(desc(observationSessions.date))
            .limit(5);
          // The same night: by the place's longitude and zone, or with no location by the zone it's logged in
          // (so a dawn session and the next evening's stay apart).
          const lon = loc?.longitude ?? null;
          const zoneOf = (c?: ObservationSession) => loc?.timezone ?? c?.timezone ?? body.timezone ?? null;
          const night = lon !== null || zoneOf() ? nightKey(at.getTime(), lon, zoneOf()) : null;
          session = candidates.find((c) => !night || nightKey(c.date.getTime(), lon, zoneOf(c)) === night);
          if (!session) {
            const conditions: SessionConditions = { moonIllumination: moonIlluminationAt(at) };
            [session] = await tx
              .insert(observationSessions)
              .values({ userId: uid, locationId: loc?.id ?? null, date: at, bortle: loc?.bortle ?? 5, conditions, timezone: body.timezone ?? null })
              .returning();
          }
        }
        const [created] = await tx
          .insert(observations)
          .values({
            sessionId: session.id,
            objectId,
            catalogRef: target.ref,
            observedAt: at,
            telescopeId: body.telescopeId ?? null,
            eyepieceId: body.eyepieceId ?? null,
            barlowId: body.barlowId ?? null,
            filterId: body.filterId ?? null,
            cameraId: body.cameraId ?? null,
            magnification,
            exitPupil,
            visibilityRating: body.rating ?? null,
            seeing: body.seeing ?? null,
            transparency: body.transparency ?? null,
            notes: blank(body.notes),
          })
          .returning({ id: observations.id });
        // Keep the session's time range and conditions in step with what was logged.
        const patch = fitSessionTo(session, at);
        const cond = sessionConditions(session) ?? {};
        if ((body.seeing && cond.seeing == null) || (body.transparency && cond.transparency == null)) {
          patch.conditions = {
            ...cond,
            ...(body.seeing && cond.seeing == null ? { seeing: body.seeing } : {}),
            ...(body.transparency && cond.transparency == null ? { transparency: body.transparency } : {}),
          };
        }
        if (Object.keys(patch).length) await tx.update(observationSessions).set(patch).where(eq(observationSessions.id, session.id));
        return { observationId: created.id, sessionId: session.id };
      });

      const [observation] = await loadObservations(uid, eq(observations.id, observationId));
      const [sessions, summary] = await Promise.all([
        db
          .select({ s: observationSessions, locationName: locations.name, count: sql<number>`(select count(*)::int from ${observations} where ${observations.sessionId} = ${observationSessions.id})` })
          .from(observationSessions)
          .leftJoin(locations, and(eq(locations.id, observationSessions.locationId), eq(locations.userId, uid)))
          .where(and(eq(observationSessions.id, sessionId), eq(observationSessions.userId, uid))),
        loggingSummary(uid, objectId, target.ref, observationId, body.timezone),
      ]);
      const s = sessions[0];
      res.status(201).json({
        observation,
        session: s ? toApiSession(s.s, s.locationName, Number(s.count) || 0) : null,
        ...summary,
      });
    }),
  );

  app.patch(
    "/api/journal/observations/:id",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const body = parseBody(observationPatchSchema, req.body);
      const { o: current, s: currentSession } = await ownedObservation(uid, id);
      const patch: Partial<typeof observations.$inferInsert> = {};

      let session = currentSession;
      if (body.sessionId !== undefined && body.sessionId !== current.sessionId) {
        session = await ownedSession(uid, body.sessionId);
        patch.sessionId = session.id;
      }
      const time = body.observedAt ?? current.observedAt;
      const sessionPatch = time && (body.observedAt !== undefined || patch.sessionId) ? fitSessionTo(session, time) : {};
      if (body.ref !== undefined) {
        const target = resolveRef(body.ref) ?? (catalogEntry(body.ref) ? resolveRef(catalogEntry(body.ref)!.id) : null);
        if (!target) throw new HttpError(400, `We couldn't find "${body.ref}" in the catalog.`);
        patch.objectId = await ensureObjectRow(target.ref);
        patch.catalogRef = target.ref;
      }
      if (body.observedAt !== undefined) patch.observedAt = body.observedAt;

      const gearKeys = ["telescopeId", "eyepieceId", "barlowId", "filterId", "cameraId"] as const;
      const gearTouched = gearKeys.some((k) => body[k] !== undefined);
      if (gearTouched || body.magnification !== undefined) {
        const merged: GearIds = Object.fromEntries(gearKeys.map((k) => [k, body[k] !== undefined ? body[k] : current[k]]));
        const gear = await checkGear(uid, merged);
        for (const k of gearKeys) if (body[k] !== undefined) patch[k] = body[k] ?? null;
        const op = optics(gear);
        const magnification = body.magnification !== undefined ? body.magnification : gearTouched ? (op?.magnification ?? null) : current.magnification;
        patch.magnification = magnification ?? null;
        patch.exitPupil = gear.telescope && magnification ? Math.round((gear.telescope.aperture / magnification) * 100) / 100 : null;
      }
      if (body.rating !== undefined) patch.visibilityRating = body.rating;
      if (body.seeing !== undefined) patch.seeing = body.seeing;
      if (body.transparency !== undefined) patch.transparency = body.transparency;
      if (body.notes !== undefined) patch.notes = blank(body.notes);

      if (Object.keys(patch).length) {
        // Ownership was verified above; the sub-select re-checks it inside the UPDATE itself.
        await db
          .update(observations)
          .set(patch)
          .where(
            and(
              eq(observations.id, id),
              inArray(observations.sessionId, db.select({ id: observationSessions.id }).from(observationSessions).where(eq(observationSessions.userId, uid))),
            ),
          );
      }
      if (Object.keys(sessionPatch).length) {
        await db
          .update(observationSessions)
          .set(sessionPatch)
          .where(and(eq(observationSessions.id, session.id), eq(observationSessions.userId, uid)));
      }
      const [observation] = await loadObservations(uid, eq(observations.id, id));
      res.json(observation);
    }),
  );

  app.delete(
    "/api/journal/observations/:id",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const imageUrls = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ id: observations.id })
          .from(observations)
          .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
          .where(and(eq(observations.id, id), eq(observationSessions.userId, uid)));
        if (!row) throw new HttpError(404, "Observation not found.");
        const urls = await detachObservations(tx, [id]);
        await tx.delete(observations).where(eq(observations.id, row.id));
        return urls;
      });
      deleteStoredPhotos(imageUrls);
      res.json({ ok: true });
    }),
  );

  /* ---------------- Stats & export ---------------- */

  app.get(
    "/api/journal/stats",
    requireAuth,
    ah(async (req, res) => res.json(await computeStats(userId(req)))),
  );

  app.get(
    "/api/journal/export.csv",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const rows = await db
        .select({
          o: observations,
          sessionDate: observationSessions.date,
          sessionTitle: observationSessions.title,
          bortle: observationSessions.bortle,
          locationName: locations.name,
          lon: locations.longitude,
          tz: sql<string | null>`coalesce(${locations.timezone}, ${observationSessions.timezone})`,
          catalogId: celestialObjects.catalogId,
          objectName: celestialObjects.name,
          category: celestialObjects.category,
          telescope: telescopes.name,
          eyepiece: eyepieces.name,
          barlow: barlows.name,
          filter: filters.name,
          camera: cameras.name,
        })
        .from(observations)
        .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
        .leftJoin(locations, and(eq(locations.id, observationSessions.locationId), eq(locations.userId, uid)))
        .leftJoin(celestialObjects, eq(celestialObjects.id, observations.objectId))
        .leftJoin(telescopes, and(eq(telescopes.id, observations.telescopeId), eq(telescopes.userId, uid)))
        .leftJoin(eyepieces, and(eq(eyepieces.id, observations.eyepieceId), eq(eyepieces.userId, uid)))
        .leftJoin(barlows, and(eq(barlows.id, observations.barlowId), eq(barlows.userId, uid)))
        .leftJoin(filters, and(eq(filters.id, observations.filterId), eq(filters.userId, uid)))
        .leftJoin(cameras, and(eq(cameras.id, observations.cameraId), eq(cameras.userId, uid)))
        .where(eq(observationSessions.userId, uid))
        .orderBy(asc(sql`coalesce(${observations.observedAt}, ${observationSessions.date})`), asc(observations.id));

      const header = [
        "Night of",
        "Local date",
        "Local time",
        "Time zone",
        "UTC time",
        "Object",
        "Name",
        "Type",
        "Session",
        "Location",
        "Bortle",
        "Telescope",
        "Eyepiece",
        "Barlow",
        "Filter",
        "Camera",
        "Magnification",
        "Rating (1-5)",
        "Seeing (1-5)",
        "Transparency (1-5)",
        "Notes",
      ];
      const lines = [header.map((h) => csvCell(h)).join(",")];
      for (const r of rows) {
        const t = (r.o.observedAt ?? r.sessionDate).getTime();
        const local = localParts(t, r.tz);
        const info = describeObject(r.o.catalogRef, { catalogId: r.catalogId, name: r.objectName, category: r.category });
        lines.push(
          [
            csvCell(nightKey(t, r.lon, r.tz)),
            csvCell(local.date),
            csvCell(local.time),
            csvCell(local.tz),
            csvCell(new Date(t).toISOString()),
            csvCell(info.ref ?? r.catalogId, true),
            csvCell(info.name, true),
            csvCell(info.type),
            csvCell(r.sessionTitle, true),
            csvCell(r.locationName, true),
            csvCell(r.bortle),
            csvCell(r.telescope, true),
            csvCell(r.eyepiece, true),
            csvCell(r.barlow, true),
            csvCell(r.filter, true),
            csvCell(r.camera, true),
            csvCell(r.o.magnification != null ? Math.round(r.o.magnification) : null),
            csvCell(r.o.visibilityRating),
            csvCell(r.o.seeing),
            csvCell(r.o.transparency),
            csvCell(r.o.notes, true),
          ].join(","),
        );
      }
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="astropilot-journal-${stamp}.csv"`);
      res.setHeader("Cache-Control", "no-store");
      // BOM so spreadsheet apps detect UTF-8 (object names use ″, °, etc.).
      res.send("﻿" + lines.join("\r\n") + "\r\n");
    }),
  );

  /* ---------------- Photos ---------------- */

  app.post(
    "/api/journal/observations/:id/photos/upload-url",
    requireAuth,
    uploadLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const store = photoStorage();
      await ownedObservation(uid, id);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(observationPhotos).where(eq(observationPhotos.observationId, id));
      if (Number(n) >= MAX_PHOTOS_PER_OBSERVATION) throw new HttpError(400, `You can attach up to ${MAX_PHOTOS_PER_OBSERVATION} photos to one observation.`);
      const objectPath = newObjectPath(uid);
      const token = signUpload({ u: uid, o: id, p: objectPath, e: Date.now() + UPLOAD_TOKEN_TTL_MS });
      res.json({ uploadUrl: await store.uploadUrl(objectPath, token), token });
    }),
  );

  // The bytes, for storage that lives behind this server (database photos). The signed token from
  // upload-url binds user, observation and path, exactly as the attach step checks it.
  app.put(
    "/api/photo-uploads/:token",
    requireAuth,
    uploadLimit,
    express.raw({ type: () => true, limit: MAX_PHOTO_BYTES + 1024 }),
    ah(async (req, res) => {
      const uid = userId(req);
      const store = photoStorage();
      if (!store.put) throw new HttpError(404, "Not found");
      const claim = verifyUpload(String(req.params.token));
      if (!claim || claim.u !== uid || !claim.p.startsWith(`/objects/users/${uid}/`)) throw new HttpError(400, "This upload link isn't valid. Please try again.");
      if (claim.e < Date.now()) throw new HttpError(400, "This upload expired. Please upload the photo again.");
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      if (!IMAGE_TYPES.test(type)) throw new HttpError(400, "Only JPEG, PNG, WebP, GIF or AVIF images can be attached.");
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "The photo arrived empty. Please try again.");
      if (body.length > MAX_PHOTO_BYTES) throw new HttpError(400, "Photos must be 25 MB or smaller.");
      await store.put(claim.p, type, body);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/journal/observations/:id/photos",
    requireAuth,
    uploadLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const id = pid(req);
      const store = photoStorage();
      const { token } = parse(z.object({ token: z.string().min(10).max(4000) }), req.body);
      const claim = verifyUpload(token);
      // The token binds user + observation + object path, so nobody can attach someone else's upload.
      if (!claim || claim.u !== uid || claim.o !== id || !claim.p.startsWith(`/objects/users/${uid}/`)) {
        throw new HttpError(400, "This upload can't be attached. Please upload the photo again.");
      }
      if (claim.e < Date.now()) throw new HttpError(400, "This upload expired. Please upload the photo again.");
      await ownedObservation(uid, id);
      const [dup] = await db
        .select()
        .from(observationPhotos)
        .where(and(eq(observationPhotos.observationId, id), eq(observationPhotos.imageUrl, claim.p)));
      if (dup) return res.json({ id: dup.id, url: photoUrl(dup.imageUrl) });
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(observationPhotos).where(eq(observationPhotos.observationId, id));
      if (Number(n) >= MAX_PHOTOS_PER_OBSERVATION) throw new HttpError(400, `You can attach up to ${MAX_PHOTOS_PER_OBSERVATION} photos to one observation.`);

      const meta = await store.stat(claim.p).catch(() => null);
      if (!meta) throw new HttpError(400, "We couldn't find the uploaded photo. Please try again.");
      if (!IMAGE_TYPES.test(meta.contentType)) {
        await store.delete(claim.p);
        throw new HttpError(400, "Only JPEG, PNG, WebP, GIF or AVIF images can be attached.");
      }
      if (meta.size > MAX_PHOTO_BYTES) {
        await store.delete(claim.p);
        throw new HttpError(400, "Photos must be 25 MB or smaller.");
      }
      await store.setOwner?.(claim.p, uid);
      const [row] = await db.insert(observationPhotos).values({ observationId: id, imageUrl: claim.p }).returning();
      res.status(201).json({ id: row.id, url: photoUrl(row.imageUrl) });
    }),
  );

  app.delete(
    "/api/journal/photos/:photoId",
    requireAuth,
    writeLimit,
    ah(async (req, res) => {
      const uid = userId(req);
      const photoId = pid(req, "photoId");
      const [row] = await db
        .select({ id: observationPhotos.id, imageUrl: observationPhotos.imageUrl })
        .from(observationPhotos)
        .innerJoin(observations, eq(observations.id, observationPhotos.observationId))
        .innerJoin(observationSessions, eq(observationSessions.id, observations.sessionId))
        .where(and(eq(observationPhotos.id, photoId), eq(observationSessions.userId, uid)));
      if (!row) throw new HttpError(404, "Photo not found.");
      await db.delete(observationPhotos).where(eq(observationPhotos.id, row.id));
      deleteStoredPhotos([row.imageUrl]);
      res.json({ ok: true });
    }),
  );

  // Photo bytes, owner only. `/objects/...` is the legacy URL shape (read-only).
  app.get(
    "/api/photos/*",
    requireAuth,
    ah(async (req, res) => servePhoto(req, res, String((req.params as Record<string, string>)[0] ?? ""))),
  );
  app.get(
    "/objects/*",
    requireAuth,
    ah(async (req, res) => servePhoto(req, res, String((req.params as Record<string, string>)[0] ?? ""))),
  );
}
