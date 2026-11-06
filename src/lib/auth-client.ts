import { createAuthClient } from "better-auth/react"
import { passkeyClient } from "@better-auth/passkey/client"
import { twoFactorClient } from "better-auth/client/plugins"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"

// oauthProviderClient carries an MCP app's signed OAuth request through /login and /consent.
export const authClient = createAuthClient({ plugins: [passkeyClient(), twoFactorClient(), oauthProviderClient()] })
