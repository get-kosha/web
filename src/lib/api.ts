import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
  CORRECTION_CATEGORY,
  NEUTRAL_SQL,
  PREFS,
  TRANSFER_CATEGORY,
  addDays,
  isSystemCategory,
  convert,
  cumulative,
  dayOf,
  daysInMonth,
  isNeutral,
  MAX_TAGS,
  cleanTag,
  eventFor,
  monthOf,
  monthRange,
  parseAmount,
  shiftMonth,
  unixOf,
  usualCurve,
  type AccountType,
  type Schedule,
  type TitleRule,
} from "@/lib/core"
import {
  COUNTERPART,
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
import { auth, getUser, userId } from "@/server/auth.server"
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
const tags = z
  .array(z.string().transform(cleanTag))
  .max(MAX_TAGS)
  .transform((t) => [...new Set(t.filter(Boolean))])
const month = z.string().regex(/^\d{4}-\d{2}$/)

// ---------- meta: everything most screens need ----------

export const getMeta = createServerFn({ method: "GET" }).handler(async () => {
  const DB = db()
  const user = (await getUser())!
  const uid = user.id
  await ensureSettled(uid)
  const settings = await getSettings(uid)
  refreshRatesIfStale(settings.ratesUpdated)
  const [wallets, categories, rules, titles, events, tagRows] = await DB.batch([
    DB.prepare(`SELECT w.id, w.name, w.currency, w.colour, w.archived, w.type, w.credit_limit,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = w.user_id AND wallet_id = w.id AND paid = 1), 0) AS balance,
      (SELECT COUNT(*) FROM transactions WHERE user_id = w.user_id AND wallet_id = w.id) AS tx_count,
      (SELECT gain FROM valuations WHERE user_id = w.user_id AND wallet_id = w.id ORDER BY day DESC LIMIT 1) AS gain,
      (SELECT day FROM valuations WHERE user_id = w.user_id AND wallet_id = w.id ORDER BY day DESC LIMIT 1) AS gain_day
      FROM wallets w WHERE w.user_id = ? ORDER BY w.archived, w.sort`).bind(uid),
    // Archived categories are included so old transactions keep their name; pickers leave them out.
    DB.prepare(`SELECT c.id, c.name, c.icon, c.income, c.parent_id, c.archived,
      (SELECT COUNT(*) FROM transactions WHERE user_id = c.user_id AND category_id = c.id AND date > unixepoch() - 90 * 86400) AS uses
      FROM categories c WHERE c.user_id = ? ORDER BY c.archived, c.sort`).bind(uid),
    DB.prepare("SELECT title, category_id, exact FROM title_rules WHERE user_id = ?").bind(uid),
    DB.prepare(
      "SELECT name FROM transactions WHERE user_id = ? AND name <> '' GROUP BY name ORDER BY COUNT(*) DESC, MAX(date) DESC LIMIT 300"
    ).bind(uid),
    // Newest first, so the picker and Settings both lead with the current trip.
    DB.prepare(`SELECT e.id, e.name, e.start_day, e.end_day,
      (SELECT COUNT(*) FROM transactions WHERE user_id = e.user_id AND event_id = e.id) AS tx_count
      FROM events e WHERE e.user_id = ? ORDER BY COALESCE(e.start_day, '') DESC, e.created_at DESC`).bind(uid),
    // Every tag in use, most used first, for suggestions and the Activity filter.
    DB.prepare(`SELECT j.value AS tag FROM transactions t, json_each(t.tags) j
      WHERE t.user_id = ? GROUP BY j.value ORDER BY COUNT(*) DESC, j.value LIMIT 200`).bind(uid),
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
    user,
  }
})
export type Meta = Awaited<ReturnType<typeof getMeta>>

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

export const getDashboard = createServerFn({ method: "GET" })
  .validator(
    z.object({
      month: month.optional(),
      currency: z
        .string()
        .regex(/^[a-z]{3,6}$/)
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
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
  })

// ---------- transactions ----------

const listInput = z.object({
  q: z.string().max(100).optional(),
  wallet: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().max(32).optional(),
  /** An event's transactions, whatever their month. */
  event: z.string().optional(),
  month: month.optional(),
  /** Amount range in cents, by absolute value. */
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
  type: z.enum(["out", "in", "transfers"]).optional(),
  /** Balance corrections are hidden unless asked for. */
  corrections: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).default(100),
})

export const listTransactions = createServerFn({ method: "GET" })
  .validator(listInput)
  .handler(async ({ data }) => {
    const uid = await userId()
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
    // Activity follows the app-wide month (no month means the current one), except for an event,
    // which is about the whole trip.
    if (data.event) {
      where.push("t.event_id = ?")
      binds.push(data.event)
    } else {
      const [from, to] = monthRange(data.month ?? monthOf(Date.now() / 1000, tz), tz)
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
      DB.prepare(`SELECT t.*, ${COUNTERPART} ${w} ORDER BY t.date DESC LIMIT ?`).bind(...binds, data.limit + 1),
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
    }
  })

// ---------- events ----------

export const saveEvent = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(1, "Give the event a name").max(80),
        startDay: day.nullable(),
        endDay: day.nullable(),
      })
      .refine((e) => !e.startDay || !e.endDay || e.endDay >= e.startDay, "The end is before the start")
  )
  .handler(async ({ data }) => {
    const uid = await userId()
    const DB = db()
    const id = data.id ?? crypto.randomUUID()
    const res = data.id
      ? await DB.prepare("UPDATE events SET name = ?, start_day = ?, end_day = ? WHERE user_id = ? AND id = ?")
          .bind(data.name, data.startDay, data.endDay, uid, id)
          .run()
      : await DB.prepare("INSERT INTO events (user_id, id, name, start_day, end_day) VALUES (?, ?, ?, ?, ?)")
          .bind(uid, id, data.name, data.startDay, data.endDay)
          .run()
    if (!res.meta.changes) throw new Error("Event not found")
    return { id }
  })

