import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { APP_CALLBACK, auth } from "@/server/auth.server"

// OAuth discovery, which MCP clients look for at the root rather than under /api/auth:
//   /.well-known/oauth-protected-resource[/mcp]        which authorization server guards /mcp (RFC 9728)
//   /.well-known/oauth-authorization-server[/api/auth] the authorization server's endpoints (RFC 8414)
//   /.well-known/openid-configuration[/api/auth]       the same, for OpenID Connect clients
// and the files that let Kosha's apps claim the sign-in callback (APP_CALLBACK), so no other app receives it:
//   /.well-known/assetlinks.json              Android App Links: the app's package and signing certificates
//   /.well-known/apple-app-site-association   iOS universal links: the app's team and bundle id
// Each needs its variable (ANDROID_CERT_SHA256, APPLE_TEAM_ID). A server without them answers 404, and the
// callback page asks the person to open the app instead.
const cors = { "Access-Control-Allow-Origin": "*" }
const authServer = oauthProviderAuthServerMetadata(auth, { headers: cors })
const openId = oauthProviderOpenIdConfigMetadata(auth, { headers: cors })

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

function appleAppSite() {
  const team = APPS.APPLE_TEAM_ID?.trim()
  if (!team) return null
  const path = new URL(APP_CALLBACK).pathname
  return { applinks: { details: [{ appIDs: [`${team}.${APP_ID}`], components: [{ "/": path }] }] } }
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
        if (path.startsWith("/.well-known/oauth-protected-resource")) return withoutDpop(await auth.handler(request))
        if (path.startsWith("/.well-known/oauth-authorization-server")) return withoutDpop(await authServer(request))
        if (path.startsWith("/.well-known/openid-configuration")) return withoutDpop(await openId(request))
        if (path === "/.well-known/assetlinks.json") return jsonOr404(assetLinks())
        if (path === "/.well-known/apple-app-site-association") return jsonOr404(appleAppSite())
        return new Response("Not found", { status: 404 })
      },
    },
  },
})
