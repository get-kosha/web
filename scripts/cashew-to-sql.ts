// Converts a Cashew backup (SQLite file) into SQL for D1, for one account. Sign up first.
//   node scripts/cashew-to-sql.ts <cashew-backup.sql> <email> [time-zone] > import.sql
//   npx wrangler d1 execute kosha --local --file import.sql   (or --remote)
// Re-running replaces that account's categories, transactions, subscriptions and title rules.
import { DatabaseSync } from "node:sqlite"

const [path, email] = process.argv.slice(2)
if (!path || !email) {
  console.error("usage: node scripts/cashew-to-sql.ts <cashew-backup.sql> <email> [time-zone]")
  process.exit(1)
}
const src = new DatabaseSync(path, { readOnly: true })
const rows = (sql: string) => src.prepare(sql).all() as Record<string, any>[]

const ICONS: Record<string, string> = {
  popcorn: "🍿",
  loan: "💸",
  fish: "🎣",
  sports: "⚽",
  briefcase: "💼",
  bills: "🧾",
  "atm-machine": "🏧",
  "clothes-hanger": "👕",
  plane: "✈️",
  car: "🚗",
  gift: "🎁",
  "portable-game-console": "🎮",
  decrease: "↩️",
  "cash-bill-dollar": "💵",
  multivitamin: "💊",
  shopping: "🛍️",
  "piggy-bank": "🐷",
  flower: "🌸",
  tablet: "📱",
  furniture: "🛋️",
  coin: "🪙",
  rent: "🏠",
  bank: "🏛️",
  "paper-bill": "📄",
  tram: "🚋",
  "fizzy-drink": "🥤",
  "lightning-bolt": "⚡",
  cutlery: "🍽️",
  "feeding-bottle": "🍼",
  groceries: "🛒",
  "internet-globe": "🌐",
  charts: "📊",
}
const icon = (name: string | null) => (name ? (ICONS[name.replace(/\(\d+\)/, "").replace(/\.png$/, "")] ?? null) : null)

const KINDS = ["upcoming", "subscription", "repetitive", "credit", "debt"]

/** The account's id, looked up in SQL. A missing account makes every insert fail (user_id is NOT NULL). */
const USER = { sql: `(SELECT id FROM "user" WHERE email = '${email.replace(/'/g, "''")}')` }

const lit = (v: unknown): string =>
  v === USER
    ? USER.sql
    : v === null || v === undefined
      ? "NULL"
      : typeof v === "number"
        ? String(v)
        : `'${String(v).replace(/'/g, "''")}'`

function insert(table: string, cols: string[], data: unknown[][], suffix = "") {
  for (let i = 0; i < data.length; i += 100) {
    const values = data
      .slice(i, i + 100)
      .map((r) => `(${[USER, ...r].map(lit).join(",")})`)
      .join(",\n")
    console.log(`INSERT INTO ${table} (user_id,${cols.join(",")}) VALUES\n${values}${suffix};`)
  }
}

console.log("PRAGMA defer_foreign_keys = on;")
// Accounts are updated in place so their type, credit limit and gains survive a re-import.
for (const t of ["title_rules", "transactions", "subscriptions", "transfers", "categories"])
  console.log(`DELETE FROM ${t} WHERE user_id = ${USER.sql};`)

insert(
  "wallets",
  ["id", "name", "currency", "colour", "sort", "archived"],
  rows(`select * from wallets order by "order"`).map((w) => [
    w.wallet_pk,
    w.name,
    (w.currency ?? "eur").toLowerCase(),
    w.colour ? `#${String(w.colour).slice(-6)}` : null,
    w.order,
    w.archived,
  ]),
  "\nON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, currency = excluded.currency, colour = excluded.colour, sort = excluded.sort, archived = excluded.archived"
)

insert(
  "categories",
  ["id", "name", "icon", "income", "parent_id", "sort", "archived"],
  rows(`select * from categories order by main_category_pk is not null, "order"`).map((c) => [
    c.category_pk,
    c.name,
    c.emoji_icon_name || icon(c.icon_name),
    c.income,
    c.main_category_pk,
    c.order,
    c.archived,
  ])
)

