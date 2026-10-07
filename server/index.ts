import "./env";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { migrate } from "./migrate";
import { HttpError } from "./http";
import { isProd } from "./env";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

app.disable("x-powered-by");
app.use(compression());
// JSON only. (No urlencoded parser: a cross-site HTML form can then never post credentials or
// data to the API — e.g. a login-CSRF into someone else's account.)
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  if (isProd && req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000");
  next();
});

export function log(message: string, source = "server") {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${time} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  // API responses are personal unless a route says otherwise (forecast, features… set their own):
  // never store them in shared caches; browsers revalidate with the ETag.
  res.setHeader("Cache-Control", "private, no-cache");
  const start = Date.now();
  const path = req.path; // mounted handlers rewrite req.url before "finish"
  res.on("finish", () => {
    if (res.statusCode >= 400 || Date.now() - start > 1500 || !isProd) {
      log(`${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`, "api");
    }
  });
  next();
});

const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

/**
 * Map an error to a status and a message that is safe to show. Only errors we raise ourselves
 * (HttpError) and the body parser's client errors keep their status; anything else — database,
 * Stripe, storage, bugs — is a 500 with a generic message, so upstream details never leak and an
 * upstream 401 is never mistaken for "please sign in".
 */
function describeError(err: any): { status: number; message: string; extra?: Record<string, unknown> } {
  if (err instanceof HttpError) return { status: err.status, message: err.message, extra: err.extra };
  if (err?.type === "entity.parse.failed") return { status: 400, message: "The request body isn't valid JSON." };
  if (err?.type === "entity.too.large") return { status: 413, message: "That request is too large." };
  if (err?.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) return { status: err.status, message: String(err.message) };
  // Postgres data exceptions (class 22: out-of-range numbers, malformed values) come from input.
  if (typeof err?.code === "string" && err.code.startsWith("22") && err?.severity) return { status: 400, message: "Some of the values you sent are invalid or out of range." };
  return { status: 500, message: GENERIC_ERROR };
}

(async () => {
  // Never let a slow or unreachable database keep the server from listening.
  let migrateTimer: NodeJS.Timeout | undefined;
  await Promise.race([
    migrate().catch((e) => console.error("[migrate] failed:", e?.message ?? e)),
    new Promise<void>((resolve) => {
      migrateTimer = setTimeout(() => {
        console.warn("[migrate] still running after 30 s — starting anyway");
        resolve();
      }, 30_000);
    }),
  ]);
  clearTimeout(migrateTimer);
  setupAuth(app);
  registerRoutes(app);

  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Mid-stream failure (e.g. a photo download): let Express close the connection.
    if (res.headersSent) return next(err);
    const { status, message, extra } = describeError(err);
    // Log the stack only — error objects can carry row values (`detail`) or upstream payloads.
    if (status >= 500) console.error(`[error] ${req.method} ${req.path}${err?.code ? ` (${err.code})` : ""}:`, err?.stack ?? String(err));
    else if (status === 400 && err?.severity) console.warn(`[error] ${req.method} ${req.path} (${err.code}): ${err.message}`);
    res.status(status).json({ ...extra, message });
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

// A stray rejected promise (e.g. in background cleanup) must not take the whole site down.
process.on("unhandledRejection", (reason: any) => console.error("[server] unhandled rejection:", reason?.stack ?? reason));

if (isProd) {
  // Redeploys send SIGTERM: finish in-flight requests, then close the database pool.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received — shutting down`);
    setTimeout(() => process.exit(0), 8000).unref();
    httpServer.close(() => void pool.end().finally(() => process.exit(0)));
    httpServer.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
