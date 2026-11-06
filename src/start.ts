import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { getUser } from "@/server/auth.server"
import { safeReturn } from "@/lib/core"

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } }) as never

// Every SSR page, server function and server route goes through here.
// Cloudflare's asset layer serves static files in /public before the Worker runs.
const requireUser = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url)
  if (url.pathname.startsWith("/api/auth/")) return next()
  const user = await getUser(request)
  if (url.pathname === "/login") return user ? redirect(safeReturn(url.searchParams.get("returnTo"))) : next()
  if (user) return next()
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
    return redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`)
  return new Response("Unauthorized", { status: 401 }) as never
})

// Server functions are same-origin RPC, so reject cross-site calls to them and to POST server routes (/api/auth).
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn" || ctx.request.method === "POST",
})

export const startInstance = createStart(() => ({ requestMiddleware: [csrf, requireUser] }))
