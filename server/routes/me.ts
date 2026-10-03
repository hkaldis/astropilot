import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users } from "@shared/schema";
import { ah, parse, requireAuth, userId, HttpError, rateLimit } from "../http";
import { getUser, publicUser, hashPassword, verifyPassword } from "../auth";

/** User preferences, stored as JSON on the user row. Unknown keys are dropped. */
export const preferencesSchema = z
  .object({
    units: z.enum(["metric", "imperial"]).optional(),
    timeFormat: z.enum(["24h", "12h"]).optional(),
    defaultLocationId: z.number().int().positive().nullable().optional(),
    defaultTelescopeId: z.number().int().positive().nullable().optional(),
    minAltitude: z.number().min(0).max(60).optional(),
    experience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();

export function registerMe(app: Express) {
  app.patch(
    "/api/me",
    requireAuth,
    ah(async (req, res) => {
      const body = parse(
        z.object({
          firstName: z.string().trim().max(60).nullable().optional(),
          lastName: z.string().trim().max(60).nullable().optional(),
          preferences: preferencesSchema.optional(),
        }),
        req.body,
      );
      const id = userId(req);
      const current = await getUser(id);
      if (!current) throw new HttpError(404, "Account not found");
      const prefs = body.preferences ? { ...((current.preferences as object) ?? {}), ...body.preferences } : current.preferences;
      const [u] = await db
        .update(users)
        .set({
          firstName: body.firstName === undefined ? current.firstName : body.firstName,
          lastName: body.lastName === undefined ? current.lastName : body.lastName,
          preferences: prefs,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      res.json({ user: publicUser(u) });
    }),
  );

  app.post(
    "/api/me/password",
    requireAuth,
    rateLimit({ windowMs: 10 * 60_000, max: 10 }),
    ah(async (req, res) => {
      const body = parse(z.object({ current: z.string().optional(), next: z.string().min(8, "Use at least 8 characters").max(200) }), req.body);
      const u = await getUser(userId(req));
      if (!u) throw new HttpError(404, "Account not found");
      if (u.passwordHash) {
        if (!body.current || !(await verifyPassword(body.current, u.passwordHash))) throw new HttpError(400, "Your current password is incorrect.");
      }
      await db.update(users).set({ passwordHash: await hashPassword(body.next), updatedAt: new Date() }).where(eq(users.id, u.id));
      res.json({ ok: true });
    }),
  );

  app.delete(
    "/api/me",
    requireAuth,
    ah(async (req, res) => {
      const id = userId(req);
      await db.delete(users).where(eq(users.id, id));
      req.logout(() => req.session?.destroy(() => res.json({ ok: true })));
    }),
  );
}
