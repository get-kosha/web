import { createAuthClient } from "better-auth/react"
import { passkeyClient } from "@better-auth/passkey/client"
import { twoFactorClient } from "better-auth/client/plugins"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"

// oauthProviderClient carries an MCP app's signed OAuth request through /login and /consent.
export const authClient = createAuthClient({ plugins: [passkeyClient(), twoFactorClient(), oauthProviderClient()] })

/** Signs out and forgets the pages and data this device saved for offline use. Queued new entries stay for next time. */
export async function signOut() {
  await authClient.signOut()
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  window.location.assign("/login")
}
