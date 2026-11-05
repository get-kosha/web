// Pure helpers shared by client and server: money, dates, categorising, subscriptions.

export type Rates = Record<string, number> // units per 1 USD

export const LOCALE = "en-GB"
/** Balance corrections and opening balances. */
export const CORRECTION_CATEGORY = "0"
/** Both halves of a transfer between your own accounts. */
export const TRANSFER_CATEGORY = "transfer"
/** Categories that are never income or spending. */
export const isNeutral = (categoryId: string) => categoryId === CORRECTION_CATEGORY || categoryId === TRANSFER_CATEGORY
/** Categories Kosha itself relies on: they can be renamed and re-iconed, never archived, merged or retyped.
 *  '0' and 'transfer' are neutral and stay out of category management. */
export const isSystemCategory = (id: string) =>
  id === CORRECTION_CATEGORY || id === TRANSFER_CATEGORY || id === "transfer_fee"
export const NEUTRAL_SQL = `('${CORRECTION_CATEGORY}', '${TRANSFER_CATEGORY}')`

/** Only same-origin paths, never "//host". */
export const safeReturn = (p: string | null | undefined) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/")

export function convert(cents: number, from: string, to: string, rates: Rates) {
  if (from === to) return cents
  const f = rates[from]
  const t = rates[to]
  if (!f || !t) return cents // ponytail: unknown currency passes through unconverted
  return (cents / f) * t
}

const moneyFormats = new Map<string, Intl.NumberFormat>()
export function fmt(cents: number, currency: string, compact = false) {
  const key = currency + compact
  let f = moneyFormats.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: currency.toUpperCase(),
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    })
    moneyFormats.set(key, f)
  }
  return f.format(cents / 100)
}

/** "12,50" | "1.234,56" | "1,234.56" | "-45" | "€ 12.00" | "12.00 Dr" -> cents, or null */
export function parseAmount(input: string): number | null {
  let s = input.trim()
  if (!s) return null
  let sign = 1
  if (/\bdr\.?$/i.test(s) || /^\(.*\)$/.test(s)) sign = -1
  s = s.replace(/\b(dr|cr)\.?$/i, "").replace(/[^\d.,-]/g, "")
  if (s.startsWith("-")) {
    sign = -sign
    s = s.slice(1)
  }
  const lastDot = s.lastIndexOf(".")
  const lastComma = s.lastIndexOf(",")
  const decimalSep =
    lastDot > -1 && lastComma > -1
      ? lastDot > lastComma
        ? "."
        : ","
      : lastComma > -1 && /,\d{1,2}$/.test(s)
        ? ","
        : lastDot > -1 && /\.\d{1,2}$/.test(s)
          ? "."
          : null
  const [int, frac = ""] = decimalSep
    ? [s.slice(0, s.lastIndexOf(decimalSep)), s.slice(s.lastIndexOf(decimalSep) + 1)]
    : [s, ""]
  const digits = int.replace(/[.,]/g, "")
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(frac) || (!digits && !frac)) return null
  return sign * (Number(digits || "0") * 100 + Math.round(Number((frac + "00").slice(0, 3)) / 10))
}

// --- time zones: stored dates are unix seconds; days and months are read in the user's zone ---

const dayFormats = new Map<string, Intl.DateTimeFormat>()
/** unix seconds -> "YYYY-MM-DD" in tz */
export function dayOf(unix: number, tz: string) {
  let f = dayFormats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    dayFormats.set(tz, f)
  }
  return f.format(unix * 1000)
}
export const monthOf = (unix: number, tz: string) => dayOf(unix, tz).slice(0, 7)

function offsetMs(utcMs: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcMs)
      .map((x) => [x.type, x.value])
  )
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs
}
/** "YYYY-MM-DD" (+hour) in tz -> unix seconds */
export function unixOf(day: string, tz: string, hour = 0) {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour)
  return Math.floor((guess - offsetMs(guess, tz)) / 1000)
}
/** "YYYY-MM" -> [start, end) unix seconds in tz */
export function monthRange(month: string, tz: string): [number, number] {
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  return [unixOf(`${month}-01`, tz), unixOf(`${next}-01`, tz)]
}
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

// --- categorising ---

export type TitleRule = { title: string; category_id: string; exact: number }

/** Longest matching rule wins; non-exact rules match as substrings. */
export function guessCategory(name: string, rules: TitleRule[]) {
  const n = name.trim().toLowerCase()
  if (!n) return null
  let best: TitleRule | null = null
  for (const r of rules) {
    const t = r.title.toLowerCase()
    if ((r.exact ? n === t : n.includes(t)) && (!best || t.length > best.title.length)) best = r
  }
  return best?.category_id ?? null
}

// --- subscriptions ---

export type Unit = "day" | "week" | "month" | "year"
export type Schedule = { start_day: string; every: number; unit: Unit; end_day: string | null }

const ymd = (d: string) => [+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10)] as const
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Running totals: index 0 is day 1. */
export function cumulative(daily: number[]) {
  let sum = 0
  return daily.map((v) => (sum += v))
}

/** Average of cumulative curves over `days` days; a shorter month holds its last value. Null without history. */
export function usualCurve(curves: number[][], days: number) {
  if (!curves.length) return null
  return Array.from(
    { length: days },
    (_, i) => curves.reduce((t, c) => t + c[Math.min(i, c.length - 1)], 0) / curves.length
  )
}

export function addDays(day: string, n: number) {
  const [y, m, d] = ymd(day)
  return iso(Date.UTC(y, m - 1, d + n))
}

