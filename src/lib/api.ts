import { createIsomorphicFn, createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { m } from "@/paraglide/messages"
import * as finance from "@/server/finance.server"
import * as ai from "@/server/ai-tasks.server"
import * as statements from "@/server/statements.server"
import * as files from "@/server/attachments.server"
import {
  MCP_RESOURCE,
  accountOverview,
  auth,
  avatars,
  demoAvailable,
  getUser,
  googleSignIn,
  resetEmail,
  setAvatar,
  userId,
} from "@/server/auth.server"
import { canEmail } from "@/server/email.server"
import {
  consentDetails,
  createApiKey,
  deleteApiKey,
  disconnectApp,
  listApiKeys,
  listConnectedApps,
} from "@/server/api.server"
import { AI_PROVIDERS } from "@/server/ai.server"
import * as aiKeys from "@/server/ai.server"
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
export type { AiEntry, AskLink, Recap } from "@/server/ai-tasks.server"
export type { ReconcileEntry } from "@/server/statements.server"

// ---------- meta: everything most screens need ----------

/** What the landing page needs to know about a signed-out visit: whether it can offer the demo account. */
export type Guest = { demo: boolean }

/**
 * A Guest when nobody is signed in, else null. Only the server can tell. The router carries its answer to
 * the client on hydration, but runs beforeLoad again on a hash change, back/forward or invalidate. A guest
 * only ever reaches / by a full page load, so on the client the landing page on screen holds the answer.
 */
export const guestVisit = createIsomorphicFn()
  .server(async (): Promise<Guest | null> => ((await getUser()) ? null : { demo: await demoAvailable() }))
  // ponytail: reads the DOM for the server's earlier answer; a client-side sign-in would need a reload anyway
  .client(async (): Promise<Guest | null> => {
    const page = document.querySelector<HTMLElement>("[data-landing]")
    return page ? { demo: page.dataset.demo === "1" } : null
  })

/** The sign-in methods this deployment offers beyond email, password and passkeys. */
/** What /login can offer: Google, the demo account, and "Forgot password?" (only where email can go out). */
export const signInOptions = createServerFn({ method: "GET" }).handler(async () => ({
  google: googleSignIn,
  demo: await demoAvailable(),
  resetByEmail: canEmail,
}))

/** /reset-password: whether the link still works, and the account's email to show. Reading doesn't use it up. */
export const getResetLink = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().max(200) }))
  .handler(async ({ data }) => {
    const email = await resetEmail(data.token)
    return { valid: email !== null, email }
  })

export const getMeta = createServerFn({ method: "GET" }).handler(async () => {
  const user = (await getUser())!
  // Files left behind by deleted transactions go from R2 after the reply.
  files.purgeLater(user.id)
  // `avatars` and `attachments` say whether this deployment has those R2 buckets (wrangler.jsonc).
  return { ...(await finance.loadMeta(user.id)), user, avatars: !!avatars(), attachments: !!files.attachmentBucket() }
})
export type Meta = Awaited<ReturnType<typeof getMeta>>

// ---------- profile picture ----------

/** Sets the profile picture: a FormData with `file`, a JPEG the browser has cropped to a square. */
export const uploadAvatar = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    const file = data instanceof FormData ? data.get("file") : null
    if (!(file instanceof Blob) || file.size > 512 * 1024) throw new Error(m.server_avatar_too_big())
    return file
  })
  .handler(async ({ data }) => setAvatar(await userId(), data))

export const removeAvatar = createServerFn({ method: "POST" }).handler(async () => setAvatar(await userId(), null))

// ---------- attachments ----------

export type { Attachment } from "@/server/attachments.server"

/** A transaction's receipts and other files. */
export const listAttachments = createServerFn({ method: "GET" })
  .validator(z.object({ transactionId: z.string() }))
  .handler(async ({ data }) => files.listAttachments(await userId(), data.transactionId))

/** Every file on a recurring schedule's payments, such as a salary's payslips. */
export const listScheduleAttachments = createServerFn({ method: "GET" })
  .validator(z.object({ subscriptionId: z.string() }))
  .handler(async ({ data }) => files.scheduleAttachments(await userId(), data.subscriptionId))

