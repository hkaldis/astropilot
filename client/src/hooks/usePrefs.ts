import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ApiUser, Preferences } from "@shared/api";
import { api, queryClient } from "@/lib/api";
import { store } from "@/lib/storage";
import { AUTH_KEY, useAuth } from "./useAuth";

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
