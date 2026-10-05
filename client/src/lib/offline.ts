/** Offline support: the service worker (production only) and keeping its API cache per account. */
const API_CACHE_PREFIX = "ap-api-";

export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(warmOfflineCache)
      .catch(() => undefined);
  });
}

/**
 * When AstroPilot is installed as an app (the way people take it into the field), fetch the pages and
 * the catalog/star data once while there's signal, so they work at a dark site without any.
 */
function warmOfflineCache() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;
  const run = () =>
    void Promise.allSettled([
      import("@/pages/Tonight"),
      import("@/pages/Sky"),
      import("@/pages/Explore"),
      import("@/pages/ObjectPage"),
      import("@/pages/Plan"),
      import("@/pages/Journal"),
      import("@/pages/JournalSession"),
      import("@shared/data/catalog.json"),
      import("@/features/sky/data").then((m) => m.preloadSkyData()),
    ]);
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 15_000 });
  else setTimeout(run, 5_000);
}

/** Forget cached API responses (signed-in data) so another account on this device never sees them. */
export function clearOfflineApiCache() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear-api");
  } catch {
    /* no service worker */
  }
  try {
    if (typeof caches !== "undefined")
      void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(API_CACHE_PREFIX)).map((k) => caches.delete(k))));
  } catch {
    /* Cache Storage unavailable */
  }
}

/** Call with the signed-in user id (or null) whenever it's known; clears the cache when the account changes. */
export function noteAccount(id: string | null) {
  try {
    const prev = localStorage.getItem("ap.account");
    const next = id ?? "";
    if (prev !== null && prev !== next) clearOfflineApiCache();
    if (prev !== next) localStorage.setItem("ap.account", next);
  } catch {
    /* storage unavailable */
  }
}
