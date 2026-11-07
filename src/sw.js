// Kosha's service worker. vite.config.ts builds it into /sw.js and fills in the two values below,
// so every deploy is a new worker and the app can offer the update.
const VERSION = __VERSION__
const ASSETS = __ASSETS__

// Built files are content-hashed, so they never change once cached.
const STATIC = `static-${VERSION}`
// Pages and server-function reads from the last visit, so the app opens offline.
// Versioned too: an old page points at old asset files, which are deleted below.
const DATA = `data-${VERSION}`

const OFFLINE_PAGE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kosha</title><body style="font:15px system-ui;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center;color:#555">
<p>You're offline, and this page wasn't saved on this device.<br>Open it again once you're back online.</p>`

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(ASSETS)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// The page asks for this when the user taps "Reload" on the update prompt.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting()
})

// Network first, so online users always see current data. A good response is kept for offline use.
async function networkFirst(request, fallback) {
  const cache = await caches.open(DATA)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    // The session ended, so forget what this device saved for it.
    else if (response.status === 401) await caches.delete(DATA)
    return response
  } catch (error) {
    const saved = await cache.match(request)
    if (saved) return saved
    if (fallback) return fallback()
    throw error
  }
}

async function cacheFirst(request) {
  const saved = await caches.match(request)
  if (saved) return saved
  const response = await fetch(request)
  if (response.ok) await (await caches.open(STATIC)).put(request, response.clone())
  return response
}

// Only same-origin reads of the app itself. Writes, auth, the public API, MCP and export always go to the network.
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return
  if (/^\/(api\/|mcp$|\.well-known\/|login$|consent$|forgot-password$|reset-password$)/.test(url.pathname)) return

  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(request))
  else if (url.pathname.startsWith("/_serverFn/")) event.respondWith(networkFirst(request))
  else if (request.mode === "navigate")
    event.respondWith(
      networkFirst(
        request,
        () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      )
    )
})
