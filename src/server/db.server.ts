import { env, waitUntil } from "cloudflare:workers"
import {
  convert,
  dayOf,
  instances,
  monthlyCost,
  occurrencesBetween,
  parsePrefs,
  unixOf,
  type Materialized,
  type Rates,
  type Schedule,
} from "@/lib/core"

export const db = () => env.DB

/**
 * An error with the HTTP status the public API answers with, and optionally its error code (else the status's
 * usual one). The UI shows its message like any other.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

// Every query here and in server/finance.server.ts is scoped by user_id, joins included, because ids are only unique per user.

export async function getSettings(uid: string) {
  const DB = db()
  const [settings, rates] = await DB.batch([
    DB.prepare("SELECT key, value FROM settings WHERE user_id = ?").bind(uid),
    DB.prepare("SELECT COALESCE(MAX(updated_at), 0) AS at FROM rates"),
  ])
  const s = Object.fromEntries((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value]))
  const prefs = parsePrefs(s)
  return {
    primary: s.primary_currency ?? "eur",
    tz: s.timezone ?? "UTC",
    order: s.currency_order?.split(",").filter(Boolean) ?? [],
    prefs,
    ratesUpdated: (rates.results[0] as { at: number }).at,
  }
}

export async function getRates(): Promise<Rates> {
  const { results } = await db()
    .prepare("SELECT currency, per_usd FROM rates")
    .all<{ currency: string; per_usd: number }>()
  return Object.fromEntries(results.map((r) => [r.currency, r.per_usd]))
}

const RATES_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"

export async function refreshRates() {
  const res = await fetch(RATES_URL)
  if (!res.ok) throw new Error(`rates fetch failed: ${res.status}`)
  const body = (await res.json()) as { usd: Record<string, number> }
  const DB = db()
  const upsert = DB.prepare(`INSERT INTO rates (currency, per_usd, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(currency) DO UPDATE SET per_usd = excluded.per_usd, updated_at = excluded.updated_at`)
  await DB.batch(
    Object.entries(body.usd)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => upsert.bind(k, v))
  )
}

/** Refresh exchange rates in the background at most once a day. */
export function refreshRatesIfStale(ratesUpdated: number) {
  if (Date.now() / 1000 - ratesUpdated < 86_400) return
  waitUntil(refreshRates().catch((e) => console.error(e)))
}

/**
 * Columns and joins that add a transfer's other half and exchange details to `t`.
 * Use as `SELECT t.*, ${COUNTERPART} WHERE t.user_id = ? ...`.
 */
export const COUNTERPART = `p.wallet_id AS counter_wallet_id, p.amount AS counter_amount, x.fee, x.provider, x.market_rate
  FROM transactions t
  LEFT JOIN transactions p ON p.user_id = t.user_id AND p.transfer_id = t.transfer_id AND p.id <> t.id
  LEFT JOIN transfers x ON x.user_id = t.user_id AND x.id = t.transfer_id`

// --- subscriptions: record due occurrences as paid (auto_pay) ---

type SubRow = Schedule & {
  id: string
  wallet_id: string
  category_id: string
  name: string
  amount: number
  note: string
  kind: string
  to_wallet_id: string | null
  to_amount: number | null
  variable: number
}

/**
 * Statements that write both halves of a transfer: money out of `from` (negative) and into `to`
 * (positive, in that account's currency). The halves share transfer_id and are always paid together.
 */
