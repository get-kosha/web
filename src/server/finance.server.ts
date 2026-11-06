// Everything the app does with a user's money data. Each function takes the user's id first, so the
// UI's server functions (lib/api.ts) and the public API (server/api.server.ts) run the same code.
// Every query is scoped by user_id, joins included.

import { z } from "zod"
import {
  CORRECTION_CATEGORY,
  NEUTRAL_SQL,
  PREFS,
  TRANSFER_CATEGORY,
  addDays,
  convert,
  cumulative,
  dayOf,
  daysInMonth,
  isNeutral,
  isSystemCategory,
  MAX_TAGS,
  cleanTag,
  eventFor,
  monthOf,
  monthRange,
  parseAmount,
  shiftMonth,
  unixOf,
  entryDate,
  usualCurve,
  type AccountType,
  type Schedule,
  type TitleRule,
} from "@/lib/core"
import {
  COUNTERPART,
  HttpError,
  db,
  ensureSettled,
  getRates,
  getSettings,
  loadSubscriptions,
  marketRate,
  receivedFor,
  refreshRates,
  refreshRatesIfStale,
  transferLegs,
} from "@/server/db.server"

export type Wallet = {
  id: string
  name: string
  currency: string
  colour: string | null
  archived: number
  balance: number
  type: AccountType
  credit_limit: number | null
  gain: number | null
  gain_day: string | null
  tx_count: number
}
export type Category = {
  id: string
  name: string
  icon: string | null
  income: number
  parent_id: string | null
  uses: number
  archived: number
}
export type Tx = {
  id: string
  wallet_id: string
  category_id: string
  name: string
  note: string
  amount: number
  date: number
  paid: number
  kind: string | null
  subscription_id: string | null
  due_day: string | null
  transfer_id: string | null
  subcategory_id?: string | null
  /** Transfers only: the other account and the amount on its side, plus exchange details. */
  counter_wallet_id?: string | null
  counter_amount?: number | null
  fee?: number | null
  provider?: string | null
  market_rate?: number | null
  /** JSON array of tags as stored; read with tagList. */
  tags?: string
  event_id?: string | null
}
export type Event = {
  id: string
  name: string
  start_day: string | null
  end_day: string | null
  tx_count: number
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** "HH:MM", 24-hour, in the user's time zone. Left out, the time follows `entryDate`. */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:30")
const month = z.string().regex(/^\d{4}-\d{2}$/)
const currency = z.string().regex(/^[a-z]{3,6}$/)
const tags = z
  .array(z.string().transform(cleanTag))
  .max(MAX_TAGS)
  .transform((t) => [...new Set(t.filter(Boolean))])
const ids = (list: string[]) => JSON.stringify(list)
const notFound = (what: string) => new HttpError(404, `${what} not found`)

// ---------- meta: everything most screens need ----------

const walletsQuery = (uid: string) =>
  db()
    .prepare(`SELECT w.id, w.name, w.currency, w.colour, w.archived, w.type, w.credit_limit,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = w.user_id AND wallet_id = w.id AND paid = 1), 0) AS balance,
      (SELECT COUNT(*) FROM transactions WHERE user_id = w.user_id AND wallet_id = w.id) AS tx_count,
      (SELECT gain FROM valuations WHERE user_id = w.user_id AND wallet_id = w.id ORDER BY day DESC LIMIT 1) AS gain,
      (SELECT day FROM valuations WHERE user_id = w.user_id AND wallet_id = w.id ORDER BY day DESC LIMIT 1) AS gain_day
      FROM wallets w WHERE w.user_id = ? ORDER BY w.archived, w.sort`)
    .bind(uid)

// Newest first, so the picker and Settings both lead with the current trip.
const eventsQuery = (uid: string) =>
  db()
    .prepare(`SELECT e.id, e.name, e.start_day, e.end_day,
      (SELECT COUNT(*) FROM transactions WHERE user_id = e.user_id AND event_id = e.id) AS tx_count
      FROM events e WHERE e.user_id = ? ORDER BY COALESCE(e.start_day, '') DESC, e.created_at DESC`)
    .bind(uid)

export const listEvents = async (uid: string) => (await eventsQuery(uid).all<Event>()).results

// Every tag in use (or those starting with `prefix`), most used first, with how often and when it was last used.
const tagsQuery = (uid: string, prefix: string, limit: number) =>
  db()
    .prepare(`SELECT j.value AS tag, COUNT(*) AS count, MAX(t.date) AS last FROM transactions t, json_each(t.tags) j
      WHERE t.user_id = ?1 AND (?2 = '' OR substr(j.value, 1, length(?2)) = ?2)
      GROUP BY j.value ORDER BY COUNT(*) DESC, j.value LIMIT ?3`)
    .bind(uid, prefix, limit)

export async function listTags(uid: string, prefix: string, limit: number) {
  const { tz } = await getSettings(uid)
  const { results } = await tagsQuery(uid, cleanTag(prefix), limit).all<{ tag: string; count: number; last: number }>()
  return results.map((r) => ({ tag: r.tag, count: r.count, lastDay: dayOf(r.last, tz) }))
}

/** Every account with its balance (paid rows only), transaction count and latest gain. */
export async function loadWallets(uid: string) {
  await ensureSettled(uid)
  return (await walletsQuery(uid).all<Wallet>()).results
}

export async function loadMeta(uid: string) {
  const DB = db()
  await ensureSettled(uid)
  const settings = await getSettings(uid)
  refreshRatesIfStale(settings.ratesUpdated)
  const [wallets, categories, rules, titles, events, tagRows] = await DB.batch([
    walletsQuery(uid),
    // Archived categories are included so old transactions keep their name; pickers leave them out.
    DB.prepare(`SELECT c.id, c.name, c.icon, c.income, c.parent_id, c.archived,
      (SELECT COUNT(*) FROM transactions WHERE user_id = c.user_id AND category_id = c.id AND date > unixepoch() - 90 * 86400) AS uses
      FROM categories c WHERE c.user_id = ? ORDER BY c.archived, c.sort`).bind(uid),
    DB.prepare("SELECT title, category_id, exact FROM title_rules WHERE user_id = ?").bind(uid),
    DB.prepare(
      "SELECT name FROM transactions WHERE user_id = ? AND name <> '' GROUP BY name ORDER BY COUNT(*) DESC, MAX(date) DESC LIMIT 300"
    ).bind(uid),
    eventsQuery(uid),
    tagsQuery(uid, "", 200),
  ])
  return {
    wallets: wallets.results as Wallet[],
    categories: categories.results as Category[],
    rules: rules.results as TitleRule[],
    titles: (titles.results as { name: string }[]).map((t) => t.name),
    events: events.results as Event[],
    tags: (tagRows.results as { tag: string }[]).map((t) => t.tag),
    rates: await getRates(),
    primary: settings.primary,
    order: settings.order,
    tz: settings.tz,
    prefs: settings.prefs,
    ratesUpdated: settings.ratesUpdated,
  }
}

// ---------- dashboard analytics ----------

export type Upcoming = {
  key: string
  name: string
  day: string
  amount: number
  currency: string
  kind: string
  subscription_id: string | null
  category_id: string
  to_wallet_id: string | null
}

export const dashboardInput = z.object({ month: month.optional(), currency: currency.optional() })

export async function dashboard(uid: string, data: z.infer<typeof dashboardInput>) {
  const DB = db()
  await ensureSettled(uid)
  const settings = await getSettings(uid)
  const { tz } = settings
  const rates = await getRates()
  const primary = data.currency && rates[data.currency] ? data.currency : settings.primary
  const nowMonth = monthOf(Date.now() / 1000, tz)
  const selected = data.month ?? nowMonth

  // ponytail: full scan aggregated in JS so months follow the user's time zone; fine for tens of
  // thousands of rows, move to SQL aggregates if it gets slow. History uses today's exchange rates.
  const [all, oneOff, accounts, valuations] = await DB.batch([
    DB.prepare(`SELECT t.amount, t.date, t.category_id, t.name, t.wallet_id, t.subscription_id, w.currency
      FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id WHERE t.user_id = ? AND t.paid = 1`).bind(
      uid
    ),
    DB.prepare(`SELECT t.*, w.currency FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
      WHERE t.user_id = ? AND t.paid = 0 AND t.subscription_id IS NULL AND COALESCE(t.kind, '') NOT IN ('credit', 'debt', 'skipped')
      AND t.date < unixepoch() + 30 * 86400 ORDER BY t.date LIMIT 20`).bind(uid),
    DB.prepare("SELECT id, type, credit_limit, currency FROM wallets WHERE user_id = ?").bind(uid),
    DB.prepare(`SELECT v.wallet_id, v.day, v.gain, w.currency FROM valuations v JOIN wallets w ON w.user_id = v.user_id AND w.id = v.wallet_id
      WHERE v.user_id = ? ORDER BY v.day`).bind(uid),
  ])
  const today = dayOf(Date.now() / 1000, tz)
  const horizon = addDays(today, 30)
  const upcoming: Upcoming[] = [
    ...(await loadSubscriptions(uid, today)).flatMap((sub) =>
      sub.instances
        .filter((i) => i.status !== "paid" && i.status !== "skipped" && i.day <= horizon)
        .map((i) => ({
          key: `${sub.id}|${i.due_day}`,
          name: sub.name,
          day: i.day,
          amount: i.amount,
          currency: sub.currency,
          kind: sub.to_wallet_id ? "transfer" : sub.kind,
          subscription_id: sub.id,
          category_id: sub.category_id,
          to_wallet_id: sub.to_wallet_id,
        }))
    ),
    ...(oneOff.results as (Tx & { currency: string })[]).map((t) => ({
      key: t.id,
      name: t.name,
      day: dayOf(t.date, tz),
      amount: t.amount,
      currency: t.currency,
      kind: t.kind ?? "upcoming",
      subscription_id: null,
      category_id: t.category_id,
      to_wallet_id: null,
    })),
  ].sort((a, b) => a.day.localeCompare(b.day))

  type Row = {
    amount: number
    date: number
    category_id: string
    name: string
    currency: string
    wallet_id: string
    subscription_id: string | null
  }
  // Net worth adjustments by month. Credit limits count from a card's first month, and gains from their entry date.
  const adjust = new Map<string, number>()
  const firstMonth = new Map<string, string>()
  for (const r of all.results as Row[]) {
    const m = monthOf(r.date, tz)
    if (!firstMonth.has(r.wallet_id) || m < firstMonth.get(r.wallet_id)!) firstMonth.set(r.wallet_id, m)
  }
  for (const a of accounts.results as { id: string; type: string; credit_limit: number | null; currency: string }[])
    if (a.type === "credit" && a.credit_limit && firstMonth.has(a.id)) {
      const m = firstMonth.get(a.id)!
      adjust.set(m, (adjust.get(m) ?? 0) - convert(a.credit_limit, a.currency, primary, rates))
    }
  const lastGain = new Map<string, number>()
  for (const v of valuations.results as { wallet_id: string; day: string; gain: number; currency: string }[]) {
    const m = v.day.slice(0, 7)
    const g = convert(v.gain, v.currency, primary, rates)
    adjust.set(m, (adjust.get(m) ?? 0) + g - (lastGain.get(v.wallet_id) ?? 0))
    lastGain.set(v.wallet_id, g)
  }
  const months = new Map<string, { income: number; expense: number; net: number }>()
  const dim = daysInMonth(selected)
  const todayNum = selected === nowMonth ? Number(today.slice(8)) : null
  // Pace compares against the 6 complete months before the selected one (the first month with data is partial).
  const first = [...firstMonth.values()].sort()[0]
  const usualMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(selected, -1 - i)).filter(
    (m) => first && m > first
  )
  const upTo = todayNum ?? dim // "by day 18": category comparisons stop at the same day of month
  const daily = new Map<string, number[]>(
    [selected, ...usualMonths].map((m) => [m, Array<number>(daysInMonth(m)).fill(0)])
  )
  const byCat = new Map<string, { total: number; count: number; fixed: boolean; usual: number }>()
  const biggest = new Map<string, { name: string; amount: number }>() // largest expense per month
  let income: { name: string; day: string; amount: number } | null = null

  for (const r of all.results as Row[]) {
    const m = monthOf(r.date, tz)
    const v = convert(r.amount, r.currency, primary, rates)
    const e = months.get(m) ?? { income: 0, expense: 0, net: 0 }
    e.net += v
    months.set(m, e)
    if (isNeutral(r.category_id)) continue
    if (v > 0) {
      e.income += v
      if (m === selected && (!income || v > income.amount))
        income = { name: r.name.trim(), day: dayOf(r.date, tz), amount: v }
      continue
    }
    e.expense -= v
    if (-v > (biggest.get(m)?.amount ?? 0)) biggest.set(m, { name: r.name.trim(), amount: -v })
    const d = Number(dayOf(r.date, tz).slice(8))
    const days = daily.get(m)
    if (days) days[d - 1] -= v
    if (m === selected) {
      const c = byCat.get(r.category_id) ?? { total: 0, count: 0, fixed: true, usual: 0 }
      c.total -= v
      c.count++
      c.fixed &&= !!r.subscription_id
      byCat.set(r.category_id, c)
    } else if (days && d <= upTo) {
      const c = byCat.get(r.category_id) ?? { total: 0, count: 0, fixed: true, usual: 0 }
      c.usual -= v / usualMonths.length
      byCat.set(r.category_id, c)
    }
  }

  const usual = usualCurve(
    usualMonths.map((m) => cumulative(daily.get(m)!)),
    dim
  )
  const spentDays = todayNum ?? (selected < nowMonth ? dim : 0)
  const pace = {
    daysInMonth: dim,
    today: todayNum,
    current: cumulative(daily.get(selected)!).slice(0, spentDays),
    usual,
  }

  const keys = [...months.keys()].sort()
  const series: { month: string; income: number; expense: number; netWorth: number }[] = []
  if (keys.length) {
    let worth = 0
    for (let m = keys[0]; m <= nowMonth; m = shiftMonth(m, 1)) {
      const e = months.get(m) ?? { income: 0, expense: 0, net: 0 }
      worth += e.net + (adjust.get(m) ?? 0)
      series.push({ month: m, income: e.income, expense: e.expense, netWorth: worth })
    }
  }
  while (series.length && series[0].netWorth === 0) series.shift()
  // The bar chart labels a month whose spend is over 1.5x the median with its largest expense.
  const last12 = series.filter((x) => x.month <= selected).slice(-12)
  const median = [...last12].map((x) => x.expense).sort((a, b) => a - b)[Math.floor(last12.length / 2)] ?? 0
  const peak = last12.reduce<(typeof last12)[number] | null>(
    (top, x) => (!top || x.expense > top.expense ? x : top),
    null
  )
  const spike =
    peak && median > 0 && peak.expense > 1.5 * median && biggest.has(peak.month)
      ? { month: peak.month, ...biggest.get(peak.month)! }
      : null
  const cur = months.get(selected) ?? { income: 0, expense: 0, net: 0 }
  const prev = months.get(shiftMonth(selected, -1)) ?? { income: 0, expense: 0, net: 0 }

  return {
    primary,
    month: selected,
    current: cur,
    previous: prev,
    series,
    categories: [...byCat.entries()]
      .filter(([, c]) => c.total > 0)
      .map(([id, c]) => ({
        id,
        total: c.total,
        count: c.count,
        fixed: c.fixed,
        usualToDate: usualMonths.length ? c.usual : null,
      }))
      .sort((a, b) => b.total - a.total),
    pace,
    spike,
    income,
    upcoming,
  }
}

