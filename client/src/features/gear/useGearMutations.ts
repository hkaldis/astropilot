import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiGear, GearKind } from "@shared/api";
import { api } from "@/lib/api";
import { AUTH_KEY } from "@/hooks/useAuth";

export type GearItem = ApiGear[GearKind][number];
export type GearBody = Record<string, unknown>;

/** Create / update / delete gear; every change refreshes GET /api/gear. */
export function useGearMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/gear"] });

  const create = useMutation({
    mutationFn: ({ kind, body }: { kind: GearKind; body: GearBody }) => api<GearItem>("POST", `/api/gear/${kind}`, body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ kind, id, body }: { kind: GearKind; id: number; body: GearBody }) => api<GearItem>("PATCH", `/api/gear/${kind}/${id}`, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: GearKind; id: number }) => api<void>("DELETE", `/api/gear/${kind}/${id}`),
    onSuccess: (_r, v) => {
      refresh();
      // Deleting the default telescope also clears preferences.defaultTelescopeId on the server.
      if (v.kind === "telescopes") qc.invalidateQueries({ queryKey: AUTH_KEY });
    },
  });
  return { create, update, remove };
}

export const KIND_LABEL: Record<GearKind, { one: string; many: string; add: string }> = {
  telescopes: { one: "telescope", many: "Telescopes", add: "Add telescope" },
  eyepieces: { one: "eyepiece", many: "Eyepieces", add: "Add eyepiece" },
  barlows: { one: "Barlow or reducer", many: "Barlows & reducers", add: "Add Barlow or reducer" },
  filters: { one: "filter", many: "Filters", add: "Add filter" },
  cameras: { one: "camera", many: "Cameras", add: "Add camera" },
};
