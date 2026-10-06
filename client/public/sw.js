/*
 * AstroPilot service worker: keeps the app usable at a dark site with no signal.
 *  - Pages: network first, falling back to the cached app shell.
 *  - Hashed build assets (JS/CSS chunks, including the catalog and star data): cache first; they never change.
 *  - API reads: network first with a timeout, falling back to the last good response (forecast, your
 *    locations and gear, ...). Auth, uploads and anything that isn't a GET always go to the network.
 * The page clears the API cache on sign-in/out (message "clear-api"), so another account never sees it.
 */
const VERSION = "v1";
const SHELL = `ap-shell-${VERSION}`;
const ASSETS = `ap-assets-${VERSION}`;
const API = `ap-api-${VERSION}`;
const NEVER_CACHE = [/^\/api\/auth\/(?!user$)/, /^\/api\/donations\//, /^\/api\/journal\/export/, /^\/api\/objects\/upload/, /^\/objects\//, /^\/sw\.js$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/favicon.svg?v=2", "/manifest.webmanifest"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ap-") && ![SHELL, ASSETS, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-api") event.waitUntil(caches.delete(API));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (r) => {
        clearTimeout(id);
        resolve(r);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

async function networkFirst(request, cacheName, timeoutMs, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), timeoutMs);
    if (response.ok && response.type === "basic") cache.put(fallbackUrl ?? request, response.clone()).catch(() => undefined);
    return response;
  } catch (err) {
    const hit = await cache.match(fallbackUrl ?? request);
    if (hit) return hit;
    throw err;
  }
}

const MAX_ASSETS = 160; // older builds' chunks are evicted first (keys come back in insertion order)

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache
      .put(request, response.clone())
      .then(() => cache.keys())
      .then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k))))
      .catch(() => undefined);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, 6000, "/"));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API, 10000));
  }
});