// ---------- transactions ----------

export const listInput = z.object({
  q: z.string().max(100).optional(),
  wallet: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().max(32).optional(),
  /** An event's transactions, whatever their month. */
  event: z.string().optional(),
  month: month.optional(),
  /** A day range instead of a month, both ends included. */
  from: day.optional(),
  to: day.optional(),
  /** Amount range in cents, by absolute value. */
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
  type: z.enum(["out", "in", "transfers"]).optional(),
  /** Balance corrections are hidden unless asked for. */
  corrections: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).default(100),
  offset: z.number().int().min(0).default(0),
})

export async function listTransactions(uid: string, data: z.infer<typeof listInput>) {
  const { tz } = await getSettings(uid)
  // Future scheduled entries show on the dashboard. The list shows what has happened, plus overdue items.
  await ensureSettled(uid)
  // Month, account and search scope everything; the type, category, amount and correction filters only scope the list.
  const where: string[] = [
    "t.user_id = ?",
    "(t.paid = 1 OR t.date <= unixepoch())",
    "COALESCE(t.kind, '') <> 'skipped'",
  ]
  const binds: unknown[] = [uid]
  if (data.q) {
    const cents = parseAmount(data.q)
    where.push(`(t.name LIKE ? OR t.note LIKE ?${cents ? " OR ABS(t.amount) = ?" : ""})`)
    binds.push(`%${data.q}%`, `%${data.q}%`, ...(cents ? [Math.abs(cents)] : []))
  }
  if (data.wallet) {
    where.push("t.wallet_id = ?")
    binds.push(data.wallet)
  } else where.push("NOT (t.transfer_id IS NOT NULL AND t.amount > 0)") // one row per transfer
  // Activity follows the app-wide month (no month means the current one), except for an event or a tag,
  // which are about every entry they hold, whatever the month. A day range overrides both.
  if (data.event) {
    where.push("t.event_id = ?")
    binds.push(data.event)
  }
  if (data.from || data.to || (!data.event && !data.tag)) {
    const [from, to] =
      data.from || data.to
        ? [data.from ? unixOf(data.from, tz) : 0, data.to ? unixOf(addDays(data.to, 1), tz) : 2 ** 40]
        : monthRange(data.month ?? monthOf(Date.now() / 1000, tz), tz)
    where.push("t.date >= ? AND t.date < ?")
    binds.push(from, to)
  }
  const base = [...where]
  const baseBinds = [...binds]
  if (data.category) {
    where.push("(t.category_id = ? OR t.subcategory_id = ?)")
    binds.push(data.category, data.category)
  }
  if (data.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ?)")
    binds.push(data.tag)
  }
  if (data.min !== undefined) {
    where.push("ABS(t.amount) >= ?")
    binds.push(data.min)
  }
  if (data.max !== undefined) {
    where.push("ABS(t.amount) <= ?")
    binds.push(data.max)
  }
  if (data.type === "out") where.push(`t.amount < 0 AND t.category_id NOT IN ${NEUTRAL_SQL}`)
  if (data.type === "in") where.push(`t.amount > 0 AND t.category_id NOT IN ${NEUTRAL_SQL}`)
  if (data.type === "transfers") where.push("t.transfer_id IS NOT NULL")
  if (!data.corrections) where.push(`t.category_id <> '${CORRECTION_CATEGORY}'`)
  const w = `WHERE ${where.join(" AND ")}`
  const DB = db()
  const [rows, count, totals, corrections] = await DB.batch([
    DB.prepare(`SELECT t.*, ${COUNTERPART} ${w} ORDER BY t.date DESC LIMIT ? OFFSET ?`).bind(
      ...binds,
      data.limit + 1,
      data.offset
    ),
    DB.prepare(`SELECT COUNT(*) AS n FROM transactions t ${w}`).bind(...binds),
    // Money out, money in and transfers per currency for the filtered list. The client converts them to the display currency.
    DB.prepare(`SELECT w.currency,
        SUM(CASE WHEN t.amount < 0 AND t.category_id NOT IN ${NEUTRAL_SQL} THEN t.amount ELSE 0 END) AS out,
        SUM(CASE WHEN t.amount > 0 AND t.category_id NOT IN ${NEUTRAL_SQL} THEN t.amount ELSE 0 END) AS inn,
        SUM(CASE WHEN t.transfer_id IS NOT NULL AND t.amount < 0 THEN -t.amount ELSE 0 END) AS transfers
      FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id ${w} AND t.paid = 1
      GROUP BY w.currency`).bind(...binds),
    DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t WHERE ${base.join(" AND ")} AND t.category_id = '${CORRECTION_CATEGORY}'`
    ).bind(...baseBinds),
  ])
  const list = rows.results as Tx[]
  return {
    rows: list.slice(0, data.limit),
    total: (count.results[0] as { n: number }).n,
    totals: totals.results as { currency: string; out: number; inn: number; transfers: number }[],
    corrections: (corrections.results[0] as { n: number }).n,
    tz,
  }
}

/** A payee's recent payments, for the "At this payee" bars in the Activity panel. */
export async function payeeHistory(uid: string, name: string) {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT t.id, t.amount, t.date, w.currency FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
      WHERE t.user_id = ? AND t.name = ? AND t.paid = 1 AND t.transfer_id IS NULL ORDER BY t.date DESC LIMIT 200`)
    .bind(uid, name)
    .all<{ id: string; amount: number; date: number; currency: string }>()
  const year = dayOf(Date.now() / 1000, tz).slice(0, 4)
  return {
    recent: results
      .slice(0, 8)
      .reverse()
      .map((r) => ({ id: r.id, amount: r.amount, currency: r.currency, day: dayOf(r.date, tz) })),
    count: results.length,
    thisYear: results.filter((r) => dayOf(r.date, tz).startsWith(year)),
  }
}

