import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { monthOf, monthRange, dayOf } from "@/lib/core"
import { db, getSettings } from "@/server/db.server"
import * as finance from "@/server/finance.server"
import { MCP_RESOURCE, auth, getUser, userId } from "@/server/auth.server"
import {
  consentDetails,
  createApiKey,
  deleteApiKey,
  disconnectApp,
  listApiKeys,
  listConnectedApps,
} from "@/server/api.server"
import {
  AI_PROVIDERS,
  checkBaseUrl,
  decryptKey,
  encryptKey,
  listModels,
  usesBaseUrl,
  type AiProviderId,
} from "@/server/ai.server"
import { getRequest } from "@tanstack/react-start/server"

// The UI's server functions. The work happens in server/finance.server.ts, which the public API
// (/api/v1 and /mcp) calls too; these only validate input and pass the signed-in user's id.

export type {
  Wallet,
  Category,
  Tx,
  Event,
  Upcoming,
  PayeeSuggestion,
  ManagedCategory,
  TitleRuleRow,
} from "@/server/finance.server"
export type { SubscriptionView } from "@/server/db.server"

// ---------- meta: everything most screens need ----------

export const getMeta = createServerFn({ method: "GET" }).handler(async () => {
  const user = (await getUser())!
  return { ...(await finance.loadMeta(user.id)), user }
})
export type Meta = Awaited<ReturnType<typeof getMeta>>

// ---------- dashboard analytics ----------

export const getDashboard = createServerFn({ method: "GET" })
  .validator(finance.dashboardInput)
  .handler(async ({ data }) => finance.dashboard(await userId(), data))

// ---------- transactions ----------

export const listTransactions = createServerFn({ method: "GET" })
  .validator(finance.listInput)
  .handler(async ({ data }) => finance.listTransactions(await userId(), data))

// ---------- events ----------

export const saveEvent = createServerFn({ method: "POST" })
  .validator(finance.eventInput)
  .handler(async ({ data }) => ({ id: await finance.saveEvent(await userId(), data) }))

/** Deletes an event. Its transactions stay but no longer belong to it. */
export const deleteEvent = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await finance.deleteEvent(await userId(), data.id)
  })

/** A payee's recent payments, for the "At this payee" bars in the Activity panel. */
export const getPayeeHistory = createServerFn({ method: "GET" })
  .validator(z.object({ name: z.string().min(1).max(200) }))
  .handler(async ({ data }) => finance.payeeHistory(await userId(), data.name))

export const saveTransaction = createServerFn({ method: "POST" })
  .validator(finance.saveInput)
  .handler(async ({ data }) => ({ id: (await finance.saveTransactions(await userId(), [data]))[0] }))

export const deleteTransaction = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await finance.deleteTransactions(await userId(), [data.id])
  })

export const saveTransfer = createServerFn({ method: "POST" })
  .validator(finance.transferInput)
  .handler(async ({ data }) => ({ transferId: (await finance.saveTransfers(await userId(), [data]))[0] }))

/** Every transfer between different currencies, newest first, with fee, provider and market rate. */
export const listExchanges = createServerFn({ method: "GET" }).handler(async () =>
  finance.listExchanges(await userId())
)
export type Exchange = Awaited<ReturnType<typeof listExchanges>>[number]

// ---------- settings ----------

export const saveSettings = createServerFn({ method: "POST" })
  .validator(finance.settingsInput)
  .handler(async ({ data }) => finance.saveSettings(await userId(), data))

/** Fetches rates now for Settings › Currencies › Refresh, at most once every 10 minutes. */
export const refreshRatesNow = createServerFn({ method: "POST" }).handler(async () => {
  await finance.refreshRatesNow(await userId())
})

/** Appearance, saved to the account so every device agrees. Only the keys passed change. */
export const savePreferences = createServerFn({ method: "POST" })
  .validator(finance.prefsInput)
  .handler(async ({ data }) => finance.savePreferences(await userId(), data))

// ---------- subscriptions ----------

export const listSubscriptions = createServerFn({ method: "GET" }).handler(async () =>
  finance.listSubscriptions(await userId())
)

