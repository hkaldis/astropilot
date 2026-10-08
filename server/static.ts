import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { renderHtml } from "./seo";

export function serveStatic(app: Express) {
  // The bundled server lives in dist/, the client build in dist/public.
  const candidates = [path.resolve(__dirname, "public"), path.resolve(process.cwd(), "dist", "public")];
  const distPath = candidates.find((p) => fs.existsSync(p));
  if (!distPath) throw new Error(`Client build not found (looked in ${candidates.join(", ")}). Run npm run build first.`);

  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }),
    // A missing hashed asset (an old tab after a redeploy) must 404, not receive index.html as JS.
    (_req, res) => res.status(404).setHeader("Cache-Control", "no-store").end(),
  );
  // The service worker must be revalidated on every check, or clients can keep an outdated one.
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "sw.js"));
  });
  app.use(express.static(distPath, { maxAge: "1h", index: false }));
  // Every page: the app shell with that page's own title, description, structured data and readable
  // content (for search engines and AI assistants), and a real 404 for addresses that don't exist.
  const template = fs.readFileSync(path.resolve(distPath, "index.html"), "utf8");
  app.use("*", (req, res) => {
    const { status, html } = renderHtml(template, req);
    res.status(status).setHeader("Cache-Control", "no-cache").type("html").send(html);
  });
}