// ---------- events ----------

export const eventInput = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Give the event a name").max(80),
    startDay: day.nullable(),
    endDay: day.nullable(),
  })
  .refine((e) => !e.startDay || !e.endDay || e.endDay >= e.startDay, "The end is before the start")

export async function saveEvent(uid: string, data: z.infer<typeof eventInput>) {
  const DB = db()
  const id = data.id ?? crypto.randomUUID()
  const res = data.id
    ? await DB.prepare("UPDATE events SET name = ?, start_day = ?, end_day = ? WHERE user_id = ? AND id = ?")
        .bind(data.name, data.startDay, data.endDay, uid, id)
        .run()
    : await DB.prepare("INSERT INTO events (user_id, id, name, start_day, end_day) VALUES (?, ?, ?, ?, ?)")
        .bind(uid, id, data.name, data.startDay, data.endDay)
        .run()
  if (!res.meta.changes) throw notFound("Event")
  return id
}

/** Deletes an event. Its transactions stay but no longer belong to it. Returns whether it existed. */
export async function deleteEvent(uid: string, id: string) {
  const DB = db()
  const res = await DB.batch([
    DB.prepare("UPDATE transactions SET event_id = NULL WHERE user_id = ? AND event_id = ?").bind(uid, id),
    DB.prepare("DELETE FROM events WHERE user_id = ? AND id = ?").bind(uid, id),
  ])
  return res[1].meta.changes > 0
}

export const saveInput = z.object({
  id: z.string().optional(),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().max(200),
  note: z.string().max(2000).default(""),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount is required"),
  day,
  time: time.optional(),
  paid: z.boolean().default(true),
  /** A subcategory of `categoryId`. When left out, it is kept while the category stays the same. */
  subcategoryId: z.string().nullable().optional(),
  /** When left out, an edit keeps its tags and a new entry gets none. */
  tags: tags.optional(),
  /** null means no event. When left out, an edit keeps its event and a new entry gets the event its day falls in. */
  eventId: z.string().nullable().optional(),
})
type SaveTx = z.infer<typeof saveInput>

/** Creates or edits transactions in one atomic batch. Returns their ids in input order. */
export async function saveTransactions(uid: string, items: SaveTx[]) {
  const DB = db()
  const { tz, prefs } = await getSettings(uid)
  const now = Math.floor(Date.now() / 1000)
  const editIds = items.flatMap((t) => (t.id ? [t.id] : []))
  const existing = new Map<string, number>()
  if (editIds.length) {
    const { results } = await DB.prepare(
      "SELECT id, date FROM transactions WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))"
    )
      .bind(uid, ids(editIds))
      .all<{ id: string; date: number }>()
    for (const r of results) existing.set(r.id, r.date)
    const missing = editIds.find((id) => !existing.has(id))
    if (missing) throw notFound(items.length > 1 ? `Transaction ${missing}` : "Transaction")
  }
  // An event id must be one of this user's; a new entry without one gets the event covering its day.
  const { results: events } = await DB.prepare("SELECT id, start_day, end_day FROM events WHERE user_id = ?")
    .bind(uid)
    .all<{ id: string; start_day: string | null; end_day: string | null }>()
  const badEvent = items.find((t) => t.eventId && !events.some((e) => e.id === t.eventId))
  if (badEvent) throw notFound(items.length > 1 ? `Event ${badEvent.eventId}` : "Event")
  const update = DB.prepare(`UPDATE transactions SET wallet_id = ?1, category_id = ?2,
    subcategory_id = CASE WHEN ?10 = 1 THEN ?11 WHEN category_id = ?2 THEN subcategory_id ELSE NULL END,
    tags = COALESCE(?12, tags), event_id = CASE WHEN ?13 = 1 THEN ?14 ELSE event_id END,
    name = ?3, note = ?4, amount = ?5, date = ?6, paid = ?7, updated_at = unixepoch() WHERE user_id = ?9 AND id = ?8`)
  const insert =
    DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, subcategory_id, name, note, amount, date, paid, tags, event_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  // Settings › Payee rules › Learn from my edits. A learned rule never replaces one you made.
  const learn = DB.prepare(`INSERT INTO title_rules (user_id, title, category_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, title) DO UPDATE SET category_id = excluded.category_id WHERE source = 'learned'`)
  const writes = []
  const out: string[] = []
  for (const data of items) {
    const old = data.id ? existing.get(data.id) : undefined
    const date = entryDate(data.day, tz, now, data.time, old)
    const name = data.name.trim()
    const id = data.id ?? crypto.randomUUID()
    const eventId = data.eventId === undefined && old === undefined ? eventFor(data.day, events) : data.eventId
    const tagsJson = data.tags === undefined ? null : JSON.stringify(data.tags)
    out.push(id)
    writes.push(
      old !== undefined
        ? update.bind(
            data.walletId,
            data.categoryId,
            name,
            data.note.trim(),
            data.amount,
            date,
            data.paid ? 1 : 0,
            id,
            uid,
            data.subcategoryId === undefined ? 0 : 1,
            data.subcategoryId ?? null,
            tagsJson,
            eventId === undefined ? 0 : 1,
            eventId ?? null
          )
        : insert.bind(
            uid,
            id,
            data.walletId,
            data.categoryId,
            data.subcategoryId ?? null,
            name,
            data.note.trim(),
            data.amount,
            date,
            data.paid ? 1 : 0,
            tagsJson ?? "[]",
            eventId ?? null
          )
    )
    if (name && !isNeutral(data.categoryId) && prefs.learn_rules === "1")
      writes.push(learn.bind(uid, name, data.categoryId))
  }
  if (writes.length) await DB.batch(writes)
  return out
}

