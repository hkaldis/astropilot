import type { Express } from "express";
import type { Server } from "http";
import { createServer as createViteServer, createLogger } from "vite";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";

export async function setupVite(server: Server, app: Express) {
  const logger = createLogger();
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: logger,
    server: { middlewareMode: true, hmr: { server, path: "/vite-hmr" }, allowedHosts: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const file = path.resolve(import.meta.dirname, "..", "client", "index.html");
      const html = await vite.transformIndexHtml(req.originalUrl, await fs.promises.readFile(file, "utf-8"));
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
