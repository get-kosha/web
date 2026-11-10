// What each AI feature asks the model and what Kosha does with the answer. Sending, keys and the request
// log live in ai.server.ts. Every request holds only what Settings › AI › What AI can see allows: hidden
// payees and accounts go out as codes, and replies get the real names back before anyone reads them.

import { listLoans } from "@/server/loans.server"
import { waitUntil } from "cloudflare:workers"
import { z } from "zod"
import {
  intlLocale,
  INCOME_SQL,
  NEUTRAL_SQL,
  SPENDING_SQL,
  addDays,
  aiBlocker,
  aiFeatures,
  aiShares,
  convert,
  dayOf,
  daysInMonth,
  fmt,
  isNeutral,
  monthRange,
  netWorth,
  parseAmount,
  parseTags,
  payeeCode,
  readJson,
  redactForAi,
  shiftMonth,
  tagList,
  unixOf,
  unmask,
  type AiFeature,
} from "@/lib/core"
import { HttpError, db, getRates, getSettings, loadSubscriptions } from "@/server/db.server"
import { withRefs } from "@/lib/statement"
import * as finance from "@/server/finance.server"
import { chat, defaultProvider, logCall, type ChatRequest, type Tool, type Turn } from "@/server/ai.server"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const month = z.string().regex(/^\d{4}-\d{2}$/)
const monthName = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString(intlLocale(), { month: "long", year: "numeric", timeZone: "UTC" })
const dayName = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(intlLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
/** The person's language, in English, for the model to write its replies in. Prompts stay English, which models follow best. */
const language = () => new Intl.DisplayNames(["en"], { type: "language" }).of(getLocale()) ?? "English"

/** A signed-in user's AI context for one feature. Refuses when the feature is off. */
/** The error for an AI feature that can't run, saying what to set up. The public API answers it as ai_unavailable. */
const unavailable = (message: string) => new HttpError(409, message, "ai_unavailable")

async function session(uid: string, feature: AiFeature) {
  const [settings, provider] = await Promise.all([getSettings(uid), defaultProvider(uid)])
  const blocked = aiBlocker(settings.prefs, !!provider, feature)
  if (blocked || !provider) throw unavailable(blocked ?? m.core_ai_no_provider())
  const keep = settings.prefs.ai_log_enabled === "1"
  return {
    uid,
    ...settings,
    provider,
    shares: aiShares(settings.prefs),
    today: dayOf(Date.now() / 1000, settings.tz),
    /** Sends one request and logs it in the background, so a slow log write never holds up the answer. */
    async send(req: ChatRequest) {
      try {
        const reply = await chat(provider, req)
        waitUntil(logCall(uid, { provider, feature, req, reply, keep }).catch(console.error))
        return reply
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        waitUntil(logCall(uid, { provider, feature, req, reply: null, error, keep }).catch(console.error))
        throw new HttpError(502, error, "ai_provider_error")
      }
    },
  }
}
type Session = Awaited<ReturnType<typeof session>>

/** Whether an AI feature can run for this person now, for places where AI is an optional extra. */
export async function aiLive(uid: string, feature: AiFeature) {
  const [{ prefs }, provider] = await Promise.all([
    getSettings(uid),
    db().prepare("SELECT 1 FROM ai_providers WHERE user_id = ? AND is_default = 1").bind(uid).first(),
  ])
  return !aiBlocker(prefs, !!provider, feature)
}

type Cat = { id: string; name: string; income: number; parent_id: string | null }
const categoriesOf = async (uid: string) =>
  (
    await db()
      .prepare(`SELECT id, name, income, parent_id FROM categories WHERE user_id = ? AND archived = 0
        AND id NOT IN ${NEUTRAL_SQL} ORDER BY sort`)
      .bind(uid)
      .all<Cat>()
  ).results

type Account = { id: string; name: string; currency: string; type: string }
/** Active accounts with the ref a model sees them by, and the name when account names are shared. */
async function accountsOf(s: Session) {
  const { results } = await db()
    .prepare("SELECT id, name, currency, type FROM wallets WHERE user_id = ? AND archived = 0 ORDER BY sort")
    .bind(s.uid)
    .all<Account>()
  return results.map((w, i) => ({
    ...w,
    ref: `account_${i + 1}`,
    sent: {
      ref: `account_${i + 1}`,
      ...(s.shares.account && { name: w.name }),
      type: w.type,
      currency: w.currency.toUpperCase(),
    },
  }))
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const json = (v: unknown) => JSON.stringify(v)

// ---------- auto-categorise ----------

export const categoryInput = z.object({
  payee: z.string().trim().min(1).max(200),
  kind: z.enum(["expense", "income"]),
})

/** The category a payee Kosha hasn't seen most likely belongs in, judged against how this person sorts. */
export async function suggestCategory(uid: string, data: z.infer<typeof categoryInput>) {
  const s = await session(uid, "categorise")
  const cats = (await categoriesOf(uid)).filter((c) => !c.parent_id && !!c.income === (data.kind === "income"))
  if (!cats.length) return { categoryId: null }
  // The payees this person uses most, with their latest category, so the model follows their sorting.
  const { results: examples } = await db()
    .prepare(`SELECT name, category_id, MAX(date) FROM transactions WHERE user_id = ? AND name <> '' AND paid = 1
      AND transfer_id IS NULL AND category_id IN (SELECT value FROM json_each(?)) GROUP BY lower(name) ORDER BY COUNT(*) DESC LIMIT 40`)
    .bind(uid, json(cats.map((c) => c.id)))
    .all<{ name: string; category_id: string }>()
  const reply = await s.send({
    system: "You sort one person's transactions into their own categories. Reply with only a JSON object.",
    turns: [
      {
        role: "user",
        content: [
          `Which category fits this ${data.kind} best?`,
          `Payee: ${json(data.payee)}`,
          `Categories: ${json(cats.map((c) => ({ id: c.id, name: c.name })))}`,
          examples.length
            ? `How this person sorted other payees: ${json(examples.map((e) => ({ payee: e.name, category: e.category_id })))}`
            : "",
          'Reply {"category": "<id>"} with an id from Categories, or {"category": null} when none clearly fits.',
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    maxTokens: 300,
    timeoutMs: 15_000,
  })
  const id = str(readJson(reply.text)?.category)
  return { categoryId: cats.some((c) => c.id === id) ? id : null }
}

/**
 * Categories for many payees at once, for entries created through the API without one and with no payee rule.
 * One request covers them all. Returns a category id, or null, for each payee given.
 */
export async function suggestCategories(uid: string, items: { payee: string; income: boolean }[]) {
  const s = await session(uid, "categorise")
  const cats = (await categoriesOf(uid)).filter((c) => !c.parent_id)
  const payees = [
    ...new Map(items.map((i) => [`${i.income ? "+" : "-"}${i.payee.trim().toLowerCase()}`, i])).values(),
  ].slice(0, 200)
  const { results: examples } = await db()
    .prepare(`SELECT name, category_id, MAX(date) FROM transactions WHERE user_id = ? AND name <> '' AND paid = 1
      AND transfer_id IS NULL AND category_id NOT IN ${NEUTRAL_SQL} GROUP BY lower(name) ORDER BY COUNT(*) DESC LIMIT 40`)
    .bind(uid)
    .all<{ name: string; category_id: string }>()
  const reply = await s.send({
    system: "You sort one person's transactions into their own categories. Reply with only a JSON object.",
    turns: [
      {
        role: "user",
        content: [
          `Categories: ${json(cats.map((c) => ({ id: c.id, name: c.name, type: c.income ? "income" : "expense" })))}`,
          examples.length &&
            `How this person sorted other payees: ${json(examples.map((e) => ({ payee: e.name, category: e.category_id })))}`,
          `Payees: ${json(payees.map((p, i) => ({ n: i, payee: p.payee, type: p.income ? "income" : "expense" })))}`,
          'For each payee pick a category of its type that clearly fits, or null. Reply {"categories": [{"n": 0, "category": "<id>" | null}]}',
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    maxTokens: 4000,
    timeoutMs: 45_000,
  })
  const rows = readJson(reply.text)?.categories
  const picked = new Map<string, string>()
  for (const r of Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []) {
    const p = typeof r?.n === "number" ? payees[r.n] : undefined
    const cat = p && cats.find((c) => c.id === str(r.category) && !!c.income === p.income)
    if (p && cat) picked.set(`${p.income ? "+" : "-"}${p.payee.trim().toLowerCase()}`, cat.id)
  }
  return items.map((i) => picked.get(`${i.income ? "+" : "-"}${i.payee.trim().toLowerCase()}`) ?? null)
}

// ---------- natural-language add and receipts ----------

export const textEntryInput = z.object({ text: z.string().trim().min(1).max(500) })
export const receiptInput = z.object({
  // Base64 of a photo the browser has already shrunk to about 1600px; 8 MB is far past that.
  image: z
    .string()
    .min(100)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/]+=*$/, { error: () => m.ai_invalid_image() }),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
})

/** One transaction read from a line of text or a receipt. Every field is optional; the form fills the rest. */
export type AiEntry = {
  /** Cents, always positive; `income` carries the direction. */
  amount: number | null
  /** Lowercase ISO code when one was stated or printed. */
  currency: string | null
  income: boolean
  payee: string
  categoryId: string | null
  walletId: string | null
  day: string | null
  time: string | null
  note: string
  tags: string[]
}

const ENTRY_SYSTEM = `You turn what someone typed, or a photo of a receipt, into one transaction for their personal finance app. Reply with only a JSON object with these keys:
- amount: the total, as a number in major units (12.5 for 12.50). For several items, their sum. For a receipt, the final total paid, with tax and tip. null if there is none.
- currency: the ISO code if one is stated, shown by a sign or printed (EUR, USD, GBP), else null.
- income: true only for money received, such as pay, a refund or someone paying back. Otherwise false.
- payee: who was paid, or who paid. Short and cleanly capitalised, like "Nando's" or "Tesco". Never the category or a description. "" if unknown.
- category: an id from categories, or null if none clearly fits.
- account: a ref from accounts when one is named or clearly implied by a card name, "cash" or a currency, else null.
- date: YYYY-MM-DD. Work out words like "yesterday" or "last friday" from today. null if no date is given or printed.
- time: HH:MM in 24 hours if given or printed, else null.
- note: anything else worth keeping, in a few words ("with Sam", "2 coffees"), else "".
- tags: the words marked with # (without the #), else [].`

/** Reads one transaction out of a typed line (natural-language add) or a receipt photo (receipt scanning). */
export async function readEntry(uid: string, input: { text: string } | z.infer<typeof receiptInput>): Promise<AiEntry> {
  const receipt = "image" in input
  const s = await session(uid, receipt ? "receipts" : "quick_add")
  const [cats, accounts] = await Promise.all([categoriesOf(uid), accountsOf(s)])
  const weekday = new Date(`${s.today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })
  const context = [
    `Today: ${s.today} (${weekday})`,
    `Accounts: ${json(accounts.map((a) => a.sent))}`,
    `Categories: ${json(cats.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name, type: c.income ? "income" : "expense" })))}`,
  ].join("\n")
  const reply = await s.send({
    system: `${ENTRY_SYSTEM}\nWrite the note in ${language()}. Keep the payee as typed or printed.`,
    turns: [
      {
        role: "user",
        content: receipt
          ? [
              { type: "image", mime: input.mime, data: input.image },
              { type: "text", text: `${context}\n\nRead this receipt.` },
            ]
          : `${context}\n\nText: ${json(input.text)}`,
      },
    ],
    maxTokens: 800,
    timeoutMs: receipt ? 45_000 : 20_000,
  })
  const raw = readJson(reply.text)
  if (!raw) throw new HttpError(502, receipt ? m.ai_receipt_unreadable() : m.ai_text_unreadable())
  const cents = typeof raw.amount === "number" ? Math.round(raw.amount * 100) : parseAmount(str(raw.amount, 40))
  const day = str(raw.date, 10)
  const time = str(raw.time, 5)
  const currency = str(raw.currency, 6).toLowerCase()
  const income = raw.income === true
  // A category of the other kind is a misread, so it is dropped rather than flipping the direction.
  const cat = cats.find((c) => c.id === str(raw.category) && !!c.income === income)
  const account =
    accounts.find((a) => a.ref === str(raw.account)) ?? accounts.find((a) => currency && a.currency === currency)
  return {
    amount: cents ? Math.abs(cents) : null,
    currency: /^[a-z]{3}$/.test(currency) ? currency : null,
    income,
    payee: str(raw.payee),
    categoryId: cat?.id ?? null,
    walletId: account?.id ?? null,
    day: /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= "2000-01-01" && day <= addDays(s.today, 366) ? day : null,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null,
    note: str(raw.note, 300),
    tags: Array.isArray(raw.tags) ? parseTags(raw.tags.filter((t) => typeof t === "string").join(" ")) : [],
  }
}

// ---------- monthly recap ----------

export type Recap = {
  headline: string
  summary: string
  points: { text: string; tone: "good" | "bad" | "neutral" }[]
}
export const recapInput = z.object({ month })

/**
 * The recap Overview shows for the month on screen, or null. In the first week of a month it is last
 * month's (written automatically, until dismissed); for a past month it's that month's, written on request.
 */
export async function getRecap(uid: string, selected: string | undefined) {
  const { prefs, tz } = await getSettings(uid)
  const DB = db()
  const connected = !!(await DB.prepare("SELECT 1 FROM ai_providers WHERE user_id = ? AND is_default = 1")
    .bind(uid)
    .first())
  if (!aiFeatures(prefs, connected).recap) return null
  const today = dayOf(Date.now() / 1000, tz)
  const current = today.slice(0, 7)
  const shown = selected ?? current
  const auto = shown === current
  if (shown > current || (auto && (Number(today.slice(8)) > 7 || prefs.ai_recap_hidden === shiftMonth(current, -1))))
    return null
  const m = auto ? shiftMonth(current, -1) : shown
  const [from, to] = monthRange(m, tz)
  const [stored, any] = await DB.batch([
    DB.prepare("SELECT body, currency, created_at FROM ai_recaps WHERE user_id = ? AND month = ?").bind(uid, m),
    DB.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND paid = 1 AND date >= ? AND date < ? LIMIT 1").bind(
      uid,
      from,
      to
    ),
  ])
  const row = stored.results[0] as { body: string; currency: string; created_at: number } | undefined
  if (!row && !any.results.length) return null
  return {
    month: m,
    auto,
    recap: row ? { ...(JSON.parse(row.body) as Recap), writtenDay: dayOf(row.created_at, tz) } : null,
  }
}

const RECAP_SYSTEM = `You write a short monthly money recap for one person, from facts their finance app worked out. Reply with only a JSON object:
{"headline": "...", "summary": "...", "points": [{"text": "...", "tone": "good" | "bad" | "neutral"}]}
- headline: one plain sentence under 80 characters about the most important thing in the month.
- summary: two or three sentences on what changed against a usual month and why. Name the categories, payees or events behind it.
- points: two to four other facts worth knowing that the summary doesn't already say, each under 100 characters. "good" for saving more or spending less than usual, "bad" for spending more than usual, otherwise "neutral".
Use only the facts given, and write amounts exactly as given. Don't give advice, don't guess at reasons the facts don't show, and don't use exclamation marks. Write payee codes like payee_x1y2 exactly as they are.`

/** Writes (or rewrites) the recap of a finished month and stores it. */
export async function writeRecap(uid: string, ym: string) {
  const s = await session(uid, "recap")
  if (ym >= s.today.slice(0, 7)) throw new HttpError(400, m.ai_recap_month_not_over())
  const { facts, names } = await recapFacts(s, ym)
  const reply = await s.send({
    system: `${RECAP_SYSTEM}\nWrite the headline, summary and points in ${language()}. Keep payee, category and event names as they are.`,
    turns: [{ role: "user", content: json(facts) }],
    maxTokens: 1500,
    timeoutMs: 60_000,
  })
  const raw = readJson(reply.text)
  const points = Array.isArray(raw?.points) ? (raw.points as Record<string, unknown>[]) : []
  const recap: Recap = {
    headline: unmask(str(raw?.headline, 160), names),
    summary: unmask(str(raw?.summary, 1200), names),
    points: points
      .slice(0, 5)
      .map((p): Recap["points"][number] => ({
        text: unmask(str(p?.text, 240), names),
        tone: p?.tone === "good" || p?.tone === "bad" ? p.tone : "neutral",
      }))
      .filter((p) => p.text),
  }
  if (!recap.headline && !recap.summary) throw new HttpError(502, m.ai_recap_empty())
  await db()
    .prepare(`INSERT INTO ai_recaps (user_id, month, currency, body) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, month) DO UPDATE SET currency = excluded.currency, body = excluded.body, created_at = unixepoch()`)
    .bind(uid, ym, s.primary, json(recap))
    .run()
  return { ...recap, writtenDay: s.today }
}

/** The month in numbers, worked out here so the model only has to put them into words. */
async function recapFacts(s: Session, m: string) {
  const d = await finance.dashboard(s.uid, { month: m })
  const p = d.primary
  const rates = await getRates()
  const money = (v: number) => fmt(v, p)
  const change = (now: number, before: number | null) =>
    before ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%` : null
  const [from, to] = monthRange(m, s.tz)
  const DB = db()
  const [spends, firsts, cats, events] = await DB.batch([
    DB.prepare(`SELECT t.name, t.amount, t.date, t.category_id, t.event_id, t.subscription_id, w.currency FROM transactions t
      JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
      WHERE t.user_id = ? AND t.paid = 1 AND ${SPENDING_SQL()} AND t.date >= ? AND t.date < ? AND t.category_id NOT IN ${NEUTRAL_SQL}`).bind(
      s.uid,
      from,
      to
    ),
    // Payees first paid this month.
    DB.prepare(`SELECT name FROM transactions WHERE user_id = ? AND paid = 1 AND name <> '' AND transfer_id IS NULL
      AND category_id NOT IN ${NEUTRAL_SQL} GROUP BY lower(name) HAVING MIN(date) >= ? AND MIN(date) < ?`).bind(
      s.uid,
      from,
      to
    ),
    DB.prepare("SELECT id, name FROM categories WHERE user_id = ?").bind(s.uid),
    DB.prepare("SELECT id, name FROM events WHERE user_id = ?").bind(s.uid),
  ])
  type Spend = {
    name: string
    amount: number
    date: number
    category_id: string
    event_id: string | null
    subscription_id: string | null
    currency: string
  }
  const rows = (spends.results as Spend[]).map((r) => ({ ...r, value: -convert(r.amount, r.currency, p, rates) }))
  const catName = new Map((cats.results as { id: string; name: string }[]).map((c) => [c.id, c.name]))
  const names = new Map<string, string>()
  const payee = (name: string) => {
    const n = name.trim() || "No payee"
    if (s.shares.payee) return n
    const code = payeeCode(s.uid, n)
    names.set(code, n)
    return code
  }
  const newPayees = new Set((firsts.results as { name: string }[]).map((r) => r.name.toLowerCase()))
  const byPayee = new Map<string, { name: string; total: number }>()
  for (const r of rows.filter((r) => newPayees.has(r.name.trim().toLowerCase()))) {
    const k = r.name.trim().toLowerCase()
    byPayee.set(k, { name: r.name, total: (byPayee.get(k)?.total ?? 0) + r.value })
  }
  const byEvent = new Map<string, number>()
  for (const r of rows) if (r.event_id) byEvent.set(r.event_id, (byEvent.get(r.event_id) ?? 0) + r.value)
  const eventName = new Map((events.results as { id: string; name: string }[]).map((e) => [e.id, e.name]))
  const usual = d.pace.usual?.[daysInMonth(m) - 1] ?? null
  const worth = (x: string) => d.series.find((v) => v.month === x)?.netWorth
  const worthNow = worth(m)
  const worthBefore = worth(shiftMonth(m, -1))
  const facts = {
    month: monthName(m),
    currency: p.toUpperCase(),
    spent: money(d.current.expense),
    income: money(d.current.income),
    saved: money(d.current.income - d.current.expense),
    savedShareOfIncome: d.current.income
      ? `${Math.round(((d.current.income - d.current.expense) / d.current.income) * 100)}%`
      : null,
    previousMonth: {
      name: monthName(shiftMonth(m, -1)),
      spent: money(d.previous.expense),
      income: money(d.previous.income),
    },
    usualMonthSpend: usual === null ? null : money(usual),
    spentVsUsual: change(d.current.expense, usual),
    categories: d.categories.slice(0, 8).map((c) => ({
      name: catName.get(c.id) ?? "Other",
      spent: money(c.total),
      payments: c.count,
      usual: c.usualToDate === null ? null : money(c.usualToDate),
      vsUsual: c.fixed ? "fixed (recurring)" : change(c.total, c.usualToDate),
    })),
    largestPayments: [...rows]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((r) => ({
        payee: payee(r.name),
        amount: money(r.value),
        category: catName.get(r.category_id) ?? "Other",
        ...(s.shares.date && { date: dayOf(r.date, s.tz) }),
      })),
    newPayees: {
      count: newPayees.size,
      top: [...byPayee.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 4)
        .map((x) => ({ payee: payee(x.name), spent: money(x.total) })),
    },
    events: [...byEvent].map(([id, total]) => ({ name: eventName.get(id) ?? "Event", spent: money(total) })),
    recurringPaid: money(rows.filter((r) => r.subscription_id).reduce((t, r) => t + r.value, 0)),
    netWorthChange:
      worthNow === undefined || worthBefore === undefined
        ? null
        : `${worthNow >= worthBefore ? "+" : "−"}${money(Math.abs(worthNow - worthBefore))}`,
  }
  return { facts, names }
}

// ---------- Ask Kosha ----------

export const askInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(6000) }))
    .min(1)
    .max(24)
    .refine((list) => list[list.length - 1].role === "user", { error: () => m.ai_ask_question() }),
})

