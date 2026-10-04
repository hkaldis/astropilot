/**
 * Account deletion.
 *
 * `DELETE FROM users` alone is not enough: several foreign keys have no ON DELETE action
 * (observations → gear and celestial_objects, observation_photos → cameras, sessions/night
 * conditions → locations, messier_progress → sessions and objects, watchlist_items →
 * observations). Postgres fires the cascades from `users` in no useful order, so e.g. a barlow
 * can be deleted while an observation still points at it and the whole delete fails. Here the
 * user's rows are removed explicitly, children first, in one transaction.
 *
 * Rows of *other* users are never deleted. If they point at this user's rows (only possible
 * through bugs in the old app) the pointers are cleared, and custom objects they still use are
 * kept as ownerless rows.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

/** Deletes the account and everything it owns. Returns the stored photo paths to clean up. */
export async function deleteAccount(uid: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const run = (q: ReturnType<typeof sql>) => tx.execute(q);

    // Lock the user row: concurrent writes by this user's other tabs wait, then fail cleanly.
    const me = await run(sql`SELECT id FROM users WHERE id = ${uid} FOR UPDATE`);
    if (!me.rows.length) return [];

    const mySessions = sql`SELECT id FROM observation_sessions WHERE user_id = ${uid}`;
    const myObservations = sql`SELECT o.id FROM observations o JOIN observation_sessions s ON s.id = o.session_id WHERE s.user_id = ${uid}`;

    const photos = await run(sql`SELECT image_url FROM observation_photos WHERE observation_id IN (${myObservations})`);

    // 1. Per-user rows that point at shared objects, sessions or locations.
    await run(sql`DELETE FROM watchlist_items WHERE user_id = ${uid}`); // windows cascade
    await run(sql`DELETE FROM messier_progress WHERE user_id = ${uid}`);
    await run(sql`DELETE FROM object_settings WHERE user_id = ${uid}`);
    await run(sql`DELETE FROM night_conditions WHERE user_id = ${uid}`);
    await run(sql`DELETE FROM user_badges WHERE user_id = ${uid}`);
    await run(sql`DELETE FROM user_stats WHERE user_id = ${uid}`);

    // 2. Other users' pointers into this account (legacy cross-references): clear them.
    await run(sql`UPDATE watchlist_items SET observation_id = NULL WHERE observation_id IN (${myObservations})`);
    await run(sql`UPDATE messier_progress SET best_session_id = NULL WHERE best_session_id IN (${mySessions})`);

    // 3. The observing log: observations (photo rows cascade), then sessions.
    await run(sql`DELETE FROM observations WHERE session_id IN (${mySessions})`);
    await run(sql`DELETE FROM observation_sessions WHERE user_id = ${uid}`);

    // 4. Anything else still referencing this user's gear or locations.
    for (const [table, column] of [
      ["telescopes", "telescope_id"],
      ["eyepieces", "eyepiece_id"],
      ["barlows", "barlow_id"],
      ["filters", "filter_id"],
      ["cameras", "camera_id"],
      ["optical_modifiers", "optical_modifier_id"],
      ["finders", "finder_id"],
    ] as const) {
      await run(sql`UPDATE observations SET ${sql.raw(column)} = NULL WHERE ${sql.raw(column)} IN (SELECT id FROM ${sql.raw(table)} WHERE user_id = ${uid})`);
    }
    await run(sql`UPDATE observation_photos SET camera_id = NULL WHERE camera_id IN (SELECT id FROM cameras WHERE user_id = ${uid})`);
    await run(sql`UPDATE observation_sessions SET location_id = NULL WHERE location_id IN (SELECT id FROM locations WHERE user_id = ${uid})`);
    await run(sql`UPDATE night_conditions SET location_id = NULL WHERE location_id IN (SELECT id FROM locations WHERE user_id = ${uid})`);

    // 5. Custom objects: keep (ownerless) any another user still refers to, delete the rest.
    await run(sql`
      UPDATE celestial_objects c SET user_id = NULL
       WHERE c.user_id = ${uid}
         AND (EXISTS (SELECT 1 FROM observations o WHERE o.object_id = c.id)
           OR EXISTS (SELECT 1 FROM watchlist_items w WHERE w.object_id = c.id)
           OR EXISTS (SELECT 1 FROM messier_progress m WHERE m.object_id = c.id)
           OR EXISTS (SELECT 1 FROM object_settings x WHERE x.object_id = c.id))`);
    await run(sql`DELETE FROM celestial_objects WHERE user_id = ${uid}`);

    // 6. The user; gear, locations (and their watchlist windows), finders, accessories… cascade.
    await run(sql`DELETE FROM users WHERE id = ${uid}`);

    return photos.rows.map((r) => String((r as { image_url: unknown }).image_url));
  });
}
