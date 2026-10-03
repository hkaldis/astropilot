/** "My targets" — the user's wish list of objects (stored in the legacy watchlist table). */
import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { watchlistItems, celestialObjects } from "@shared/schema";
import { ah, parse, requireAuth, userId, idParam, HttpError } from "../http";
import { ensureObjectRow, legacyRef } from "../catalog";

const createSchema = z.object({
  ref: z.string().trim().min(1).max(50),
  priority: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const patchSchema = z.object({
  priority: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["planned", "observed", "dismissed"]).optional(),
});

async function listTargets(uid: string) {
  const rows = await db
    .select({
      id: watchlistItems.id,
      priority: watchlistItems.priority,
      notes: watchlistItems.notes,
      status: watchlistItems.status,
      createdAt: watchlistItems.createdAt,
      catalogId: celestialObjects.catalogId,
      name: celestialObjects.name,
    })
    .from(watchlistItems)
    .innerJoin(celestialObjects, eq(watchlistItems.objectId, celestialObjects.id))
    .where(eq(watchlistItems.userId, uid))
    .orderBy(desc(watchlistItems.createdAt));
  return rows.map((r) => ({ id: r.id, ref: legacyRef(r.catalogId) ?? r.catalogId, name: r.name, priority: r.priority ?? "medium", notes: r.notes, status: r.status ?? "planned", createdAt: r.createdAt }));
}

export function registerTargets(app: Express) {
  app.get(
    "/api/targets",
    requireAuth,
    ah(async (req, res) => res.json(await listTargets(userId(req)))),
  );

  app.post(
    "/api/targets",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const body = parse(createSchema, req.body);
      const objectId = await ensureObjectRow(body.ref);
      const [existing] = await db
        .select()
        .from(watchlistItems)
        .where(and(eq(watchlistItems.userId, uid), eq(watchlistItems.objectId, objectId)));
      if (existing) {
        if (existing.status !== "planned") {
          await db.update(watchlistItems).set({ status: "planned", updatedAt: new Date() }).where(eq(watchlistItems.id, existing.id));
        }
      } else {
        await db.insert(watchlistItems).values({ userId: uid, objectId, priority: body.priority ?? "medium", notes: body.notes ?? null, status: "planned" });
      }
      res.status(201).json(await listTargets(uid));
    }),
  );

  app.patch(
    "/api/targets/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      const body = parse(patchSchema, req.body);
      const [row] = await db
        .update(watchlistItems)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(watchlistItems.id, idParam(req)), eq(watchlistItems.userId, uid)))
        .returning();
      if (!row) throw new HttpError(404, "Target not found");
      res.json(await listTargets(uid));
    }),
  );

  app.delete(
    "/api/targets/:id",
    requireAuth,
    ah(async (req, res) => {
      const uid = userId(req);
      await db.delete(watchlistItems).where(and(eq(watchlistItems.id, idParam(req)), eq(watchlistItems.userId, uid)));
      res.json(await listTargets(uid));
    }),
  );
}
