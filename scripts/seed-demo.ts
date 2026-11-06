// Creates (or resets) a demo account with about 14 months of made-up data ending today, so the app
// can be tried and tested without real finances.
//   node scripts/seed-demo.ts > demo.sql
//   npx wrangler d1 execute kosha --local --file demo.sql
// Sign in as demo@kosha.local / kosha-demo-2026. Re-running deletes the demo account and starts over.
import { hashPassword } from "better-auth/crypto"
import { DEFAULT_CATEGORIES } from "../src/lib/defaults.ts"

const UID = "demo"
const EMAIL = "demo@kosha.local"
const PASSWORD = "kosha-demo-2026"
const TZ = "Europe/Berlin"

// ---------- helpers ----------

let seed = 7
/** Deterministic random in [0, 1), so every run makes the same data. */
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) // euros in, cents out
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

const today = new Date().toISOString().slice(0, 10)
const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
}
const monthDay = (monthsAgo: number, day: number) => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day)).toISOString().slice(0, 10)
}
/** Unix seconds at `hour` o'clock Berlin time (ignoring summer time: good enough for a day). */
const unix = (day: string, hour = 12) => Date.parse(`${day}T00:00:00Z`) / 1000 + (hour - 1) * 3600

const lit = (v: unknown): string =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`
const out: string[] = []
function insert(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = ["user_id", ...Object.keys(rows[0])]
  for (let i = 0; i < rows.length; i += 100)
    out.push(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${rows
        .slice(i, i + 100)
        .map((r) => `(${[UID, ...Object.values(r)].map(lit).join(", ")})`)
        .join(",\n")};`
    )
}

// ---------- accounts ----------

const W = { main: "main", savings: "savings", cash: "cash", card: "card", india: "india", etf: "etf", old: "old" }
insert("wallets", [
  {
    id: W.main,
    name: "Girokonto",
    currency: "eur",
    colour: "#2563eb",
    sort: 1,
    archived: 0,
    type: "bank",
    credit_limit: null,
  },
  {
    id: W.savings,
    name: "Savings",
    currency: "eur",
    colour: "#16a34a",
    sort: 2,
    archived: 0,
    type: "bank",
    credit_limit: null,
  },
  {
    id: W.cash,
    name: "Cash",
    currency: "eur",
    colour: "#ca8a04",
    sort: 3,
    archived: 0,
    type: "cash",
    credit_limit: null,
  },
  {
    id: W.card,
    name: "Credit card",
    currency: "eur",
    colour: "#dc2626",
    sort: 4,
    archived: 0,
    type: "credit",
    credit_limit: 300000,
  },
  {
    id: W.india,
    name: "HDFC (India)",
    currency: "inr",
    colour: "#ea580c",
    sort: 5,
    archived: 0,
    type: "bank",
    credit_limit: null,
  },
  {
    id: W.etf,
    name: "ETF portfolio",
    currency: "eur",
    colour: "#7c3aed",
    sort: 6,
    archived: 0,
    type: "investment",
    credit_limit: null,
  },
  {
    id: W.old,
    name: "Old bank (closed)",
    currency: "eur",
    colour: null,
    sort: 7,
    archived: 1,
    type: "bank",
    credit_limit: null,
  },
])

// ---------- categories ----------

insert("categories", [
  ...DEFAULT_CATEGORIES.map((c, i) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    income: c.income,
    parent_id: null,
    sort: i,
  })),
  { id: "coffee", name: "Coffee", icon: "☕", income: 0, parent_id: "dining", sort: 100 },
  { id: "electronics", name: "Electronics", icon: "💻", income: 0, parent_id: "shopping", sort: 101 },
])
insert("settings", [
  { key: "primary_currency", value: "eur" },
  { key: "timezone", value: TZ },
])
insert(
  "title_rules",
  [
    ["REWE", "groceries"],
    ["Lidl", "groceries"],
    ["Edeka", "groceries"],
    ["Starbucks", "dining"],
    ["Vapiano", "dining"],
    ["DB Ticket", "transit"],
    ["Amazon", "shopping"],
    ["IKEA", "home"],
    ["Apotheke", "health"],
    ["BigBasket", "groceries"],
  ].map(([title, category_id]) => ({ title, category_id, exact: 0 }))
)

// ---------- transactions ----------