/** A filter on Activity that shows the entries an answer is based on. */
export type AskLink = {
  label: string
  search: {
    q?: string
    category?: string
    wallet?: string
    tag?: string
    event?: string
    type?: "out" | "in" | "transfers"
    min?: number
    max?: number
    month?: string
  }
}
export type AskEvent =
  | { type: "step"; label: string }
  /** `text` has the real names back; `raw` is the reply as the model wrote it, which is what goes back as history. */
  | { type: "answer"; text: string; raw: string; links: AskLink[] }
  | { type: "error"; message: string; code: "ai_unavailable" | "ai_provider_error" }

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const findInput = z.object({
  from: day.optional(),
  to: day.optional(),
  search: z.string().max(100).optional(),
  category: z.string().max(64).optional(),
  account: z.string().max(64).optional(),
  tag: z.string().max(32).optional(),
  event: z.string().max(64).optional(),
  type: z.enum(["out", "in", "transfers"]).optional(),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  sort: z.enum(["newest", "largest"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
})
const summarizeInput = z.object({
  from: day.optional(),
  to: day.optional(),
  by: z.enum(["category", "payee", "month", "account", "tag"]),
  type: z.enum(["out", "in"]).optional(),
})

/** How a summarize look-up groups, as its step label names it. */
const BY = {
  category: m.ai_by_category,
  payee: m.ai_by_payee,
  month: m.ai_by_month,
  account: m.ai_by_account,
  tag: m.ai_by_tag,
}

const dayProps = {
  from: { type: "string", description: "First day, YYYY-MM-DD" },
  to: { type: "string", description: "Last day, YYYY-MM-DD, included" },
}
const TOOLS: Tool[] = [
  {
    name: "find_transactions",
    description:
      "Lists matching transactions, newest or largest first, with how many match and their total spent and received in the display currency (for every match, not only those listed). Without from or to, a search, event or tag covers every date, and anything else the current month. Spending and income leave out transfers between the person's own accounts and balance corrections. Leave out every filter you don't need.",
    parameters: {
      type: "object",
      properties: {
        ...dayProps,
        search: {
          type: "string",
          description: "Text in the payee, note, a tag, or an event or category name; or a payee code",
        },
        category: { type: "string", description: "A category id" },
        account: { type: "string", description: "An account ref" },
        tag: { type: "string", description: "A tag, without #" },
        event: { type: "string", description: "An event id" },
        type: { type: "string", enum: ["out", "in", "transfers"], description: "out is spending, in is income" },
        min: { type: "number", description: "Smallest amount, in major units, ignoring the sign" },
        max: { type: "number", description: "Largest amount, in major units, ignoring the sign" },
        sort: { type: "string", enum: ["newest", "largest"] },
        limit: { type: "integer", description: "How many to list, at most 50. Default 20" },
      },
    },
  },
  {
    name: "summarize",
    description:
      "Adds up spending (or income) between two days, grouped by category, payee, month, account or tag, in the display currency, largest first. Without from it starts at the beginning of the current month, and without to it runs to today.",
    parameters: {
      type: "object",
      properties: {
        ...dayProps,
        by: { type: "string", enum: ["category", "payee", "month", "account", "tag"] },
        type: { type: "string", enum: ["out", "in"], description: "out (spending, the default) or in (income)" },
      },
      required: ["by"],
    },
  },
  {
    name: "accounts",
    description:
      "Every open account with its type, currency and balance, plus net worth. Credit cards show available credit and what is owed; investments include their latest gain.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "recurring",
    description:
      "Subscriptions, bills and other recurring payments, with their amount, how often they repeat, their cost per month in the display currency and when the next one is due.",
    parameters: { type: "object", properties: {} },
  },
]

/** Answers a question from the person's data. Yields each look-up as it happens, then the answer. */
export async function* ask(uid: string, messages: z.infer<typeof askInput>["messages"]): AsyncGenerator<AskEvent> {
  try {
    const s = await session(uid, "ask")
    const ctx = await askContext(s)
    // Conversations start with a question, and a question asked again after an error joins the one before.
    const merged: typeof messages = []
    for (const m of messages) {
      const last = merged[merged.length - 1]
      if (!last && m.role === "assistant") continue
      if (last?.role === m.role) last.text += `\n\n${m.text}`
      else merged.push({ ...m })
    }
    const turns: Turn[] = merged.map((m) =>
      m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", text: m.text }
    )
    const links: AskLink[] = []
    for (let round = 0; round < 8; round++) {
      const reply = await s.send({ system: ctx.system, turns, tools: TOOLS, maxTokens: 2000, timeoutMs: 60_000 })
      if (!reply.calls.length) {
        const raw = reply.text.trim()
        yield raw
          ? { type: "answer", text: unmask(raw, ctx.names), raw, links: links.slice(0, 4) }
          : { type: "error", message: m.ai_ask_no_answer(), code: "ai_provider_error" }
        return
      }
      turns.push({ role: "assistant", text: reply.text, calls: reply.calls, raw: reply.raw })
      const results = []
      for (const call of reply.calls) {
        const run = Object.hasOwn(ctx.tools, call.name) ? ctx.tools[call.name] : undefined
        if (!run) {
          results.push({ id: call.id, content: json({ error: `No tool called ${call.name}` }) })
          continue
        }
        const out = run(call.input)
        yield { type: "step", label: out.label }
        let content: unknown
        try {
          content = await out.result()
        } catch (e) {
          content = { error: e instanceof Error ? e.message : "That look-up failed" }
        }
        if (out.link && !links.some((l) => json(l.search) === json(out.link!.search))) links.push(out.link)
        results.push({ id: call.id, content: json(content) })
      }
      turns.push({ role: "tool", results })
    }
    yield { type: "error", message: m.ai_ask_too_many(), code: "ai_provider_error" }
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : m.common_something_went_wrong(),
      code: e instanceof HttpError && e.code === "ai_unavailable" ? "ai_unavailable" : "ai_provider_error",
    }
  }
}

/** Ask Kosha in one call, for the public API: the answer once it's ready, with the look-ups made on the way. */
export async function askOnce(uid: string, messages: z.infer<typeof askInput>["messages"]) {
  const lookups: string[] = []
  for await (const ev of ask(uid, messages)) {
    if (ev.type === "step") lookups.push(ev.label)
    else if (ev.type === "answer") return { answer: ev.text, raw: ev.raw, lookups, links: ev.links }
    else throw new HttpError(ev.code === "ai_unavailable" ? 409 : 502, ev.message, ev.code)
  }
  throw new HttpError(502, m.ai_no_answer(), "ai_provider_error")
}

/** The system prompt and the tools, bound to this person's data and privacy settings. */
async function askContext(s: Session) {
  const DB = db()
  const [cats, accounts, events, tags, rates, payees] = await Promise.all([
    DB.prepare("SELECT id, name, income, parent_id FROM categories WHERE user_id = ? AND archived = 0 ORDER BY sort")
      .bind(s.uid)
      .all<Cat>()
      .then((r) => r.results),
    accountsOf(s),
    finance.listEvents(s.uid),
    finance.listTags(s.uid, "", 60),
    getRates(),
    // With payee names hidden, every name gets its code up front, so a code from an earlier answer still reads back.
    s.shares.payee
      ? []
      : DB.prepare(
          "SELECT DISTINCT name FROM transactions WHERE user_id = ?1 AND name <> '' UNION SELECT name FROM subscriptions WHERE user_id = ?1"
        )
          .bind(s.uid)
          .all<{ name: string }>()
          .then((r) => r.results.map((x) => x.name)),
  ])
  const p = s.primary
  const tz = s.tz
  const names = new Map(payees.map((n) => [payeeCode(s.uid, n), n.trim()]))
  const payee = (name: string) => (s.shares.payee || !name.trim() ? name.trim() : payeeCode(s.uid, name))
  if (!s.shares.account) for (const a of accounts) names.set(a.ref, a.name)
  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    return a ? (s.shares.account ? a.name : a.ref) : "a closed account"
  }
  const catById = new Map(cats.map((c) => [c.id, c]))
  const catLabel = (id: string, sub?: string | null) => {
    const c = catById.get(id)
    const subName = sub ? catById.get(sub)?.name : null
    return id === "transfer" ? "Transfer" : `${c?.name ?? "Other"}${subName ? ` › ${subName}` : ""}`
  }
  const amount = (cents: number) => (s.shares.amount ? Math.round(cents) / 100 : null)
  // A code the model sends back as a search becomes the payee name again.
  const realName = (text: string) => names.get(text.trim()) ?? text
  const nameOf = (text: string) => (s.shares.payee ? text : realName(text))
  const label = (m: string) => monthName(m)
  const weekday = new Date(`${s.today}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  const privacy = [
    !s.shares.payee &&
      "Payee names are hidden: each payee is a code like payee_x1y2. Use the codes exactly as they are, and the app shows the real names.",
    !s.shares.amount &&
      "Amounts are hidden, so you can count transactions but not add up money. Say so if asked for amounts.",
    !s.shares.date && "Exact dates are hidden: transactions show only their month.",
    !s.shares.note && "Notes are hidden.",
    !s.shares.account && "Account names are hidden: accounts are refs like account_1. Use the refs as they are.",
  ].filter(Boolean)
  const system = `You are Kosha, a personal finance app, answering one person's questions about their own money. Use the tools to look things up in their data. Today is ${weekday} (${s.today}). Amounts are in ${p.toUpperCase()} unless another currency is given.

How to answer:
- Look things up before answering, and never guess a figure. If the data can't answer the question, say so plainly.
- Be brief: a sentence or two, then a short list only when it helps. Put the key figure in **bold**. Write money like ${fmt(123456, p)}.
- Spending and income never include transfers between the person's own accounts or balance corrections.
- Use plain words. No tables, no headings, no advice unless asked.
- Write in ${language()}. Keep payee, category, account, event and tag names exactly as they are.${privacy.length ? `\n\nPrivacy:\n${privacy.map((l) => `- ${l}`).join("\n")}` : ""}

Categories: ${json(cats.filter((c) => !isNeutral(c.id)).map((c) => ({ id: c.id, name: c.name, type: c.income ? "income" : "expense", ...(c.parent_id && { parent: c.parent_id }) })))}
Accounts: ${json(accounts.map((a) => a.sent))}
Events: ${json(events.map((e) => ({ id: e.id, name: e.name, from: e.start_day, to: e.end_day })))}
Tags: ${json(tags.map((t) => t.tag))}`

  /** The month an Activity link can show for a day range: only a whole single month, or no range at all. */
  const linkMonth = (from?: string, to?: string) => {
    if (!from && !to) return { ok: true, month: undefined }
    if (!from || !to || from.slice(0, 7) !== to.slice(0, 7) || !from.endsWith("-01")) return { ok: false }
    const m = from.slice(0, 7)
    return to === `${m}-${String(daysInMonth(m)).padStart(2, "0")}` ? { ok: true, month: m } : { ok: false }
  }
  const range = (from?: string, to?: string) =>
    from && to && from.slice(0, 7) === to.slice(0, 7) && linkMonth(from, to).ok
      ? label(from.slice(0, 7))
      : from || to
        ? from && to
          ? m.ai_range_between({ from: dayName(from), to: dayName(to) })
          : from
            ? m.ai_range_since({ from: dayName(from) })
            : m.ai_range_until({ to: dayName(to!) })
        : label(s.today.slice(0, 7))

  type Run = { label: string; link?: AskLink; result: () => Promise<unknown> }
  // Models often fill filters they don't need with "", null or 0. None of those can mean a real filter
  // (no amount is 0), so they count as left out.
  const given = (input: unknown) =>
    Object.fromEntries(
      Object.entries(input && typeof input === "object" ? input : {}).filter(
        ([, v]) => v !== "" && v !== null && v !== 0
      )
    )
  const invalid = (e: z.ZodError): Run => ({
    label: m.ai_step_checking_question(),
    result: async () => ({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }),
  })

  const tools: Record<string, (input: unknown) => Run> = {
    find_transactions(input) {
      const r = findInput.safeParse(given(input))
      if (!r.success) return invalid(r.error)
      const f = r.data
      const wallet = f.account ? accounts.find((a) => a.ref === f.account || a.id === f.account)?.id : undefined
      const q = f.search ? nameOf(f.search) : undefined
      const what =
        [
          q,
          f.category && catById.get(f.category)?.name,
          f.tag && `#${f.tag}`,
          f.event && events.find((e) => e.id === f.event)?.name,
          wallet && accounts.find((a) => a.id === wallet)?.name,
        ]
          .filter(Boolean)
          .join(", ") ||
        (f.type === "in"
          ? m.ai_what_income()
          : f.type === "transfers"
            ? m.ai_what_transfers()
            : m.ai_what_transactions())
      // An event is about all of it, and without days a search or tag covers every date too.
      const allDates = !!f.event || (!f.from && !f.to && (!!f.tag || !!q))
      const lm = linkMonth(f.from, f.to)
      const search = {
        q,
        category: f.category,
        wallet,
        tag: f.tag,
        event: f.event,
        type: f.type,
        min: f.min === undefined ? undefined : Math.round(f.min * 100),
        max: f.max === undefined ? undefined : Math.round(f.max * 100),
      }
      return {
        label: allDates ? m.ai_step_find({ what }) : m.ai_step_find_range({ what, range: range(f.from, f.to) }),
        link:
          allDates || lm.ok
            ? {
                label: `${what}${allDates ? "" : ` · ${range(f.from, f.to)}`}`,
                // JSON drops the unset filters. No days means the current month.
                search: JSON.parse(
                  json({ ...search, month: allDates ? undefined : (lm.month ?? s.today.slice(0, 7)) })
                ),
              }
            : undefined,
        result: async () => {
          const limit = f.limit ?? 20
          const res = await finance.listTransactions(s.uid, {
            ...search,
            from: f.from,
            to: f.to,
            corrections: false,
            limit: f.sort === "largest" ? 2000 : limit,
            offset: 0,
          })
          const cur = new Map(accounts.map((a) => [a.id, a.currency]))
          const value = (t: finance.Tx) => convert(t.amount, cur.get(t.wallet_id) ?? p, p, rates)
          const rows =
            f.sort === "largest" ? [...res.rows].sort((a, b) => Math.abs(value(b)) - Math.abs(value(a))) : res.rows
          let out = 0
          let inn = 0
          for (const t of res.totals) {
            out += convert(t.out, t.currency, p, rates)
            inn += convert(t.inn, t.currency, p, rates)
          }
          return {
            matches: res.total,
            spent: amount(-out),
            received: amount(inn),
            currency: p.toUpperCase(),
            listed: rows.slice(0, limit).map((t) => ({
              ...redactForAi(
                {
                  payee: t.name,
                  amount: t.amount,
                  currency: cur.get(t.wallet_id) ?? p,
                  day: dayOf(t.date, tz),
                  note: t.note,
                  account: accountLabel(t.wallet_id),
                },
                { ...s.shares, account: true },
                s.uid
              ),
              payee: payee(t.name),
              category: catLabel(t.category_id, t.subcategory_id),
              ...(tagList(t.tags).length && { tags: tagList(t.tags) }),
              ...(t.transfer_id && { transferTo: t.counter_wallet_id ? accountLabel(t.counter_wallet_id) : null }),
            })),
          }
        },
      }
    },

    summarize(input) {
      const r = summarizeInput.safeParse(given(input))
      if (!r.success) return invalid(r.error)
      const f = r.data
      const from = f.from ?? `${s.today.slice(0, 7)}-01`
      const to = f.to ?? s.today
      const income = f.type === "in"
      return {
        label: (income ? m.ai_step_sum_income : m.ai_step_sum_spending)({ by: BY[f.by](), range: range(from, to) }),
        result: async () => {
          const { results } = await db()
            .prepare(`SELECT t.name, t.amount, t.date, t.category_id, t.wallet_id, t.tags, w.currency FROM transactions t
              JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
              WHERE t.user_id = ? AND t.paid = 1 AND t.date >= ? AND t.date < ? AND t.category_id NOT IN ${NEUTRAL_SQL}
              AND ${income ? INCOME_SQL() : SPENDING_SQL()}`)
            .bind(s.uid, unixOf(from, tz), unixOf(addDays(to, 1), tz))
            .all<{
              name: string
              amount: number
              date: number
              category_id: string
              wallet_id: string
              tags: string
              currency: string
            }>()
          const groups = new Map<string, { name: string; total: number; count: number }>()
          let total = 0
          for (const t of results) {
            // Refunds are on the spending side as money in, so they lower spending.
            const v = convert(t.amount, t.currency, p, rates) * (income ? 1 : -1)
            total += v
            const keys =
              f.by === "category"
                ? [catLabel(t.category_id)]
                : f.by === "payee"
                  ? [payee(t.name) || "No payee"]
                  : f.by === "month"
                    ? [dayOf(t.date, tz).slice(0, 7)]
                    : f.by === "account"
                      ? [accountLabel(t.wallet_id)]
                      : tagList(t.tags).length
                        ? tagList(t.tags).map((x) => `#${x}`)
                        : ["no tag"]
            for (const k of keys) {
              const g = groups.get(k) ?? { name: k, total: 0, count: 0 }
              g.total += v
              g.count++
              groups.set(k, g)
            }
          }
          return {
            from,
            to,
            currency: p.toUpperCase(),
            total: amount(total),
            count: results.length,
            groups: [...groups.values()]
              .sort((a, b) => b.total - a.total || b.count - a.count)
              .slice(0, 30)
              .map((g) => ({ name: g.name, total: amount(g.total), count: g.count })),
          }
        },
      }
    },

    accounts() {
      return {
        label: m.ai_step_accounts(),
        result: async () => {
          const wallets = (await finance.loadWallets(s.uid)).filter((w) => !w.archived)
          const nw = netWorth(wallets, p, rates, await listLoans(s.uid))
          return {
            currency: p.toUpperCase(),
            netWorth: amount(nw.total),
            moneyLent: amount(nw.receivables),
            moneyBorrowed: amount(nw.personalDebt),
            cash: amount(nw.cash),
            investments: amount(nw.investments),
            owedOnCards: amount(nw.debt),
            accounts: wallets.map((w) => ({
              account: accountLabel(w.id),
              type: w.type,
              currency: w.currency.toUpperCase(),
              balance: amount(w.balance),
              ...(w.type === "credit" && {
                creditLimit: amount(w.credit_limit ?? 0),
                owed: amount(Math.max(0, (w.credit_limit ?? 0) - w.balance)),
              }),
              ...(w.type === "investment" && { gain: amount(w.gain ?? 0) }),
            })),
          }
        },
      }
    },

    recurring() {
      return {
        label: m.ai_step_recurring(),
        result: async () => {
          const subs = (await loadSubscriptions(s.uid, s.today)).filter((x) => !x.ended)
          return {
            currency: p.toUpperCase(),
            perMonth: amount(subs.reduce((t, x) => t + convert(x.monthly, x.currency, p, rates), 0)),
            recurring: subs.map((x) => ({
              name: payee(x.name),
              amount: amount(x.amount),
              currency: x.currency.toUpperCase(),
              every: `${x.every} ${x.unit}${x.every > 1 ? "s" : ""}`,
              perMonth: amount(convert(x.monthly, x.currency, p, rates)),
              category: x.to_wallet_id ? `Transfer to ${accountLabel(x.to_wallet_id)}` : catLabel(x.category_id),
              next: x.next ? (s.shares.date ? x.next.day : x.next.day.slice(0, 7)) : null,
              ...(x.end_day && { ends: s.shares.date ? x.end_day : x.end_day.slice(0, 7) }),
            })),
          }
        },
      }
    },
  }
  return { system, tools, names }
}

