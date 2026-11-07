// Endpoints only Kosha's own phone apps call, under /api/app. They mirror server functions the web uses
// (src/lib/api.ts) for what the public API leaves out on purpose: AI keys, API keys, export, Delete & reset,
// attachments, the profile and statement import. They are not MCP tools and not in the OpenAPI document,
// and they take only access tokens issued to APP_CLIENTS. Errors and messages follow Accept-Language.

import { z } from "zod"
import { DEMO_READ_ONLY, dayOf, monthRange } from "@/lib/core"
import { csvAccountHint, guessLayout, isOfx, layoutSignature, parseCsv, parseOfx, readCsv } from "@/lib/statement"
import { m } from "@/paraglide/messages"
import * as aiKeys from "@/server/ai.server"
import * as ai from "@/server/ai-tasks.server"
import {
  bearer,
  createApiKey,
  deleteApiKey,
  describeError,
  disconnectApp,
  fail,
  fromAccessToken,
  json,
  listApiKeys,
  listConnectedApps,
  overLimit,
  zodIssues,
  type Principal,
} from "@/server/api.server"
import * as files from "@/server/attachments.server"
import {
  API_RESOURCE,
  APP_CLIENTS,
  MCP_RESOURCE,
  accountOverview,
  avatars,
  demoLocked,
  getAvatar,
  setAvatar,
  updateProfile,
} from "@/server/auth.server"
import { HttpError, db, getSettings } from "@/server/db.server"
import { everythingJson, transactionsCsv } from "@/server/export.server"
import * as finance from "@/server/finance.server"
import * as statements from "@/server/statements.server"

/** Bumped when an endpoint here changes in a way older apps can't read, so an app can tell a server is too old. */
const APP_API_VERSION = 1

type Ctx = { uid: string; params: Record<string, string>; url: URL; request: Request }
type Handler = (c: Ctx) => Promise<unknown>

/** A JSON body checked against a schema; a failure answers 400 with every invalid field. */
const body = async <T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> =>
  schema.parse(await c.request.json().catch(() => ({})))

const file = (bytes: BodyInit | null, type: string, name: string, download = true) =>
  new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })

const providerId = z.enum(aiKeys.AI_PROVIDERS)
const providerInput = z.object({
  key: z.string().trim().max(500).optional(),
  baseUrl: z.string().trim().max(500).optional(),
})

/** A statement file to read: text for CSV, OFX and QFX, base64 for a PDF (read by the AI model). */
const readInput = z.object({
  name: z.string().trim().max(200),
  content: z.string().max(15_000_000),
  format: z.enum(["csv", "ofx", "qfx", "pdf"]).optional(),
  /** A credit card's statement: its CSV usually shows spending as positive. */
  card: z.boolean().default(false),
  /** The columns as the person set them; left out, Kosha uses the remembered layout or its own guess. */
  layout: statements.layoutSchema.optional(),
})

async function readStatement(uid: string, input: z.infer<typeof readInput>) {
  const ext = input.name.toLowerCase().match(/\.(csv|ofx|qfx|pdf)$/)?.[1]
  const format = input.format ?? (ext === "pdf" ? "pdf" : isOfx(input.content) ? "ofx" : ext === "qfx" ? "qfx" : "csv")
  if (format === "pdf")
    return { format, ...(await ai.readStatement(uid, ai.pdfInput.parse({ name: input.name, data: input.content }))) }
  if (format === "ofx" || format === "qfx") return { format, ...parseOfx(input.content) }
  const rows = parseCsv(input.content)
  if (rows.length < 2) throw new HttpError(400, m.import_error_no_rows())
  const guess = guessLayout(rows, input.card)
  const signature = layoutSignature(rows, guess.layout)
  const remembered = (await statements.importMemory(uid)).layouts[signature]
  const layout = input.layout ?? remembered ?? guess.layout
  return {
    format,
    // The first rows, so the app can show the columns to check.
    rows: rows.slice(0, 15).map((r) => r.slice(0, 60)),
    signature,
    layout,
    confident: !!input.layout || !!remembered || guess.confident,
    accountHint: csvAccountHint(rows, layout),
    ...readCsv(rows, layout),
  }
}