/** Attaches a file: a FormData with `transactionId` and `file`, a photo or a PDF. */
export const uploadAttachment = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    const transactionId = data instanceof FormData ? data.get("transactionId") : null
    const file = data instanceof FormData ? data.get("file") : null
    if (typeof transactionId !== "string" || !(file instanceof File)) throw new Error(m.server_choose_file())
    return { transactionId, file }
  })
  .handler(async ({ data }) => files.addAttachment(await userId(), data.transactionId, data.file))

export const deleteAttachment = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => files.deleteAttachment(await userId(), data.id))

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

/** Several accounts at once, from the welcome screen. They all save, or none do. */
export const saveAccounts = createServerFn({ method: "POST" })
  .validator(z.object({ accounts: z.array(finance.accountInput).min(1).max(50) }))
  .handler(async ({ data }) => ({ ids: await finance.saveAccounts(await userId(), data.accounts) }))

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

// ---------- reconcile and import ----------

/** One account's reconciliation state: history, open entries, recent reconciled ones, layouts and payee aliases. */
export const getReconcile = createServerFn({ method: "GET" })
  .validator(z.object({ walletId: z.string().min(1) }))
  .handler(async ({ data }) => statements.reconcileData(await userId(), data.walletId))
export type ReconcileData = Awaited<ReturnType<typeof getReconcile>>

export const finishReconcile = createServerFn({ method: "POST" })
  .validator(statements.finishInput)
  .handler(async ({ data }) => statements.finishReconcile(await userId(), data))

export const undoReconcile = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => statements.undoReconcile(await userId(), data.id))

/** Adds statement lines missing from Kosha. Returns the new entries' ids in line order. */
export const importLines = createServerFn({ method: "POST" })
  .validator(statements.importInput)
  .handler(async ({ data }) => statements.importLines(await userId(), data))

// Getting started: importing many statements at once.

/** CSV layouts and payee names remembered from earlier imports. */
export const getImportMemory = createServerFn({ method: "GET" }).handler(async () =>
  statements.importMemory(await userId())
)

/** An account's entries over a statement's days, to leave out the lines it already has. */
export const getImportEntries = createServerFn({ method: "GET" })
  .validator(statements.entriesInput)
  .handler(async ({ data }) => statements.importEntries(await userId(), data))

/** Statement lines from two accounts that are one transfer, saved as transfers. */
export const importTransferPairs = createServerFn({ method: "POST" })
  .validator(statements.pairsInput)
  .handler(async ({ data }) => statements.importTransferPairs(await userId(), data))

/** Opening balance and reconciliation for one account after an import. */
export const finishImport = createServerFn({ method: "POST" })
  .validator(statements.finishImportInput)
  .handler(async ({ data }) => statements.finishImport(await userId(), data))

// AI help with statements: reading a PDF, a CSV's columns, payee names, and a reconciliation difference.
export const readStatementPdf = createServerFn({ method: "POST" })
  .validator(ai.pdfInput)
  .handler(async ({ data }) => ai.readStatement(await userId(), data))

export const readCsvLayout = createServerFn({ method: "POST" })
  .validator(ai.layoutInput)
  .handler(async ({ data }) => ai.readLayout(await userId(), data))

export const tidyStatementLines = createServerFn({ method: "POST" })
  .validator(ai.tidyInput)
  .handler(async ({ data }) => ai.tidyLines(await userId(), data))

export const explainDifference = createServerFn({ method: "POST" })
  .validator(ai.differenceInput)
  .handler(async ({ data }) => ai.explainDifference(await userId(), data))

// ---------- spotting recurring payments ----------

export const recurringSuggestions = createServerFn({ method: "GET" }).handler(async () =>
  statements.recurringSuggestions(await userId())
)

export const dismissRecurring = createServerFn({ method: "POST" })
  .validator(z.object({ payee: z.string().min(1).max(200) }))
  .handler(async ({ data }) => statements.dismissRecurring(await userId(), data.payee))

/** Files past payments under a recurring schedule made from a suggestion. */
export const linkPayments = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), ids: z.array(z.string()).max(500) }))
  .handler(async ({ data }) => statements.linkPayments(await userId(), data.id, data.ids))

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
  .validator(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, { error: () => m.server_api_key_name_required() })
        .max(60),
      scope: z.enum(["read", "write"]),
    })
  )
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
    const user = await getUser()
    if (!user) throw new Error(m.server_not_signed_in())
    return { ...(await consentDetails(data.query ?? new URL(getRequest().url).search)), email: user.email }
  })

// ---------- AI ----------