type Tx = {
  id: string
  wallet_id: string
  category_id: string
  subcategory_id?: string | null
  name: string
  note?: string
  amount: number
  date: number
  paid?: number
  kind?: string | null
  subscription_id?: string | null
  due_day?: string | null
  transfer_id?: string | null
  tags?: string[]
  event_id?: string | null
}
const txs: Tx[] = []
let n = 0
const tx = (t: Omit<Tx, "id"> & { id?: string }) => txs.push({ id: t.id ?? `t${++n}`, ...t })
const transfers: { id: string; fee: number; fee_tx_id: string | null; provider: string; market_rate: number | null }[] =
  []
function transfer(o: {
  from: string
  to: string
  sent: number
  received?: number
  day: string
  note?: string
  fee?: number
  provider?: string
  rate?: number
  sub?: string
}) {
  const id = o.sub ? `${o.sub}:${o.day}` : `x${++n}`
  const date = unix(o.day, 10)
  const fee = o.fee ?? 0
  const leg = {
    category_id: "transfer",
    name: "",
    note: o.note ?? "",
    date,
    transfer_id: id,
    kind: o.sub ? "repetitive" : null,
  }
  tx({
    ...leg,
    id: `${id}:out`,
    wallet_id: o.from,
    amount: -(o.sent - fee),
    subscription_id: o.sub ?? null,
    due_day: o.sub ? o.day : null,
  })
  tx({ ...leg, id: `${id}:in`, wallet_id: o.to, amount: o.received ?? o.sent - fee })
  if (fee)
    tx({
      id: `${id}:fee`,
      wallet_id: o.from,
      category_id: "transfer_fee",
      name: `${o.provider} fee`,
      amount: -fee,
      date,
    })
  if (fee || o.rate)
    transfers.push({
      id,
      fee,
      fee_tx_id: fee ? `${id}:fee` : null,
      provider: o.provider ?? "",
      market_rate: o.rate ?? null,
    })
}

const MONTHS = 14
const start = monthDay(MONTHS, 1)
const opening = addDays(start, -1)
tx({ wallet_id: W.main, category_id: "0", name: "Opening balance", amount: 420000, date: unix(opening) })
tx({ wallet_id: W.savings, category_id: "0", name: "Opening balance", amount: 850000, date: unix(opening) })
tx({ wallet_id: W.cash, category_id: "0", name: "Opening balance", amount: 12000, date: unix(opening) })
tx({ wallet_id: W.card, category_id: "0", name: "Opening balance", amount: 300000, date: unix(opening) }) // full credit available
tx({ wallet_id: W.india, category_id: "0", name: "Opening balance", amount: 4500000, date: unix(opening) })
tx({ wallet_id: W.etf, category_id: "0", name: "Opening balance", amount: 600000, date: unix(opening) })
// The closed account: money moved out, then archived.
tx({ wallet_id: W.old, category_id: "0", name: "Opening balance", amount: 98000, date: unix(opening) })
transfer({ from: W.old, to: W.main, sent: 98000, day: addDays(start, 4), note: "Closing old account" })

