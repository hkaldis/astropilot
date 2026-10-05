import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ApiUser, Preferences } from "@shared/api";
import { api, queryClient } from "@/lib/api";
import { store } from "@/lib/storage";
import { AUTH_KEY, useAuth } from "./useAuth";

/** Display and observing choices a guest makes before signing up, carried into the new account. */
const GUEST_KEYS = ["units", "timeFormat", "minAltitude"] as const;
/** Accounts whose missing preferences were filled from this browser's guest choices (once per page load). */
const carried = new Set<string>();

export const DEFAULT_PREFS: Required<Omit<Preferences, "defaultLocationId" | "defaultTelescopeId">> & Pick<Preferences, "defaultLocationId" | "defaultTelescopeId"> = {
  units: "metric",
  timeFormat: "24h",
  minAltitude: 20,
  experience: "intermediate",
  onboarded: false,
  defaultLocationId: null,
  defaultTelescopeId: null,
};

/** Preferences: from the account when signed in, from this browser otherwise. */
export function usePrefs() {
  const { user } = useAuth();
  const [local, setLocal] = useState<Preferences>(() => store.get<Preferences>("ap.prefs", {}));
  const m = useMutation({
    mutationFn: (p: Preferences) => api<{ user: ApiUser }>("PATCH", "/api/me", { preferences: p }),
    onSuccess: (r) => queryClient.setQueryData(AUTH_KEY, { user: r.user }),
  });

  const prefs = useMemo(() => ({ ...DEFAULT_PREFS, ...(user ? user.preferences : local) }), [user, local]);

  // Signing up (or in) shouldn't undo the 12-hour clock, units or minimum altitude chosen as a guest: settings the
  // account has never had are filled in once from this browser; after that the account's own settings rule.
  useEffect(() => {
    if (!user || carried.has(user.id)) return;
    const own = user.preferences ?? {};
    const guest = store.get<Preferences>("ap.prefs", {});
    const missing: Preferences = {};
    for (const k of GUEST_KEYS) if (own[k] === undefined && guest[k] !== undefined) Object.assign(missing, { [k]: guest[k] });
    carried.add(user.id);
    if (!Object.keys(missing).length) return;
    queryClient.setQueryData(AUTH_KEY, { user: { ...user, preferences: { ...own, ...missing } } });
    m.mutate(missing, { onError: () => carried.delete(user.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setPrefs = useCallback(
    (p: Preferences) => {
      if (user) {
        queryClient.setQueryData(AUTH_KEY, { user: { ...user, preferences: { ...user.preferences, ...p } } });
        m.mutate(p);
      } else {
        const next = { ...local, ...p };
        setLocal(next);
        store.set("ap.prefs", next);
      }
    },
    [user, local, m],
  );

  return { prefs, setPrefs, hour12: prefs.timeFormat === "12h" };
}
