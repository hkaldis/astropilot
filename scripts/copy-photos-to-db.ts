/**
 * Copy every journal photo from Replit Object Storage into the database (table photo_blobs), so the
 * photos travel with an ordinary database dump. Safe to run more than once: photos already copied
 * are skipped. Run on Replit (it needs the Replit sidecar):  npx tsx scripts/copy-photos-to-db.ts
 */
import { pool } from "../server/db";
import { photoStores, readPhoto } from "../server/photoStore";

async function main() {
  if (!process.env.PRIVATE_OBJECT_DIR) {
    console.log("PRIVATE_OBJECT_DIR isn't set here, so there's no Replit Object Storage to copy from — nothing to do.");
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS photo_blobs (path varchar(300) PRIMARY KEY, content_type varchar(100) NOT NULL, size integer NOT NULL, data bytea NOT NULL, created_at timestamp DEFAULT now())`,
  );
  const { rows } = await pool.query<{ image_url: string }>(`SELECT DISTINCT image_url FROM observation_photos WHERE image_url LIKE '/objects/%'`);
  const done = new Set((await pool.query<{ path: string }>(`SELECT path FROM photo_blobs`)).rows.map((r) => r.path));
  let copied = 0;
  let skipped = 0;
  const missing: string[] = [];
  for (const { image_url: path } of rows) {
    if (done.has(path)) {
      skipped++;
      continue;
    }
    const photo = await readPhoto(photoStores.replit, path);
    if (!photo) {
      missing.push(path);
      continue;
    }
    await photoStores.db.put!(path, photo.contentType, photo.data);
    copied++;
    if (copied % 20 === 0) console.log(`  … ${copied} copied`);
  }
  console.log(`Photos: ${rows.length} referenced, ${copied} copied, ${skipped} already in the database, ${missing.length} missing from storage.`);
  if (missing.length) console.log(`Missing (rows kept, files gone): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("Copying photos failed:", e?.message ?? e);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
