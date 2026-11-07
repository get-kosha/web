// Pure helpers shared by client and server: money, dates, categorising, subscriptions.

import { z } from "zod"

export type Rates = Record<string, number> // units per 1 USD

export const LOCALE = "en-GB"
/** Balance corrections and opening balances. */
export const CORRECTION_CATEGORY = "0"
/** Both halves of a transfer between your own accounts. */
export const TRANSFER_CATEGORY = "transfer"
/** Categories that are never income or spending. */
export const isNeutral = (categoryId: string) => categoryId === CORRECTION_CATEGORY || categoryId === TRANSFER_CATEGORY
/** Categories Kosha itself relies on. They can be renamed and re-iconed, but never archived, merged or retyped.
 *  '0' and 'transfer' are neutral and stay out of category management. */
export const isSystemCategory = (id: string) =>
  id === CORRECTION_CATEGORY || id === TRANSFER_CATEGORY || id === "transfer_fee"
export const NEUTRAL_SQL = `('${CORRECTION_CATEGORY}', '${TRANSFER_CATEGORY}')`

/**
 * The shared demo account (scripts/seed-demo.ts). Its password is public on purpose: anyone can sign in
 * and look around, and the server refuses every change it tries to make. It is known by its id, which
 * only the seed script can create; Better Auth gives real accounts random ids.
 */
export const DEMO = { id: "demo", email: "demo@kosha.local", password: "kosha-demo-2026" } as const
export const DEMO_READ_ONLY =
  "This is the demo account, so changes are turned off. Create your own account to make changes."

/** Allows only same-origin paths, never "//host". */
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

/** The phone keypad: one ".", at most 2 decimals, a leading "0" is replaced, at most 8 digits. */
export function pressKey(amount: string, key: string) {
  if (key === "del") return amount.slice(0, -1)
  if (key === ".") return amount.includes(".") ? amount : (amount || "0") + "."
  const dot = amount.indexOf(".")
  if (dot !== -1 && amount.length - dot > 2) return amount
  if (amount.replace(".", "").length >= 8) return amount
  return (amount === "0" ? "" : amount) + key
}

/** Parses "12,50", "1.234,56", "1,234.56", "-45", "€ 12.00" or "12.00 Dr" into cents, or returns null. */
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
/** Formats unix seconds as "YYYY-MM-DD" in `tz`. */
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
/** Converts "YYYY-MM-DD" (plus an optional hour and minute) in `tz` to unix seconds. */
export function unixOf(day: string, tz: string, hour = 0, minute = 0) {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour, minute)
  return Math.floor((guess - offsetMs(guess, tz)) / 1000)
}

const timeFormats = new Map<string, Intl.DateTimeFormat>()
/** Formats unix seconds as 24-hour "HH:MM" in `tz`. */
export function timeOf(unix: number, tz: string) {
  let f = timeFormats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    timeFormats.set(tz, f)
  }
  return f.format(unix * 1000)
}

/**
 * When a saved entry happened. A given "HH:MM" wins. Otherwise an edit that keeps its day keeps its time,
 * an entry for today is stamped now, and any other day gets noon.
 */
export function entryDate(day: string, tz: string, now: number, time?: string, old?: number) {
  if (time) return unixOf(day, tz, +time.slice(0, 2), +time.slice(3, 5))
  if (old !== undefined && dayOf(old, tz) === day) return old
  return day === dayOf(now, tz) ? now : unixOf(day, tz, 12)
}
/** Returns the [start, end) unix seconds of a "YYYY-MM" month in `tz`. */
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

// --- tags and events ---

export const MAX_TAGS = 20

/** One hashtag as stored: lowercase, no '#', letters, digits, '-' and '_' only. Empty when nothing is left. */
export const cleanTag = (t: string) =>
  t
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 32)

/** Turns typed text ("#trip, food rome") into unique stored tags, in the order typed. */
export function parseTags(text: string) {
  const out: string[] = []
  for (const part of text.split(/[\s,]+/)) {
    const t = cleanTag(part)
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, MAX_TAGS)
}

/** Reads the stored JSON column as a list. Anything unreadable gives no tags. */
export function tagList(json: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(json || "[]")
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []
  } catch {
    return []
  }
}

export type EventSpan = { id: string; start_day: string | null; end_day: string | null }