// Cashew stores every payment of a subscription as its own row, and the next one as an unpaid row.
// Group them into one subscription per title; unpaid rows become projected occurrences.
const tz = process.argv[4] ?? "Europe/Berlin"
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
const day = (unix: number) => dayFmt.format(unix * 1000)
const UNITS: Record<number, string> = { 1: "day", 2: "week", 3: "month", 4: "year" }
const step = (d: string, every: number, unit: string) => {
  const [y, m, dd] = d.split("-").map(Number)
  const t =
    unit === "day"
      ? Date.UTC(y, m - 1, dd + every)
      : unit === "week"
        ? Date.UTC(y, m - 1, dd + 7 * every)
        : Date.UTC(y, m - 1 + (unit === "year" ? 12 : 1) * every, dd)
  return new Date(t).toISOString().slice(0, 10)
}
const walletName = new Map(rows("select wallet_pk, name from wallets").map((w) => [w.wallet_pk, w.name]))
const walletCurrency = new Map(
  rows("select wallet_pk, currency from wallets").map((w) => [w.wallet_pk, (w.currency ?? "eur").toLowerCase()])
)
const categoryName = new Map(rows("select category_pk, name from categories").map((c) => [c.category_pk, c.name]))

const txs = rows("select * from transactions order by date_created")

// Cashew records a transfer as "<A> Transfer Out" and "<B> Transfer In", one second apart.
// Pair them into one transfer; unpaired halves stay balance corrections.
const isOut = (t: Record<string, any>) => t.category_fk === "0" && t.name.trim().endsWith("Transfer Out")
const isIn = (t: Record<string, any>) => t.category_fk === "0" && t.name.trim().endsWith("Transfer In")
const transferOf = new Map<string, string>() // transaction_pk -> transfer_id
const partner = new Map<string, Record<string, any>>() // out pk -> in row
for (const o of txs.filter(isOut)) {
  const i = txs.find(
    (t) =>
      isIn(t) &&
      !transferOf.has(t.transaction_pk) &&
      t.wallet_fk !== o.wallet_fk &&
      t.paid === o.paid &&
      Math.abs(t.date_created - o.date_created) <= 5
  )
  if (!i) continue
  const id = crypto.randomUUID()
  transferOf.set(o.transaction_pk, id)
  transferOf.set(i.transaction_pk, id)
  partner.set(o.transaction_pk, i)
}
const transferNote = (note: string) => (note.trim().startsWith("Transferred Balance") ? "" : note.trim())
const series = Map.groupBy(
  txs.filter((t) => t.type === 1 || t.type === 2),
  (t) => `${t.name.trim() || categoryName.get(t.category_fk)}|${t.type}`
)
const subOf = new Map<string, { id: string; due: string | null }>() // transaction_pk -> link
const subs: unknown[][] = []
for (const [key, group] of series) {
  // A recurring transfer is one schedule; its incoming half follows the outgoing one.
  if (isIn(group[0])) continue
  const paid = group.filter((t) => t.paid)
  const unpaid = group.filter((t) => !t.paid)
  const template = paid.at(-1) ?? group.at(-1)!
  const every = template.period_length || 1
  const unit = UNITS[template.reoccurrence] ?? "month"
  const id = crypto.randomUUID()
  const lastPaid = paid.length ? day(paid.at(-1)!.date_created) : null
  const start = unpaid.length ? day(Math.min(...unpaid.map((t) => t.date_created))) : step(lastPaid!, every, unit)
  const cashewEnd = group
    .map((t) => t.end_date)
    .filter(Boolean)
    .sort()
    .at(-1)
  // No next payment scheduled in Cashew means it was cancelled after the last payment.
  const end = !unpaid.length ? lastPaid : cashewEnd ? day(cashewEnd) : null
  const to = isOut(template)
    ? partner.get(paid.findLast((t) => partner.has(t.transaction_pk))?.transaction_pk ?? "")
    : undefined
  const toWallet = to?.wallet_fk ?? null
  const sameCurrency = toWallet && walletCurrency.get(toWallet) === walletCurrency.get(template.wallet_fk)
  subs.push([
    id,
    toWallet ? `${walletName.get(template.wallet_fk)} → ${walletName.get(toWallet)}` : key.split("|")[0],
    template.wallet_fk,
    toWallet ? "transfer" : template.category_fk,
    Math.round(template.amount * 100),
    toWallet ? transferNote(template.note) : template.note.trim(),
    every,
    unit,
    start,
    end && end < start && unpaid.length ? start : end,
    1,
    template.type === 2 ? "repetitive" : "subscription",
    toWallet,
    toWallet && !sameCurrency ? Math.round(to!.amount * 100) : null,
  ])
  const used = new Set<string>()
  for (const t of paid) {
    const d = day(t.date_created)
    subOf.set(t.transaction_pk, { id, due: used.has(d) ? null : d })
    used.add(d)
  }
  for (const t of unpaid) subOf.set(t.transaction_pk, { id, due: null })
}
insert(
  "subscriptions",
  [
    "id",
    "name",
    "wallet_id",
    "category_id",
    "amount",
    "note",
    "every",
    "unit",
    "start_day",
    "end_day",
    "auto_pay",
    "kind",
    "to_wallet_id",
    "to_amount",
  ],
  subs
)

