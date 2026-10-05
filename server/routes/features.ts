import type { Express } from "express";
import type { ApiFeatures } from "@shared/api";
import { googleEnabled } from "../auth";
import { photoStoreKind } from "../photoStore";

/** Photos are stored in the database unless Replit Object Storage is configured, so they're always on. */
export const photosEnabled = () => photoStoreKind() === "db" || Boolean(process.env.PRIVATE_OBJECT_DIR);
/** Donations need Stripe: a STRIPE_SECRET_KEY, or (on Replit) the Stripe connector. */
export const donationsEnabled = () =>
  Boolean(process.env.STRIPE_SECRET_KEY) || Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
/** Render sets RENDER=true on every service; Replit sets REPL_ID (and REPLIT_DOMAINS) in Repls and deployments. */
export const hostName = (): ApiFeatures["host"] =>
  process.env.RENDER === "true" ? "render" : process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT || process.env.REPLIT_DOMAINS ? "replit" : null;

export function registerFeatures(app: Express) {
  app.get("/api/features", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    const features: ApiFeatures = { google: googleEnabled(), photos: photosEnabled(), donations: donationsEnabled(), host: hostName() };
    res.json(features);
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, version: "2.0.0" }));
}