for (let m = MONTHS; m >= 0; m--) {
  const d = (day: number) => monthDay(m, day)
  const past = (day: string) => day <= today
  const salaryDay = d(1)
  if (past(salaryDay))
    tx({
      wallet_id: W.main,
      category_id: "salary",
      name: "Acme GmbH",
      note: "Salary",
      amount: 385000,
      date: unix(salaryDay, 8),
    })

  // Groceries about weekly, mostly from the main account, some in cash.
  for (let day = 2; day <= 28; day += 4 + Math.floor(rand() * 4)) {
    const when = d(day)
    if (!past(when)) break
    const cash = rand() < 0.25
    tx({
      wallet_id: cash ? W.cash : W.main,
      category_id: "groceries",
      name: pick(["REWE", "Lidl", "Edeka"]),
      amount: -between(cash ? 8 : 25, cash ? 30 : 95),
      date: unix(when, 18),
    })
  }
  // Eating out and coffee, on the card.
  for (let i = 0; i < 4 + Math.floor(rand() * 4); i++) {
    const when = d(1 + Math.floor(rand() * 27))
    if (!past(when)) continue
    const coffee = rand() < 0.4
    tx({
      wallet_id: W.card,
      category_id: "dining",
      subcategory_id: coffee ? "coffee" : null,
      name: coffee ? "Starbucks" : pick(["Vapiano", "Sushi Circle", "Pizzeria Napoli", "Thai Express"]),
      amount: -(coffee ? between(3, 7) : between(14, 58)),
      date: unix(when, 13),
    })
  }
  // Shopping, now and then something bigger.
  const shopDay = d(5 + Math.floor(rand() * 20))
  if (past(shopDay))
    tx({
      wallet_id: W.card,
      category_id: "shopping",
      name: "Amazon",
      amount: -between(15, 120),
      date: unix(shopDay, 20),
    })
  if (m % 4 === 2) {
    const big = d(12)
    if (past(big))
      tx({
        wallet_id: W.card,
        category_id: "shopping",
        subcategory_id: "electronics",
        name: "MediaMarkt",
        note: "New headphones",
        amount: -between(180, 320),
        date: unix(big, 16),
      })
  }
  if (m % 3 === 0) {
    const when = d(9)
    if (past(when))
      tx({ wallet_id: W.main, category_id: "home", name: "IKEA", amount: -between(40, 210), date: unix(when, 15) })
  }
  if (rand() < 0.5) {
    const when = d(15)
    if (past(when))
      tx({ wallet_id: W.cash, category_id: "health", name: "Apotheke", amount: -between(6, 25), date: unix(when, 11) })
  }
  if (m === 7 || m === 2) {
    const when = d(18)
    if (past(when))
      tx({
        wallet_id: W.card,
        category_id: "travel",
        name: m === 7 ? "Lufthansa" : "Deutsche Bahn",
        note: m === 7 ? "Summer holiday" : "Weekend in Hamburg",
        amount: -between(140, 480),
        date: unix(when, 9),
      })
  }
  if (m === 11)
    tx({ wallet_id: W.main, category_id: "gifts", name: "Birthday present", amount: -6500, date: unix(d(20)) })
  // Side income and a refund.
  if (m % 5 === 1) {
    const when = d(22)
    if (past(when))
      tx({
        wallet_id: W.main,
        category_id: "other_income",
        name: "Freelance invoice",
        note: "Website for a friend",
        amount: between(300, 700),
        date: unix(when, 9),
      })
  }
  if (m === 4)
    tx({ wallet_id: W.card, category_id: "shopping", name: "Amazon", note: "Refund", amount: 3499, date: unix(d(25)) })

  // India: spending in rupees.
  for (let i = 0; i < 2; i++) {
    const when = d(6 + i * 12)
    if (past(when))
      tx({
        wallet_id: W.india,
        category_id: i ? "dining" : "groceries",
        name: i ? "Swiggy" : "BigBasket",
        amount: -between(600, 2400),
        date: unix(when, 14),
      })
  }

  // Cash from the ATM every other month.
  if (m % 2 === 0) {
    const when = d(10)
    if (past(when)) transfer({ from: W.main, to: W.cash, sent: 20000, day: when, note: "ATM" })
  }
  // Pay off the card: this month's spending so far, plus about what the card subscriptions cost.
  const payDay = d(27)
  if (past(payDay)) {
    const spent = txs
      .filter((t) => t.wallet_id === W.card && t.date >= unix(d(1)) && t.date < unix(payDay))
      .reduce((sum, t) => sum - t.amount, 0)
    if (spent > 0) transfer({ from: W.main, to: W.card, sent: spent + 2500, day: payDay, note: "Card bill" })
  }
}

// Money lent and borrowed, plus things still to pay.
tx({
  wallet_id: W.main,
  category_id: "gifts",
  name: "Lent to Sam",
  note: "Concert tickets, pays back next month",
  amount: -9000,
  date: unix(monthDay(1, 14)),
  kind: "credit",
})
tx({
  wallet_id: W.cash,
  category_id: "dining",
  name: "Borrowed from Alex",
  amount: 4000,
  date: unix(monthDay(2, 3)),
  kind: "debt",
})
tx({
  wallet_id: W.main,
  category_id: "bills",
  name: "Car service",
  amount: -34000,
  date: unix(addDays(today, 9)),
  paid: 0,
  kind: "upcoming",
})
tx({
  wallet_id: W.card,
  category_id: "entertainment",
  name: "Festival tickets",
  amount: -18900,
  date: unix(addDays(today, 21)),
  paid: 0,
  kind: "upcoming",
})
tx({
  wallet_id: W.main,
  category_id: "bills",
  name: "Dentist bill",
  note: "Overdue",
  amount: -8500,
  date: unix(addDays(today, -3)),
  paid: 0,
  kind: "upcoming",
})

// ---------- recurring ----------