insert(
  "transactions",
  [
    "id",
    "wallet_id",
    "category_id",
    "subcategory_id",
    "name",
    "note",
    "amount",
    "date",
    "paid",
    "kind",
    "subscription_id",
    "due_day",
    "transfer_id",
    "created_at",
    "updated_at",
  ],
  txs
    .filter((t) => !((t.type === 1 || t.type === 2) && !t.paid)) // projected from the subscription instead
    .map((t) => [
      t.transaction_pk,
      t.wallet_fk,
      transferOf.has(t.transaction_pk) ? "transfer" : t.category_fk,
      t.sub_category_fk,
      transferOf.has(t.transaction_pk) ? "" : t.name.trim(),
      transferOf.has(t.transaction_pk) ? transferNote(t.note) : t.note.trim(),
      Math.round(t.amount * 100),
      t.date_created,
      t.paid,
      t.type === null ? null : (KINDS[t.type] ?? null),
      subOf.get(t.transaction_pk)?.id ?? null,
      subOf.get(t.transaction_pk)?.due ?? null,
      transferOf.get(t.transaction_pk) ?? null,
      t.date_created,
      t.date_time_modified ?? t.date_created,
    ])
)

// Look up the market rate on the day of each currency exchange, so its cost can be compared later.
const fxRows: unknown[][] = []
const rateCache = new Map<string, number | null>()
for (const [outPk, inRow] of partner) {
  const out = txs.find((t) => t.transaction_pk === outPk)!
  const [from, to] = [walletCurrency.get(out.wallet_fk)!, walletCurrency.get(inRow.wallet_fk)!]
  if (from === to) continue
  const d = day(out.date_created)
  const key = `${d}|${from}|${to}`
  if (!rateCache.has(key)) {
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/${from}.json`)
      rateCache.set(
        key,
        res.ok ? (((await res.json()) as Record<string, Record<string, number>>)[from]?.[to] ?? null) : null
      )
    } catch {
      rateCache.set(key, null)
    }
  }
  fxRows.push([transferOf.get(outPk)!, 0, null, "", rateCache.get(key) ?? null])
}
insert("transfers", ["id", "fee", "fee_tx_id", "provider", "market_rate"], fxRows)

const seen = new Set<string>()
insert(
  "title_rules",
  ["title", "category_id", "exact"],
  rows(`select * from associated_titles where archived = 0 order by "order"`)
    .filter((a) => {
      const k = a.title.trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((a) => [a.title.trim(), a.category_fk, a.is_exact_match])
)

const settings = JSON.parse(rows(`select settings_j_s_o_n s from app_settings limit 1`)[0]?.s ?? "{}")
if (settings.lastWalletCurrencyCode)
  insert(
    "settings",
    ["key", "value"],
    [["primary_currency", String(settings.lastWalletCurrencyCode).toLowerCase()]],
    " ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
  )
insert(
  "settings",
  ["key", "value"],
  [["timezone", tz]],
  " ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
)
// Opening balances need category '0' and transfers need the other two, whatever the backup has.
insert(
  "categories",
  ["id", "name", "icon", "income", "sort"],
  [
    ["0", "Balance correction", "⚖️", 0, 997],
    ["transfer_fee", "Transfer fees", "💱", 0, 998],
    ["transfer", "Transfer", "↔️", 0, 999],
  ],
  " ON CONFLICT(user_id, id) DO NOTHING"
)