/** Income over the last 365 days, per account currency (Recurring shows committed costs as a share of it). */
export const recentIncome = createServerFn({ method: "GET" }).handler(async () => finance.recentIncome(await userId()))

export const saveSubscription = createServerFn({ method: "POST" })
  .validator(finance.subInput)
  .handler(async ({ data }) => ({ id: await finance.saveSubscription(await userId(), data) }))

export const deleteSubscription = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await finance.deleteSubscription(await userId(), data.id)
  })

/** Change one occurrence without touching the rest of the schedule. */
export const updateOccurrence = createServerFn({ method: "POST" })
  .validator(finance.occurrenceInput)
  .handler(async ({ data }) => finance.updateOccurrence(await userId(), data))

// ---------- accounts ----------

export const saveAccount = createServerFn({ method: "POST" })
  .validator(finance.accountInput)
  .handler(async ({ data }) => ({ id: await finance.saveAccount(await userId(), data) }))

export const deleteAccount = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => finance.deleteAccount(await userId(), data.id))

export const listValuations = createServerFn({ method: "GET" }).handler(async () =>
  finance.listValuations(await userId())
)

export const recordGain = createServerFn({ method: "POST" })
  .validator(finance.gainInput)
  .handler(async ({ data }) => finance.recordGains(await userId(), [data]))

export const deleteValuation = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await finance.deleteValuation(await userId(), data.id)
  })

// ---------- accounts page ----------

export const getAccountsOverview = createServerFn({ method: "GET" })
  .validator(finance.dashboardInput)
  .handler(async ({ data }) => finance.accountsOverview(await userId(), data))
export type AccountsOverview = Awaited<ReturnType<typeof getAccountsOverview>>

// ---------- quick add ----------

/** Past payees matching q (most used first) with their last category and account and their average amount. */
export const suggestPayees = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().max(100) }))
  .handler(async ({ data }) => finance.suggestPayees(await userId(), data.q))

// ---------- categories ----------

export const listCategories = createServerFn({ method: "GET" }).handler(async () =>
  finance.listCategories(await userId())
)

export const saveCategory = createServerFn({ method: "POST" })
  .validator(finance.categoryInput)
  .handler(async ({ data }) => ({ id: await finance.saveCategory(await userId(), data) }))

/** Archived categories leave every picker but keep their history. */
export const archiveCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), archived: z.boolean() }))
  .handler(async ({ data }) => finance.archiveCategory(await userId(), data))

/** Moves everything that uses a category into another, then deletes it. */
export const mergeCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), into: z.string() }))
  .handler(async ({ data }) => finance.mergeCategory(await userId(), data))

/** Deletes a category nothing uses. Anything in use is merged or archived instead. */
export const deleteCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => finance.deleteCategory(await userId(), data.id))

// ---------- payee rules ----------

/** Payee rules, most used first, 50 a page. */
export const listTitleRules = createServerFn({ method: "GET" })
  .validator(finance.rulesInput)
  .handler(async ({ data }) => finance.listTitleRules(await userId(), data))

/** Creates or edits a rule you made. `old` is the payee text it had, when that changes. */
export const saveTitleRule = createServerFn({ method: "POST" })
  .validator(finance.ruleInput)
  .handler(async ({ data }) => finance.saveTitleRules(await userId(), [data]))

export const deleteTitleRule = createServerFn({ method: "POST" })
  .validator(z.object({ title: z.string().max(100) }))
  .handler(async ({ data }) => {
    await finance.deleteTitleRules(await userId(), [data.title])
  })

// ---------- API keys and connected apps (Settings › API & MCP) ----------

export const getApiAccess = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  const [keys, apps] = await Promise.all([listApiKeys(uid), listConnectedApps(uid)])
  return { keys, apps, mcpUrl: MCP_RESOURCE, docsUrl: `${new URL(MCP_RESOURCE).origin}/api/v1/docs` }
})

/** The key is returned once, here; only its hash is stored. */
export const addApiKey = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(1, "Name the key").max(60), scope: z.enum(["read", "write"]) }))
  .handler(async ({ data }) => createApiKey(await userId(), data))

export const removeApiKey = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => deleteApiKey(await userId(), data.id))

