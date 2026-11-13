import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

// OAuth discovery, which MCP clients look for at the root rather than under /api/auth:
//   /.well-known/oauth-protected-resource[/mcp]        which authorization server guards /mcp (RFC 9728)
//   /.well-known/oauth-authorization-server[/api/auth] the authorization server's endpoints (RFC 8414)
//   /.well-known/openid-configuration[/api/auth]       the same, for OpenID Connect clients
// and the files that let Kosha's apps claim the sign-in callback (APP_CALLBACK), so no other app receives it:
//   /.well-known/assetlinks.json              Android App Links: the app's package and signing certificates
//   /.well-known/apple-app-site-association   iOS universal links and web credentials: the app's team and bundle id
// Each needs its variable (ANDROID_CERT_SHA256, APPLE_TEAM_ID). A server without them answers 404, and the
// callback page asks the person to open the app instead.
const cors = { "Access-Control-Allow-Origin": "*" }
// Better Auth and the OAuth provider load on first use, so page requests never evaluate them.
const authOf = () => import("@/server/auth.server")
async function metadata(kind: "server" | "openid", request: Request) {
  const [{ auth }, op] = await Promise.all([authOf(), import("@better-auth/oauth-provider")])
  return kind === "server"
    ? op.oauthProviderAuthServerMetadata(auth, { headers: cors })(request)
    : op.oauthProviderOpenIdConfigMetadata(auth, { headers: cors })(request)
}

/** /mcp accepts bearer tokens only (see fromAccessToken), so discovery mustn't offer DPoP. */
async function withoutDpop(res: Response) {
  if (!res.ok) return res
  const doc = (await res.json()) as Record<string, unknown>
  for (const k of Object.keys(doc)) if (k.startsWith("dpop_")) delete doc[k]
  return Response.json(doc, { headers: res.headers })
}

const APP_ID = "app.getkosha"
const APPS = env as { ANDROID_CERT_SHA256?: string; APPLE_TEAM_ID?: string }

/** Comma-separated SHA-256 fingerprints of the Android signing certificates (upload and Play app signing keys). */
function assetLinks() {
  const certs = (APPS.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
  if (!certs.length) return null
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: certs },
    },
  ]
}

/**
 * applinks lets Safari hand the callback to the app. webcredentials is what iOS checks before an
 * ASWebAuthenticationSession may finish on an HTTPS callback (.https(host:path:)), so the app's sign-in needs it.
 */
function appleAppSite(APP_CALLBACK: string) {
  const team = APPS.APPLE_TEAM_ID?.trim()
  if (!team) return null
  const app = `${team}.${APP_ID}`
  const path = new URL(APP_CALLBACK).pathname
  return { applinks: { details: [{ appIDs: [app], components: [{ "/": path }] }] }, webcredentials: { apps: [app] } }
}

const jsonOr404 = (doc: unknown) =>
  doc
    ? Response.json(doc, { headers: { "Cache-Control": "public, max-age=3600" } })
    : new Response("Not found", { status: 404 })

export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const path = new URL(request.url).pathname
        if (path.startsWith("/.well-known/oauth-protected-resource"))
          return withoutDpop(await (await authOf()).auth.handler(request))
        if (path.startsWith("/.well-known/oauth-authorization-server"))
          return withoutDpop(await metadata("server", request))
        if (path.startsWith("/.well-known/openid-configuration")) return withoutDpop(await metadata("openid", request))
        if (path === "/.well-known/assetlinks.json") return jsonOr404(assetLinks())
        if (path === "/.well-known/apple-app-site-association")
          return jsonOr404(appleAppSite((await authOf()).APP_CALLBACK))
        return new Response("Not found", { status: 404 })
      },
    },
  },
})