type Sub = {
  id: string
  name: string
  wallet_id: string
  category_id: string
  amount: number
  every?: number
  unit: string
  start_day: string
  end_day?: string | null
  auto_pay?: number
  kind?: string
  to_wallet_id?: string | null
  to_amount?: number | null
  variable?: number
  note?: string
}
const subs: Sub[] = [
  {
    id: "rent",
    name: "Rent",
    wallet_id: W.main,
    category_id: "home",
    amount: -115000,
    unit: "month",
    start_day: monthDay(MONTHS, 3),
    kind: "repetitive",
  },
  {
    id: "ticket",
    name: "Deutschlandticket",
    wallet_id: W.main,
    category_id: "transit",
    amount: -5800,
    unit: "month",
    start_day: monthDay(MONTHS, 1),
  },
  {
    id: "phone",
    name: "Phone plan",
    wallet_id: W.main,
    category_id: "bills",
    amount: -1999,
    unit: "month",
    start_day: monthDay(MONTHS, 8),
  },
  {
    id: "netflix",
    name: "Netflix",
    wallet_id: W.card,
    category_id: "entertainment",
    amount: -1399,
    unit: "month",
    start_day: monthDay(MONTHS, 12),
  },
  {
    id: "spotify",
    name: "Spotify",
    wallet_id: W.card,
    category_id: "entertainment",
    amount: -1099,
    unit: "month",
    start_day: monthDay(MONTHS, 16),
  },
  {
    id: "gym",
    name: "Gym",
    wallet_id: W.main,
    category_id: "health",
    amount: -2990,
    unit: "month",
    start_day: monthDay(MONTHS, 5),
  },
  {
    id: "cloud",
    name: "Cloud storage",
    wallet_id: W.card,
    category_id: "bills",
    amount: -299,
    unit: "month",
    start_day: monthDay(MONTHS, 20),
    end_day: monthDay(3, 20),
    note: "Cancelled",
  },
  {
    id: "domain",
    name: "Domain renewal",
    wallet_id: W.card,
    category_id: "bills",
    amount: -1500,
    unit: "year",
    start_day: monthDay(10, 2),
  },
  {
    id: "insurance",
    name: "Liability insurance",
    wallet_id: W.main,
    category_id: "bills",
    amount: -6400,
    unit: "year",
    start_day: addDays(today, 12),
    auto_pay: 0,
    note: "Pay by bank transfer",
  },
  {
    id: "cleaning",
    name: "Cleaner",
    wallet_id: W.cash,
    category_id: "home",
    amount: -4000,
    every: 2,
    unit: "week",
    start_day: addDays(monthDay(2, 1), 2),
    kind: "repetitive",
  },
  // Recurring transfers
  {
    id: "save",
    name: "Girokonto → Savings",
    wallet_id: W.main,
    category_id: "transfer",
    amount: -50000,
    unit: "month",
    start_day: monthDay(MONTHS, 2),
    kind: "repetitive",
    to_wallet_id: W.savings,
  },
  {
    id: "invest",
    name: "Girokonto → ETF portfolio",
    wallet_id: W.main,
    category_id: "transfer",
    amount: -30000,
    unit: "month",
    start_day: monthDay(MONTHS, 5),
    kind: "repetitive",
    to_wallet_id: W.etf,
  },
  {
    id: "family",
    name: "Girokonto → HDFC (India)",
    wallet_id: W.main,
    category_id: "transfer",
    amount: -25000,
    unit: "month",
    start_day: monthDay(MONTHS, 15),
    kind: "repetitive",
    to_wallet_id: W.india,
    variable: 1,
    note: "Family support via Wise",
  },
]
insert(
  "subscriptions",
  subs.map((s) => ({
    id: s.id,
    name: s.name,
    wallet_id: s.wallet_id,
    category_id: s.category_id,
    amount: s.amount,
    note: s.note ?? "",
    every: s.every ?? 1,
    unit: s.unit,
    start_day: s.start_day,
    end_day: s.end_day ?? null,
    auto_pay: s.auto_pay ?? 1,
    kind: s.kind ?? "subscription",
    to_wallet_id: s.to_wallet_id ?? null,
    to_amount: s.to_amount ?? null,
    variable: s.variable ?? 0,
  }))
)
// Fixed-amount subscriptions with auto-pay are recorded by the app on first load. Seed the exceptions:
// a skipped gym month, a one-off Netflix price, and the variable rupee transfers (paid by hand, through Wise).
const gymSkip = monthDay(4, 5)
tx({
  id: "gym-skip",
  wallet_id: W.main,
  category_id: "health",
  name: "Gym",
  note: "On holiday",
  amount: -2990,
  date: unix(gymSkip),
  paid: 0,
  kind: "skipped",
  subscription_id: "gym",
  due_day: gymSkip,
})
const netflixPromo = monthDay(6, 12)
tx({
  id: "netflix-promo",
  wallet_id: W.card,
  category_id: "entertainment",
  name: "Netflix",
  note: "Discount month",
  amount: -699,
  date: unix(netflixPromo),
  paid: 1,
  kind: "subscription",
  subscription_id: "netflix",
  due_day: netflixPromo,
})
for (let m = MONTHS; m >= 1; m--) {
  const due = monthDay(m, 15)
  if (due > today) continue
  const rate = 89 + rand() * 4 // INR per EUR
  const sent = between(220, 300)
  const fee = Math.round(sent * 0.006) + 50
  transfer({
    from: W.main,
    to: W.india,
    sent,
    received: Math.round((sent - fee) * rate * 0.997),
    day: due,
    fee,
    provider: "Wise",
    rate,
    sub: "family",
  })
}
// A one-off exchange at the bank, for comparing providers.
const bankFx = monthDay(9, 8)
transfer({
  from: W.savings,
  to: W.india,
  sent: 100000,
  received: Math.round(100000 * 86.1),
  day: bankFx,
  fee: 1500,
  provider: "Bank",
  rate: 90.4,
  note: "Laptop for parents",
})

