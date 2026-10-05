/** Journal data: queries, mutations (with optimistic cache updates) and the photo upload flow. */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ApiObservation, ApiSession, JournalStats, ObservationInput, SessionConditions } from "@shared/api";
import { api, ApiError, queryClient } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export const SESSIONS_KEY = "/api/journal/sessions";
export const STATS_KEY = "/api/journal/stats";
export const sessionKey = (id: number) => `/api/journal/sessions/${id}`;
export const EXPORT_URL = "/api/journal/export.csv";

export interface LogResult {
  observation: ApiObservation;
  session: ApiSession | null;
  objectsThisYear: number;
  firstTime: boolean;
}

export interface SessionInput {
  date?: string;
  endDate?: string | null;
  locationId?: number | null;
  title?: string | null;
  notes?: string | null;
  conditions?: SessionConditions | null;
}

export type ObservationPatch = Partial<Omit<ObservationInput, "locationId">>;

/** Refetch everything journal-related (lists, details, stats, anything other features key under /api/journal). */
export function invalidateJournal() {
  return queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/journal"),
  });
}

export function useJournalSessions() {
  const { user } = useAuth();
  return useQuery<ApiSession[]>({ queryKey: [SESSIONS_KEY], enabled: !!user });
}

export function useJournalSession(id: number) {
  const { user } = useAuth();
  return useQuery<ApiSession>({ queryKey: [sessionKey(id)], enabled: !!user && Number.isInteger(id) && id > 0 });
}

export function useJournalStats() {
  const { user } = useAuth();
  return useQuery<JournalStats>({ queryKey: [STATS_KEY], enabled: !!user });
}

/* ------------------------------------------------------------------------------------------ */

export function useLogObservation() {
  return useMutation({
    mutationFn: (input: ObservationInput) => api<LogResult>("POST", "/api/journal/observations", input),
    onSuccess: (r) => {
      // Show the new row immediately where we already hold the session, then refresh.
      const key = [sessionKey(r.observation.sessionId)];
      const cur = queryClient.getQueryData<ApiSession>(key);
      if (cur?.observations && !cur.observations.some((o) => o.id === r.observation.id)) {
        queryClient.setQueryData<ApiSession>(key, { ...cur, ...(r.session ?? {}), observations: [...cur.observations, r.observation] });
      }
      void invalidateJournal();
    },
  });
}

export function useCreateSession() {
  return useMutation({
    mutationFn: (input: SessionInput) => api<ApiSession>("POST", SESSIONS_KEY, input),
    onSuccess: (s) => {
      queryClient.setQueryData([sessionKey(s.id)], s);
      queryClient.setQueryData<ApiSession[]>([SESSIONS_KEY], (list) =>
        list ? [{ ...s, observations: undefined }, ...list].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)) : list,
      );
      void invalidateJournal();
    },
  });
}