/**
 * Deletes transactions in one batch. Deleting either half of a transfer deletes both halves and its fee;
 * deleting just a fee clears it from its transfer. A deleted subscription payment becomes a skipped
 * occurrence, otherwise auto-pay would re-create it. Returns the ids found and the ids that weren't.
 */
export async function deleteTransactions(uid: string, list: string[]) {
  const DB = db()
  const { results: rows } = await DB.prepare(`SELECT id, transfer_id, subscription_id, due_day FROM transactions
    WHERE user_id = ?1 AND (id IN (SELECT value FROM json_each(?2)) OR transfer_id IN
      (SELECT transfer_id FROM transactions WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2)) AND transfer_id IS NOT NULL))`)
    .bind(uid, ids(list))
    .all<{ id: string; transfer_id: string | null; subscription_id: string | null; due_day: string | null }>()
  const asked = new Set(list)
  const found = rows.filter((r) => asked.has(r.id))
  const transferIds = [...new Set(found.flatMap((r) => (r.transfer_id ? [r.transfer_id] : [])))]
  const legs = rows.filter((r) => asked.has(r.id) || (r.transfer_id && transferIds.includes(r.transfer_id)))
  const occurrences = legs.filter((r) => r.subscription_id && r.due_day).map((r) => r.id)
  const plain = found.filter((r) => !r.transfer_id).map((r) => r.id)
  if (legs.length)
    await DB.batch([
      DB.prepare(`DELETE FROM transactions WHERE user_id = ?1 AND id IN
        (SELECT fee_tx_id FROM transfers WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2)))`).bind(
        uid,
        ids(transferIds)
      ),
      DB.prepare("DELETE FROM transfers WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))").bind(
        uid,
        ids(transferIds)
      ),
      DB.prepare(
        "UPDATE transfers SET fee = 0, fee_tx_id = NULL WHERE user_id = ? AND fee_tx_id IN (SELECT value FROM json_each(?))"
      ).bind(uid, ids(plain)),
      DB.prepare(
        "UPDATE transactions SET kind = 'skipped', paid = 0, updated_at = unixepoch() WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))"
      ).bind(uid, ids(occurrences)),
      DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))").bind(
        uid,
        ids(legs.filter((r) => !occurrences.includes(r.id)).map((r) => r.id))
      ),
    ])
  return { deleted: found.map((r) => r.id), notFound: list.filter((id) => !found.some((r) => r.id === id)) }
}

export const transferInput = z
  .object({
    transferId: z.string().optional(),
    fromWalletId: z.string().min(1),
    toWalletId: z.string().min(1),
    /** Total that left the source account, fee included. */
    sent: z.number().int().positive(),
    /** Part of `sent` charged as a fee (source currency). */
    fee: z.number().int().min(0).default(0),
    received: z.number().int().positive(),
    provider: z.string().trim().max(60).default(""),
    day,
    time: time.optional(),
    note: z.string().max(2000).default(""),
  })
  .refine((d) => d.fromWalletId !== d.toWalletId, "Pick two different accounts")
  .refine((d) => d.fee < d.sent, "The fee must be less than the amount sent")
type SaveTransfer = z.infer<typeof transferInput>

/** Creates or edits transfers, both halves and the fee, in one atomic batch. Returns their transfer ids. */
export async function saveTransfers(uid: string, items: SaveTransfer[]) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const now = Math.floor(Date.now() / 1000)
  const today = dayOf(now, tz)
  const { results: wallets } = await DB.prepare("SELECT id, currency FROM wallets WHERE user_id = ?")
    .bind(uid)
    .all<{ id: string; currency: string }>()
  const cur = (id: string) => wallets.find((w) => w.id === id)?.currency ?? ""
  const rates = new Map<string, Promise<number | null>>()
  const rateOn = (from: string, to: string, d: string) => {
    const key = `${from}|${to}|${d}`
    if (!rates.has(key)) rates.set(key, marketRate(from, to, d, today))
    return rates.get(key)!
  }
  const writes = []
  const out: string[] = []
  for (const data of items) {
    const { results: legs } = data.transferId
      ? await DB.prepare("SELECT * FROM transactions WHERE user_id = ? AND transfer_id = ?")
          .bind(uid, data.transferId)
          .all<Tx>()
      : { results: [] as Tx[] }
    if (data.transferId && !legs.length) throw notFound("Transfer")
    const outLeg = legs.find((l) => l.amount < 0)
    const inLeg = legs.find((l) => l.amount > 0)
    const date = entryDate(data.day, tz, now, data.time, outLeg?.date)
    const transferId = data.transferId ?? crypto.randomUUID()
    const meta = data.transferId
      ? await DB.prepare("SELECT * FROM transfers WHERE user_id = ? AND id = ?")
          .bind(uid, transferId)
          .first<{ fee_tx_id: string | null; market_rate: number | null }>()
      : null
    const [fromCur, toCur] = [cur(data.fromWalletId), cur(data.toWalletId)]
    // Keep a looked-up market rate unless the currencies or day changed.
    const sameDay = outLeg && dayOf(outLeg.date, tz) === data.day
    const market =
      fromCur === toCur
        ? null
        : meta?.market_rate &&
            sameDay &&
            outLeg?.wallet_id === data.fromWalletId &&
            inLeg?.wallet_id === data.toWalletId
          ? meta.market_rate
          : await rateOn(fromCur, toCur, data.day)
    const feeId = meta?.fee_tx_id ?? crypto.randomUUID()
    out.push(transferId)
    writes.push(
      ...transferLegs(uid, {
        transferId,
        outId: outLeg?.id ?? crypto.randomUUID(),
        inId: inLeg?.id ?? crypto.randomUUID(),
        from: data.fromWalletId,
        to: data.toWalletId,
        sent: data.sent - data.fee,
        received: data.received,
        date,
        paid: 1,
        note: data.note.trim(),
        kind: outLeg?.kind,
        subscriptionId: outLeg?.subscription_id,
        dueDay: outLeg?.due_day,
      }),
      data.fee
        ? DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date) VALUES (?, ?, ?, 'transfer_fee', ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET wallet_id = excluded.wallet_id, name = excluded.name, amount = excluded.amount, date = excluded.date, updated_at = unixepoch()`).bind(
            uid,
            feeId,
            data.fromWalletId,
            `${data.provider || "Transfer"} fee`,
            -data.fee,
            date
          )
        : DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(uid, feeId),
      DB.prepare(`INSERT INTO transfers (user_id, id, fee, fee_tx_id, provider, market_rate) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET fee = excluded.fee, fee_tx_id = excluded.fee_tx_id, provider = excluded.provider, market_rate = excluded.market_rate`).bind(
        uid,
        transferId,
        data.fee,
        data.fee ? feeId : null,
        data.provider,
        market
      )
    )
  }
  if (writes.length) await DB.batch(writes)
  return out
}

/**
 * Transfers with both halves and their exchange details, newest first: the ones named, or every paid
 * transfer between different currencies. `converted` is what left the source account minus the fee.
 */
export async function listTransfers(uid: string, only?: string[]) {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT o.transfer_id AS id, o.date, -o.amount AS converted, i.amount AS received,
      o.wallet_id AS from_wallet, i.wallet_id AS to_wallet, wo.currency AS from_currency, wi.currency AS to_currency,
      COALESCE(x.fee, 0) AS fee, COALESCE(x.provider, '') AS provider, x.market_rate, o.note
    FROM transactions o
    JOIN transactions i ON i.user_id = o.user_id AND i.transfer_id = o.transfer_id AND i.amount > 0
    JOIN wallets wo ON wo.user_id = o.user_id AND wo.id = o.wallet_id
    JOIN wallets wi ON wi.user_id = o.user_id AND wi.id = i.wallet_id
    LEFT JOIN transfers x ON x.user_id = o.user_id AND x.id = o.transfer_id
    WHERE o.user_id = ?1 AND o.amount < 0 AND (?2 IS NULL AND o.paid = 1 AND wo.currency <> wi.currency
      OR o.transfer_id IN (SELECT value FROM json_each(?2)))
    ORDER BY o.date DESC`)
    .bind(uid, only ? ids(only) : null)
    .all<{
      id: string
      date: number
      converted: number
      received: number
      from_wallet: string
      to_wallet: string
      from_currency: string
      to_currency: string
      fee: number
      provider: string
      market_rate: number | null
      note: string
    }>()
  return results.map((r) => ({ ...r, day: dayOf(r.date, tz) }))
}