/** Revokes an app's tokens and consent. It loses access at once. */
export const removeConnectedApp = createServerFn({ method: "POST" })
  .validator(z.object({ clientId: z.string() }))
  .handler(async ({ data }) => disconnectApp(await userId(), data.clientId))

/**
 * The /consent screen: which app is asking, for what. `query` is the page's raw query string; left out
 * during server rendering, where the page request carries it. (The router's own search string is
 * re-encoded, which breaks the signature.)
 */
export const getConsentRequest = createServerFn({ method: "GET" })
  .validator(z.object({ query: z.string().max(8000).optional() }))
  .handler(async ({ data }) => {
    await userId()
    return consentDetails(data.query ?? new URL(getRequest().url).search)
  })

// ---------- AI ----------

const providerId = z.enum(AI_PROVIDERS)
type ProviderRow = {
  id: AiProviderId
  base_url: string | null
  model: string
  key_cipher: string | null
  key_iv: string | null
  key_hint: string | null
  is_default: number
}
const loadProviders = async (uid: string) =>
  (
    await db()
      .prepare(
        "SELECT id, base_url, model, key_cipher, key_iv, key_hint, is_default FROM ai_providers WHERE user_id = ?"
      )
      .bind(uid)
      .all<ProviderRow>()
  ).results

/** Each provider's status. It never includes the key, only its last four characters. */
export const listAiProviders = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await loadProviders(await userId())
  return AI_PROVIDERS.map((id) => {
    const r = rows.find((x) => x.id === id)
    return {
      id,
      connected: !!r,
      model: r?.model ?? "",
      keyHint: r?.key_hint ?? null,
      baseUrl: r?.base_url ?? null,
      isDefault: !!r?.is_default,
    }
  })
})
export type AiProviderView = Awaited<ReturnType<typeof listAiProviders>>[number]

const providerInput = z.object({
  id: providerId,
  key: z.string().trim().max(500).optional(),
  baseUrl: z.string().trim().max(500).optional(),
})

/** The key and URL to use: what was typed, or what's stored when the field was left blank. */
async function credentials(uid: string, data: z.infer<typeof providerInput>) {
  const stored = (await loadProviders(uid)).find((r) => r.id === data.id)
  const key =
    data.key || (stored?.key_cipher && stored.key_iv ? await decryptKey(stored.key_cipher, stored.key_iv) : "")
  const baseUrl = usesBaseUrl(data.id) ? checkBaseUrl(data.baseUrl || stored?.base_url || "") : null
  if (!usesBaseUrl(data.id) && !key) throw new Error("Paste an API key")
  return { key, baseUrl, stored }
}

/** Calls the provider's model list with the typed (or stored) key. Returns the latency and models, or the error. */
export const testAiProvider = createServerFn({ method: "POST" })
  .validator(providerInput)
  .handler(async ({ data }) => {
    const { key, baseUrl } = await credentials(await userId(), data)
    return listModels(data.id, key, baseUrl)
  })

/** Connects or updates a provider. The first one connected becomes the default. */
export const saveAiProvider = createServerFn({ method: "POST" })
  .validator(providerInput.extend({ model: z.string().trim().min(1, "Pick a model").max(200) }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const { key, baseUrl, stored } = await credentials(uid, data)
    const enc = data.key ? await encryptKey(data.key) : null
    const others = (await loadProviders(uid)).filter((r) => r.id !== data.id)
    const isDefault = stored ? stored.is_default : others.some((r) => r.is_default) ? 0 : 1
    await db()
      .prepare(`INSERT INTO ai_providers (user_id, id, base_url, model, key_cipher, key_iv, key_hint, is_default, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(user_id, id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model,
          key_cipher = excluded.key_cipher, key_iv = excluded.key_iv, key_hint = excluded.key_hint, updated_at = unixepoch()`)
      .bind(
        uid,
        data.id,
        baseUrl,
        data.model,
        enc?.cipher ?? stored?.key_cipher ?? null,
        enc?.iv ?? stored?.key_iv ?? null,
        key ? key.slice(-4) : null,
        isDefault
      )
      .run()
  })

