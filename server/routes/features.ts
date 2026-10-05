import type { Express } from "express";
import { googleEnabled } from "../auth";
import { photoStoreKind } from "../photoStore";

/** Photos are stored in the database unless Replit Object Storage is configured, so they're always on. */
export const photosEnabled = () => photoStoreKind() === "db" || Boolean(process.env.PRIVATE_OBJECT_DIR);
/** Donations need Stripe: a STRIPE_SECRET_KEY, or (on Replit) the Stripe connector. */
export const donationsEnabled = () =>
  Boolean(process.env.STRIPE_SECRET_KEY) || Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));

export function registerFeatures(app: Express) {
  app.get("/api/features", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ google: googleEnabled(), photos: photosEnabled(), donations: donationsEnabled() });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, version: "2.0.0" }));
}