/**
 * By default, a new entry on `day` belongs to the event whose dates cover that day. A missing end
 * means it is still going. When events overlap, the one that started last (the more specific) wins.
 */
export function eventFor(day: string, events: EventSpan[]) {
  let best: EventSpan | null = null
  for (const e of events) {
    if (!e.start_day || day < e.start_day || (e.end_day && day > e.end_day)) continue
    if (!best || e.start_day > best.start_day!) best = e
  }
  return best?.id ?? null
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

/** Average of cumulative curves over `days` days; a shorter month holds its last value. Returns null without history. */
export function usualCurve(curves: number[][], days: number) {
  if (!curves.length) return null
  return Array.from(
    { length: days },
    (_, i) => curves.reduce((t, c) => t + c[Math.min(i, c.length - 1)], 0) / curves.length
  )
}

/** A day as a local-midnight Date, for calendar widgets that work in the browser's zone. */
export function dateOfDay(day: string) {
  const [y, m, d] = ymd(day)
  return new Date(y, m - 1, d)
}

/** The day a calendar widget's local Date stands for. The inverse of `dateOfDay`. */
export const dayOfDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function addDays(day: string, n: number) {
  const [y, m, d] = ymd(day)
  return iso(Date.UTC(y, m - 1, d + n))
}

/** The n-th occurrence, where 0 is start_day. Month steps keep the start's day, clamped to short months. */
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

// --- spotting recurring payments ---

const PERIODS = [
  { every: 1, unit: "week", days: 7, slack: 1 },
  { every: 2, unit: "week", days: 14, slack: 2 },
  { every: 1, unit: "month", days: 30.44, slack: 4 },
  { every: 3, unit: "month", days: 91.3, slack: 8 },
  { every: 1, unit: "year", days: 365.25, slack: 12 },
] as const
const between = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export type Payment = { id: string; name: string; amount: number; day: string; category_id: string; wallet_id: string }
export type RecurringGuess = {
  name: string
  /** The latest amount for a steady one, the typical one when it varies. Signed. */
  amount: number
  variable: boolean
  every: number
  unit: Unit
  nextDay: string
  lastDay: string
  count: number
  categoryId: string
  walletId: string
  /** The past payments it was spotted from, oldest first. */
  ids: string[]
}

/**
 * Payees paid on a steady rhythm: weekly, fortnightly, monthly, quarterly or yearly, still going, and with
 * about one payment per period. Three payments are needed (two for yearly). Weekly, fortnightly and yearly
 * ones must also keep a steady amount (within 10%), so weekly groceries don't count; monthly and quarterly
 * ones may vary, like an energy bill. Pass payments that aren't already recurring, transfers or corrections.
 */
export function findRecurring(payments: Payment[], today: string): RecurringGuess[] {
  const groups = new Map<string, Payment[]>()
  for (const p of payments) {
    const key = p.name.trim().toLowerCase()
    if (key) (groups.get(key) ?? groups.set(key, []).get(key)!).push(p)
  }
  const out: RecurringGuess[] = []
  for (const list of groups.values()) {
    const ps = [...list].sort((a, b) => a.day.localeCompare(b.day))
    if (ps.length < 2 || !ps.every((p) => Math.sign(p.amount) === Math.sign(ps[0].amount))) continue
    const gaps = ps.slice(1).map((p, i) => between(ps[i].day, p.day))
    const typical = median(gaps)
    const period = PERIODS.find((x) => Math.abs(typical - x.days) <= x.slack)
    if (!period || ps.length < (period.unit === "year" ? 2 : 3)) continue
    if (gaps.filter((g) => Math.abs(g - period.days) <= period.slack).length < gaps.length * 0.75) continue
    const last = ps[ps.length - 1]
    if (between(last.day, today) > period.days * 1.5 + period.slack) continue
    const amounts = ps.map((p) => Math.abs(p.amount))
    const mid = median(amounts)
    const steady = amounts.filter((a) => Math.abs(a - mid) <= Math.max(mid * 0.1, 100)).length >= amounts.length * 0.75
    if (!steady && (period.unit === "week" || period.unit === "year")) continue
    let n = 1
    let next = occurrence({ start_day: last.day, every: period.every, unit: period.unit, end_day: null }, n)
    while (next < today)
      next = occurrence({ start_day: last.day, every: period.every, unit: period.unit, end_day: null }, ++n)
    out.push({
      name: last.name.trim(),
      amount: Math.sign(last.amount) * (steady ? Math.abs(last.amount) : Math.round(mid)),
      variable: !steady,
      every: period.every,
      unit: period.unit,
      nextDay: next,
      lastDay: last.day,
      count: ps.length,
      categoryId: last.category_id,
      walletId: last.wallet_id,
      ids: ps.map((p) => p.id),
    })
  }
  return out.sort(
    (a, b) => Math.abs(monthlyCost(b.amount, b.every, b.unit)) - Math.abs(monthlyCost(a.amount, a.every, a.unit))
  )
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

/**
 * What a new account stores, from the figures people know about it today. `amount` is the balance, what a
 * card owes, or the money put into an investment. `extra` is a card's credit limit or an investment's value
 * today. A card keeps the credit left; without a limit that is minus what is owed, so its worth still holds.
 * An investment with only a value counts it all as money put in. Blank figures are null.
 */
export function openingFigures(type: AccountType, amount: number | null, extra: number | null) {
  if (type === "credit") return { balance: (extra ?? 0) - Math.abs(amount ?? 0), credit_limit: extra, gain: null }
  if (type === "investment") {
    const put = amount ?? extra ?? 0
    return { balance: put, credit_limit: null, gain: extra === null ? null : extra - put }
  }
  return { balance: amount ?? 0, credit_limit: null, gain: null }
}

// ponytail: about 80 common regions; anywhere else keeps the current default currency.
const REGION_CURRENCY: Record<string, string> = Object.fromEntries([
  ..."AD AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA".split(" ").map((r) => [r, "eur"]),
  ...`US:usd GB:gbp IN:inr CA:cad AU:aud NZ:nzd CH:chf LI:chf JP:jpy CN:cny HK:hkd SG:sgd SE:sek NO:nok DK:dkk
    IS:isk PL:pln CZ:czk HU:huf RO:ron RS:rsd TR:try IL:ils AE:aed SA:sar QA:qar KW:kwd BH:bhd OM:omr EG:egp MA:mad
    ZA:zar NG:ngn KE:kes GH:ghs BR:brl MX:mxn AR:ars CL:clp CO:cop PE:pen KR:krw TW:twd TH:thb MY:myr ID:idr PH:php
    VN:vnd PK:pkr BD:bdt LK:lkr NP:npr UA:uah RU:rub KZ:kzt GE:gel`
    .split(/\s+/)
    .map((p) => p.split(":")),
])

/**
 * A likely main currency from the browser's languages (navigator.languages). A tag that names its region
 * ("en-GB") beats one whose region is only likely ("en" is most often US). Only currencies in `known` count.
 */
export function guessCurrency(languages: readonly string[], known: Record<string, unknown>, fallback: string) {
  const locales = languages.flatMap((tag) => {
    try {
      return [new Intl.Locale(tag)]
    } catch {
      return []
    }
  })
  const regions = [...locales.map((l) => l.region), ...locales.map((l) => l.maximize().region)]
  return regions.map((r) => r && REGION_CURRENCY[r]).find((c) => c && known[c]) ?? fallback
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

// ---------- preferences ----------

const pref = <T extends z.ZodType<string | null>>(schema: T, fallback: z.infer<T>) => ({ schema, fallback })

/**
 * Every per-user preference in the settings table: its allowed values and its default. getSettings parses
 * with parsePrefs and savePreferences validates against the same schemas, so a new key is one line here.
 */
export const PREFS = {
  theme: pref(z.enum(["light", "dark", "system"]), "system"),
  layout: pref(z.enum(["boxed", "full"]), "boxed"),
  motion: pref(z.enum(["on", "reduced", "off"]), "on"),
  accent: pref(z.enum(["teal", "blue", "amber", "rose", "graphite"]), "teal"),
  density: pref(z.enum(["comfortable", "compact"]), "comfortable"),
  figures: pref(z.enum(["mono", "proportional"]), "mono"),
  hide_amounts: pref(z.enum(["0", "1"]), "0"),
  round_hero: pref(z.enum(["0", "1"]), "0"),
  default_wallet: pref(z.string().max(64), "last"),
  add_kind: pref(z.enum(["expense", "income"]), "expense"),
  suggest_category: pref(z.enum(["0", "1"]), "1"),
  default_auto_pay: pref(z.enum(["0", "1"]), "1"),
  upcoming_horizon: pref(z.enum(["month", "30d"]), "month"),
  learn_rules: pref(z.enum(["0", "1"]), "1"),
  ai_enabled: pref(z.enum(["0", "1"]), "0"),
  ai_share_amount: pref(z.enum(["0", "1"]), "1"),
  ai_share_payee: pref(z.enum(["0", "1"]), "1"),
  ai_share_date: pref(z.enum(["0", "1"]), "1"),
  ai_share_note: pref(z.enum(["0", "1"]), "0"),
  ai_share_account: pref(z.enum(["0", "1"]), "0"),
  ai_log_enabled: pref(z.enum(["0", "1"]), "1"),
  ai_categorise: pref(z.enum(["0", "1"]), "1"),
  ai_quick_add: pref(z.enum(["0", "1"]), "1"),
  ai_receipts: pref(z.enum(["0", "1"]), "1"),
  ai_recap: pref(z.enum(["0", "1"]), "1"),
  ai_ask: pref(z.enum(["0", "1"]), "1"),
  ai_statements: pref(z.enum(["0", "1"]), "1"),
  /** The month whose recap was dismissed from Overview, so it stays hidden on every device. */
  ai_recap_hidden: pref(
    z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    null
  ),
  backup_codes_saved_at: pref(z.string().regex(/^\d+$/).nullable(), null),
}
export type Prefs = { [K in keyof typeof PREFS]: z.infer<(typeof PREFS)[K]["schema"]> }

/** Stored key/value rows to typed preferences. Unknown or invalid values fall back to the default. */
export function parsePrefs(rows: Record<string, string | undefined>): Prefs {
  return Object.fromEntries(
    Object.entries(PREFS).map(([k, p]) => {
      const r = p.schema.safeParse(rows[k])
      return [k, r.success ? r.data : p.fallback]
    })
  ) as Prefs
}

// ---------- AI ----------

export type AiShares = { amount: boolean; payee: boolean; date: boolean; note: boolean; account: boolean }
export type AiTx = { payee: string; amount: number; currency: string; day: string; note: string; account: string }

/** Settings › AI › What AI can see, as flags. */
export const aiShares = (p: Prefs): AiShares => ({
  amount: p.ai_share_amount === "1",
  payee: p.ai_share_payee === "1",
  date: p.ai_share_date === "1",
  note: p.ai_share_note === "1",
  account: p.ai_share_account === "1",
})

/**
 * Each AI feature, its on/off preference, and the settings it can't work without. Auto-categorise guesses
 * from the payee and only while Kosha suggests categories at all; a recap is about amounts.
 */
export const AI_FEATURES = {
  categorise: { pref: "ai_categorise", needs: ["ai_share_payee", "suggest_category"] },
  quick_add: { pref: "ai_quick_add", needs: [] },
  receipts: { pref: "ai_receipts", needs: [] },
  recap: { pref: "ai_recap", needs: ["ai_share_amount"] },
  ask: { pref: "ai_ask", needs: [] },
  statements: { pref: "ai_statements", needs: [] },
} as const satisfies Record<string, { pref: keyof Prefs; needs: readonly (keyof Prefs)[] }>
export type AiFeature = keyof typeof AI_FEATURES

const AI_FEATURE_NAMES: Record<AiFeature, string> = {
  categorise: "Auto-categorise",
  quick_add: "Natural-language add",
  receipts: "Receipt scanning",
  recap: "Monthly recap",
  ask: "Ask Kosha",
  statements: "Statements",
}
const NEEDS: Partial<Record<keyof Prefs, string>> = {
  ai_share_payee: "payee names shared, under Settings › AI › What AI can see",
  ai_share_amount: "amounts shared, under Settings › AI › What AI can see",
  suggest_category: "Suggest a category turned on, under Settings › General",
}

/**
 * Why an AI feature can't run, as a message that says what to change, or null when it can: no provider
 * connected, AI off, the feature off, or a setting it needs off.
 */
export function aiBlocker(p: Prefs, connected: boolean, feature: AiFeature): string | null {
  const on = p.ai_enabled === "1"
  if (!connected && !on)
    return "AI isn't set up. In Kosha, open Settings › AI, turn on Use AI features and connect a provider (Anthropic, OpenAI, Gemini, OpenRouter, Ollama or any OpenAI-compatible endpoint)."
  if (!connected)
    return "No AI provider is connected. In Kosha, open Settings › AI and connect one (Anthropic, OpenAI, Gemini, OpenRouter, Ollama or any OpenAI-compatible endpoint)."
  if (!on) return "AI is turned off. In Kosha, open Settings › AI and turn on Use AI features."
  const f = AI_FEATURES[feature]
  const name = AI_FEATURE_NAMES[feature]
  if (p[f.pref] !== "1") return `${name} is turned off. Turn it on in Kosha under Settings › AI › Features.`
  const missing = f.needs.find((n: keyof Prefs) => p[n] !== "1")
  return missing ? `${name} needs ${NEEDS[missing]}.` : null
}

/** Which AI features are live: AI on, a default provider connected, the feature on and what it needs turned on. */
export function aiFeatures(p: Prefs, connected: boolean) {
  return Object.fromEntries(
    (Object.keys(AI_FEATURES) as AiFeature[]).map((k) => [k, !aiBlocker(p, connected, k)])
  ) as Record<AiFeature, boolean>
}

/**
 * An amount read by AI in the account's currency. A receipt in another currency is converted at today's
 * rate, and the note says what was paid. Without a rate for it, the amount stays and the note says so.
 */
export function inCurrency(
  e: { amount: number | null; currency: string | null; note: string },
  currency: string,
  rates: Rates
) {
  if (!e.amount || !e.currency || e.currency === currency) return { amount: e.amount, note: e.note }
  const paid = `Paid ${fmt(e.amount, e.currency)}`
  const known = rates[e.currency] && rates[currency]
  return {
    amount: known ? Math.round(convert(e.amount, e.currency, currency, rates)) : e.amount,
    note: [e.note, known ? paid : `${paid}, not converted`].filter(Boolean).join(" · "),
  }
}

/** FNV-1a: a small stable hash, so the same payee always gets the same code. Not for secrets. */
function fnv1a(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** The stable code that stands in for a payee name when payee names aren't shared. */
export const payeeCode = (uid: string, payee: string) =>
  `payee_${fnv1a(`${uid}\u0000${payee.trim().toLowerCase()}`).toString(36)}`

/**
 * Exactly what an AI request may contain for one transaction, per Settings › AI › What AI can see.
 * With payee off, the payee becomes a stable per-user code, so a model can still group them. With exact
 * dates off, only YYYY-MM is sent. Notes and account names are left out unless shared.
 */
export function redactForAi(tx: AiTx, shares: AiShares, uid: string) {
  const out: Record<string, string | number | null> = {
    payee: shares.payee ? tx.payee : payeeCode(uid, tx.payee),
    amount: shares.amount ? tx.amount / 100 : null,
    currency: tx.currency.toUpperCase(),
  }
  if (shares.date) out.date = tx.day
  else out.month = tx.day.slice(0, 7)
  if (shares.note) out.note = tx.note
  if (shares.account) out.account = tx.account
  return out
}

/** Puts real names back in a model's reply, in place of the payee codes and account refs it was given. */
export const unmask = (text: string, names: Map<string, string>) =>
  names.size ? text.replace(/\b(payee_[0-9a-z]+|account_\d+)\b/g, (code) => names.get(code) ?? code) : text

/**
 * The JSON object in a model's reply. Models wrap it in prose or ``` fences now and then, so this reads
 * from the first "{" to the last "}". Returns null when there's no object.
 */
export function readJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) return null
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1))
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ---------- attachments ----------

/** The largest receipt or payslip Kosha stores. */
export const ATTACHMENT_LIMIT = 10 * 1024 * 1024
/** What the file picker offers. The server still checks the bytes with fileKind. */
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf"

/**
 * The type of an attachment from its first bytes, or null when it isn't a JPEG, PNG, WebP or PDF. Files are
 * served with this type, so a file that only claims to be an image can't be served as something else.
 */
export function fileKind(b: Uint8Array) {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(0, 5) === "%PDF-") return "application/pdf"
  return null
}

/**
 * File names for a zip of documents: each starts with its payment's month, so "2026-11 payslip.pdf", and a
 * repeated name gets " (2)" before its extension.
 */
export function archiveNames(files: { day: string; name: string }[]) {
  const seen = new Map<string, number>()
  return files.map((f) => {
    const base = `${f.day.slice(0, 7)} ${f.name.replace(/[\\/:*?"<>|]/g, "-")}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    if (n === 1) return base
    const dot = base.lastIndexOf(".")
    return dot > 8 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`
  })
}