// ---------- statements ----------

const base64 = z
  .string()
  .min(100)
  .regex(/^[A-Za-z0-9+/]+=*$/, { error: () => m.ai_invalid_file() })
export const pdfInput = z.object({
  /** The account it's for, when known; a first import reads the account from the statement instead. */
  walletId: z.string().min(1).optional(),
  name: z.string().trim().max(200),
  data: base64.max(15_000_000),
})

const STATEMENT_SYSTEM = `You read a bank or credit card statement and list every transaction on it. Reply with only a JSON object:
{"account": {"name": "...", "type": "bank", "last4": "1234"}, "currency": "EUR", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "opening": 0, "closing": 0, "lines": [{"date": "YYYY-MM-DD", "description": "...", "payee": "...", "amount": -12.5}]}
- account: the account it is for: its name as printed ("Current Account", "Platinum Card"), type "credit" for a credit card or "bank" otherwise, and the last four digits of its number, or null for any you can't see.
- lines: every transaction, in the order printed. Leave out balances brought forward, subtotals, and pending or authorised items.
- date: the date the line is listed under. Statements often leave out the year; take it from the statement period.
- description: the line's text as printed, on one line.
- payee: who was paid or who paid, short and cleanly capitalised ("Tesco", "Uber"), without card numbers, places or dates.
- amount: in major units. Negative for money out of the account (purchases, payments, fees, interest charged), positive for money in (deposits, refunds, a repayment to a card).
- opening and closing: the balances printed for the start and end of the period, in major units. For a credit card, the amount owed, as a positive number. null when not printed.
- from and to: the statement period. currency: its ISO code.`

