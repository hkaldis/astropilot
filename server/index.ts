import "./env";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { migrate } from "./migrate";
import { HttpError } from "./http";
import { isProd } from "./env";

const app = express();
const httpServer = createServer(app);

app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  next();
});

export function log(message: string, source = "server") {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${time} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    if (res.statusCode >= 400 || Date.now() - start > 1500 || !isProd) {
      log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`, "api");
    }
  });
  next();
});

(async () => {
  await migrate().catch((e) => console.error("[migrate] failed:", e.message));
  setupAuth(app);
  registerRoutes(app);

  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return;
    res.status(status).json({ message: status >= 500 ? "Something went wrong on our side. Please try again." : err.message });
  });

  if (isProd) {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => log(`AstroPilot listening on :${port}`));
})();