const query = (url: URL) => Object.fromEntries(url.searchParams)

/** The days of a month that have paid entries, for the dots in the date picker. */
async function daysWithEntries(uid: string, month: string) {
  const { tz } = await getSettings(uid)
  const [from, to] = monthRange(month, tz)
  const { results } = await db()
    .prepare("SELECT DISTINCT date FROM transactions WHERE user_id = ? AND paid = 1 AND date >= ? AND date < ?")
    .bind(uid, from, to)
    .all<{ date: number }>()
  return { days: [...new Set(results.map((r) => dayOf(r.date, tz)))].sort() }
}

// Each route is "METHOD /path" with {name} for a path parameter. GET only reads; anything else needs kosha:write.
const ROUTES: Record<string, Handler> = {
  // Everything most screens need: accounts, categories, rules, events, tags, rates, settings, which AI features
  // are live, and whether this server has R2 for pictures and attachments.
  "GET /meta": async ({ uid }) => {
    files.purgeLater(uid)
    const user = await db()
      .prepare(`SELECT "id", "name", "email", "image" FROM "user" WHERE "id" = ?`)
      .bind(uid)
      .first<{ id: string; name: string; email: string; image: string | null }>()
    return {
      ...(await finance.loadMeta(uid)),
      user,
      demo: demoLocked(uid),
      avatars: !!avatars(),
      attachments: !!files.attachmentBucket(),
      version: APP_API_VERSION,
    }
  },
  // The web's own reads where the public API's shapes are thinner: Overview's pace curves and cards, the Accounts
  // page's per-account history and month flows, schedules with their payment history, and the days that have entries.
  "GET /dashboard": ({ uid, url }) => finance.dashboard(uid, finance.dashboardInput.parse(query(url))),
  "GET /accounts-overview": ({ uid, url }) => finance.accountsOverview(uid, finance.dashboardInput.parse(query(url))),
  "GET /subscriptions": async ({ uid }) => {
    const [subscriptions, income] = await Promise.all([finance.listSubscriptions(uid), finance.recentIncome(uid)])
    return { subscriptions, income }
  },
  "GET /payee-history": ({ uid, url }) =>
    finance.payeeHistory(uid, z.string().min(1).max(200).parse(url.searchParams.get("name"))),
  "GET /days": ({ uid, url }) =>
    daysWithEntries(
      uid,
      z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .parse(url.searchParams.get("month"))
    ),
  // The recap Overview shows for a month, if one was written. Reading never writes one.
  "GET /recap": ({ uid, url }) => ai.getRecap(uid, url.searchParams.get("month") ?? undefined),
  // Auto-categorise for a payee Kosha hasn't seen.
  "POST /ai/category": async (c) => ai.suggestCategory(c.uid, await body(c, ai.categoryInput)),
  // Reconcile: one account's state, finishing with a statement, and the AI's view of a difference.
  "GET /reconcile": ({ uid, url }) =>
    statements.reconcileData(uid, z.string().min(1).parse(url.searchParams.get("walletId"))),
  "POST /reconcile/finish": async (c) => statements.finishReconcile(c.uid, await body(c, statements.finishInput)),
  "POST /reconcile/undo": async (c) =>
    statements.undoReconcile(c.uid, (await body(c, z.object({ id: z.string().min(1) }))).id),
  "POST /reconcile/explain": async (c) => ai.explainDifference(c.uid, await body(c, ai.differenceInput)),

  // Every preference in PREFS, the AI ones included (the public update_settings leaves those out).
  "PATCH /preferences": async (c) => finance.savePreferences(c.uid, await body(c, finance.prefsInput)),
  // Sign-in methods (for Settings › Sign-in & security) and what Delete & reset would remove.
  "GET /account": ({ uid }) => accountOverview(uid),

  // Profile
  "PATCH /profile": async (c) =>
    updateProfile(c.uid, await body(c, z.object({ name: z.string().trim().min(1).max(100) }))),
  "GET /avatar": async ({ uid }) => {
    const photo = await getAvatar(uid)
    if (!photo) throw new HttpError(404, "No profile picture.")
    return file(photo.body, "image/jpeg", "avatar.jpg", false)
  },
  // The body is the JPEG itself, already cropped square and shrunk by the app.
  "PUT /avatar": async ({ uid, request }) => {
    const photo = await request.blob()
    if (photo.size > 512 * 1024) throw new HttpError(413, m.server_avatar_too_big())
    await setAvatar(uid, photo)
  },
  "DELETE /avatar": ({ uid }) => setAvatar(uid, null),

  // Attachments
  "GET /transactions/{id}/attachments": ({ uid, params }) => files.listAttachments(uid, params.id),
  "GET /recurring/{id}/attachments": ({ uid, params }) => files.scheduleAttachments(uid, params.id),
  // A multipart form with one `file`: a photo or a PDF, up to 10 MB.
  "POST /transactions/{id}/attachments": async ({ uid, params, request }) => {
    const upload = (await request.formData().catch(() => null))?.get("file")
    if (!(upload instanceof File)) throw new HttpError(400, m.server_choose_file())
    return files.addAttachment(uid, params.id, upload)
  },
  "GET /attachments/{id}": async ({ uid, params, url }) => {
    const a = await files.getAttachment(uid, params.id)
    if (!a) throw new HttpError(404, m.server_attachment_not_found())
    return new Response(a.body, {
      headers: {
        "Content-Type": a.type,
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        // An attachment never changes; deleting it gives the next one a new id.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  },
  "DELETE /attachments/{id}": ({ uid, params }) => files.deleteAttachment(uid, params.id),

  // Statement import (Accounts › Import statements): read files, then save each account's lines, the
  // transfers found between them, and its opening balance and reconciliation.
  "GET /import/memory": ({ uid }) => statements.importMemory(uid),
  "POST /import/read": async (c) => readStatement(c.uid, await body(c, readInput)),
  "GET /import/entries": ({ uid, url }) =>
    statements.importEntries(uid, statements.entriesInput.parse(Object.fromEntries(url.searchParams))),
  "POST /import/lines": async (c) => statements.importLines(c.uid, await body(c, statements.importInput)),
  "POST /import/transfers": async (c) => statements.importTransferPairs(c.uid, await body(c, statements.pairsInput)),
  "POST /import/finish": async (c) => statements.finishImport(c.uid, await body(c, statements.finishImportInput)),
  // AI help: a CSV's columns when Kosha couldn't tell, and payee names (and categories) for bank text.
  "POST /import/layout": async (c) => ai.readLayout(c.uid, await body(c, ai.layoutInput)),
  "POST /import/tidy": async (c) => ai.tidyLines(c.uid, await body(c, ai.tidyInput)),

  // AI providers and the request log (Settings › AI)
  "GET /ai/providers": ({ uid }) => aiKeys.listProviders(uid),
  "POST /ai/providers/{id}/test": async (c) =>
    aiKeys.testProvider(c.uid, { id: providerId.parse(c.params.id), ...(await body(c, providerInput)) }),
  "PUT /ai/providers/{id}": async (c) =>
    aiKeys.saveProvider(c.uid, {
      id: providerId.parse(c.params.id),
      ...(await body(
        c,
        providerInput.extend({
          model: z
            .string()
            .trim()
            .min(1, { error: () => m.server_pick_model() })
            .max(200),
        })
      )),
    }),
  "POST /ai/providers/{id}/default": ({ uid, params }) => aiKeys.setDefaultProvider(uid, providerId.parse(params.id)),
  "DELETE /ai/providers/{id}": ({ uid, params }) => aiKeys.disconnectProvider(uid, providerId.parse(params.id)),
  "GET /ai/log": ({ uid }) => aiKeys.aiUsage(uid),

  // API keys and connected apps (Settings › API & MCP)
  "GET /api-access": async ({ uid }) => {
    const [keys, apps] = await Promise.all([listApiKeys(uid), listConnectedApps(uid)])
    return { keys, apps, mcpUrl: MCP_RESOURCE, docsUrl: `${new URL(MCP_RESOURCE).origin}/api/v1/docs` }
  },
  // The key comes back once, here; only its hash is stored.
  "POST /api-keys": async (c) =>
    createApiKey(
      c.uid,
      await body(
        c,
        z.object({
          name: z
            .string()
            .trim()
            .min(1, { error: () => m.server_api_key_name_required() })
            .max(60),
          scope: z.enum(["read", "write"]),
        })
      )
    ),
  "DELETE /api-keys/{id}": ({ uid, params }) => deleteApiKey(uid, params.id),
  "DELETE /connected-apps/{id}": ({ uid, params }) => disconnectApp(uid, params.id),

  // Export (Settings › Import & export), handed to the share sheet
  "GET /export/transactions.csv": async ({ uid }) =>
    file(await transactionsCsv(uid), "text/csv; charset=utf-8", "kosha-transactions.csv"),
  "GET /export/kosha.json": async ({ uid }) =>
    file(JSON.stringify(await everythingJson(uid), null, 2), "application/json; charset=utf-8", "kosha.json"),

  // Delete & reset: every transaction, transfer, gain, reconciliation and recurring schedule. Accounts,
  // categories, rules and settings stay. The app asks the person to type DELETE first.
  "DELETE /transactions": ({ uid }) => finance.deleteAllTransactions(uid),
}

const COMPILED = Object.entries(ROUTES).map(([key, handler]) => {
  const [method, path] = key.split(" ")
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((x) => x[1])
  return { method, names, handler, re: new RegExp(`^${path.replace(/\{\w+\}/g, "([^/]+)")}/?$`) }
})

/** /api/app/*: one handler per route above, for access tokens issued to Kosha's own apps. */
export async function handleApp(request: Request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/app/, "") || "/"
  let params: Record<string, string> = {}
  const route = COMPILED.find((r) => {
    const x = r.method === request.method && r.re.exec(path)
    if (x) params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(x[i + 1])]))
    return !!x
  })
  if (!route) return fail(404, "not_found", `No ${request.method} /api/app${path}.`)

  const token = bearer(request)
  const who: Principal | "no-scope" | null = token ? await fromAccessToken(token, [API_RESOURCE]) : null
  if (who === "no-scope" || !who || !APP_CLIENTS.has(who.client ?? ""))
    return fail(401, "unauthorized", m.server_not_signed_in(), {}, { "WWW-Authenticate": 'Bearer realm="kosha"' })
  if (request.method !== "GET" && who.scope !== "write")
    // Kosha's apps always ask for kosha:write, so in practice this is the demo account.
    return fail(403, "read_only", demoLocked(who.uid) ? DEMO_READ_ONLY() : "This sign-in can only read.")
  if (await overLimit(who.uid))
    return fail(429, "rate_limited", m.auth_error_rate_limited(), {}, { "Retry-After": "60" })

  try {
    const out = await route.handler({ uid: who.uid, params, url, request })
    if (out instanceof Response) return out
    return out === undefined ? new Response(null, { status: 204 }) : json(out)
  } catch (e) {
    if (e instanceof z.ZodError)
      return fail(400, "invalid_request", e.issues[0]?.message ?? "", { issues: zodIssues(e) })
    const { status, code, message, ...extra } = describeError(e)
    return fail(status, code, message, extra)
  }
}
