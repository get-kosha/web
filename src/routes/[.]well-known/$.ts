import { createFileRoute } from "@tanstack/react-router"
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/server/auth.server"

// OAuth discovery, which MCP clients look for at the root rather than under /api/auth:
//   /.well-known/oauth-protected-resource[/mcp]        which authorization server guards /mcp (RFC 9728)
//   /.well-known/oauth-authorization-server[/api/auth] the authorization server's endpoints (RFC 8414)
//   /.well-known/openid-configuration[/api/auth]       the same, for OpenID Connect clients
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

export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const path = new URL(request.url).pathname
        if (path.startsWith("/.well-known/oauth-protected-resource")) return withoutDpop(await auth.handler(request))
        if (path.startsWith("/.well-known/oauth-authorization-server")) return withoutDpop(await authServer(request))
        if (path.startsWith("/.well-known/openid-configuration")) return withoutDpop(await openId(request))
        return new Response("Not found", { status: 404 })
      },
    },
  },
})