// An event: last month's weekend in Lisbon, with the spending filed under it and tagged.
const lisbon = monthDay(1, 12)
insert("events", [{ id: "lisbon", name: "Lisbon weekend", start_day: lisbon, end_day: addDays(lisbon, 3) }])
for (const [i, name, category_id, amount] of [
  [0, "TAP Air Portugal", "travel", -18640],
  [0, "Hotel Alfama", "travel", -31200],
  [1, "Time Out Market", "dining", -3870],
  [1, "Carris tram", "transit", -960],
  [2, "Pastéis de Belém", "dining", -1250],
  [3, "A Vida Portuguesa", "shopping", -4290],
] as const)
  tx({
    wallet_id: W.card,
    category_id,
    name,
    amount,
    date: unix(addDays(lisbon, i), 13),
    event_id: "lisbon",
    tags: ["travel", "portugal"],
  })
// Tag work lunches so the tag filter has something to show.
for (const t of txs.filter((t) => t.category_id === "dining" && !t.event_id).slice(-6)) t.tags = ["work"]

insert(
  "transactions",
  txs.map((t) => ({
    id: t.id,
    wallet_id: t.wallet_id,
    category_id: t.category_id,
    subcategory_id: t.subcategory_id ?? null,
    name: t.name,
    note: t.note ?? "",
    amount: t.amount,
    date: t.date,
    paid: t.paid ?? 1,
    kind: t.kind ?? null,
    subscription_id: t.subscription_id ?? null,
    due_day: t.due_day ?? null,
    transfer_id: t.transfer_id ?? null,
    tags: JSON.stringify(t.tags ?? []),
    event_id: t.event_id ?? null,
    created_at: t.date,
    updated_at: t.date,
  }))
)
insert("transfers", transfers)

// Investment gains, entered every quarter.
const valuations = [3, 6, 9, 12].map((ago, i) => {
  const day = monthDay(ago, 28)
  const invested = 600000 + (MONTHS - ago) * 30000
  return { id: `v${i}`, wallet_id: W.etf, day, gain: [88000, 63000, 12000, 41000][i], invested, note: "" }
})
insert("valuations", valuations)

// ---------- output ----------

const now = new Date().toISOString()
const hash = await hashPassword(PASSWORD)
console.log("PRAGMA defer_foreign_keys = on;")
for (const t of [
  "ai_log",
  "ai_providers",
  "transfers",
  "valuations",
  "title_rules",
  "transactions",
  "events",
  "subscriptions",
  "settings",
  "categories",
  "wallets",
])
  console.log(`DELETE FROM ${t} WHERE user_id = '${UID}';`)
// Sessions, accounts and passkeys cascade. Only ever the demo id: if someone else owns the email, the insert fails.
console.log(`DELETE FROM "user" WHERE id = '${UID}';`)
console.log(
  `INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${UID}', 'Demo', '${EMAIL}', 1, NULL, '${now}', '${now}');`
)
console.log(
  `INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES ('demo-credential', '${UID}', 'credential', '${UID}', '${hash}', '${now}', '${now}');`
)
console.log(out.join("\n"))
