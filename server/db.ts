import "./env";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const url = process.env.DATABASE_URL;
const wantsSsl = /sslmode=require|neon\.tech/i.test(url) && !/sslmode=disable/i.test(url);

export const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=require/i, ""),
  ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => console.error("[db] idle client error", err.message));

export const db = drizzle(pool, { schema });