const num = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) : parseAmount(str(v, 40)))
const isDay = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) && str(v, 10) >= "1990-01-01"

/** Reads a PDF statement's lines, period and balances. The PDF goes to the provider as it is. */
export async function readStatement(uid: string, input: z.infer<typeof pdfInput>) {
  const s = await session(uid, "statements")
  const reply = await s.send({
    system: STATEMENT_SYSTEM,
    turns: [
      {
        role: "user",
        content: [
          { type: "pdf", name: input.name || "statement.pdf", data: input.data },
          { type: "text", text: `Today is ${s.today}. Read this statement.` },
        ],
      },
    ],
    maxTokens: 32_000,
    timeoutMs: 180_000,
  })
  const raw = readJson(reply.text)
  const rows = Array.isArray(raw?.lines) ? (raw.lines as Record<string, unknown>[]) : []
  const lines = rows.flatMap((r) => {
    const amount = num(r?.amount)
    if (!isDay(r?.date) || !amount) return []
    return [
      {
        day: str(r.date, 10),
        amount,
        description: str(r.description, 300),
        // No payee rather than an empty one, so Kosha's own name or the AI tidy-up fills it in.
        payee: str(r.payee) || undefined,
        balance: null,
        ref: null,
      },
    ]
  })
  if (!lines.length) throw new HttpError(502, m.ai_statement_empty())
  const opening = raw?.opening == null ? null : num(raw.opening)
  const closing = raw?.closing == null ? null : num(raw.closing)
  // A model can misread a line, so the lines must take the opening balance to the closing one, to the cent.
  // A card's balances are what is owed, which spending raises.
  const total = lines.reduce((t, l) => t + l.amount, 0)
  const acc = (raw?.account ?? {}) as Record<string, unknown>
  const wallet = input.walletId
    ? await db()
        .prepare("SELECT type FROM wallets WHERE user_id = ? AND id = ?")
        .bind(uid, input.walletId)
        .first<{ type: string }>()
    : null
  const card = wallet ? wallet.type === "credit" : acc.type === "credit"
  const off = opening === null || closing === null ? null : closing - (card ? opening - total : opening + total)
  return {
    /** How far the lines miss the closing balance, in the account's direction. 0 when they add up, null without both balances. */
    off: off === null ? null : card ? -off : off,
    account: {
      name: str(acc.name, 80) || null,
      type: card ? ("credit" as const) : ("bank" as const),
      last4: /^\d{4}$/.test(str(acc.last4, 4)) ? str(acc.last4, 4) : null,
    },
    lines: withRefs(lines).map((l, i) => ({ ...l, payee: lines[i].payee })),
    opening,
    closing,
    from: isDay(raw?.from) ? str(raw!.from, 10) : null,
    to: isDay(raw?.to) ? str(raw!.to, 10) : null,
    currency: /^[a-z]{3}$/i.test(str(raw?.currency, 3)) ? str(raw!.currency, 3).toLowerCase() : null,
  }
}

