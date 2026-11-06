import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { passkey } from "@better-auth/passkey"
import { twoFactor } from "better-auth/plugins"
import { getRequest } from "@tanstack/react-start/server"
import { DEFAULT_CATEGORIES } from "@/lib/defaults"

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
        before: async (user) => {
          if (!isAllowed(user.email)) throw new APIError("FORBIDDEN", { message: "Sign-up is closed for this email." })
        },
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
  // tanstackStartCookies must stay last: it forwards cookies set by server-side auth.api calls.
  plugins: [passkey({ rpName: "Kosha" }), twoFactor({ issuer: "Kosha" }), tanstackStartCookies()],
})

/** Every table that holds a user's data, children before parents so foreign keys hold. Auth tables follow the user row. */
export const USER_TABLES = [
  "ai_log",
  "ai_providers",
  "transfers",
  "valuations",
  "transactions",
  "subscriptions",
  "title_rules",
  "categories",
  "wallets",
  "settings",
]
async function deleteUserData(id: string) {
  const DB = env.DB
  await DB.batch([
    ...USER_TABLES.map((t) => DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)),
    DB.prepare('DELETE FROM "passkey" WHERE "userId" = ?').bind(id),
    DB.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?').bind(id),
  ])
}

/** ALLOWED_EMAILS limits who can sign up. Empty means anyone. */
function isAllowed(email: string) {
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !allowed.length || allowed.includes(email.toLowerCase())
}

type User = { id: string; email: string; name: string }

// One session lookup per request, shared by the auth middleware and server functions.
const sessions = new WeakMap<Request, Promise<User | null>>()
export function getUser(request: Request = getRequest()) {
  let user = sessions.get(request)
  if (!user) {
    user = auth.api
      .getSession({ headers: request.headers })
      .then((s) => (s ? { id: s.user.id, email: s.user.email, name: s.user.name } : null))
    sessions.set(request, user)
  }
  return user
}

/** The signed-in user's id. Every data query is scoped by it. */
export async function userId() {
  const user = await getUser()
  if (!user) throw new Error("Not signed in")
  return user.id
}