/** Deletes an event. Its transactions stay but no longer belong to it. */
export const deleteEvent = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const DB = db()
    await DB.batch([
      DB.prepare("UPDATE transactions SET event_id = NULL WHERE user_id = ? AND event_id = ?").bind(uid, data.id),
      DB.prepare("DELETE FROM events WHERE user_id = ? AND id = ?").bind(uid, data.id),
    ])
  })

// ---------- activity panel ----------

/** A payee's recent payments, for the "At this payee" bars in the Activity panel. */
export const getPayeeHistory = createServerFn({ method: "GET" })
  .validator(z.object({ name: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const { tz } = await getSettings(uid)
    const { results } = await db()
      .prepare(`SELECT t.id, t.amount, t.date, w.currency FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
        WHERE t.user_id = ? AND t.name = ? AND t.paid = 1 AND t.transfer_id IS NULL ORDER BY t.date DESC LIMIT 200`)
      .bind(uid, data.name)
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
  })

const saveInput = z.object({
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
  paid: z.boolean().default(true),
  /** A subcategory of `categoryId`. When left out, it is kept while the category stays the same. */
  subcategoryId: z.string().nullable().optional(),
  /** When left out, an edit keeps its tags and a new entry gets none. */
  tags: tags.optional(),
  /** null means no event. When left out, an edit keeps its event and a new entry gets the event its day falls in. */
  eventId: z.string().nullable().optional(),
})

export const saveTransaction = createServerFn({ method: "POST" })
  .validator(saveInput)
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const { tz } = await getSettings(uid)
    const now = Math.floor(Date.now() / 1000)
    const existing = data.id
      ? await DB.prepare("SELECT date FROM transactions WHERE user_id = ? AND id = ?")
          .bind(uid, data.id)
          .first<{ date: number }>()
      : null
    if (data.id && !existing) throw new Error("Transaction not found")
    // Keep the original time when the day is unchanged; today means "now"; other days default to noon.
    const date =
      existing && dayOf(existing.date, tz) === data.day
        ? existing.date
        : data.day === dayOf(now, tz)
          ? now
          : unixOf(data.day, tz, 12)
    const name = data.name.trim()
    const id = data.id ?? crypto.randomUUID()
    // An event id must be one of this user's; a new entry without one gets the event covering its day.
    const { results: events } = await DB.prepare("SELECT id, start_day, end_day FROM events WHERE user_id = ?")
      .bind(uid)
      .all<{ id: string; start_day: string | null; end_day: string | null }>()
    if (data.eventId && !events.some((e) => e.id === data.eventId)) throw new Error("Event not found")
    const eventId = data.eventId === undefined && !existing ? eventFor(data.day, events) : data.eventId
    const tagsJson = data.tags === undefined ? null : JSON.stringify(data.tags)
    const write = existing
      ? DB.prepare(`UPDATE transactions SET wallet_id = ?1, category_id = ?2,
          subcategory_id = CASE WHEN ?10 = 1 THEN ?11 WHEN category_id = ?2 THEN subcategory_id ELSE NULL END,
          tags = COALESCE(?12, tags), event_id = CASE WHEN ?13 = 1 THEN ?14 ELSE event_id END,
          name = ?3, note = ?4, amount = ?5, date = ?6, paid = ?7, updated_at = unixepoch() WHERE user_id = ?9 AND id = ?8`).bind(
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
      : DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, subcategory_id, name, note, amount, date, paid, tags, event_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
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
    // Settings › Payee rules › Learn from my edits. A learned rule never replaces one you made.
    const { prefs } = await getSettings(uid)
    const learn =
      name && !isNeutral(data.categoryId) && prefs.learn_rules === "1"
        ? [
            DB.prepare(`INSERT INTO title_rules (user_id, title, category_id) VALUES (?, ?, ?)
          ON CONFLICT(user_id, title) DO UPDATE SET category_id = excluded.category_id WHERE source = 'learned'`).bind(
              uid,
              name,
              data.categoryId
            ),
          ]
        : []
    await DB.batch([write, ...learn])
    return { id }
  })

