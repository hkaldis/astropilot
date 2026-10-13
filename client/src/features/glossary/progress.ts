import { useMemo, useSyncExternalStore } from "react";
import { store } from "@/lib/storage";

// The terms this browser has opened, so the glossary can show progress and pick up where you left off.
const KEY = "ap.glossarySeen";
const listeners = new Set<() => void>();
let cache: string[] | null = null;
const NONE: string[] = [];

function read(): string[] {
  return (cache ??= store.get<string[]>(KEY, []));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function markSeen(slug: string) {
  const seen = read();
  if (seen.includes(slug)) return;
  cache = [...seen, slug];
  store.set(KEY, cache);
  listeners.forEach((fn) => fn());
}

/** The set of terms opened so far (updates live when another one is opened). */
export function useSeenTerms(): Set<string> {
  const list = useSyncExternalStore(subscribe, read, () => NONE);
  return useMemo(() => new Set(list), [list]);
}