export const layoutInput = z.object({
  rows: z
    .array(z.array(z.string().max(500)).max(60))
    .min(2)
    .max(15),
})

/**
 * Works out which CSV column holds what, for a layout Kosha couldn't read alone. Only the header names and
 * the shape of the values go out: letters become x and digits 9, so no payee or amount is sent.
 */
export async function readLayout(uid: string, input: z.infer<typeof layoutInput>) {
  const s = await session(uid, "statements")
  const mask = (v: string) =>
    v
      .replace(/\p{Lu}/gu, "X")
      .replace(/\p{Ll}/gu, "x")
      .replace(/\d/g, "9")
  const looksLikeHeader = (r: string[]) =>
    r.some((c) => /\p{L}{3,}/u.test(c)) && !r.some((c) => /\d{2}[/.-]\d{2}|\d{4}-\d{2}/.test(c))
  const shown = input.rows.map((r, i) => (i < 3 && looksLikeHeader(r) ? r : r.map(mask)))
  const reply = await s.send({
    system: "You work out the layout of a bank's CSV export. Reply with only a JSON object.",
    turns: [
      {
        role: "user",
        content: `Rows from the top of the file, as JSON arrays. Header rows are as written; in data rows letters are x and digits 9.
${shown.map((r, i) => `${i}: ${json(r)}`).join("\n")}

Reply {"header": <row number of the header, or -1>, "date": <column>, "description": [<columns naming the payee or describing the payment, best first>], "amount": <one signed amount column, or null>, "debit": <money-out column, or null>, "credit": <money-in column, or null>, "balance": <running balance column, or null>}. Columns count from 0. Use amount, or debit and credit, not both.`,
      },
    ],
    maxTokens: 600,
    timeoutMs: 30_000,
  })
  const raw = readJson(reply.text)
  const col = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 60 ? v : null)
  const date = col(raw?.date)
  if (!raw || date === null) throw new HttpError(502, m.ai_layout_unknown())
  return {
    header: typeof raw.header === "number" && raw.header >= -1 && raw.header < input.rows.length ? raw.header : 0,
    date,
    description: (Array.isArray(raw.description) ? raw.description : [])
      .map(col)
      .filter((c): c is number => c !== null)
      .slice(0, 2),
    amount: col(raw.amount),
    debit: col(raw.debit),
    credit: col(raw.credit),
    balance: col(raw.balance),
  }
}

