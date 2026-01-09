import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface AuthResponse {
  user: User | null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      const loginData = await res.json() as AuthResponse;
      
      // Verify session is established by fetching user with the new session cookie
      // This ensures the cookie is properly processed before we continue
      // Retry a few times with increasing delays for slow devices/Safari
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        try {
          const verifyRes = await apiRequest("GET", "/api/auth/user");
          const verifyData = await verifyRes.json() as AuthResponse;
          if (verifyData.user?.id === loginData.user?.id) {
            // Session verified - return data to update cache
            return loginData;
          }
        } catch {
          // Continue retrying
        }
      }
      
      // Session verification failed after all retries - reject the mutation
      throw new Error("Session could not be established. Please try again or refresh the page.");
    },
    onSuccess: (data) => {
      // Only update cache after session is verified working
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", credentials);
      const registerData = await res.json() as AuthResponse;
      
      // Verify session is established by fetching user with the new session cookie
      // This ensures the cookie is properly processed before we continue
      // Retry a few times with increasing delays for slow devices/Safari
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        try {
          const verifyRes = await apiRequest("GET", "/api/auth/user");
          const verifyData = await verifyRes.json() as AuthResponse;
          if (verifyData.user?.id === registerData.user?.id) {
            // Session verified - return data to update cache
            return registerData;
          }
        } catch {
          // Continue retrying
        }
      }
      
      // Session verification failed after all retries - reject the mutation
      throw new Error("Session could not be established. Please try again or refresh the page.");
    },
    onSuccess: (data) => {
      // Only update cache after session is verified working
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: () => {
      // Clear the user from cache on logout
      queryClient.setQueryData(["/api/auth/user"], { user: null });
    },
  });

  return {
    user: data?.user || null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}