export const deleteTransaction = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const tx = await DB.prepare("SELECT id, transfer_id FROM transactions WHERE user_id = ? AND id = ?")
      .bind(uid, data.id)
      .first<{ id: string; transfer_id: string | null }>()
    if (!tx) return
    const { results: legs } = tx.transfer_id
      ? await DB.prepare("SELECT id, subscription_id, due_day FROM transactions WHERE user_id = ? AND transfer_id = ?")
          .bind(uid, tx.transfer_id)
          .all<{ id: string; subscription_id: string | null; due_day: string | null }>()
      : { results: [{ ...tx, subscription_id: null, due_day: null }] }
    const ids = JSON.stringify(legs.map((l) => l.id))
    // A deleted subscription payment becomes a skipped occurrence; otherwise auto-pay would re-create it.
    const occurrence = (
      await DB.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND id IN (SELECT value FROM json_each(?)) AND subscription_id IS NOT NULL AND due_day IS NOT NULL"
      )
        .bind(uid, ids)
        .first<{ id: string }>()
    )?.id
    await DB.batch([
      // Deleting a transfer takes its fee with it; deleting just the fee clears it from the transfer.
      ...(tx.transfer_id
        ? [
            DB.prepare(
              "DELETE FROM transactions WHERE user_id = ?1 AND id = (SELECT fee_tx_id FROM transfers WHERE user_id = ?1 AND id = ?2)"
            ).bind(uid, tx.transfer_id),
            DB.prepare("DELETE FROM transfers WHERE user_id = ? AND id = ?").bind(uid, tx.transfer_id),
          ]
        : [
            DB.prepare("UPDATE transfers SET fee = 0, fee_tx_id = NULL WHERE user_id = ? AND fee_tx_id = ?").bind(
              uid,
              tx.id
            ),
          ]),
      ...(occurrence
        ? [
            DB.prepare(
              "UPDATE transactions SET kind = 'skipped', paid = 0, updated_at = unixepoch() WHERE user_id = ? AND id = ?"
            ).bind(uid, occurrence),
          ]
        : []),
      DB.prepare(
        "DELETE FROM transactions WHERE user_id = ? AND id IN (SELECT value FROM json_each(?)) AND id IS NOT ?"
      ).bind(uid, ids, occurrence ?? null),
    ])
  })

