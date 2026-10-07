import { QueryClient, type QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The error body's other fields (e.g. a forecast's `relay`). */
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message: string | null = null;
  let data: Record<string, unknown> | undefined;
  try {
    const body = await res.json();
    if (typeof body?.message === "string") message = body.message;
    if (body && typeof body === "object") data = body;
  } catch {
    /* not JSON (e.g. a proxy error page) */
  }
  if (!message) message = res.status >= 502 ? "Can't reach AstroPilot right now. Check your connection and try again." : res.statusText || "Request failed";
  return new ApiError(res.status, message, data);
}

/** JSON fetch against our API. Throws ApiError with the server's human message. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Can't reach AstroPilot right now. Check your connection and try again.");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T,>(url: string) => api<T>("GET", url);

/** Default query fn: the first query-key element is the URL. */
const defaultQueryFn: QueryFunction = async ({ queryKey }) => apiGet(String(queryKey[0]));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Build a URL with query parameters, skipping null/undefined. */
export function withParams(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
