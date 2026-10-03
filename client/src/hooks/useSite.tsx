import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiLocation, ObservingSite } from "@shared/api";
import { store } from "@/lib/storage";
import { useAuth } from "./useAuth";

interface SiteState {
  /** The site everything is computed for (saved location or guest location). */
  site: ObservingSite | null;
  /** All selectable sites (saved locations with coordinates, plus the guest site if any). */
  sites: ObservingSite[];
  locations: ApiLocation[];
  isLoading: boolean;
  selectSite: (key: string) => void;
  /** Set an ad-hoc location (guests, or "use my current position"). */
  setGuestSite: (site: Omit<ObservingSite, "key" | "locationId">) => void;
  clearGuestSite: () => void;
}

const Ctx = createContext<SiteState | null>(null);

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

export function locationToSite(l: ApiLocation): ObservingSite | null {
  if (l.latitude === null || l.longitude === null) return null;
  return {
    key: `loc:${l.id}`,
    locationId: l.id,
    name: l.name,
    lat: l.latitude,
    lon: l.longitude,
    elevation: l.elevation,
    timezone: l.timezone,
    bortle: l.bortle,
    sqm: l.sqm,
  };
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const q = useQuery<ApiLocation[]>({ queryKey: ["/api/locations"], enabled: !!user });
  const [selectedKey, setSelectedKey] = useState<string | null>(() => store.get<string | null>("ap.siteKey", null));
  const [guest, setGuest] = useState<ObservingSite | null>(() => store.get<ObservingSite | null>("ap.guestSite", null));

  const locations = user ? (q.data ?? []) : [];
  const saved = useMemo(() => locations.map(locationToSite).filter((s): s is ObservingSite => !!s), [locations]);
  const sites = useMemo(() => (guest ? [...saved, guest] : saved), [saved, guest]);

  const site = useMemo(() => {
    const byKey = selectedKey ? sites.find((s) => s.key === selectedKey) : undefined;
    if (byKey) return byKey;
    const defId = user?.preferences?.defaultLocationId;
    const byDefault = defId ? saved.find((s) => s.locationId === defId) : undefined;
    const fav = locations.find((l) => l.isFavorite);
    const byFav = fav ? saved.find((s) => s.locationId === fav.id) : undefined;
    return byDefault ?? byFav ?? saved[0] ?? guest ?? null;
  }, [selectedKey, sites, saved, guest, user, locations]);

  const selectSite = useCallback((key: string) => {
    setSelectedKey(key);
    store.set("ap.siteKey", key);
  }, []);

  const setGuestSite = useCallback((s: Omit<ObservingSite, "key" | "locationId">) => {
    const g: ObservingSite = { ...s, key: "guest", locationId: null, timezone: s.timezone ?? browserTimeZone() };
    setGuest(g);
    store.set("ap.guestSite", g);
    setSelectedKey("guest");
    store.set("ap.siteKey", "guest");
  }, []);

  const clearGuestSite = useCallback(() => {
    setGuest(null);
    store.remove("ap.guestSite");
  }, []);

  const value: SiteState = {
    site,
    sites,
    locations,
    isLoading: !!user && q.isLoading,
    selectSite,
    setGuestSite,
    clearGuestSite,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSite() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSite must be used inside SiteProvider");
  return v;
}

/** Time zone to display times in: the site's, else the viewer's. */
export function siteTz(site: ObservingSite | null): string | undefined {
  return site?.timezone ?? browserTimeZone() ?? undefined;
}
