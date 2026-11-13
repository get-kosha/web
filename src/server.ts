import { env, waitUntil } from "cloudflare:workers"
import { hasSessionCookie } from "@/lib/session-cookie"
import { extractLocaleFromRequest } from "@/paraglide/runtime"

// The Worker's entry. Signed-out visitors see the landing and legal pages the same as everyone else in their
// language, so those are kept in this data centre's cache for a few minutes and a hit never loads the app. The
// Cache API leaves billing as it is (Workers Cache would bill every static file request), and the rest of the
// Worker loads on the first request that isn't a hit.
const PAGES = new Set(["/", "/privacy", "/terms", "/delete-account"])
const TTL = 300

/** Where a signed-out page view is cached, or null when the response might be personal or differ. */
function cacheKey(request: Request) {
  const url = new URL(request.url)
  // ponytail: any query string (utm tags included) skips the cache, so links with tags always render.
  if (request.method !== "GET" || url.search || !PAGES.has(url.pathname)) return null
  if (hasSessionCookie(request.headers.get("cookie"))) return null
  // Each deploy has its own copy, because a page names that build's asset files and the old ones are gone.
  const version = env.CF_VERSION_METADATA.id
  return new Request(`${url.origin}/__pages/${version}/${extractLocaleFromRequest(request)}${url.pathname}`)
}

// The DOM's CacheStorage type, which this project also loads, has no Workers default cache.
const pageCache = () => (caches as unknown as { default: Cache }).default
const app = () => import("@tanstack/react-start/server-entry").then((m) => m.default)

export default {
  async fetch(request: Request, ...rest: unknown[]) {
    const key = cacheKey(request)
    const hit = key && (await pageCache().match(key))
    // Browsers still never store pages (the service worker keeps its own copies), only this cache does.
    if (hit) return withHeader(hit, "private, no-store")
    const res = await (await app()).fetch(request, ...(rest as []))
    const html = res.headers.get("content-type")?.startsWith("text/html")
    if (key && res.status === 200 && html && !res.headers.has("set-cookie"))
      waitUntil(pageCache().put(key, withHeader(res.clone(), `public, max-age=${TTL}`)))
    return res
  },
}

function withHeader(res: Response, cacheControl: string) {
  const copy = new Response(res.body, res)
  copy.headers.set("Cache-Control", cacheControl)
  return copy
}
