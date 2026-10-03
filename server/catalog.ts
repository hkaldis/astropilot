/**
 * Server-side access to the static catalog (shared/data/catalog.json) and the bridge to the
 * legacy `celestial_objects` table, which observations and targets reference by integer id.
 */
import { and, ilike, isNull, sql } from "drizzle-orm";
import catalogData from "@shared/data/catalog.json";
import { db } from "./db";
import { celestialObjects } from "@shared/schema";
import { SOLAR_SYSTEM } from "@shared/astro/planets";

export interface CatalogEntry {
  id: string;
  name: string;
  type: string;
  ra: number;
  dec: number;
  mag?: number;
  size?: number[];
  con?: string;
  desc?: string;
  m?: number;
  c?: number;
  [k: string]: unknown;
}

let cache: { list: CatalogEntry[]; byId: Map<string, CatalogEntry> } | null = null;

export function catalog() {
  if (cache) return cache;
  const list = (catalogData as unknown as CatalogEntry[]) ?? [];
  const byId = new Map<string, CatalogEntry>();
  for (const o of list) byId.set(o.id.toUpperCase(), o);
  cache = { list, byId };
  return cache;
}

/** Resolve a catalog reference ("M31", "ngc7000", "jupiter") to a display entry. */
export function resolveRef(ref: string): { ref: string; name: string; type: string; con?: string } | null {
  const key = ref.trim();
  const ss = SOLAR_SYSTEM.find((p) => p.id === key.toLowerCase());
  if (ss) return { ref: ss.id, name: ss.name, type: ss.id === "moon" ? "moon" : "planet" };
  const o = catalog().byId.get(key.toUpperCase());
  if (o) return { ref: o.id, name: o.name, type: o.type, con: o.con };
  return null;
}

const LEGACY_CATEGORY: Record<string, string> = {
  galaxy: "galaxy",
  galaxy_group: "galaxy",
  open_cluster: "open_cluster",
  globular_cluster: "globular_cluster",
  cluster_nebula: "emission_nebula",
  planetary_nebula: "planetary_nebula",
  emission_nebula: "emission_nebula",
  reflection_nebula: "reflection_nebula",
  dark_nebula: "dark_nebula",
  supernova_remnant: "supernova_remnant",
  double_star: "double_star",
  asterism: "asterism",
  star_cloud: "asterism",
  planet: "planet",
  moon: "moon",
};

/**
 * Find (or create) the shared `celestial_objects` row for a catalog reference, so legacy
 * foreign keys keep working. Returns the row id.
 */
export async function ensureObjectRow(ref: string): Promise<number> {
  const r = resolveRef(ref);
  if (!r) throw Object.assign(new Error(`Unknown object "${ref}"`), { status: 400 });
  const legacyIds = r.ref === "moon" ? ["Moon", "Luna"] : [r.ref];
  for (const id of legacyIds) {
    const [row] = await db
      .select({ id: celestialObjects.id })
      .from(celestialObjects)
      .where(and(isNull(celestialObjects.userId), ilike(celestialObjects.catalogId, id)))
      .limit(1);
    if (row) return row.id;
  }
  const entry = catalog().byId.get(r.ref.toUpperCase());
  const [created] = await db
    .insert(celestialObjects)
    .values({
      catalogId: r.ref,
      name: r.name.slice(0, 100),
      category: (LEGACY_CATEGORY[r.type] ?? "galaxy") as any,
      constellation: r.con ?? null,
      magnitude: (entry?.mag as number | undefined) ?? null,
      description: (entry?.desc as string | undefined) ?? null,
    })
    .returning({ id: celestialObjects.id });
  return created.id;
}

/** Map a legacy celestial_objects row back to a catalog reference string. */
export function legacyRef(catalogId: string | null | undefined): string | null {
  if (!catalogId) return null;
  const c = catalogId.replace(/\s+/g, "");
  if (/^luna$/i.test(c) || /^moon$/i.test(c)) return "moon";
  const ss = SOLAR_SYSTEM.find((p) => p.id === c.toLowerCase());
  if (ss) return ss.id;
  return resolveRef(c)?.ref ?? c;
}

export { sql };
