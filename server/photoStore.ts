/**
 * Where observation photos live. Two drivers behind one interface:
 *  - "db": photos are rows in Postgres (table `photo_blobs`). No extra service or account, they move
 *    with an ordinary database backup/restore, and they work anywhere the app runs. The default.
 *  - "replit": Replit Object Storage (Google Cloud Storage reached through the Replit sidecar), used
 *    while the app still runs on Replit with PRIVATE_OBJECT_DIR set. `scripts/move-off-replit.sh`
 *    copies those photos into `photo_blobs` before moving to another host.
 * Choose explicitly with PHOTO_STORAGE=db|replit.
 *
 * Paths are always "/objects/<folder>/<id>" (the shape AstroPilot 1 stored in observation_photos).
 */
import type { Response } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";

export interface PhotoStat {
  contentType: string;
  size: number;
}

export interface PhotoStore {
  kind: "db" | "replit";
  /** Where the browser should PUT the file. `token` is the signed upload claim for our own endpoint. */
  uploadUrl(objectPath: string, token: string): Promise<string>;
  /** Store bytes received by our own upload endpoint (db driver). */
  put?(objectPath: string, contentType: string, data: Buffer): Promise<void>;
  stat(objectPath: string): Promise<PhotoStat | null>;
  /** Stream the photo to the response (caller has checked ownership). */
  send(objectPath: string, res: Response, maxAgeSec: number): Promise<void>;
  delete(objectPath: string): Promise<void>;
  /** Owner check from the storage layer itself (Replit ACL metadata); null when it doesn't know. */
  ownerOf?(objectPath: string): Promise<string | null>;
  /** Record the owner, where the storage keeps ACLs. */
  setOwner?(objectPath: string, uid: string): Promise<void>;
}

const PATH_RE = /^\/objects\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;
const validPath = (p: string) => PATH_RE.test(p) && !p.split("/").some((s) => s === "." || s === "..");

export const newObjectPath = (uid: string) => `/objects/users/${uid}/${randomUUID()}`;

/* ------------------------------------------------------------------------------------------ */

const dbStore: PhotoStore = {
  kind: "db",
  async uploadUrl(_objectPath, token) {
    return `/api/photo-uploads/${encodeURIComponent(token)}`;
  },
  async put(objectPath, contentType, data) {
    if (!validPath(objectPath)) throw new Error("invalid photo path");
    await pool.query(
      `INSERT INTO photo_blobs (path, content_type, size, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (path) DO UPDATE SET content_type = EXCLUDED.content_type, size = EXCLUDED.size, data = EXCLUDED.data`,
      [objectPath, contentType, data.length, data],
    );
  },
  async stat(objectPath) {
    if (!validPath(objectPath)) return null;
    const { rows } = await pool.query(`SELECT content_type, size FROM photo_blobs WHERE path = $1`, [objectPath]);
    return rows[0] ? { contentType: rows[0].content_type, size: Number(rows[0].size) } : null;
  },
  async send(objectPath, res, maxAgeSec) {
    const { rows } = await pool.query(`SELECT content_type, size, data FROM photo_blobs WHERE path = $1`, [objectPath]);
    if (!rows[0]) {
      res.status(404).json({ message: "Photo not found." });
      return;
    }
    res.set({ "Content-Type": rows[0].content_type, "Content-Length": String(rows[0].size), "Cache-Control": `private, max-age=${maxAgeSec}` });
    res.end(rows[0].data);
  },
  async delete(objectPath) {
    await pool.query(`DELETE FROM photo_blobs WHERE path = $1`, [objectPath]);
  },
};

/* ------------------------------------------------------------------------------------------ */

let replitModules: Promise<{ svc: import("./objectStorage").ObjectStorageService; acl: typeof import("./objectAcl") }> | null = null;
const replit = () =>
  (replitModules ??= Promise.all([import("./objectStorage"), import("./objectAcl")]).then(([s, acl]) => ({ svc: new s.ObjectStorageService(), acl })));

const replitStore: PhotoStore = {
  kind: "replit",
  async uploadUrl(objectPath) {
    const { svc } = await replit();
    return svc.signedUploadUrl(objectPath);
  },
  async stat(objectPath) {
    const { svc } = await replit();
    try {
      const file = await svc.getObjectEntityFile(objectPath);
      const [meta] = await file.getMetadata();
      return { contentType: String(meta.contentType ?? ""), size: Number(meta.size ?? 0) };
    } catch {
      return null;
    }
  },
  async send(objectPath, res, maxAgeSec) {
    const { svc } = await replit();
    const file = await svc.getObjectEntityFile(objectPath);
    await svc.downloadObject(file, res, maxAgeSec);
  },
  async delete(objectPath) {
    const { svc } = await replit();
    await svc.deleteObjectEntity(objectPath).catch(() => undefined);
  },
  async ownerOf(objectPath) {
    const { svc, acl } = await replit();
    try {
      const file = await svc.getObjectEntityFile(objectPath);
      const policy = await acl.getObjectAclPolicy(file);
      return policy?.owner ?? null;
    } catch {
      return null;
    }
  },
  async setOwner(objectPath, uid) {
    const { svc, acl } = await replit();
    const file = await svc.getObjectEntityFile(objectPath);
    await acl.setObjectAclPolicy(file, { owner: uid, visibility: "private" });
  },
};

/* ------------------------------------------------------------------------------------------ */

/** Both drivers, for moving photos between them (scripts/copy-photos-to-db.ts). */
export const photoStores = { db: dbStore, replit: replitStore };

export function photoStoreKind(): "db" | "replit" {
  const forced = process.env.PHOTO_STORAGE;
  if (forced === "db" || forced === "replit") return forced;
  return process.env.PRIVATE_OBJECT_DIR ? "replit" : "db";
}

export function photoStore(): PhotoStore {
  return photoStoreKind() === "replit" ? replitStore : dbStore;
}

/** Read a stored photo's bytes from either driver (used when moving photos between them). */
export async function readPhoto(store: PhotoStore, objectPath: string): Promise<{ contentType: string; data: Buffer } | null> {
  if (store.kind === "db") {
    const { rows } = await pool.query(`SELECT content_type, data FROM photo_blobs WHERE path = $1`, [objectPath]);
    return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : null;
  }
  const { svc } = await replit();
  try {
    const file = await svc.getObjectEntityFile(objectPath);
    const [[meta], [data]] = await Promise.all([file.getMetadata(), file.download()]);
    return { contentType: String(meta.contentType ?? "application/octet-stream"), data };
  } catch {
    return null;
  }
}
