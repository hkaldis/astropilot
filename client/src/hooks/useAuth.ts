import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "@/lib/api";
import type { ApiFeatures, ApiUser } from "@shared/api";

export const AUTH_KEY = ["/api/auth/user"] as const;

export function useAuth() {
  const q = useQuery<{ user: ApiUser | null }>({ queryKey: AUTH_KEY, staleTime: 5 * 60_000, retry: 1 });
  const user = q.data?.user ?? null;
  return { user, isLoading: q.isLoading, isAuthenticated: !!user };
}

export function useFeatures(): ApiFeatures {
  const q = useQuery<ApiFeatures>({ queryKey: ["/api/features"], staleTime: 10 * 60_000 });
  return q.data ?? { google: false, photos: false, donations: false };
}

function onSignedIn(user: ApiUser) {
  queryClient.clear();
  queryClient.setQueryData(AUTH_KEY, { user });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<{ user: ApiUser }>("POST", "/api/auth/login", body),
    onSuccess: (r) => onSignedIn(r.user),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: { email: string; password: string; firstName?: string }) => api<{ user: ApiUser }>("POST", "/api/auth/register", body),
    onSuccess: (r) => onSignedIn(r.user),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api("POST", "/api/auth/logout"),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, { user: null });
    },
  });
}

export function displayName(u: ApiUser | null): string {
  if (!u) return "Guest";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email?.split("@")[0] || "Observer";
}
