import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap an async handler so rejections reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated?.() && (req.user as any)?.id) return next();
  res.status(401).json({ message: "Please sign in to continue." });
};

export function userId(req: Request): string {
  const id = (req.user as any)?.id;
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  return id;
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
    throw new HttpError(400, msg);
  }
  return r.data;
}

export function idParam(req: Request, name = "id"): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
}

/** Tiny in-memory fixed-window rate limiter (per instance). */
export function rateLimit(opts: { windowMs: number; max: number; message?: string }): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const key = req.ip ?? "anon";
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + opts.windowMs });
      if (hits.size > 5000) hits.forEach((v, k) => v.reset < now && hits.delete(k));
      return next();
    }
    h.n++;
    if (h.n > opts.max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ message: opts.message ?? "Too many requests — please wait a moment." });
    }
    next();
  };
}

/** Small TTL cache for upstream API responses. */
export class TTLCache<V> {
  private store = new Map<string, { v: V; exp: number }>();
  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}
  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e.v;
  }
  set(key: string, v: V, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { v, exp: Date.now() + ttlMs });
  }
}

/** fetch with a timeout. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 12_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const USER_AGENT = "AstroPilot/2.0 (+https://astropilot.space)";
