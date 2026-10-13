import { photoOf, type ObjectPhoto } from "@shared/objectImages";
import { findObject, useCatalog } from "@/hooks/useCatalog";

/** The photograph of an example object (catalog object, planet or moon), once the catalog has loaded. */
export function useExamplePhoto(id: string | undefined): ObjectPhoto | null {
  const { byId, isLoading } = useCatalog();
  if (!id || isLoading) return null;
  return photoOf(id, findObject(byId, id) ?? null);
}
