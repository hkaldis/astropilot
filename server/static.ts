import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // The bundled server lives in dist/, the client build in dist/public.
  const candidates = [path.resolve(__dirname, "public"), path.resolve(process.cwd(), "dist", "public")];
  const distPath = candidates.find((p) => fs.existsSync(p));
  if (!distPath) throw new Error(`Client build not found (looked in ${candidates.join(", ")}). Run npm run build first.`);

  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static(distPath, { maxAge: "1h", index: false }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
