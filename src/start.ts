import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { getUser } from "@/server/auth.server"
import { safeReturn } from "@/lib/core"

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } }) as never

// Every SSR page, server function and server route goes through here.
// Cloudflare's asset layer serves static files in /public before the Worker runs.
// The public API, MCP and OAuth discovery check their own bearer tokens and never read the session cookie.
const PUBLIC = /^\/(api\/auth\/|api\/v1(\/|$)|mcp$|\.well-known\/)/
const requireUser = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url)
  if (PUBLIC.test(url.pathname)) return next()
  const user = await getUser(request)
  // An OAuth sign-in (signed `sig` query) can ask a signed-in user to sign in again (prompt=login).
  if (url.pathname === "/login")
    return user && !url.searchParams.has("sig") ? redirect(safeReturn(url.searchParams.get("returnTo"))) : next()
  if (user) return next()
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
    return redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`)
  return new Response("Unauthorized", { status: 401 }) as never
})

// Server functions are same-origin RPC, so reject cross-site calls to them and to POST server routes (/api/auth).
// The bearer-token endpoints are left out, because they ignore cookies, so a cross-site request can't act as the user.
const csrf = createCsrfMiddleware({
  filter: (ctx) =>
    ctx.handlerType === "serverFn" ||
    (ctx.request.method === "POST" && !/^\/(api\/v1(\/|$)|mcp$)/.test(new URL(ctx.request.url).pathname)),
})

export const startInstance = createStart(() => ({ requestMiddleware: [csrf, requireUser] }))
