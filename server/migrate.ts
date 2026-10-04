import { pool } from "./db";

/**
 * Idempotent, additive schema changes for AstroPilot 2.
 * Safe to run on every boot against the existing production database: it only adds
 * columns and indexes that may be missing, never drops or rewrites data.
 * (A brand-new database is created with `npm run db:push`.)
 *
 * Append new statements here (one ALTER TABLE … ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
 * EXISTS / CREATE TABLE IF NOT EXISTS each). Statements whose column, index or table already
 * exists are skipped without touching the table, so a normal boot takes no locks at all.
 */
const STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb`,
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS timezone varchar(64)`,
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS elevation real`,
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS sqm real`,
  `ALTER TABLE observation_sessions ADD COLUMN IF NOT EXISTS title varchar(120)`,
  `ALTER TABLE observation_sessions ADD COLUMN IF NOT EXISTS end_date timestamp`,
  `ALTER TABLE observation_sessions ADD COLUMN IF NOT EXISTS conditions jsonb`,
  `ALTER TABLE observations ADD COLUMN IF NOT EXISTS observed_at timestamp`,
  `ALTER TABLE observations ADD COLUMN IF NOT EXISTS catalog_ref varchar(50)`,
  `ALTER TABLE observations ADD COLUMN IF NOT EXISTS seeing integer`,
  `ALTER TABLE observations ADD COLUMN IF NOT EXISTS transparency integer`,
  // Login sessions (connect-pg-simple) — present in every AstroPilot 1 database; recreate if missing.
  `CREATE TABLE IF NOT EXISTS sessions (sid varchar PRIMARY KEY, sess jsonb NOT NULL, expire timestamp NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire)`,
  `CREATE INDEX IF NOT EXISTS ap_sessions_user_idx ON observation_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_observations_session_idx ON observations (session_id)`,
  `CREATE INDEX IF NOT EXISTS ap_observations_ref_idx ON observations (catalog_ref)`,
  `CREATE INDEX IF NOT EXISTS ap_locations_user_idx ON locations (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_telescopes_user_idx ON telescopes (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_eyepieces_user_idx ON eyepieces (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_objects_catalog_idx ON celestial_objects (catalog_id)`,
  `CREATE INDEX IF NOT EXISTS ap_photos_observation_idx ON observation_photos (observation_id)`,
];

const ident = (s: string) => s.replace(/"/g, "").toLowerCase();

/** What a statement creates, so it can be skipped when that already exists. */
function target(sql: string): { kind: "column"; table: string; column: string } | { kind: "index" | "table"; name: string } | null {
  let m = /^ALTER TABLE\s+("?[\w]+"?)\s+ADD COLUMN IF NOT EXISTS\s+("?[\w]+"?)/i.exec(sql);
  if (m) return { kind: "column", table: ident(m[1]), column: ident(m[2]) };
  m = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+"?([\w]+)"?/i.exec(sql);
  if (m) return { kind: "index", name: m[1] };
  m = /^CREATE TABLE IF NOT EXISTS\s+("?[\w]+"?)/i.exec(sql);
  if (m) return { kind: "table", name: ident(m[1]) };
  return null;
}

export async function migrate() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`);
    if (!rows[0]?.t) {
      console.warn("[migrate] base tables are missing — run `npm run db:push` once to create them.");
      return;
    }
    const catalogQuery = (q: string) => client.query(q).catch(() => null);
    const cols = await catalogQuery(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
    const idx = await catalogQuery(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    const tables = await catalogQuery(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const haveColumn = new Set((cols?.rows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    const haveIndex = new Set((idx?.rows ?? []).map((r: any) => String(r.indexname)));
    const haveTable = new Set((tables?.rows ?? []).map((r: any) => String(r.tablename)));
    const known = !!cols && !!idx && !!tables;

    for (const sql of STATEMENTS) {
      const t = target(sql);
      if (known && t) {
        if (t.kind === "column" && haveColumn.has(`${t.table}.${t.column}`)) continue;
        if (t.kind === "index" && haveIndex.has(t.name)) continue;
        if (t.kind === "table" && haveTable.has(t.name)) continue;
      }
      try {
        // Short lock timeout: never queue behind a long transaction of a still-running old
        // instance (every query on the table would queue behind us). Skipped DDL retries next boot.
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`[migrate] applied: ${sql}`);
      } catch (e: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.warn(`[migrate] skipped: ${sql} — ${e.message}`);
      }
    }
  } finally {
    client.release();
  }
}
