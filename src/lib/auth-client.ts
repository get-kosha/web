import { createAuthClient } from "better-auth/react"
import { passkeyClient } from "@better-auth/passkey/client"
import { twoFactorClient } from "better-auth/client/plugins"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { sentinelClient } from "@better-auth/infra/client"

// oauthProviderClient carries an MCP app's signed OAuth request through /login and /consent. sentinelClient
// sends a browser fingerprint with auth requests for the Better Auth dashboard (dash() in auth.server.ts).
// ponytail: identifyUrl is getkosha.app's Better Auth project; a self-hosted copy should use its own or drop it.
const identifyUrl = "https://kv.better-auth.com/api/v1/projects/ijK6ph6sYZ8iLgZphlaXPUptVu3Mk5HE"
export const authClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient(), oauthProviderClient(), sentinelClient({ identifyUrl })],
})

/** Signs out and forgets the pages and data this device saved for offline use. Queued new entries stay for next time. */
export const signOut = () => signOutTo("/login")

/** signOut, then opens `to` instead of the sign-in page. */
export async function signOutTo(to: string) {
  await authClient.signOut()
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  window.location.assign(to)
}