/** n-th occurrence (0 = start_day). Month steps keep the start's day, clamped to short months. */
export function occurrence(s: Schedule, n: number) {
  const [y, m, d] = ymd(s.start_day)
  if (s.unit === "day" || s.unit === "week") return addDays(s.start_day, n * s.every * (s.unit === "week" ? 7 : 1))
  const months = m - 1 + n * s.every * (s.unit === "year" ? 12 : 1)
  const y2 = y + Math.floor(months / 12)
  const m2 = months % 12
  const last = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate()
  return iso(Date.UTC(y2, m2, Math.min(d, last)))
}

/** Occurrence days within [from, to], never past end_day. */
export function occurrencesBetween(s: Schedule, from: string, to: string, limit = 2000) {
  const out: string[] = []
  for (let n = 0; n < limit; n++) {
    const day = occurrence(s, n)
    if (day > to || (s.end_day && day > s.end_day)) break
    if (day >= from) out.push(day)
  }
  return out
}

/** Next occurrence on or after `from`, or null when the schedule has ended. */
export function nextOccurrence(s: Schedule, from: string) {
  return occurrencesBetween(s, from, addDays(from, 366 * Math.max(1, s.unit === "year" ? s.every : 1)), 5000)[0] ?? null
}

const PER_MONTH: Record<Unit, number> = { day: 365.25 / 12, week: 52.18 / 12, month: 1, year: 1 / 12 }
/** Amount normalised to one month. */
export const monthlyCost = (amount: number, every: number, unit: Unit) => (amount * PER_MONTH[unit]) / every

export type Materialized = {
  id: string
  due_day: string
  day: string
  amount: number
  paid: number
  kind: string | null
  note: string
}
export type Instance = {
  due_day: string
  day: string
  amount: number
  note: string
  status: "paid" | "skipped" | "overdue" | "due" | "upcoming"
  edited: boolean
  tx_id: string | null
}

/**
 * Merges projected occurrences with stored rows for one subscription.
 * Returns instances from `from` (plus unpaid ones before it, which are overdue) up to `count` future ones.
 */
export function instances(
  s: Schedule & { amount: number; note: string },
  rows: Materialized[],
  today: string,
  count = 6
): Instance[] {
  const byDue = new Map(rows.map((r) => [r.due_day, r]))
  const out: Instance[] = []
  let future = 0
  for (let n = 0; n < 5000 && future < count; n++) {
    const due = occurrence(s, n)
    if (s.end_day && due > s.end_day) break
    const r = byDue.get(due)
    if (r?.paid && due < today) continue // already settled history
    const day = r?.day ?? due
    const status: Instance["status"] =
      r?.kind === "skipped"
        ? "skipped"
        : r?.paid
          ? "paid"
          : day < today
            ? "overdue"
            : day === today
              ? "due"
              : "upcoming"
    if (due < today && status === "skipped") continue
    out.push({
      due_day: due,
      day,
      amount: r?.amount ?? s.amount,
      note: r?.note ?? s.note,
      status,
      edited: !!r && r.kind !== "skipped" && !r.paid,
      tx_id: r?.id ?? null,
    })
    if (due >= today) future++
  }
  return out
}

// --- accounts & net worth ---

export type AccountType = "bank" | "cash" | "credit" | "investment"
export type AccountLike = {
  type: AccountType
  currency: string
  balance: number
  credit_limit: number | null
  gain: number | null
  archived?: number
}

/**
 * What an account adds to net worth, in its own currency.
 * Credit cards track available credit, so their worth is minus what is owed.
 * Investments track money put in, so the latest recorded gain is added.
 */
export function accountWorth(a: AccountLike) {
  if (a.type === "credit") return a.balance - (a.credit_limit ?? 0)
  if (a.type === "investment") return a.balance + (a.gain ?? 0)
  return a.balance
}

export function netWorth(accounts: AccountLike[], to: string, rates: Rates) {
  const c = (v: number, from: string) => convert(v, from, to, rates)
  let total = 0,
    cash = 0,
    invested = 0,
    gains = 0,
    debt = 0,
    available = 0
  for (const a of accounts) {
    total += c(accountWorth(a), a.currency)
    if (a.type === "investment") {
      invested += c(a.balance, a.currency)
      gains += c(a.gain ?? 0, a.currency)
    } else if (a.type === "credit") {
      debt += c(Math.max(0, (a.credit_limit ?? 0) - a.balance), a.currency)
      available += c(a.balance, a.currency)
    } else cash += c(a.balance, a.currency)
  }
  return { total, cash, invested, gains, investments: invested + gains, debt, available }
}

// --- currency exchange ---

/**
 * Breakdown of a transfer where `total` left the source account, `fee` of it was charged,
 * and the rest was converted into `received` (destination currency).
 */
export function exchange(total: number, fee: number, received: number, marketRate: number | null) {
  const converted = Math.abs(total) - Math.abs(fee)
  const rate = converted > 0 ? Math.abs(received) / converted : 0
  // What the rate gap cost, in the source currency: the converted amount at market minus what arrived, valued at market.
  const rateCost = marketRate ? (converted * marketRate - Math.abs(received)) / marketRate : null
  const totalCost = rateCost === null ? Math.abs(fee) : Math.abs(fee) + rateCost
  return {
    converted,
    rate,
    marketRate,
    rateCost,
    totalCost,
    costPct: Math.abs(total) ? (totalCost / Math.abs(total)) * 100 : 0,
  }
}

export const fmtRate = (r: number) => (r >= 100 ? r.toFixed(2) : r >= 1 ? r.toFixed(4) : r.toPrecision(4))
