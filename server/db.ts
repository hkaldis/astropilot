import "./env";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const url = process.env.DATABASE_URL;
const wantsSsl = /sslmode=require|neon\.tech/i.test(url) && !/sslmode=disable/i.test(url);

/**
 * Drop `sslmode=require` (the `ssl` option below handles it; pg would otherwise let the URL override
 * it) while keeping any other parameters intact: "db?sslmode=require&channel_binding=require" must
 * become "db?channel_binding=require", not the database name "db&channel_binding=require".
 */
const connectionString = url.replace(/([?&])sslmode=require(&?)/i, (_m, sep: string, amp: string) => (amp ? sep : ""));

export const pool = new pg.Pool({
  connectionString,
  ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Fail fast (instead of hanging boot or requests forever) when the database is unreachable.
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => console.error("[db] idle client error", err.message));

export const db = drizzle(pool, { schema });
