import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiLocation, LocationInput } from "@shared/api";
import { api } from "@/lib/api";
import { AUTH_KEY } from "@/hooks/useAuth";

export const LOCATIONS_KEY = ["/api/locations"] as const;

/** Location CRUD. Every change refreshes the list and the user (the default location lives in preferences too). */
export function useLocationMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: LOCATIONS_KEY }), qc.invalidateQueries({ queryKey: AUTH_KEY })]);

  const create = useMutation({
    mutationFn: (body: LocationInput) => api<ApiLocation>("POST", "/api/locations", body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<LocationInput> }) => api<ApiLocation>("PATCH", `/api/locations/${id}`, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<void>("DELETE", `/api/locations/${id}`),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
