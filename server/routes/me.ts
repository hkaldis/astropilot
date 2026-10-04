import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users } from "@shared/schema";
import { ah, parse, requireAuth, userId, HttpError, rateLimit, PG_INT_MAX } from "../http";
import { getUser, publicUser, hashPassword, verifyPassword, destroyUserSessions } from "../auth";
import { deleteAccount } from "../account";
import { deleteStoredPhotos } from "./journal";

const prefId = z.number().int().positive().max(PG_INT_MAX, "Invalid id");

/** User preferences, stored as JSON on the user row. Unknown keys are dropped. */
export const preferencesSchema = z
  .object({
    units: z.enum(["metric", "imperial"]).optional(),
    timeFormat: z.enum(["24h", "12h"]).optional(),
    defaultLocationId: prefId.nullable().optional(),
    defaultTelescopeId: prefId.nullable().optional(),
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
      const body = parse(
        z.object({
          current: z.string().max(200, "That password is too long").optional(),
          next: z.string({ required_error: "Choose a new password" }).min(8, "Use at least 8 characters").max(200, "Keep the password under 200 characters"),
        }),
        req.body,
      );
      const u = await getUser(userId(req));
      if (!u) throw new HttpError(404, "Account not found");
      if (u.passwordHash) {
        if (!body.current || !(await verifyPassword(body.current, u.passwordHash))) throw new HttpError(400, "Your current password is incorrect.");
      }
      await db.update(users).set({ passwordHash: await hashPassword(body.next), updatedAt: new Date() }).where(eq(users.id, u.id));
      // A changed password signs out every other device (this one stays signed in).
      await destroyUserSessions(u.id, req.sessionID).catch((e) => console.warn("[me] couldn't end other sessions:", e?.message));
      res.json({ ok: true });
    }),
  );

  app.delete(
    "/api/me",
    requireAuth,
    rateLimit({ windowMs: 10 * 60_000, max: 10 }),
    ah(async (req, res) => {
      const id = userId(req);
      let photos: string[];
      try {
        photos = await deleteAccount(id);
      } catch (e: any) {
        if (e?.code === "23503") {
          console.error("[me] account deletion blocked by a reference:", e?.constraint ?? e?.message);
          throw new HttpError(409, "We couldn't delete your account because some records still depend on it. Please contact support.");
        }
        throw e;
      }
      deleteStoredPhotos(photos);
      // Sign out everywhere: other devices' sessions are removed from the store, this one is destroyed.
      await destroyUserSessions(id, req.sessionID).catch((e) => console.warn("[me] couldn't end other sessions:", e?.message));
      req.logout(() => {
        req.session?.destroy(() => {
          res.clearCookie("connect.sid", { path: "/" });
          res.json({ ok: true });
        });
      });
    }),
  );
}
