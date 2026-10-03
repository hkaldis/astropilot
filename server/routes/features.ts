import type { Express } from "express";
import { googleEnabled } from "../auth";

export const photosEnabled = () => Boolean(process.env.PRIVATE_OBJECT_DIR);
export const donationsEnabled = () => Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));

export function registerFeatures(app: Express) {
  app.get("/api/features", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ google: googleEnabled(), photos: photosEnabled(), donations: donationsEnabled() });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, version: "2.0.0" }));
}