/** Every transfer between different currencies, newest first, with fee, provider and market rate. */
export const listExchanges = (uid: string) => listTransfers(uid)

// ---------- settings ----------

export const settingsInput = z.object({
  primary: currency,
  tz: z.string().max(64),
  order: z.array(currency).max(50),
})

export async function saveSettings(uid: string, data: z.infer<typeof settingsInput>) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: data.tz })
  } catch {
    throw new HttpError(400, `Unknown time zone: ${data.tz}`)
  }
  if (!(await getRates())[data.primary]) throw new HttpError(400, `No exchange rate for ${data.primary}`)
  const DB = db()
  const set = DB.prepare(
    "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
  )
  await DB.batch([
    set.bind(uid, "primary_currency", data.primary),
    set.bind(uid, "timezone", data.tz),
    set.bind(uid, "currency_order", data.order.join(",")),
  ])
}

/** Fetches rates now for Settings › Currencies › Refresh, at most once every 10 minutes. */
export async function refreshRatesNow(uid: string) {
  const { ratesUpdated } = await getSettings(uid)
  const refreshed = Date.now() / 1000 - ratesUpdated >= 600
  if (refreshed) await refreshRates()
  return refreshed
}

/** Appearance, saved to the account so every device agrees. Only the keys passed change. */
export const prefsInput = z.object(
  Object.fromEntries(Object.entries(PREFS).map(([k, p]) => [k, p.schema.optional()])) as {
    [K in keyof typeof PREFS]: z.ZodOptional<(typeof PREFS)[K]["schema"]>
  }
)
export async function savePreferences(uid: string, data: z.infer<typeof prefsInput>) {
  const DB = db()
  const set = DB.prepare(
    "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
  )
  const writes = Object.entries(data)
    .filter(([, v]) => v != null)
    .map(([k, v]) => set.bind(uid, k, String(v)))
  if (writes.length) await DB.batch(writes)
}

// ---------- subscriptions ----------

export async function listSubscriptions(uid: string) {
  await ensureSettled(uid)
  const { tz } = await getSettings(uid)
  return loadSubscriptions(uid, dayOf(Date.now() / 1000, tz))
}

/** Income over the last 365 days, per account currency (Recurring shows committed costs as a share of it). */
export async function recentIncome(uid: string) {
  const { results } = await db()
    .prepare(`SELECT w.currency, SUM(t.amount) AS total FROM transactions t
    JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
    WHERE t.user_id = ? AND t.paid = 1 AND t.amount > 0 AND t.category_id NOT IN ${NEUTRAL_SQL} AND t.date >= unixepoch() - 365 * 86400
    GROUP BY w.currency`)
    .bind(uid)
    .all<{ currency: string; total: number }>()
  return results
}

export const subInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount is required"),
  note: z.string().max(2000).default(""),
  every: z.number().int().min(1).max(365),
  unit: z.enum(["day", "week", "month", "year"]),
  nextDay: day,
  endDay: day.nullable(),
  autoPay: z.boolean(),
  kind: z.enum(["subscription", "repetitive"]),
  /** Recurring transfers only. */
  toWalletId: z.string().nullable().default(null),
  toAmount: z.number().int().positive().nullable().default(null),
  variable: z.boolean().default(false),
})

export async function saveSubscription(uid: string, data: z.infer<typeof subInput>) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const today = dayOf(Date.now() / 1000, tz)
  const id = data.id ?? crypto.randomUUID()
  const old = data.id
    ? await DB.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND id = ?").bind(uid, id).first<Schedule>()
    : null
  if (data.id && !old) throw notFound("Subscription")
  const transfer = !!data.toWalletId
  if (transfer && data.toWalletId === data.walletId) throw new HttpError(400, "Pick two different accounts")
  const values = [
    data.name,
    data.walletId,
    transfer ? TRANSFER_CATEGORY : data.categoryId,
    transfer ? -Math.abs(data.amount) : data.amount,
    data.note.trim(),
    data.every,
    data.unit,
    data.nextDay,
    data.endDay,
    data.autoPay ? 1 : 0,
    transfer ? "repetitive" : data.kind,
    data.toWalletId,
    transfer ? data.toAmount : null,
    transfer && data.variable ? 1 : 0,
  ]
  const writes = [
    old
      ? DB.prepare(`UPDATE subscriptions SET name = ?, wallet_id = ?, category_id = ?, amount = ?, note = ?, every = ?, unit = ?,
          start_day = ?, end_day = ?, auto_pay = ?, kind = ?, to_wallet_id = ?, to_amount = ?, variable = ? WHERE id = ? AND user_id = ?`).bind(
          ...values,
          id,
          uid
        )
      : DB.prepare(`INSERT INTO subscriptions (name, wallet_id, category_id, amount, note, every, unit, start_day, end_day, auto_pay, kind,
          to_wallet_id, to_amount, variable, id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          ...values,
          id,
          uid
        ),
  ]
  // A new schedule no longer lines up with per-occurrence edits and skips made for the old one.
  if (old && (old.every !== data.every || old.unit !== data.unit || old.start_day !== data.nextDay))
    writes.push(...dropUnpaid(uid, id, today))
  await DB.batch(writes)
  await ensureSettled(uid, true)
  return id
}

/** Delete unpaid edits and skips from `from` on, including the other half of transfers. */
function dropUnpaid(uid: string, subscriptionId: string, from: string) {
  const DB = db()
  return [
    DB.prepare(`DELETE FROM transactions WHERE user_id = ?1 AND paid = 0 AND transfer_id IN
      (SELECT transfer_id FROM transactions WHERE user_id = ?1 AND subscription_id = ?2 AND paid = 0 AND due_day >= ?3 AND transfer_id IS NOT NULL)`).bind(
      uid,
      subscriptionId,
      from
    ),
    DB.prepare("DELETE FROM transactions WHERE user_id = ? AND subscription_id = ? AND paid = 0 AND due_day >= ?").bind(
      uid,
      subscriptionId,
      from
    ),
  ]
}

/** Paid history stays as ordinary transactions. Returns whether the subscription existed. */
export async function deleteSubscription(uid: string, id: string) {
  const DB = db()
  const res = await DB.batch([
    ...dropUnpaid(uid, id, "0000-00-00"),
    DB.prepare(
      "UPDATE transactions SET subscription_id = NULL, due_day = NULL WHERE user_id = ? AND subscription_id = ?"
    ).bind(uid, id),
    DB.prepare("DELETE FROM subscriptions WHERE user_id = ? AND id = ?").bind(uid, id),
  ])
  return res[res.length - 1].meta.changes > 0
}

export const occurrenceInput = z.object({
  id: z.string(),
  dueDay: day,
  action: z.enum(["edit", "skip", "pay", "reset"]),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0)
    .optional(),
  /** Transfers between currencies: what arrived in the destination account. */
  received: z.number().int().positive().optional(),
  day: day.optional(),
  note: z.string().max(2000).optional(),
})

/** Change one occurrence without touching the rest of the schedule. */
export async function updateOccurrence(uid: string, data: z.infer<typeof occurrenceInput>) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const sub = await DB.prepare(`SELECT s.*, w.currency, tw.currency AS to_currency FROM subscriptions s
    JOIN wallets w ON w.user_id = s.user_id AND w.id = s.wallet_id
    LEFT JOIN wallets tw ON tw.user_id = s.user_id AND tw.id = s.to_wallet_id WHERE s.user_id = ? AND s.id = ?`)
    .bind(uid, data.id)
    .first<
      Schedule & {
        id: string
        name: string
        wallet_id: string
        category_id: string
        amount: number
        note: string
        kind: string
        to_wallet_id: string | null
        to_amount: number | null
        currency: string
        to_currency: string | null
      }
    >()
  if (!sub) throw notFound("Subscription")
  const existing = await DB.prepare(
    "SELECT * FROM transactions WHERE user_id = ? AND subscription_id = ? AND due_day = ?"
  )
    .bind(uid, data.id, data.dueDay)
    .first<Tx>()
  if (existing?.paid && data.action !== "edit")
    throw new HttpError(409, "Already paid. Edit it from the history instead")

  const otherHalf = existing?.transfer_id
    ? await DB.prepare("SELECT * FROM transactions WHERE user_id = ? AND transfer_id = ? AND id <> ?")
        .bind(uid, existing.transfer_id, existing.id)
        .first<Tx>()
    : null
  if (data.action === "reset") {
    await DB.batch([
      ...(otherHalf && !otherHalf.paid
        ? [DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(uid, otherHalf.id)]
        : []),
      DB.prepare(
        "DELETE FROM transactions WHERE user_id = ? AND subscription_id = ? AND due_day = ? AND paid = 0"
      ).bind(uid, data.id, data.dueDay),
    ])
    return
  }
  const now = Math.floor(Date.now() / 1000)
  const today = dayOf(now, tz)
  const day = data.day ?? (existing ? dayOf(existing.date, tz) : data.dueDay)
  const date = data.action === "pay" && day > today ? now : unixOf(day, tz, 12)
  const amount = data.amount ?? existing?.amount ?? sub.amount
  const note = data.note ?? existing?.note ?? sub.note
  const paid = data.action === "pay" ? 1 : 0
  const kind = data.action === "skip" ? "skipped" : sub.kind
  if (sub.to_wallet_id && data.action !== "skip") {
    const tid = existing?.transfer_id ?? `${sub.id}:${data.dueDay}`
    const received =
      data.received ??
      (data.amount === undefined && otherHalf
        ? otherHalf.amount
        : receivedFor(sub, amount, sub.currency, sub.to_currency ?? sub.currency, await getRates()))
    await DB.batch(
      transferLegs(uid, {
        transferId: tid,
        outId: existing?.id ?? `${tid}:out`,
        inId: otherHalf?.id ?? `${tid}:in`,
        from: sub.wallet_id,
        to: sub.to_wallet_id,
        sent: amount,
        received,
        date,
        paid,
        note,
        kind,
        subscriptionId: sub.id,
        dueDay: data.dueDay,
      })
    )
    return
  }
  if (otherHalf) await DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(uid, otherHalf.id).run()
  await DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, note, amount, date, paid, kind, subscription_id, due_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, subscription_id, due_day) DO UPDATE SET note = excluded.note, amount = excluded.amount, date = excluded.date,
      paid = excluded.paid, kind = excluded.kind, updated_at = unixepoch()`)
    .bind(
      uid,
      crypto.randomUUID(),
      sub.wallet_id,
      sub.category_id,
      sub.name,
      note,
      amount,
      date,
      paid,
      kind,
      sub.id,
      data.dueDay
    )
    .run()
}