export function useUpdateSession(id: number) {
  const key = [sessionKey(id)];
  return useMutation({
    mutationFn: (input: SessionInput) => api<ApiSession>("PATCH", sessionKey(id), input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ApiSession>(key);
      if (prev) {
        const next: ApiSession = {
          ...prev,
          ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
          ...(input.conditions !== undefined ? { conditions: input.conditions ? { ...(prev.conditions ?? {}), ...input.conditions } : null } : {}),
        };
        queryClient.setQueryData(key, next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSuccess: (s) => queryClient.setQueryData(key, s),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [SESSIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

export function useDeleteSession() {
  return useMutation({
    mutationFn: (id: number) => api("DELETE", sessionKey(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [SESSIONS_KEY] });
      const prev = queryClient.getQueryData<ApiSession[]>([SESSIONS_KEY]);
      if (prev) queryClient.setQueryData<ApiSession[]>([SESSIONS_KEY], prev.filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([SESSIONS_KEY], ctx.prev);
    },
    onSuccess: (_r, id) => queryClient.removeQueries({ queryKey: [sessionKey(id)] }),
    onSettled: () => void invalidateJournal(),
  });
}

/** Patch the observations list of a cached session (and its count in the sessions list). */
function patchCachedObservations(sessionId: number, fn: (list: ApiObservation[]) => ApiObservation[]) {
  const key = [sessionKey(sessionId)];
  const prev = queryClient.getQueryData<ApiSession>(key);
  if (prev?.observations) {
    const observations = fn(prev.observations);
    queryClient.setQueryData<ApiSession>(key, { ...prev, observations, observationCount: observations.length });
    queryClient.setQueryData<ApiSession[]>([SESSIONS_KEY], (list) =>
      list?.map((s) => (s.id === sessionId ? { ...s, observationCount: observations.length } : s)),
    );
  }
  return prev;
}

export function useUpdateObservation(sessionId: number) {
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ObservationPatch }) => api<ApiObservation>("PATCH", `/api/journal/observations/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: [sessionKey(sessionId)] });
      const prev = patchCachedObservations(sessionId, (list) =>
        list.map((o) =>
          o.id === id
            ? {
                ...o,
                ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
                ...(patch.seeing !== undefined ? { seeing: patch.seeing } : {}),
                ...(patch.transparency !== undefined ? { transparency: patch.transparency } : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
                ...(patch.observedAt !== undefined ? { observedAt: patch.observedAt } : {}),
              }
            : o,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([sessionKey(sessionId)], ctx.prev);
    },
    onSuccess: (o) => {
      if (o.sessionId === sessionId) patchCachedObservations(sessionId, (list) => list.map((x) => (x.id === o.id ? o : x)));
    },
    onSettled: () => void invalidateJournal(),
  });
}

export function useDeleteObservation(sessionId: number) {
  return useMutation({
    mutationFn: (id: number) => api("DELETE", `/api/journal/observations/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [sessionKey(sessionId)] });
      const prev = patchCachedObservations(sessionId, (list) => list.filter((o) => o.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData([sessionKey(sessionId)], ctx.prev);
        void queryClient.invalidateQueries({ queryKey: [SESSIONS_KEY] });
      }
    },
    onSettled: () => void invalidateJournal(),
  });
}

/* ---------------------------------------- Photos ---------------------------------------- */

export const MAX_PHOTO_MB = 25;
const PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i; // what browsers can display

/** Originals up to this size are accepted, because they're resized before upload (GIFs aren't). */
const MAX_ORIGINAL_MB = 80;

export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.test(file.type)) return `${file.name}: use a JPEG, PNG, WebP, GIF or AVIF image.`;
  const limit = file.type === "image/gif" ? MAX_PHOTO_MB : MAX_ORIGINAL_MB;
  if (file.size > limit * 1024 * 1024) return `${file.name} is larger than ${limit} MB.`;
  return null;
}

const MAX_EDGE_PX = 2400;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

/**
 * Photos straight off a phone or camera are often 5–25 MB; resized to 2400 px on the long side as a
 * high-quality JPEG they look the same on screen at a tenth of the size — quicker to upload from the
 * field and kinder to storage. Animated GIFs, small images and anything the browser can't decode are
 * sent unchanged.
 */
async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) return file;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    bmp.close();
  }
}

/** Upload one photo (resized if large), then attach it to the observation. */
export async function uploadPhoto(observationId: number, file: File): Promise<{ id: number; url: string }> {
  const problem = photoProblem(file);
  if (problem) throw new ApiError(400, problem);
  const body = await shrinkPhoto(file);
  if (body.size > MAX_PHOTO_MB * 1024 * 1024) throw new ApiError(400, `${file.name} is larger than ${MAX_PHOTO_MB} MB.`);
  const { uploadUrl, token } = await api<{ uploadUrl: string; token: string }>("POST", `/api/journal/observations/${observationId}/photos/upload-url`);
  let put: Response;
  try {
    put = await fetch(uploadUrl, { method: "PUT", body, headers: { "Content-Type": body.type || file.type } });
  } catch {
    throw new ApiError(0, "The photo upload didn't go through. Check your connection and try again.");
  }
  if (!put.ok) throw new ApiError(put.status, "The photo upload didn't go through. Please try again.");
  return api<{ id: number; url: string }>("POST", `/api/journal/observations/${observationId}/photos`, { token });
}

export function useUploadPhotos(sessionId: number) {
  return useMutation({
    mutationFn: async ({ observationId, files }: { observationId: number; files: File[] }) => {
      const done: { id: number; url: string }[] = [];
      for (const f of files) done.push(await uploadPhoto(observationId, f));
      return done;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [sessionKey(sessionId)] }),
  });
}

export function useDeletePhoto(sessionId: number) {
  return useMutation({
    mutationFn: (photoId: number) => api("DELETE", `/api/journal/photos/${photoId}`),
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: [sessionKey(sessionId)] });
      const prev = patchCachedObservations(sessionId, (list) => list.map((o) => ({ ...o, photos: o.photos.filter((p) => p.id !== photoId) })));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([sessionKey(sessionId)], ctx.prev);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [sessionKey(sessionId)] }),
  });
}
