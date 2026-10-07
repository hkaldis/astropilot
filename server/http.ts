import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields for the JSON body, next to `message` (e.g. what the client can do instead). */
    public extra?: Record<string, unknown>,
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

/** Largest value of a Postgres `integer` (all serial/identity ids are int4). */
export const PG_INT_MAX = 2_147_483_647;

/**
 * A positive integer route id. Only plain digits are accepted ("1e3", "0x1A", " 7" are not ids),
 * and anything beyond int4 can't exist: 404 instead of a Postgres "out of range" error (500).
 */
export function idParam(req: Request, name = "id"): number {
  const raw = String(req.params[name] ?? "");
  if (!/^\d{1,16}$/.test(raw) || Number(raw) <= 0) throw new HttpError(400, "Invalid id");
  const n = Number(raw);
  if (n > PG_INT_MAX) throw new HttpError(404, "Not found.");
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

/**
 * fetch with a deadline. The deadline also covers reading the body: `fetch` resolves as soon as
 * the headers arrive, so an upstream that then stalls would otherwise hang `res.json()` forever —
 * and with it every request waiting on the same in-flight (de-duplicated) promise.
 * Aborting after the body has been read is a no-op. Rejects with an "AbortError" on timeout.
 */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  t.unref?.();
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

export const USER_AGENT = "AstroPilot/2.0 (+https://astropilot.space)";