// ---------- accounts ----------

export const accountInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["bank", "cash", "credit", "investment"]),
  currency,
  creditLimit: z.number().int().min(0).nullable(),
  archived: z.boolean(),
  /** Balance the account should have now, in cents (available credit for cards, amount invested for investments).
   *  The difference from the current balance becomes a balance correction. null leaves it as is. */
  balance: z.number().int().nullable().default(null),
})

export async function saveAccount(uid: string, data: z.infer<typeof accountInput>) {
  const DB = db()
  const limit = data.type === "credit" ? data.creditLimit : null
  const id = data.id ?? crypto.randomUUID()
  const writes = []
  if (data.id) {
    const old =
      await DB.prepare(`SELECT currency, (SELECT COUNT(*) FROM transactions WHERE user_id = wallets.user_id AND wallet_id = wallets.id) AS n
      FROM wallets WHERE user_id = ? AND id = ?`)
        .bind(uid, data.id)
        .first<{ currency: string; n: number }>()
    if (!old) throw notFound("Account")
    if (old.currency !== data.currency && old.n > 0)
      throw new HttpError(409, "Currency can't change once an account has transactions")
    writes.push(
      DB.prepare(
        "UPDATE wallets SET name = ?, type = ?, currency = ?, credit_limit = ?, archived = ? WHERE user_id = ? AND id = ?"
      ).bind(data.name, data.type, data.currency, limit, data.archived ? 1 : 0, uid, id)
    )
  } else {
    writes.push(
      DB.prepare(`INSERT INTO wallets (user_id, id, name, currency, type, credit_limit, archived, sort)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(MAX(sort), 0) + 1 FROM wallets WHERE user_id = ?1))`).bind(
        uid,
        id,
        data.name,
        data.currency,
        data.type,
        limit,
        data.archived ? 1 : 0
      )
    )
  }
  // The difference is computed in the same batch, so it is always against the latest balance.
  if (data.balance !== null)
    writes.push(
      DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date)
      SELECT ?1, ?2, ?3, '${CORRECTION_CATEGORY}', ?4, diff, unixepoch()
      FROM (SELECT ?5 - COALESCE(SUM(amount), 0) AS diff FROM transactions WHERE user_id = ?1 AND wallet_id = ?3 AND paid = 1) WHERE diff <> 0`).bind(
        uid,
        crypto.randomUUID(),
        id,
        data.id ? "Balance correction" : "Opening balance",
        data.balance
      )
    )
  await DB.batch(writes)
  return id
}

export async function deleteAccount(uid: string, id: string) {
  const DB = db()
  const used = await DB.prepare(`SELECT (SELECT COUNT(*) FROM transactions WHERE user_id = ?1 AND wallet_id = ?2)
    + (SELECT COUNT(*) FROM subscriptions WHERE user_id = ?1 AND (wallet_id = ?2 OR to_wallet_id = ?2)) AS n,
    (SELECT COUNT(*) FROM wallets WHERE user_id = ?1 AND id = ?2) AS found`)
    .bind(uid, id)
    .first<{ n: number; found: number }>()
  if (!used?.found) throw notFound("Account")
  if (used.n) throw new HttpError(409, "This account has transactions. Archive it instead.")
  await DB.batch([
    DB.prepare("DELETE FROM valuations WHERE user_id = ? AND wallet_id = ?").bind(uid, id),
    DB.prepare("DELETE FROM wallets WHERE user_id = ? AND id = ?").bind(uid, id),
  ])
}

export async function listValuations(uid: string) {
  const { results } = await db().prepare("SELECT * FROM valuations WHERE user_id = ? ORDER BY day DESC").bind(uid).all()
  return results as { id: string; wallet_id: string; day: string; gain: number; invested: number; note: string }[]
}

export const gainInput = z.object({
  walletId: z.string(),
  day,
  gain: z.number().int(),
  note: z.string().max(500).default(""),
})

/** Records investment gains, one per account and day (a second entry for the same day replaces it). */
export async function recordGains(uid: string, items: z.infer<typeof gainInput>[]) {
  const DB = db()
  const { results } =
    await DB.prepare(`SELECT id, type, COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = wallets.user_id AND wallet_id = wallets.id AND paid = 1), 0) AS invested
    FROM wallets WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))`)
      .bind(uid, ids([...new Set(items.map((g) => g.walletId))]))
      .all<{ id: string; type: string; invested: number }>()
  const upsert =
    DB.prepare(`INSERT INTO valuations (user_id, id, wallet_id, day, gain, invested, note) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, wallet_id, day) DO UPDATE SET gain = excluded.gain, invested = excluded.invested, note = excluded.note`)
  const writes = items.map((g) => {
    const w = results.find((r) => r.id === g.walletId)
    if (!w) throw notFound(items.length > 1 ? `Account ${g.walletId}` : "Account")
    if (w.type !== "investment") throw new HttpError(400, "Gains can only be recorded for investment accounts")
    return upsert.bind(uid, crypto.randomUUID(), g.walletId, g.day, g.gain, w.invested, g.note.trim())
  })
  if (writes.length) await DB.batch(writes)
}

export async function deleteValuation(uid: string, id: string) {
  const res = await db().prepare("DELETE FROM valuations WHERE user_id = ? AND id = ?").bind(uid, id).run()
  return res.meta.changes > 0
}

// ---------- accounts page ----------

/** Everything the Accounts page draws: the net worth line, and per account its sparkline (6 month-ends),
 *  a 90-day balance line, the selected month's in / out / moved, and its 4 latest transactions.
 *  All per-account values are in the account's own currency; the series is in the display currency. */
export async function accountsOverview(uid: string, data: z.infer<typeof dashboardInput>) {
  const DB = db()
  await ensureSettled(uid)
  const settings = await getSettings(uid)
  const { tz } = settings
  const rates = await getRates()
  const display = data.currency && rates[data.currency] ? data.currency : settings.primary
  const today = dayOf(Date.now() / 1000, tz)
  const nowMonth = today.slice(0, 7)
  const selected = data.month ?? nowMonth
  // ponytail: full scan of paid transactions, like the dashboard; move to SQL aggregates if it gets slow.
  const [txs, walletRows, vals, recentRows] = await DB.batch([
    DB.prepare(
      "SELECT wallet_id, amount, date, category_id FROM transactions WHERE user_id = ? AND paid = 1 ORDER BY date"
    ).bind(uid),
    DB.prepare("SELECT id, type, currency, credit_limit FROM wallets WHERE user_id = ?").bind(uid),
    DB.prepare("SELECT wallet_id, day, gain FROM valuations WHERE user_id = ? ORDER BY day").bind(uid),
    DB.prepare(`SELECT id, wallet_id, name, amount, date, category_id, transfer_id, counter_wallet_id FROM (
        SELECT t.id, t.wallet_id, t.name, t.amount, t.date, t.category_id, t.transfer_id,
          (SELECT x.wallet_id FROM transactions x WHERE x.user_id = t.user_id AND x.transfer_id = t.transfer_id AND x.id <> t.id) AS counter_wallet_id,
          ROW_NUMBER() OVER (PARTITION BY t.wallet_id ORDER BY t.date DESC) AS n
        FROM transactions t WHERE t.user_id = ? AND t.paid = 1) WHERE n <= 4 ORDER BY date DESC`).bind(uid),
  ])
  type T = { wallet_id: string; amount: number; date: number; category_id: string }
  type W = { id: string; type: AccountType; currency: string; credit_limit: number | null }
  const byWallet = new Map<string, T[]>()
  for (const t of txs.results as T[])
    (byWallet.get(t.wallet_id) ?? byWallet.set(t.wallet_id, []).get(t.wallet_id)!).push(t)
  const gains = new Map<string, { day: string; gain: number }[]>()
  for (const v of vals.results as { wallet_id: string; day: string; gain: number }[])
    (gains.get(v.wallet_id) ?? gains.set(v.wallet_id, []).get(v.wallet_id)!).push(v)

  // An account's worth at each point, ascending. Before its first transaction it didn't exist yet, so its worth is 0.
  const curve = (w: W, ends: { t: number; day: string }[]) => {
    const tx = byWallet.get(w.id) ?? [],
      vs = gains.get(w.id) ?? []
    let i = 0,
      j = 0,
      bal = 0,
      gain = 0
    return ends.map((e) => {
      while (i < tx.length && tx[i].date < e.t) bal += tx[i++].amount
      while (j < vs.length && vs[j].day <= e.day) gain = vs[j++].gain
      if (!i) return 0
      return w.type === "credit" ? bal - (w.credit_limit ?? 0) : w.type === "investment" ? bal + gain : bal
    })
  }
  const monthEnd = (m: string) => ({ t: monthRange(m, tz)[1], day: addDays(`${shiftMonth(m, 1)}-01`, -1) })
  const first = (txs.results as T[])[0]
  const months: string[] = []
  if (first) for (let m = monthOf(first.date, tz); m <= nowMonth; m = shiftMonth(m, 1)) months.push(m)
  const days = Array.from({ length: 90 }, (_, k) => addDays(today, k - 89))
  const dayEnds = days.map((d) => ({ t: unixOf(addDays(d, 1), tz), day: d }))
  const last6 = Array.from({ length: 6 }, (_, k) => shiftMonth(nowMonth, k - 5))
  const [from, to] = monthRange(selected, tz)

  const totals = months.map(() => 0)
  const accounts: Record<
    string,
    { months: number[]; days: number[]; lastEntry: string | null; in: number; out: number; moved: number }
  > = {}
  for (const w of walletRows.results as W[]) {
    curve(w, months.map(monthEnd)).forEach((v, k) => (totals[k] += convert(v, w.currency, display, rates)))
    const tx = byWallet.get(w.id) ?? []
    let inc = 0,
      out = 0,
      moved = 0
    for (const t of tx) {
      if (t.date < from || t.date >= to || t.category_id === CORRECTION_CATEGORY) continue
      if (t.category_id === TRANSFER_CATEGORY) moved += Math.abs(t.amount)
      else if (t.amount > 0) inc += t.amount
      else out += t.amount
    }
    accounts[w.id] = {
      months: curve(w, last6.map(monthEnd)),
      days: curve(w, dayEnds),
      lastEntry: tx.length ? dayOf(tx[tx.length - 1].date, tz) : null,
      in: inc,
      out,
      moved,
    }
  }
  const start = totals.findIndex((v) => v !== 0)
  return {
    currency: display,
    month: selected,
    today,
    ratesUpdated: settings.ratesUpdated,
    series: start < 0 ? [] : months.slice(start).map((m, k) => ({ month: m, netWorth: totals[start + k] })),
    days,
    last6,
    accounts,
    recent: (
      recentRows.results as {
        id: string
        wallet_id: string
        name: string
        amount: number
        date: number
        category_id: string
        transfer_id: string | null
        counter_wallet_id: string | null
      }[]
    ).map((r) => ({ ...r, day: dayOf(r.date, tz) })),
  }
}

// ---------- quick add ----------

export type PayeeSuggestion = {
  name: string
  count: number
  category_id: string
  wallet_id: string
  currency: string
  avg: number
}

/** Past payees matching q (most used first) with their last category and account and their average amount. */
export async function suggestPayees(uid: string, q: string, limit = 5) {
  const { results } = await db()
    .prepare(`SELECT t.name, COUNT(*) AS count, CAST(ROUND(AVG(t.amount)) AS INTEGER) AS avg,
      (SELECT x.category_id FROM transactions x WHERE x.user_id = t.user_id AND x.name = t.name AND x.transfer_id IS NULL ORDER BY x.date DESC LIMIT 1) AS category_id,
      (SELECT x.wallet_id FROM transactions x WHERE x.user_id = t.user_id AND x.name = t.name AND x.transfer_id IS NULL ORDER BY x.date DESC LIMIT 1) AS wallet_id
    FROM transactions t WHERE t.user_id = ? AND t.name <> '' AND t.name LIKE ? AND t.transfer_id IS NULL AND t.paid = 1 AND t.category_id NOT IN ${NEUTRAL_SQL}
    GROUP BY t.name ORDER BY count DESC, MAX(t.date) DESC LIMIT ?`)
    .bind(uid, `%${q.trim()}%`, limit)
    .all<Omit<PayeeSuggestion, "currency">>()
  const { results: wallets } = await db()
    .prepare("SELECT id, currency FROM wallets WHERE user_id = ?")
    .bind(uid)
    .all<{ id: string; currency: string }>()
  const cur = new Map(wallets.map((w) => [w.id, w.currency]))
  // ponytail: the average mixes currencies if a payee was paid from accounts in different currencies; shown in the last account's.
  return results.map((r) => ({ ...r, currency: cur.get(r.wallet_id) ?? "" }))
}

// ---------- categories ----------

export type ManagedCategory = Omit<Category, "uses"> & { archived: number; tx: number; subs: number; rules: number }

export async function listCategories(uid: string) {
  const { results } = await db()
    .prepare(`SELECT c.id, c.name, c.icon, c.income, c.parent_id, c.archived,
      (SELECT COUNT(*) FROM transactions t WHERE t.user_id = c.user_id AND (t.category_id = c.id OR t.subcategory_id = c.id)) AS tx,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = c.user_id AND s.category_id = c.id) AS subs,
      (SELECT COUNT(*) FROM title_rules r WHERE r.user_id = c.user_id AND r.category_id = c.id) AS rules
    FROM categories c WHERE c.user_id = ? AND c.id NOT IN ${NEUTRAL_SQL} ORDER BY c.sort, c.name`)
    .bind(uid)
    .all<ManagedCategory>()
  return results
}

type CatRow = { id: string; income: number; parent_id: string | null; archived: number }
async function loadCategory(uid: string, id: string) {
  const c = await db()
    .prepare("SELECT id, income, parent_id, archived FROM categories WHERE user_id = ? AND id = ?")
    .bind(uid, id)
    .first<CatRow>()
  if (!c) throw notFound("Category")
  return c
}
const hasChildren = async (uid: string, id: string) =>
  !!(await db().prepare("SELECT 1 FROM categories WHERE user_id = ? AND parent_id = ? LIMIT 1").bind(uid, id).first())

export const categoryInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  icon: z.string().max(40).nullable(),
  income: z.boolean(),
  parentId: z.string().nullable(),
})

export async function saveCategory(uid: string, data: z.infer<typeof categoryInput>) {
  const DB = db()
  const old = data.id ? await loadCategory(uid, data.id) : null
  if (old && isSystemCategory(old.id)) {
    await DB.prepare("UPDATE categories SET name = ?, icon = ? WHERE user_id = ? AND id = ?")
      .bind(data.name, data.icon, uid, old.id)
      .run()
    return old.id
  }
  if (data.parentId) {
    if (data.parentId === data.id || isNeutral(data.parentId)) throw new HttpError(400, "Pick another parent")
    const parent = await loadCategory(uid, data.parentId)
    if (parent.parent_id) throw new HttpError(400, "Subcategories can't have their own subcategories")
    if (!!parent.income !== data.income) throw new HttpError(400, "A subcategory must be the same type as its parent")
    if (old && (await hasChildren(uid, old.id))) throw new HttpError(409, "Move this category's subcategories first")
  }
  const id = old?.id ?? crypto.randomUUID()
  const income = data.income ? 1 : 0
  const writes = old
    ? [
        DB.prepare(
          "UPDATE categories SET name = ?, icon = ?, income = ?, parent_id = ? WHERE user_id = ? AND id = ?"
        ).bind(data.name, data.icon, income, data.parentId, uid, id),
        // Subcategories follow their parent's type.
        DB.prepare("UPDATE categories SET income = ? WHERE user_id = ? AND parent_id = ?").bind(income, uid, id),
      ]
    : [
        DB.prepare(`INSERT INTO categories (user_id, id, name, icon, income, parent_id, sort)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories WHERE user_id = ?1))`).bind(
          uid,
          id,
          data.name,
          data.icon,
          income,
          data.parentId
        ),
      ]
  // Re-parenting moves its transactions, because they store the top-level category plus the subcategory.
  if (old && old.parent_id !== data.parentId) {
    if (!old.parent_id)
      writes.push(
        DB.prepare(
          "UPDATE transactions SET category_id = ?, subcategory_id = ? WHERE user_id = ? AND category_id = ?"
        ).bind(data.parentId, id, uid, id)
      )
    else if (!data.parentId)
      writes.push(
        DB.prepare(
          "UPDATE transactions SET category_id = ?, subcategory_id = NULL WHERE user_id = ? AND subcategory_id = ?"
        ).bind(id, uid, id)
      )
    else
      writes.push(
        DB.prepare("UPDATE transactions SET category_id = ? WHERE user_id = ? AND subcategory_id = ?").bind(
          data.parentId,
          uid,
          id
        )
      )
  }
  await DB.batch(writes)
  return id
}

/** Archived categories leave every picker but keep their history. Archiving a parent archives its subcategories;
 *  restoring a subcategory restores its parent. */
export async function archiveCategory(uid: string, data: { id: string; archived: boolean }) {
  if (isSystemCategory(data.id)) throw new HttpError(400, "This category is used by Kosha and can't be archived")
  const c = await loadCategory(uid, data.id)
  await db()
    .prepare("UPDATE categories SET archived = ? WHERE user_id = ? AND (id = ? OR parent_id = ? OR id = ?)")
    .bind(data.archived ? 1 : 0, uid, c.id, c.id, data.archived ? c.id : (c.parent_id ?? c.id))
    .run()
}

/** Moves everything that uses a category (transactions, recurring, title rules, subcategories) into another, then deletes it. */
export async function mergeCategory(uid: string, data: { id: string; into: string }) {
  const DB = db()
  if (isSystemCategory(data.id)) throw new HttpError(400, "This category is used by Kosha and can't be merged")
  if (data.id === data.into || isNeutral(data.into)) throw new HttpError(400, "Pick another category")
  const [from, into] = await Promise.all([loadCategory(uid, data.id), loadCategory(uid, data.into)])
  if (!!from.income !== !!into.income) throw new HttpError(400, "Merge into a category of the same type")
  if (into.parent_id === from.id) throw new HttpError(400, "Can't merge a category into its own subcategory")
  const fromHasChildren = await hasChildren(uid, from.id)
  if (into.parent_id && fromHasChildren)
    throw new HttpError(400, "This category has subcategories, so it can only merge into a top-level category")
  const top = into.parent_id ?? into.id
  const sub = into.parent_id ? into.id : null
  await DB.batch([
    from.parent_id
      ? DB.prepare(
          "UPDATE transactions SET category_id = ?, subcategory_id = ? WHERE user_id = ? AND (category_id = ? OR subcategory_id = ?)"
        ).bind(top, sub, uid, from.id, from.id)
      : // A top-level category keeps its rows' subcategories, which move along with it.
        DB.prepare(
          "UPDATE transactions SET category_id = ?, subcategory_id = COALESCE(?, subcategory_id) WHERE user_id = ? AND category_id = ?"
        ).bind(top, sub, uid, from.id),
    DB.prepare("UPDATE categories SET parent_id = ? WHERE user_id = ? AND parent_id = ?").bind(into.id, uid, from.id),
    DB.prepare("UPDATE subscriptions SET category_id = ? WHERE user_id = ? AND category_id = ?").bind(
      into.id,
      uid,
      from.id
    ),
    DB.prepare("UPDATE title_rules SET category_id = ? WHERE user_id = ? AND category_id = ?").bind(
      into.id,
      uid,
      from.id
    ),
    DB.prepare("DELETE FROM categories WHERE user_id = ? AND id = ?").bind(uid, from.id),
  ])
}

/** Deletes a category nothing uses. Anything in use is merged or archived instead. */
export async function deleteCategory(uid: string, id: string) {
  const DB = db()
  if (isSystemCategory(id)) throw new HttpError(400, "This category is used by Kosha and can't be deleted")
  await loadCategory(uid, id)
  const used = await DB.prepare(`SELECT
      (SELECT COUNT(*) FROM transactions WHERE user_id = ?1 AND (category_id = ?2 OR subcategory_id = ?2))
    + (SELECT COUNT(*) FROM subscriptions WHERE user_id = ?1 AND category_id = ?2)
    + (SELECT COUNT(*) FROM categories WHERE user_id = ?1 AND parent_id = ?2) AS n`)
    .bind(uid, id)
    .first<{ n: number }>()
  if (used?.n) throw new HttpError(409, "This category is in use. Merge it into another instead")
  await DB.batch([
    DB.prepare("DELETE FROM title_rules WHERE user_id = ? AND category_id = ?").bind(uid, id),
    DB.prepare("DELETE FROM categories WHERE user_id = ? AND id = ?").bind(uid, id),
  ])
}

// ---------- payee rules ----------

export type TitleRuleRow = {
  title: string
  category_id: string
  exact: number
  source: "learned" | "manual"
  used: number
}
export const rulesInput = z.object({
  q: z.string().max(100),
  page: z.number().int().min(0).default(0),
  size: z.number().int().min(1).max(200).default(50),
  /** Rows to skip; overrides page. */
  offset: z.number().int().min(0).optional(),
})

/** Payee rules, most used first, a page at a time. "Used" counts the transactions each rule matches today. */
export async function listTitleRules(uid: string, data: z.infer<typeof rulesInput>) {
  const q = data.q.trim().toLowerCase()
  const where = "r.user_id = ?1 AND (?2 = '' OR instr(lower(r.title), ?2) > 0)"
  const DB = db()
  const [rows, total] = await DB.batch([
    DB.prepare(`SELECT r.title, r.category_id, r.exact, r.source,
        (SELECT COUNT(*) FROM transactions t WHERE t.user_id = r.user_id
          AND (t.category_id = r.category_id OR t.subcategory_id = r.category_id)
          AND CASE WHEN r.exact = 1 THEN lower(t.name) = lower(r.title) ELSE instr(lower(t.name), lower(r.title)) > 0 END) AS used
      FROM title_rules r WHERE ${where} ORDER BY used DESC, r.title LIMIT ?3 OFFSET ?4`).bind(
      uid,
      q,
      data.size,
      data.offset ?? data.page * data.size
    ),
    DB.prepare(`SELECT COUNT(*) AS n FROM title_rules r WHERE ${where}`).bind(uid, q),
  ])
  const n = (total.results[0] as { n: number }).n
  return {
    rules: rows.results as TitleRuleRow[],
    total: n,
    more: (data.offset ?? data.page * data.size) + data.size < n,
  }
}

export const ruleInput = z.object({
  old: z.string().max(100).optional(),
  title: z.string().trim().min(1, "Type a payee").max(100),
  exact: z.boolean(),
  categoryId: z.string(),
})

/** Creates or edits rules you made, in one batch. `old` is the payee text a rule had, when that changes. */
export async function saveTitleRules(uid: string, items: z.infer<typeof ruleInput>[]) {
  const DB = db()
  const cats = [...new Set(items.map((r) => r.categoryId))]
  const { results } = await DB.prepare(
    "SELECT id FROM categories WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))"
  )
    .bind(uid, ids(cats))
    .all<{ id: string }>()
  const writes = items.flatMap((data) => {
    if (isNeutral(data.categoryId)) throw new HttpError(400, "Pick a spending or income category")
    if (!results.some((c) => c.id === data.categoryId))
      throw notFound(items.length > 1 ? `Category ${data.categoryId}` : "Category")
    return [
      ...(data.old && data.old.toLowerCase() !== data.title.toLowerCase()
        ? [DB.prepare("DELETE FROM title_rules WHERE user_id = ? AND title = ?").bind(uid, data.old)]
        : []),
      DB.prepare(`INSERT INTO title_rules (user_id, title, category_id, exact, source) VALUES (?, ?, ?, ?, 'manual')
        ON CONFLICT(user_id, title) DO UPDATE SET title = excluded.title, category_id = excluded.category_id,
          exact = excluded.exact, source = 'manual'`).bind(uid, data.title, data.categoryId, data.exact ? 1 : 0),
    ]
  })
  if (writes.length) await DB.batch(writes)
}

/** Deletes rules by payee text (case-insensitive). Returns how many existed. */
export async function deleteTitleRules(uid: string, titles: string[]) {
  const res = await db()
    .prepare("DELETE FROM title_rules WHERE user_id = ? AND title IN (SELECT value FROM json_each(?))")
    .bind(uid, ids(titles))
    .run()
  return res.meta.changes
}