export const tidyInput = z.object({
  items: z
    .array(z.object({ key: z.string().max(200), text: z.string().max(300), amount: z.number().int() }))
    .min(1)
    .max(300),
})

/**
 * Turns bank descriptions into payee names and, while Kosha suggests categories, picks one for each. It sends
 * bank text, so it runs only while payee names are shared; amounts go only when they are shared too.
 */
export async function tidyLines(uid: string, input: z.infer<typeof tidyInput>) {
  const s = await session(uid, "statements")
  if (!s.shares.payee) return {}
  const guessing = s.prefs.suggest_category === "1"
  const cats = guessing ? (await categoriesOf(uid)).filter((c) => !c.parent_id) : []
  const { results: examples } = guessing
    ? await db()
        .prepare(`SELECT name, category_id, MAX(date) FROM transactions WHERE user_id = ? AND name <> '' AND paid = 1
          AND transfer_id IS NULL AND category_id NOT IN ${NEUTRAL_SQL} GROUP BY lower(name) ORDER BY COUNT(*) DESC LIMIT 40`)
        .bind(uid)
        .all<{ name: string; category_id: string }>()
    : { results: [] }
  const reply = await s.send({
    system:
      "You turn bank statement descriptions into payee names and sort them into one person's categories. Reply with only a JSON object.",
    turns: [
      {
        role: "user",
        content: [
          guessing &&
            `Categories: ${json(cats.map((c) => ({ id: c.id, name: c.name, type: c.income ? "income" : "expense" })))}`,
          examples.length &&
            `How this person names and sorts payees: ${json(examples.map((e) => ({ payee: e.name, category: e.category_id })))}`,
          `Lines: ${json(input.items.map((i) => ({ key: i.key, text: i.text, ...(s.shares.amount && { amount: i.amount / 100 }) })))}`,
          `For each line reply with its key, the payee as a short, cleanly capitalised name ("Tesco", not "CARD PAYMENT TESCO STORES 3211")${guessing ? ', and a category id that fits, or null. A negative amount is money out, so it takes an "expense" category; a positive one takes "income". Use null for a transfer between the person\'s own accounts' : ""}.
Reply {"lines": [{"key": "...", "payee": "..."${guessing ? ', "category": "<id>" | null' : ""}}]}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    maxTokens: 8000,
    timeoutMs: 90_000,
  })
  const rows = readJson(reply.text)?.lines
  const out: Record<string, { payee: string; categoryId: string | null }> = {}
  for (const r of Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []) {
    const item = input.items.find((i) => i.key === str(r?.key))
    if (!item) continue
    const cat = cats.find((c) => c.id === str(r.category) && !!c.income === item.amount > 0)
    out[item.key] = { payee: str(r.payee) || item.text, categoryId: cat?.id ?? null }
  }
  return out
}

export const differenceInput = z.object({
  statementDay: day,
  diff: z.number().int(),
  currency: z.string().regex(/^[a-z]{3,6}$/),
  ticked: z.array(z.object({ id: z.string(), day, amount: z.number().int(), name: z.string().max(200) })).max(400),
  unticked: z.array(z.object({ id: z.string(), day, amount: z.number().int(), name: z.string().max(200) })).max(400),
  /** Statement lines with no entry in Kosha. */
  missing: z.array(z.object({ day, amount: z.number().int(), text: z.string().max(300) })).max(400),
  /** Entries that look like a statement line with a different amount (a tip, a currency rate). */
  close: z
    .array(z.object({ id: z.string(), statementAmount: z.number().int() }))
    .max(400)
    .default([]),
})

/**
 * Looks for what explains a reconciliation difference, on top of the checks Kosha runs itself. It compares
 * payees and amounts, so it runs only while both are shared. Entries go out as e1, e2… and come back as ids.
 */
export async function explainDifference(uid: string, input: z.infer<typeof differenceInput>) {
  const s = await session(uid, "statements")
  if (!s.shares.payee || !s.shares.amount) throw unavailable(m.ai_difference_needs_shares())
  const refs = [...input.ticked, ...input.unticked].map((e, i) => ({ ...e, ref: `e${i + 1}` }))
  const when = (d: string) => (s.shares.date ? d : d.slice(0, 7))
  const entry = (e: (typeof refs)[number]) => ({ ref: e.ref, date: when(e.day), payee: e.name, amount: e.amount / 100 })
  const reply = await s.send({
    system: `You help one person reconcile an account: their finance app's entries against a bank statement. Reply with only a JSON object:
{"summary": "...", "suggestions": [{"text": "...", "refs": ["e1"]}]}
- summary: one or two plain sentences on what most likely explains the difference.
- suggestions: up to four specific things to check or change, most likely first. Name entries by payee in the text, and list the entries each is about in refs. For example an entry ticked that isn't on the statement, one missing, a duplicate, a wrong amount, a wrong sign, or a fee not entered yet.
Only use the data given, and never invent entries. When the data can't explain part of the difference, say so rather than guessing at one.
Write the summary and suggestions in ${language()}. Keep payee names as they are.`,
    turns: [
      {
        role: "user",
        content: [
          `Statement closing day: ${when(input.statementDay)}. Difference (statement minus ticked entries): ${input.diff / 100} ${input.currency.toUpperCase()}. Amounts are negative for money out.`,
          `Ticked as on the statement: ${json(refs.slice(0, input.ticked.length).map(entry))}`,
          `Not ticked: ${json(refs.slice(input.ticked.length).map(entry))}`,
          input.missing.length &&
            `On the statement but not in the app: ${json(input.missing.map((m) => ({ date: when(m.day), text: m.text, amount: m.amount / 100 })))}`,
          input.close.length &&
            `Entries that match a statement line except for the amount, with the statement's amount: ${json(
              input.close.flatMap((c) => {
                const e = refs.find((r) => r.id === c.id)
                return e ? [{ ref: e.ref, app: e.amount / 100, statement: c.statementAmount / 100 }] : []
              })
            )}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    maxTokens: 2000,
    timeoutMs: 90_000,
  })
  const raw = readJson(reply.text)
  const list = Array.isArray(raw?.suggestions) ? (raw.suggestions as Record<string, unknown>[]) : []
  // A ref the model wrote into its text reads as the payee.
  const named = (t: string) => t.replace(/\be\d+\b/g, (r) => refs.find((e) => e.ref === r)?.name || r)
  return {
    summary: named(str(raw?.summary, 600)),
    suggestions: list.slice(0, 4).flatMap((x) => {
      const text = named(str(x?.text, 300))
      const ids = (Array.isArray(x?.refs) ? x.refs : []).flatMap((r) => refs.find((e) => e.ref === r)?.id ?? [])
      return text ? [{ text, ids }] : []
    }),
  }
}