const providerId = z.enum(AI_PROVIDERS)
const providerInput = z.object({
  id: providerId,
  key: z.string().trim().max(500).optional(),
  baseUrl: z.string().trim().max(500).optional(),
})
const modelInput = z
  .string()
  .trim()
  .min(1, { error: () => m.server_pick_model() })
  .max(200)

/** Each provider's status. It never includes the key, only its last four characters. */
export const listAiProviders = createServerFn({ method: "GET" }).handler(async () =>
  aiKeys.listProviders(await userId())
)
export type AiProviderView = Awaited<ReturnType<typeof listAiProviders>>[number]

/** Calls the provider's model list with the typed (or stored) key. Returns the latency and models, or the error. */
export const testAiProvider = createServerFn({ method: "POST" })
  .validator(providerInput)
  .handler(async ({ data }) => aiKeys.testProvider(await userId(), data))

/** Connects or updates a provider. The first one connected becomes the default. */
export const saveAiProvider = createServerFn({ method: "POST" })
  .validator(providerInput.extend({ model: modelInput }))
  .handler(async ({ data }) => aiKeys.saveProvider(await userId(), data))

export const setDefaultAiProvider = createServerFn({ method: "POST" })
  .validator(z.object({ id: providerId }))
  .handler(async ({ data }) => aiKeys.setDefaultProvider(await userId(), data.id))

/** Forgets a provider and its key. If it was the default, another connected one takes over. */
export const disconnectAiProvider = createServerFn({ method: "POST" })
  .validator(z.object({ id: providerId }))
  .handler(async ({ data }) => aiKeys.disconnectProvider(await userId(), data.id))

// The AI features. Each is a POST, because each call is logged and spends the user's tokens.

/** A category for a payee Kosha hasn't seen (auto-categorise). */
export const suggestCategory = createServerFn({ method: "POST" })
  .validator(ai.categoryInput)
  .handler(async ({ data }) => ai.suggestCategory(await userId(), data))

/** One transaction read from a typed sentence (natural-language add). */
export const readEntry = createServerFn({ method: "POST" })
  .validator(ai.textEntryInput)
  .handler(async ({ data }) => ai.readEntry(await userId(), data))

/** One transaction read from a photo of a receipt. */
export const scanReceipt = createServerFn({ method: "POST" })
  .validator(ai.receiptInput)
  .handler(async ({ data }) => ai.readEntry(await userId(), data))

/** The recap Overview shows for a month, if any. Reading never writes one. */
export const getRecap = createServerFn({ method: "GET" })
  .validator(
    z.object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    })
  )
  .handler(async ({ data }) => ai.getRecap(await userId(), data.month))

/** Writes, or rewrites, the recap of a finished month. */
export const writeRecap = createServerFn({ method: "POST" })
  .validator(ai.recapInput)
  .handler(async ({ data }) => ai.writeRecap(await userId(), data.month))

/** Ask Kosha. Streams each look-up as it happens, then the answer. */
export const askKosha = createServerFn({ method: "POST" })
  .validator(ai.askInput)
  .handler(async function* ({ data }) {
    yield* ai.ask(await userId(), data.messages)
  })

/** Requests and tokens this month, and the last 30 days of the request log. */
export const getAiUsage = createServerFn({ method: "GET" }).handler(async () => aiKeys.aiUsage(await userId()))

// ---------- delete & reset ----------

/**
 * Deletes every transaction, transfer, valuation and reconciliation, and the recurring schedules too, because settling
 * would otherwise recreate their past payments on the next load. Accounts, categories, rules and settings stay.
 */
export const deleteAllTransactions = createServerFn({ method: "POST" }).handler(async () =>
  finance.deleteAllTransactions(await userId())
)

// ---------- account ----------

/** What deleting the account would remove, for the confirmation step, and which sign-in methods it has. */
export const accountSummary = createServerFn({ method: "GET" }).handler(async () => accountOverview(await userId()))

/** Adds a password to an account that signs in with passkeys only. Changing an existing one goes through authClient.changePassword. */
export const setAccountPassword = createServerFn({ method: "POST" })
  .validator(
    z.object({
      password: z
        .string()
        .min(10, { error: () => m.server_password_min_length() })
        .max(128),
    })
  )
  .handler(async ({ data }) => {
    await userId()
    await auth.api.setPassword({ body: { newPassword: data.password }, headers: getRequest().headers })
  })
