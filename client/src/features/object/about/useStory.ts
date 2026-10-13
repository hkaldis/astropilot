import { useQuery } from "@tanstack/react-query";
import type { StoryResponse } from "@shared/stories";

/** An object's story and measured facts (GET /api/story/:id). Objects without one resolve to an error, which is fine. */
export function useStory(id: string | undefined) {
  return useQuery<StoryResponse | null>({
    queryKey: [`/api/story/${encodeURIComponent(id ?? "")}`],
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    throwOnError: false,
  });
}

/** The catalog's generated one-liners ("An 8.2-magnitude open cluster in Ara…") say nothing the figures don't. */
export const GENERATED_DESC = /^An? [\d.]+-magnitude/;
