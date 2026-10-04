import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

/** Load a local .env file in development (never overrides real environment variables). */
export function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

loadEnv();

export const isProd = process.env.NODE_ENV === "production";

/**
 * Secret for session cookies and signed upload tokens. A well-known fallback is fine locally, but
 * never in production: without SESSION_SECRET we use a random per-process secret instead (sessions
 * then end on restart, which is better than cookies and tokens anyone could forge).
 */
export const sessionSecret: string = (() => {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (!isProd) return "astropilot-dev-secret";
  console.error("[security] SESSION_SECRET is not set — using a random secret; everyone is signed out on each restart. Set SESSION_SECRET.");
  return randomBytes(32).toString("hex");
})();
