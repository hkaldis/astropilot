import { pool } from "./db";

/**
 * Idempotent, additive schema changes for AstroPilot 2.
 * Safe to run on every boot against the existing production database: it only adds
 * columns and indexes that may be missing, never drops or rewrites data.
 * (A brand-new database is created with `npm run db:push`.)
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
  `CREATE INDEX IF NOT EXISTS ap_sessions_user_idx ON observation_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_observations_session_idx ON observations (session_id)`,
  `CREATE INDEX IF NOT EXISTS ap_observations_ref_idx ON observations (catalog_ref)`,
  `CREATE INDEX IF NOT EXISTS ap_locations_user_idx ON locations (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_telescopes_user_idx ON telescopes (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_eyepieces_user_idx ON eyepieces (user_id)`,
  `CREATE INDEX IF NOT EXISTS ap_objects_catalog_idx ON celestial_objects (catalog_id)`,
  `CREATE INDEX IF NOT EXISTS ap_photos_observation_idx ON observation_photos (observation_id)`,
];

export async function migrate() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`);
    if (!rows[0]?.t) {
      console.warn("[migrate] base tables are missing — run `npm run db:push` once to create them.");
      return;
    }
    for (const sql of STATEMENTS) {
      try {
        await client.query(sql);
      } catch (e: any) {
        console.warn(`[migrate] skipped: ${sql} — ${e.message}`);
      }
    }
  } finally {
    client.release();
  }
}