export const setDefaultAiProvider = createServerFn({ method: "POST" })
  .validator(z.object({ id: providerId }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const DB = db()
    const row = await DB.prepare("SELECT 1 FROM ai_providers WHERE user_id = ? AND id = ?").bind(uid, data.id).first()
    if (!row) throw new Error("Connect it first")
    await DB.prepare("UPDATE ai_providers SET is_default = (id = ?) WHERE user_id = ?").bind(data.id, uid).run()
  })

/** Forgets a provider and its key. If it was the default, another connected one takes over. */
export const disconnectAiProvider = createServerFn({ method: "POST" })
  .validator(z.object({ id: providerId }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const DB = db()
    await DB.batch([
      DB.prepare("DELETE FROM ai_providers WHERE user_id = ? AND id = ?").bind(uid, data.id),
      DB.prepare(`UPDATE ai_providers SET is_default = 1 WHERE user_id = ?1 AND id = (SELECT id FROM ai_providers
        WHERE user_id = ?1 ORDER BY updated_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM ai_providers WHERE user_id = ?1 AND is_default = 1)`).bind(
        uid
      ),
    ])
  })

/** Requests and tokens this month, and the last 30 days of the request log. */
export const getAiUsage = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  const { tz } = await getSettings(uid)
  const [from] = monthRange(monthOf(Date.now() / 1000, tz), tz)
  const DB = db()
  const [usage, log] = await DB.batch([
    DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
      FROM ai_log WHERE user_id = ? AND at >= ?`).bind(uid, from),
    DB.prepare(`SELECT id, at, provider, model, feature, request, response, tokens_in, tokens_out FROM ai_log
      WHERE user_id = ? AND at >= unixepoch() - 30 * 86400 ORDER BY at DESC LIMIT 100`).bind(uid),
  ])
  return {
    ...(usage.results[0] as { requests: number; tokens: number }),
    log: (
      log.results as {
        id: string
        at: number
        provider: string
        model: string
        feature: string
        request: string
        response: string
        tokens_in: number
        tokens_out: number
      }[]
    ).map((r) => ({
      ...r,
      day: dayOf(r.at, tz),
    })),
  }
})

// ---------- delete & reset ----------

/**
 * Deletes every transaction, transfer and valuation, and the recurring schedules too, because settling
 * would otherwise recreate their past payments on the next load. Accounts, categories, rules and settings stay.
 */
export const deleteAllTransactions = createServerFn({ method: "POST" }).handler(async () => {
  const uid = await userId()
  const DB = db()
  await DB.batch(
    ["transfers", "valuations", "transactions", "subscriptions"].map((t) =>
      DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid)
    )
  )
})

// ---------- account ----------

/** What deleting the account would remove, for the confirmation step. */
export const accountSummary = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  const n = (table: string) => `(SELECT COUNT(*) FROM ${table} WHERE user_id = ?1)`
  const row = await db()
    .prepare(`SELECT ${n("transactions")} AS transactions, ${n("wallets")} AS accounts,
      ${n("subscriptions")} AS recurring, ${n("categories")} AS categories, ${n("title_rules")} AS rules`)
    .bind(uid)
    .first<{ transactions: number; accounts: number; recurring: number; categories: number; rules: number }>()
  const hasPassword = !!(await db()
    .prepare(`SELECT 1 FROM "account" WHERE "userId" = ? AND "providerId" = 'credential' AND "password" IS NOT NULL`)
    .bind(uid)
    .first())
  const twoFa = await db()
    .prepare(
      `SELECT "twoFactorEnabled" AS on2fa, (SELECT COUNT(*) FROM "passkey" WHERE "userId" = ?1) AS passkeys FROM "user" WHERE "id" = ?1`
    )
    .bind(uid)
    .first<{ on2fa: number | null; passkeys: number }>()
  return { ...row!, hasPassword, twoFactor: !!twoFa?.on2fa, passkeys: twoFa?.passkeys ?? 0 }
})

/** Adds a password to an account that signs in with passkeys only. Changing an existing one goes through authClient.changePassword. */
export const setAccountPassword = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string().min(10, "Use at least 10 characters").max(128) }))
  .handler(async ({ data }) => {
    await userId()
    await auth.api.setPassword({ body: { newPassword: data.password }, headers: getRequest().headers })
  })
