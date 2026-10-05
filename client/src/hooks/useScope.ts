import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiGear } from "@shared/api";
import type { ScopeSpec, EyepieceSpec, BarlowSpec } from "@shared/astro/optics";
import { store } from "@/lib/storage";
import { useAuth } from "./useAuth";
import { usePrefs } from "./usePrefs";

export interface ScopePreset {
  id: string;
  name: string;
  aperture: number;
  focalLength: number;
  kind: "eye" | "binoculars" | "telescope";
}

/** Instruments anyone can pick (also handy for owners: "what if I just use binoculars?"). */
export const SCOPE_PRESETS: ScopePreset[] = [
  { id: "eye", name: "Naked eye", aperture: 7, focalLength: 17, kind: "eye" },
  { id: "bino", name: "10×50 binoculars", aperture: 50, focalLength: 180, kind: "binoculars" },
  { id: "r80", name: "80 mm refractor", aperture: 80, focalLength: 600, kind: "telescope" },
  { id: "n130", name: "130 mm reflector", aperture: 130, focalLength: 650, kind: "telescope" },
  { id: "dob8", name: "8″ Dobsonian", aperture: 203, focalLength: 1200, kind: "telescope" },
  { id: "sct8", name: "8″ Schmidt–Cassegrain", aperture: 203, focalLength: 2032, kind: "telescope" },
  { id: "dob10", name: "10″ Dobsonian", aperture: 254, focalLength: 1270, kind: "telescope" },
  { id: "dob12", name: "12″ Dobsonian", aperture: 305, focalLength: 1500, kind: "telescope" },
];

/** A sensible eyepiece kit assumed for presets. */
const PRESET_EYEPIECES: EyepieceSpec[] = [
  { name: "32 mm Plössl", focalLength: 32, afov: 50 },
  { name: "25 mm Plössl", focalLength: 25, afov: 52 },
  { name: "10 mm Plössl", focalLength: 10, afov: 52 },
  { name: "6 mm wide-angle", focalLength: 6, afov: 66 },
];

export interface ActiveScope {
  scope: ScopeSpec & { name: string };
  eyepieces: EyepieceSpec[];
  barlows: BarlowSpec[];
  source: "gear" | "preset";
  telescopeId: number | null;
  presetId: string | null;
  kind: ScopePreset["kind"];
}

// ---- shared selection store (one choice for the whole app, persisted per browser) ----
/** `owner`: the account the pick was made with (null: as a guest). Only that account's own picks override its default telescope. */
type Choice = { mode: "auto" | "preset" | "telescope"; presetId: string; telescopeId: number | null; owner?: string | null };
const KEY = "ap.scopeChoice";
let choice: Choice = store.get<Choice>(KEY, { mode: "auto", presetId: store.get("ap.scopePreset", "dob8"), telescopeId: store.get<number | null>("ap.scopeId", null) });
const listeners = new Set<() => void>();
function setChoice(next: Choice) {
  choice = next;
  store.set(KEY, next);
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
/** The account's default telescope (and whether it has any) as last seen, to notice when Settings or My gear change them. */
let seenDefault: string | undefined;

export function useGear() {
  const { user } = useAuth();
  return useQuery<ApiGear>({ queryKey: ["/api/gear"], enabled: !!user });
}

/**
 * The instrument recommendations are computed for — shared across every page. A signed-in user's default
 * telescope (or their only one) wins over a preset picked as a guest; a pick made with this account stands
 * until they choose another default or add their first telescope.
 */
export function useActiveScope() {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const gear = useGear();
  const c = useSyncExternalStore(subscribe, () => choice);
  const uid = user?.id ?? null;

  const defaultKey = user && gear.data ? `${user.id}|${prefs.defaultTelescopeId ?? ""}|${gear.data.telescopes.length > 0}` : undefined;
  useEffect(() => {
    if (defaultKey === undefined) return;
    if (seenDefault !== undefined && seenDefault !== defaultKey && choice.mode !== "auto") setChoice({ ...choice, mode: "auto" });
    seenDefault = defaultKey;
  }, [defaultKey]);

  const active: ActiveScope = useMemo(() => {
    const g = user ? gear.data : undefined;
    const tels = g?.telescopes ?? [];
    // A guest's preset (or another account's pick) is stale once this account has telescopes of its own.
    const mode = !user || c.owner === user.id ? c.mode : "auto";
    const pickTelescope = mode === "telescope" || (mode === "auto" && tels.length > 0);
    const t = pickTelescope
      ? ((mode === "telescope" ? tels.find((x) => x.id === c.telescopeId) : undefined) ?? tels.find((x) => x.id === prefs.defaultTelescopeId) ?? tels[0])
      : undefined;
    if (t && g) {
      const isBino = /bino/i.test(t.type ?? "") || /bino/i.test(t.name);
      return {
        scope: { name: t.name, aperture: t.aperture, focalLength: t.focalLength, obstruction: t.obstructionRatio },
        eyepieces: g.eyepieces.map((e) => ({ id: e.id, name: e.name, focalLength: e.focalLength, afov: e.apparentFov })),
        barlows: g.barlows.map((b) => ({ id: b.id, name: b.name, factor: b.factor })),
        source: "gear",
        telescopeId: t.id,
        presetId: null,
        kind: isBino ? "binoculars" : "telescope",
      };
    }
    const p = SCOPE_PRESETS.find((x) => x.id === c.presetId) ?? SCOPE_PRESETS[4];
    return {
      scope: { name: p.name, aperture: p.aperture, focalLength: p.focalLength },
      eyepieces: p.kind === "telescope" ? PRESET_EYEPIECES : [],
      barlows: [],
      source: "preset",
      telescopeId: null,
      presetId: p.id,
      kind: p.kind,
    };
  }, [user, gear.data, c, prefs.defaultTelescopeId]);

  return {
    ...active,
    setPreset: (id: string) => setChoice({ ...choice, mode: "preset", presetId: id, owner: uid }),
    setTelescope: (id: number | null) => setChoice({ ...choice, mode: id === null ? "auto" : "telescope", telescopeId: id, owner: uid }),
    telescopes: gear.data?.telescopes ?? [],
    isLoading: !!user && gear.isLoading,
  };
}
