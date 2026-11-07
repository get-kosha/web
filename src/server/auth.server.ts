import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { passkey } from "@better-auth/passkey"
import { jwt, twoFactor } from "better-auth/plugins"
import { mcp } from "@better-auth/mcp"
import { getRequest } from "@tanstack/react-start/server"
import { DEFAULT_CATEGORIES } from "@/lib/defaults"
import { DEMO } from "@/lib/core"
import { deleteAllAttachments } from "@/server/attachments.server"

const ORIGIN = env.BETTER_AUTH_URL.replace(/\/+$/, "")
/** The MCP server's URL: what people paste into Claude or ChatGPT, and the audience of its access tokens. */
export const MCP_RESOURCE = `${ORIGIN}/mcp`
/** Who signs MCP access tokens: Better Auth, at its base path. */
export const OAUTH_ISSUER = `${ORIGIN}/api/auth`
/** What an MCP connection may do. A read-only connection sees only the read tools. */
export const API_SCOPES = { read: "kosha:read", write: "kosha:write" } as const

export const auth = betterAuth({
  database: env.DB,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database" },
  // Cloudflare sets the visitor's IP here; rate limits are per IP.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  user: {
    // Deleting an account removes every row of the user's finance data first (Settings › Account › Delete).
    deleteUser: { enabled: true, beforeDelete: (user) => deleteUserData(user.id) },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const DB = env.DB
          const cat = DB.prepare(
            "INSERT OR IGNORE INTO categories (user_id, id, name, icon, income, sort) VALUES (?, ?, ?, ?, ?, ?)"
          )
          await DB.batch(DEFAULT_CATEGORIES.map((c, i) => cat.bind(user.id, c.id, c.name, c.icon, c.income, i)))
        },
      },
    },
  },
  // MCP clients get tokens from /api/auth/oauth2/token, so the JWT plugin's own /token isn't needed.
  disabledPaths: ["/token"],
  // tanstackStartCookies must stay last, because it forwards cookies set by server-side auth.api calls.
  plugins: [
    passkey({ rpName: "Kosha" }),
    twoFactor({ issuer: "Kosha" }),
    // Signs MCP access tokens. It sets no set-auth-jwt header, because session JWTs would share the signing key.
    jwt({ disableSettingJwtHeader: true }),
    // Kosha is the OAuth 2.1 authorization server for its own MCP server. Clients register themselves
    // (Claude, ChatGPT and Cursor all use dynamic registration), and every sign-in still goes through
    // /login and the consent screen at /consent.
    mcp({
      resource: MCP_RESOURCE,
      loginPage: "/login",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email", "offline_access", API_SCOPES.read, API_SCOPES.write],
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Claude Code and other local clients register http://localhost callbacks on a changing port.
      clientRegistrationDefaultApplicationType: "infer",
      // A retried refresh with a used token is replay, not a lost response.
      refreshTokenReuseInterval: 0,
    }),
    tanstackStartCookies(),
  ],
})

/** Every table that holds a user's data, children before parents so foreign keys hold. Auth tables follow the user row. */
export const USER_TABLES = [
  "ai_log",
  "ai_providers",
  "ai_recaps",
  "attachments",
  "reconciliations",
  "import_layouts",
  "payee_aliases",
  "recurring_dismissed",
  "transfers",
  "valuations",
  "transactions",
  "events",
  "subscriptions",
  "title_rules",
  "categories",
  "wallets",
  "settings",
  "api_keys",
  // Last, because deleting attachments and transactions fills it through triggers.
  "attachment_trash",
]
async function deleteUserData(id: string) {
  const DB = env.DB
  await avatars()?.delete(avatarKey(id))
  await deleteAllAttachments(id)
  await DB.batch([
    ...USER_TABLES.map((t) => DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)),
    DB.prepare('DELETE FROM "passkey" WHERE "userId" = ?').bind(id),
    DB.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?').bind(id),
  ])
}

type User = { id: string; email: string; name: string; image: string | null }

// One session lookup per request, shared by the auth middleware and server functions.
const sessions = new WeakMap<Request, Promise<User | null>>()
export function getUser(request: Request = getRequest()) {
  let user = sessions.get(request)
  if (!user) {
    user = auth.api
      .getSession({ headers: request.headers })
      .then((s) => (s ? { id: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image ?? null } : null))
    sessions.set(request, user)
  }
  return user
}

/**
 * Whether this user is the demo account with changes locked. DEMO_WRITABLE=1 in .dev.vars unlocks it
 * locally, so features that write can still be tried in the browser as the demo user.
 */
export const demoLocked = (uid: string | undefined) =>
  uid === DEMO.id && (env as { DEMO_WRITABLE?: string }).DEMO_WRITABLE !== "1"

/** Whether this deployment has the demo account (scripts/seed-demo.ts), so the landing page can offer it. */
export async function demoAvailable() {
  return !!(await env.DB.prepare('SELECT 1 FROM "user" WHERE id = ?').bind(DEMO.id).first())
}

/** The signed-in user's id. Every data query is scoped by it. */
export async function userId() {
  const user = await getUser()
  if (!user) throw new Error("Not signed in")
  return user.id
}

/** The R2 bucket for profile pictures. It's an optional binding, so a deployment without R2 has none. */
export const avatars = () => (env as { AVATARS?: R2Bucket }).AVATARS
const avatarKey = (uid: string) => `avatars/${uid}`

/** The user's profile picture from R2, or null. */
export const getAvatar = (uid: string) => avatars()?.get(avatarKey(uid)) ?? null

/**
 * Stores a profile picture (a JPEG the browser has already cropped and shrunk), or removes it when `file`
 * is null. user.image points at /api/avatar with a new version each time, so browsers can cache it for good.
 */
export async function setAvatar(uid: string, file: Blob | null) {
  const bucket = avatars()
  if (!bucket) throw new Error("Profile pictures aren't set up on this server")
  let image: string | null = null
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // Every JPEG starts FF D8 FF. The route serves it as image/jpeg, so nothing else may get in.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("That image couldn't be read")
    await bucket.put(avatarKey(uid), bytes, { httpMetadata: { contentType: "image/jpeg" } })
    image = `/api/avatar?v=${Date.now().toString(36)}`
  } else await bucket.delete(avatarKey(uid))
  await auth.api.updateUser({ headers: getRequest().headers, body: { image } })
}
