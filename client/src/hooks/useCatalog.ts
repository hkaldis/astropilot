import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CatalogObject } from "@shared/data/types";

/** The deep-sky catalog (~1k objects), loaded lazily as its own chunk. */
export function useCatalog() {
  const q = useQuery<CatalogObject[]>({
    queryKey: ["catalog"],
    queryFn: () => import("@shared/data/catalog.json").then((m) => (m.default ?? m) as unknown as CatalogObject[]),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const byId = useMemo(() => {
    const map = new Map<string, CatalogObject>();
    for (const o of q.data ?? []) map.set(o.id.toUpperCase(), o);
    return map;
  }, [q.data]);
  return { objects: q.data ?? [], byId, isLoading: q.isLoading, error: q.error };
}

export function findObject(byId: Map<string, CatalogObject>, ref: string | null | undefined) {
  if (!ref) return undefined;
  return byId.get(ref.toUpperCase());
}