export function transferLegs(
  uid: string,
  o: {
    transferId: string
    outId: string
    inId: string
    from: string
    to: string
    sent: number
    received: number
    date: number
    paid: number
    note: string
    kind?: string | null
    subscriptionId?: string | null
    dueDay?: string | null
  }
) {
  const up = db()
    .prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, note, amount, date, paid, kind, transfer_id, subscription_id, due_day)
    VALUES (?, ?, ?, 'transfer', '', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET wallet_id = excluded.wallet_id, category_id = 'transfer', note = excluded.note, amount = excluded.amount,
      date = excluded.date, paid = excluded.paid, kind = excluded.kind, transfer_id = excluded.transfer_id, updated_at = unixepoch(),
      reconciled_id = CASE WHEN amount = excluded.amount AND wallet_id = excluded.wallet_id THEN reconciled_id END`)
  return [
    up.bind(
      uid,
      o.outId,
      o.from,
      o.note,
      -Math.abs(o.sent),
      o.date,
      o.paid,
      o.kind ?? null,
      o.transferId,
      o.subscriptionId ?? null,
      o.dueDay ?? null
    ),
    up.bind(uid, o.inId, o.to, o.note, Math.abs(o.received), o.date, o.paid, o.kind ?? null, o.transferId, null, null),
  ]
}

/** What arrives in the destination account for one payment of a recurring transfer. */
export function receivedFor(
  s: { amount: number; to_amount: number | null },
  sent: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Rates
) {
  if (fromCurrency === toCurrency) return Math.abs(sent)
  // A fixed received amount only applies to the regular amount; edited payments are converted.
  if (s.to_amount && Math.abs(sent) === Math.abs(s.amount)) return s.to_amount
  return Math.round(Math.abs(convert(sent, fromCurrency, toCurrency, rates)))
}

async function settle(uid: string) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const now = Math.floor(Date.now() / 1000)
  const today = dayOf(now, tz)
  const [subs, rows] = await DB.batch([
    DB.prepare(`SELECT s.*, w.currency, tw.currency AS to_currency FROM subscriptions s
      JOIN wallets w ON w.user_id = s.user_id AND w.id = s.wallet_id
      LEFT JOIN wallets tw ON tw.user_id = s.user_id AND tw.id = s.to_wallet_id
      WHERE s.user_id = ? AND s.auto_pay = 1 AND s.variable = 0 AND s.start_day <= ? AND (s.end_day IS NULL OR s.end_day >= s.start_day)`).bind(
      uid,
      today
    ),
    DB.prepare(
      "SELECT subscription_id, due_day FROM transactions WHERE user_id = ? AND subscription_id IS NOT NULL AND due_day IS NOT NULL"
    ).bind(uid),
  ])
  const rates = await getRates()
  const have = new Set(
    (rows.results as { subscription_id: string; due_day: string }[]).map((r) => `${r.subscription_id}|${r.due_day}`)
  )
  const insert = DB.prepare(`INSERT OR IGNORE INTO transactions
    (user_id, id, wallet_id, category_id, name, note, amount, date, paid, kind, subscription_id, due_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
  const writes = [
    // Edited occurrences whose day has come are paid as edited.
    DB.prepare(`UPDATE transactions SET paid = 1, updated_at = unixepoch()
      WHERE user_id = ?1 AND paid = 0 AND COALESCE(kind, '') <> 'skipped' AND date <= ?2
      AND subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ?1 AND auto_pay = 1 AND variable = 0)`).bind(
      uid,
      now
    ),
    // Once one half of a transfer is paid, mark the other half paid too.
    DB.prepare(`UPDATE transactions SET paid = 1, updated_at = unixepoch() WHERE user_id = ?1 AND paid = 0 AND transfer_id IN
      (SELECT transfer_id FROM transactions WHERE user_id = ?1 AND paid = 1 AND transfer_id IS NOT NULL)`).bind(uid),
  ]
  // Deterministic ids keep concurrent settles from writing a transfer's halves twice.
  const insertLeg = DB.prepare(`INSERT OR IGNORE INTO transactions
    (user_id, id, wallet_id, category_id, name, note, amount, date, paid, kind, transfer_id, subscription_id, due_day)
    VALUES (?, ?, ?, 'transfer', '', ?, ?, ?, 1, ?, ?, ?, ?)`)
  for (const s of subs.results as (SubRow & { currency: string; to_currency: string | null })[]) {
    for (const due of occurrencesBetween(s, s.start_day, today)) {
      if (have.has(`${s.id}|${due}`)) continue
      const date = unixOf(due, tz, 12)
      if (s.to_wallet_id) {
        const tid = `${s.id}:${due}`
        const received = receivedFor(s, s.amount, s.currency, s.to_currency ?? s.currency, rates)
        writes.push(
          insertLeg.bind(uid, `${tid}:out`, s.wallet_id, s.note, -Math.abs(s.amount), date, s.kind, tid, s.id, due),
          insertLeg.bind(uid, `${tid}:in`, s.to_wallet_id, s.note, received, date, s.kind, tid, null, null)
        )
      } else
        writes.push(
          insert.bind(
            uid,
            crypto.randomUUID(),
            s.wallet_id,
            s.category_id,
            s.name,
            s.note,
            s.amount,
            date,
            s.kind,
            s.id,
            due
          )
        )
    }
  }
  await DB.batch(writes)
}

// ponytail: one entry per user per isolate, never evicted; fine for a handful of users.
const settled = new Map<string, { at: number; run: Promise<void> }>()
/**
 * Lazily settles a user's subscriptions at most every 10 minutes per isolate (no cron needed).
 * It is safe to run concurrently anywhere, because the (user_id, subscription_id, due_day) index makes inserts idempotent.
 */
export function ensureSettled(uid: string, force = false) {
  const last = settled.get(uid)
  if (!force && last && Date.now() - last.at <= 600_000) return last.run
  const run = settle(uid).catch((e) => {
    settled.delete(uid)
    throw e
  })
  settled.set(uid, { at: Date.now(), run })
  return run
}

type Subscription = SubRow & { auto_pay: number; created_at: number }

/** Every subscription with its currency, monthly cost, upcoming instances, and paid history. */
export async function loadSubscriptions(uid: string, today: string) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const [subs, rows] = await DB.batch([
    DB.prepare(`SELECT s.*, w.currency, tw.currency AS to_currency FROM subscriptions s
      JOIN wallets w ON w.user_id = s.user_id AND w.id = s.wallet_id
      LEFT JOIN wallets tw ON tw.user_id = s.user_id AND tw.id = s.to_wallet_id
      WHERE s.user_id = ? ORDER BY s.name COLLATE NOCASE`).bind(uid),
    DB.prepare(`SELECT t.*, ${COUNTERPART}
      WHERE t.user_id = ? AND t.subscription_id IS NOT NULL ORDER BY t.date DESC`).bind(uid),
  ])
  type Row = {
    id: string
    subscription_id: string
    due_day: string | null
    date: number
    amount: number
    paid: number
    kind: string | null
    note: string
    name: string
    wallet_id: string
    category_id: string
    transfer_id: string | null
    counter_wallet_id: string | null
    counter_amount: number | null
    fee: number | null
    provider: string | null
    market_rate: number | null
  }
  const bySub = Map.groupBy(rows.results as Row[], (r) => r.subscription_id)
  return (subs.results as (Subscription & { currency: string; to_currency: string | null })[]).map((s) => {
    const own = bySub.get(s.id) ?? []
    const materialized: Materialized[] = own
      .filter((r) => r.due_day)
      .map((r) => ({
        id: r.id,
        due_day: r.due_day!,
        day: dayOf(r.date, tz),
        amount: r.amount,
        paid: r.paid,
        kind: r.kind,
        note: r.note,
      }))
    const history = own.filter((r) => r.paid).map((r) => ({ ...r, day: dayOf(r.date, tz) }))
    const upcoming = instances(s, materialized, today, 6)
    const ended = !!s.end_day && s.end_day < today
    return {
      ...s,
      ended,
      monthly: ended ? 0 : monthlyCost(s.amount, s.every, s.unit),
      instances: upcoming,
      next: upcoming.find((i) => i.status !== "skipped" && i.status !== "paid") ?? null,
      history,
    }
  })
}
export type SubscriptionView = Awaited<ReturnType<typeof loadSubscriptions>>[number]

/** Public mid-market rate (units of `to` per 1 `from`) on `day`, falling back to the latest stored rates. */
export async function marketRate(from: string, to: string, day: string, today: string) {
  if (from === to) return 1
  try {
    const tag = day >= today ? "latest" : day
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${from}.json`)
    if (res.ok) {
      const rate = ((await res.json()) as Record<string, Record<string, number>>)[from]?.[to]
      if (rate > 0) return rate
    }
  } catch {
    // offline or no data for that day
  }
  const rates = await getRates()
  return rates[from] && rates[to] ? rates[to] / rates[from] : null
}