export const saveTransfer = createServerFn({ method: "POST" })
  .validator(
    z
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
        note: z.string().max(2000).default(""),
      })
      .refine((d) => d.fromWalletId !== d.toWalletId, "Pick two different accounts")
      .refine((d) => d.fee < d.sent, "The fee must be less than the amount sent")
  )
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const { tz } = await getSettings(uid)
    const now = Math.floor(Date.now() / 1000)
    const { results: legs } = data.transferId
      ? await DB.prepare("SELECT * FROM transactions WHERE user_id = ? AND transfer_id = ?")
          .bind(uid, data.transferId)
          .all<Tx>()
      : { results: [] as Tx[] }
    if (data.transferId && !legs.length) throw new Error("Transfer not found")
    const out = legs.find((l) => l.amount < 0)
    const inc = legs.find((l) => l.amount > 0)
    const date =
      out && dayOf(out.date, tz) === data.day ? out.date : data.day === dayOf(now, tz) ? now : unixOf(data.day, tz, 12)
    const transferId = data.transferId ?? crypto.randomUUID()
    const meta = data.transferId
      ? await DB.prepare("SELECT * FROM transfers WHERE user_id = ? AND id = ?")
          .bind(uid, transferId)
          .first<{ fee_tx_id: string | null; market_rate: number | null }>()
      : null
    const wallets = await DB.prepare("SELECT id, currency FROM wallets WHERE user_id = ? AND id IN (?, ?)")
      .bind(uid, data.fromWalletId, data.toWalletId)
      .all<{ id: string; currency: string }>()
    const cur = (id: string) => wallets.results.find((w) => w.id === id)?.currency ?? ""
    const [fromCur, toCur] = [cur(data.fromWalletId), cur(data.toWalletId)]
    // Keep a looked-up market rate unless the currencies or day changed.
    const sameDay = out && dayOf(out.date, tz) === data.day
    const market =
      fromCur === toCur
        ? null
        : meta?.market_rate && sameDay && out?.wallet_id === data.fromWalletId && inc?.wallet_id === data.toWalletId
          ? meta.market_rate
          : await marketRate(fromCur, toCur, data.day, dayOf(now, tz))
    const feeId = meta?.fee_tx_id ?? crypto.randomUUID()
    const writes = [
      ...transferLegs(uid, {
        transferId,
        outId: out?.id ?? crypto.randomUUID(),
        inId: inc?.id ?? crypto.randomUUID(),
        from: data.fromWalletId,
        to: data.toWalletId,
        sent: data.sent - data.fee,
        received: data.received,
        date,
        paid: 1,
        note: data.note.trim(),
        kind: out?.kind,
        subscriptionId: out?.subscription_id,
        dueDay: out?.due_day,
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
      ),
    ]
    await DB.batch(writes)
    return { transferId }
  })

