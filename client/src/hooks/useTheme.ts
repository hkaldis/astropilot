import { useCallback, useSyncExternalStore } from "react";
import { store } from "@/lib/storage";

export type Theme = "dark" | "light" | "night";

const listeners = new Set<() => void>();
let current: Theme = store.get<Theme>("ap.theme", "dark");

function apply(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light", "night-vision");
  root.classList.add(t === "light" ? "light" : "dark");
  if (t === "night") root.classList.add("night-vision");
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", t === "light" ? "#f5f7fb" : t === "night" ? "#0a0000" : "#05070c");
}

if (typeof document !== "undefined") apply(current);

export function setTheme(t: Theme) {
  current = t;
  store.set("ap.theme", t);
  apply(t);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  const toggleNight = useCallback(() => setTheme(current === "night" ? "dark" : "night"), []);
  return { theme, setTheme, toggleNight };
}
