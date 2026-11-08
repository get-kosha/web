import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { demoLocked, getUser } from "@/server/auth.server"
import { DEMO_READ_ONLY, safeReturn } from "@/lib/core"
import { paraglideMiddleware } from "@/paraglide/server"

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } }) as never

// Every SSR page, server function and server route goes through here.
// Cloudflare's asset layer serves static files in /public before the Worker runs.
// The public API, the phone apps' endpoints, MCP and OAuth discovery check their own bearer tokens and never
// read the session cookie.
const BEARER = /^\/(api\/v1(\/|$)|api\/app\/|mcp$)/
const PUBLIC = /^\/(api\/auth\/|api\/v1(\/|$)|api\/app\/|mcp$|\.well-known\/)/
const SIGNED_OUT_PAGES = new Set([
  "/",
  "/privacy",
  "/terms",
  "/delete-account",
  "/forgot-password",
  "/reset-password",
  "/auth/error",
  "/app/oauth/callback",
])
const requireUser = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url)
  if (PUBLIC.test(url.pathname)) return next()
  const user = await getUser(request)
  // An OAuth sign-in (signed `sig` query) can ask a signed-in user to sign in again (prompt=login).
  if (url.pathname === "/login")
    return user && !url.searchParams.has("sig") ? redirect(safeReturn(url.searchParams.get("returnTo"))) : next()
  if (user) return next()
  // A signed-out visit to / gets the landing page (the _app layout renders it instead of the app), and the
  // legal, password reset and auth error pages and the apps' sign-in callback are public too. GET and HEAD
  // qualify, so link-preview bots can read the card. Server functions live under /_serverFn/.
  if ((request.method === "GET" || request.method === "HEAD") && SIGNED_OUT_PAGES.has(url.pathname)) return next()
  const page = request.method === "GET" && request.headers.get("accept")?.includes("text/html")
  if (page) return redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`)
  return new Response("Unauthorized", { status: 401 }) as never
})

// Every message and email rendered for this request speaks its locale (cookie, then Accept-Language, then English).
// The public API and MCP skip it, so they answer in English like their documentation.
const API = /^\/(api\/v1(\/|$)|mcp$)/
const locale = createMiddleware().server(({ next, request }) =>
  API.test(new URL(request.url).pathname) ? next() : paraglideMiddleware(request, () => next())
)

// Server functions are same-origin RPC, so reject cross-site calls to them and to POST server routes (/api/auth).
// The bearer-token endpoints are left out, because they ignore cookies, so a cross-site request can't act as the user.
// So are the OAuth endpoints apps and MCP clients call directly (native apps send no Origin header), but only
// without cookies: they authenticate with a code, PKCE verifier or token, never a session. A request that carries
// cookies is checked like any other, so another site can't, say, register a client owned by the user.
const COOKIELESS = /^\/api\/auth\/oauth2\/(token|revoke|introspect|register)$/
const csrf = createCsrfMiddleware({
  filter: (ctx) => {
    if (ctx.handlerType === "serverFn") return true
    const path = new URL(ctx.request.url).pathname
    if (ctx.request.method !== "POST" || BEARER.test(path)) return false
    return !COOKIELESS.test(path) || ctx.request.headers.has("cookie")
  },
})

// The demo account is read-only. Every server function that changes data is a POST, so refuse them all
// here rather than in each one. GET functions still run, so due subscriptions keep settling on load.
const demoReadOnly = createMiddleware({ type: "function" }).server(async ({ next, method }) => {
  if (method === "POST" && demoLocked((await getUser())?.id)) throw new Error(DEMO_READ_ONLY())
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [locale, csrf, requireUser],
  functionMiddleware: [demoReadOnly],
}))