/** Every transfer between different currencies, newest first, with fee, provider and market rate. */
export const listExchanges = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
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
    WHERE o.user_id = ? AND o.amount < 0 AND o.paid = 1 AND wo.currency <> wi.currency
    ORDER BY o.date DESC`)
    .bind(uid)
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
})
export type Exchange = Awaited<ReturnType<typeof listExchanges>>[number]

// ---------- settings ----------

export const saveSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      primary: z.string().regex(/^[a-z]{3,6}$/),
      tz: z.string().max(64),
      order: z.array(z.string().regex(/^[a-z]{3,6}$/)).max(50),
    })
  )
  .handler(async ({ data }) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: data.tz })
    } catch {
      throw new Error(`Unknown time zone: ${data.tz}`)
    }
    if (!(await getRates())[data.primary]) throw new Error(`No exchange rate for ${data.primary}`)
    const DB = db()
    const uid = await userId()
    const set = DB.prepare(
      "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
    )
    await DB.batch([
      set.bind(uid, "primary_currency", data.primary),
      set.bind(uid, "timezone", data.tz),
      set.bind(uid, "currency_order", data.order.join(",")),
    ])
  })

/** Fetches rates now for Settings › Currencies › Refresh, at most once every 10 minutes. */
export const refreshRatesNow = createServerFn({ method: "POST" }).handler(async () => {
  const { ratesUpdated } = await getSettings(await userId())
  if (Date.now() / 1000 - ratesUpdated >= 600) await refreshRates()
})

/** Appearance, saved to the account so every device agrees. Only the keys passed change. */
const prefsInput = z.object(
  Object.fromEntries(Object.entries(PREFS).map(([k, p]) => [k, p.schema.optional()])) as {
    [K in keyof typeof PREFS]: z.ZodOptional<(typeof PREFS)[K]["schema"]>
  }
)
export const savePreferences = createServerFn({ method: "POST" })
  .validator(prefsInput)
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const set = DB.prepare(
      "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
    )
    const writes = Object.entries(data)
      .filter(([, v]) => v != null)
      .map(([k, v]) => set.bind(uid, k, String(v)))
    if (writes.length) await DB.batch(writes)
  })

// ---------- subscriptions ----------

export const listSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  await ensureSettled(uid)
  const { tz } = await getSettings(uid)
  return loadSubscriptions(uid, dayOf(Date.now() / 1000, tz))
})
export type { SubscriptionView } from "@/server/db.server"

/** Income over the last 365 days, per account currency (Recurring shows committed costs as a share of it). */
export const recentIncome = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  const { results } = await db()
    .prepare(`SELECT w.currency, SUM(t.amount) AS total FROM transactions t
    JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
    WHERE t.user_id = ? AND t.paid = 1 AND t.amount > 0 AND t.category_id NOT IN ${NEUTRAL_SQL} AND t.date >= unixepoch() - 365 * 86400
    GROUP BY w.currency`)
    .bind(uid)
    .all<{ currency: string; total: number }>()
  return results
})

const subInput = z.object({
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

export const saveSubscription = createServerFn({ method: "POST" })
  .validator(subInput)
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const { tz } = await getSettings(uid)
    const today = dayOf(Date.now() / 1000, tz)
    const id = data.id ?? crypto.randomUUID()
    const old = data.id
      ? await DB.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND id = ?").bind(uid, id).first<Schedule>()
      : null
    if (data.id && !old) throw new Error("Subscription not found")
    const transfer = !!data.toWalletId
    if (transfer && data.toWalletId === data.walletId) throw new Error("Pick two different accounts")
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
    return { id }
  })

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

export const deleteSubscription = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    // Paid history stays as ordinary transactions.
    await DB.batch([
      ...dropUnpaid(uid, data.id, "0000-00-00"),
      DB.prepare(
        "UPDATE transactions SET subscription_id = NULL, due_day = NULL WHERE user_id = ? AND subscription_id = ?"
      ).bind(uid, data.id),
      DB.prepare("DELETE FROM subscriptions WHERE user_id = ? AND id = ?").bind(uid, data.id),
    ])
  })

/** Change one occurrence without touching the rest of the schedule. */
export const updateOccurrence = createServerFn({ method: "POST" })
  .validator(
    z.object({
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
  )
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
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
    if (!sub) throw new Error("Subscription not found")
    const existing = await DB.prepare(
      "SELECT * FROM transactions WHERE user_id = ? AND subscription_id = ? AND due_day = ?"
    )
      .bind(uid, data.id, data.dueDay)
      .first<Tx>()
    if (existing?.paid && data.action !== "edit") throw new Error("Already paid. Edit it from the history instead")

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
    if (otherHalf)
      await DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(uid, otherHalf.id).run()
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
  })

// ---------- accounts ----------

const accountInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["bank", "cash", "credit", "investment"]),
  currency: z.string().regex(/^[a-z]{3,6}$/),
  creditLimit: z.number().int().min(0).nullable(),
  archived: z.boolean(),
  /** Balance the account should have now, in cents (available credit for cards, amount invested for investments).
   *  The difference from the current balance becomes a balance correction. null leaves it as is. */
  balance: z.number().int().nullable().default(null),
})

export const saveAccount = createServerFn({ method: "POST" })
  .validator(accountInput)
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const limit = data.type === "credit" ? data.creditLimit : null
    const id = data.id ?? crypto.randomUUID()
    const writes = []
    if (data.id) {
      const old =
        await DB.prepare(`SELECT currency, (SELECT COUNT(*) FROM transactions WHERE user_id = wallets.user_id AND wallet_id = wallets.id) AS n
        FROM wallets WHERE user_id = ? AND id = ?`)
          .bind(uid, data.id)
          .first<{ currency: string; n: number }>()
      if (!old) throw new Error("Account not found")
      if (old.currency !== data.currency && old.n > 0)
        throw new Error("Currency can't change once an account has transactions")
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
    return { id }
  })

export const deleteAccount = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const used = await DB.prepare(`SELECT (SELECT COUNT(*) FROM transactions WHERE user_id = ?1 AND wallet_id = ?2)
      + (SELECT COUNT(*) FROM subscriptions WHERE user_id = ?1 AND (wallet_id = ?2 OR to_wallet_id = ?2)) AS n`)
      .bind(uid, data.id)
      .first<{ n: number }>()
    if (used?.n) throw new Error("This account has transactions. Archive it instead.")
    await DB.batch([
      DB.prepare("DELETE FROM valuations WHERE user_id = ? AND wallet_id = ?").bind(uid, data.id),
      DB.prepare("DELETE FROM wallets WHERE user_id = ? AND id = ?").bind(uid, data.id),
    ])
  })

export const listValuations = createServerFn({ method: "GET" }).handler(async () => {
  const { results } = await db()
    .prepare("SELECT * FROM valuations WHERE user_id = ? ORDER BY day DESC")
    .bind(await userId())
    .all()
  return results as { id: string; wallet_id: string; day: string; gain: number; invested: number; note: string }[]
})

export const recordGain = createServerFn({ method: "POST" })
  .validator(z.object({ walletId: z.string(), day, gain: z.number().int(), note: z.string().max(500).default("") }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const w =
      await DB.prepare(`SELECT type, COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = wallets.user_id AND wallet_id = wallets.id AND paid = 1), 0) AS invested
      FROM wallets WHERE user_id = ? AND id = ?`)
        .bind(uid, data.walletId)
        .first<{ type: string; invested: number }>()
    if (!w) throw new Error("Account not found")
    if (w.type !== "investment") throw new Error("Gains can only be recorded for investment accounts")
    await DB.prepare(`INSERT INTO valuations (user_id, id, wallet_id, day, gain, invested, note) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, wallet_id, day) DO UPDATE SET gain = excluded.gain, invested = excluded.invested, note = excluded.note`)
      .bind(uid, crypto.randomUUID(), data.walletId, data.day, data.gain, w.invested, data.note.trim())
      .run()
  })

export const deleteValuation = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await db()
      .prepare("DELETE FROM valuations WHERE user_id = ? AND id = ?")
      .bind(await userId(), data.id)
      .run()
  })

// ---------- accounts page ----------

/** Everything the Accounts page draws: the net worth line, and per account its sparkline (6 month-ends),
 *  a 90-day balance line, the selected month's in / out / moved, and its 4 latest transactions.
 *  All per-account values are in the account's own currency; the series is in the display currency. */
export const getAccountsOverview = createServerFn({ method: "GET" })
  .validator(
    z.object({
      month: month.optional(),
      currency: z
        .string()
        .regex(/^[a-z]{3,6}$/)
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
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
      {
        months: number[]
        days: number[]
        lastEntry: string | null
        in: number
        out: number
        moved: number
      }
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
  })
export type AccountsOverview = Awaited<ReturnType<typeof getAccountsOverview>>

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
export const suggestPayees = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().max(100) }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const { results } = await db()
      .prepare(`SELECT t.name, COUNT(*) AS count, CAST(ROUND(AVG(t.amount)) AS INTEGER) AS avg,
        (SELECT x.category_id FROM transactions x WHERE x.user_id = t.user_id AND x.name = t.name AND x.transfer_id IS NULL ORDER BY x.date DESC LIMIT 1) AS category_id,
        (SELECT x.wallet_id FROM transactions x WHERE x.user_id = t.user_id AND x.name = t.name AND x.transfer_id IS NULL ORDER BY x.date DESC LIMIT 1) AS wallet_id
      FROM transactions t WHERE t.user_id = ? AND t.name <> '' AND t.name LIKE ? AND t.transfer_id IS NULL AND t.paid = 1 AND t.category_id NOT IN ${NEUTRAL_SQL}
      GROUP BY t.name ORDER BY count DESC, MAX(t.date) DESC LIMIT 5`)
      .bind(uid, `%${data.q.trim()}%`)
      .all<Omit<PayeeSuggestion, "currency">>()
    const { results: wallets } = await db()
      .prepare("SELECT id, currency FROM wallets WHERE user_id = ?")
      .bind(uid)
      .all<{ id: string; currency: string }>()
    const cur = new Map(wallets.map((w) => [w.id, w.currency]))
    // ponytail: the average mixes currencies if a payee was paid from accounts in different currencies; shown in the last account's.
    return results.map((r) => ({ ...r, currency: cur.get(r.wallet_id) ?? "" }))
  })

// ---------- categories ----------

export type ManagedCategory = Omit<Category, "uses"> & { archived: number; tx: number; subs: number; rules: number }

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await userId()
  const { results } = await db()
    .prepare(`SELECT c.id, c.name, c.icon, c.income, c.parent_id, c.archived,
      (SELECT COUNT(*) FROM transactions t WHERE t.user_id = c.user_id AND (t.category_id = c.id OR t.subcategory_id = c.id)) AS tx,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = c.user_id AND s.category_id = c.id) AS subs,
      (SELECT COUNT(*) FROM title_rules r WHERE r.user_id = c.user_id AND r.category_id = c.id) AS rules
    FROM categories c WHERE c.user_id = ? AND c.id NOT IN ${NEUTRAL_SQL} ORDER BY c.sort, c.name`)
    .bind(uid)
    .all<ManagedCategory>()
  return results
})

type CatRow = { id: string; income: number; parent_id: string | null; archived: number }
async function loadCategory(uid: string, id: string) {
  const c = await db()
    .prepare("SELECT id, income, parent_id, archived FROM categories WHERE user_id = ? AND id = ?")
    .bind(uid, id)
    .first<CatRow>()
  if (!c) throw new Error("Category not found")
  return c
}
const hasChildren = async (uid: string, id: string) =>
  !!(await db().prepare("SELECT 1 FROM categories WHERE user_id = ? AND parent_id = ? LIMIT 1").bind(uid, id).first())

export const saveCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1, "Name is required").max(60),
      icon: z.string().max(40).nullable(),
      income: z.boolean(),
      parentId: z.string().nullable(),
    })
  )
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    const old = data.id ? await loadCategory(uid, data.id) : null
    if (old && isSystemCategory(old.id)) {
      await DB.prepare("UPDATE categories SET name = ?, icon = ? WHERE user_id = ? AND id = ?")
        .bind(data.name, data.icon, uid, old.id)
        .run()
      return { id: old.id }
    }
    if (data.parentId) {
      if (data.parentId === data.id || isNeutral(data.parentId)) throw new Error("Pick another parent")
      const parent = await loadCategory(uid, data.parentId)
      if (parent.parent_id) throw new Error("Subcategories can't have their own subcategories")
      if (!!parent.income !== data.income) throw new Error("A subcategory must be the same type as its parent")
      if (old && (await hasChildren(uid, old.id))) throw new Error("Move this category's subcategories first")
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
    return { id }
  })

/** Archived categories leave every picker but keep their history. Archiving a parent archives its subcategories;
 *  restoring a subcategory restores its parent. */
export const archiveCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const uid = await userId()
    if (isSystemCategory(data.id)) throw new Error("This category is used by Kosha and can't be archived")
    const c = await loadCategory(uid, data.id)
    await db()
      .prepare("UPDATE categories SET archived = ? WHERE user_id = ? AND (id = ? OR parent_id = ? OR id = ?)")
      .bind(data.archived ? 1 : 0, uid, c.id, c.id, data.archived ? c.id : (c.parent_id ?? c.id))
      .run()
  })

/** Moves everything that uses a category (transactions, recurring, title rules, subcategories) into another, then deletes it. */
export const mergeCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), into: z.string() }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    if (isSystemCategory(data.id)) throw new Error("This category is used by Kosha and can't be merged")
    if (data.id === data.into || isNeutral(data.into)) throw new Error("Pick another category")
    const [from, into] = await Promise.all([loadCategory(uid, data.id), loadCategory(uid, data.into)])
    if (!!from.income !== !!into.income) throw new Error("Merge into a category of the same type")
    if (into.parent_id === from.id) throw new Error("Can't merge a category into its own subcategory")
    const fromHasChildren = await hasChildren(uid, from.id)
    if (into.parent_id && fromHasChildren)
      throw new Error("This category has subcategories, so it can only merge into a top-level category")
    const top = into.parent_id ?? into.id
    const sub = into.parent_id ? into.id : null
    const writes = [
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
    ]
    await DB.batch(writes)
  })

/** Deletes a category nothing uses. Anything in use is merged or archived instead. */
export const deleteCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const DB = db()
    const uid = await userId()
    if (isSystemCategory(data.id)) throw new Error("This category is used by Kosha and can't be deleted")
    const used = await DB.prepare(`SELECT
        (SELECT COUNT(*) FROM transactions WHERE user_id = ?1 AND (category_id = ?2 OR subcategory_id = ?2))
      + (SELECT COUNT(*) FROM subscriptions WHERE user_id = ?1 AND category_id = ?2)
      + (SELECT COUNT(*) FROM categories WHERE user_id = ?1 AND parent_id = ?2) AS n`)
      .bind(uid, data.id)
      .first<{ n: number }>()
    if (used?.n) throw new Error("This category is in use. Merge it into another instead")
    await DB.batch([
      DB.prepare("DELETE FROM title_rules WHERE user_id = ? AND category_id = ?").bind(uid, data.id),
      DB.prepare("DELETE FROM categories WHERE user_id = ? AND id = ?").bind(uid, data.id),
    ])
  })

// ---------- payee rules ----------

export type TitleRuleRow = {
  title: string
  category_id: string
  exact: number
  source: "learned" | "manual"
  used: number
}
const RULES_PAGE = 50

/** Payee rules, most used first, 50 a page. "Used" counts the transactions each rule matches today. */
export const listTitleRules = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().max(100), page: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    const uid = await userId()
    const q = data.q.trim().toLowerCase()
    const where = "r.user_id = ?1 AND (?2 = '' OR instr(lower(r.title), ?2) > 0)"
    const DB = db()
    const [rows, total] = await DB.batch([
      DB.prepare(`SELECT r.title, r.category_id, r.exact, r.source,
          (SELECT COUNT(*) FROM transactions t WHERE t.user_id = r.user_id
            AND (t.category_id = r.category_id OR t.subcategory_id = r.category_id)
            AND CASE WHEN r.exact = 1 THEN lower(t.name) = lower(r.title) ELSE instr(lower(t.name), lower(r.title)) > 0 END) AS used
        FROM title_rules r WHERE ${where} ORDER BY used DESC, r.title LIMIT ${RULES_PAGE} OFFSET ?3`).bind(
        uid,
        q,
        data.page * RULES_PAGE
      ),
      DB.prepare(`SELECT COUNT(*) AS n FROM title_rules r WHERE ${where}`).bind(uid, q),
    ])
    const n = (total.results[0] as { n: number }).n
    return { rules: rows.results as TitleRuleRow[], total: n, more: (data.page + 1) * RULES_PAGE < n }
  })

/** Creates or edits a rule you made. `old` is the payee text it had, when that changes. */
export const saveTitleRule = createServerFn({ method: "POST" })
  .validator(
    z.object({
      old: z.string().max(100).optional(),
      title: z.string().trim().min(1, "Type a payee").max(100),
      exact: z.boolean(),
      categoryId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const uid = await userId()
    if (isNeutral(data.categoryId)) throw new Error("Pick a spending or income category")
    await loadCategory(uid, data.categoryId)
    const DB = db()
    await DB.batch([
      ...(data.old && data.old.toLowerCase() !== data.title.toLowerCase()
        ? [DB.prepare("DELETE FROM title_rules WHERE user_id = ? AND title = ?").bind(uid, data.old)]
        : []),
      DB.prepare(`INSERT INTO title_rules (user_id, title, category_id, exact, source) VALUES (?, ?, ?, ?, 'manual')
        ON CONFLICT(user_id, title) DO UPDATE SET title = excluded.title, category_id = excluded.category_id,
          exact = excluded.exact, source = 'manual'`).bind(uid, data.title, data.categoryId, data.exact ? 1 : 0),
    ])
  })

export const deleteTitleRule = createServerFn({ method: "POST" })
  .validator(z.object({ title: z.string().max(100) }))
  .handler(async ({ data }) => {
    const uid = await userId()
    await db().prepare("DELETE FROM title_rules WHERE user_id = ? AND title = ?").bind(uid, data.title).run()
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
