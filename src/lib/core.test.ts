// node src/lib/core.test.ts
import assert from "node:assert/strict"
import {
  convert,
  cumulative,
  daysInMonth,
  guessCategory,
  monthRange,
  parseAmount,
  unixOf,
  dayOf,
  usualCurve,
} from "./core.ts"

assert.equal(parseAmount("12,50"), 1250)
assert.equal(parseAmount("-1.234,56"), -123456)
assert.equal(parseAmount("1,234.5"), 123450)
assert.equal(parseAmount("€ 45"), 4500)
assert.equal(parseAmount("1,234"), 123400)
assert.equal(parseAmount("500.00 Dr"), -50000)
assert.equal(parseAmount("abc"), null)

assert.equal(Math.round(convert(10000, "eur", "inr", { eur: 0.9, inr: 90 })), 1000000)

const tz = "Europe/Berlin"
assert.equal(dayOf(unixOf("2026-11-05", tz, 0), tz), "2026-11-05")
assert.equal(dayOf(unixOf("2026-07-01", tz, 0), tz), "2026-07-01")
const [s, e] = monthRange("2026-12", tz)
assert.equal(dayOf(s, tz), "2026-12-01")
assert.equal(dayOf(e - 1, tz), "2026-12-31")

const rules = [
  { title: "rewe", category_id: "groceries", exact: 0 },
  { title: "rewe to go", category_id: "dining", exact: 0 },
  { title: "o2", category_id: "utilities", exact: 1 },
]
assert.equal(guessCategory("REWE To Go Berlin", rules), "dining")
assert.equal(guessCategory("Rewe Markt", rules), "groceries")
assert.equal(guessCategory("o2 shop", rules), null)

assert.equal(daysInMonth("2026-02"), 28)
assert.equal(daysInMonth("2024-02"), 29)
assert.equal(daysInMonth("2026-11"), 30)
assert.deepEqual(cumulative([1, 0, 2]), [1, 1, 3])
assert.deepEqual(
  usualCurve(
    [
      [1, 2, 3],
      [2, 4],
    ],
    3
  ),
  [1.5, 3, 3.5]
)
assert.equal(usualCurve([], 30), null)

console.log("core ok")

// subscriptions
import { instances, monthlyCost, nextOccurrence, occurrence, occurrencesBetween } from "./core.ts"
const monthly = { start_day: "2026-01-31", every: 1, unit: "month" as const, end_day: null }
assert.equal(occurrence(monthly, 1), "2026-02-28")
assert.equal(occurrence(monthly, 2), "2026-03-31")
assert.equal(occurrence({ ...monthly, start_day: "2024-02-29", unit: "year" }, 1), "2025-02-28")
assert.equal(occurrence({ ...monthly, unit: "week", every: 2 }, 1), "2026-02-14")
assert.deepEqual(occurrencesBetween({ ...monthly, end_day: "2026-03-15" }, "2026-01-01", "2026-12-31"), [
  "2026-01-31",
  "2026-02-28",
])
assert.equal(nextOccurrence(monthly, "2026-03-01"), "2026-03-31")
assert.equal(nextOccurrence({ ...monthly, end_day: "2026-02-01" }, "2026-03-01"), null)
assert.equal(Math.round(monthlyCost(-1200, 1, "year")), -100)

const sub = { start_day: "2026-09-10", every: 1, unit: "month" as const, end_day: null, amount: -999, note: "" }
const inst = instances(
  sub,
  [
    { id: "p", due_day: "2026-09-10", day: "2026-09-10", amount: -999, paid: 1, kind: null, note: "" },
    { id: "s", due_day: "2026-12-10", day: "2026-12-10", amount: -999, paid: 0, kind: "skipped", note: "" },
    { id: "e", due_day: "2027-01-10", day: "2027-01-12", amount: -1299, paid: 0, kind: null, note: "price up" },
  ],
  "2026-11-10",
  4
)
assert.deepEqual(
  inst.map((i) => `${i.due_day}:${i.status}`),
  ["2026-10-10:overdue", "2026-11-10:due", "2026-12-10:skipped", "2027-01-10:upcoming", "2027-02-10:upcoming"]
)
assert.equal(inst[3].amount, -1299)
assert.equal(inst[3].day, "2027-01-12")
assert.equal(inst[3].edited, true)

console.log("subscriptions ok")

// net worth
import { accountWorth, netWorth } from "./core.ts"
const card = { type: "credit" as const, currency: "eur", balance: 458557, credit_limit: 600000, gain: null }
const fund = { type: "investment" as const, currency: "eur", balance: 2445438, credit_limit: null, gain: 120000 }
const bank = { type: "bank" as const, currency: "inr", balance: 9000, credit_limit: null, gain: null }
assert.equal(accountWorth(card), -141443)
assert.equal(accountWorth(fund), 2565438)
const nw = netWorth([card, fund, bank], "eur", { eur: 1, inr: 90 })
assert.equal(Math.round(nw.total), -141443 + 2565438 + 100)
assert.equal(nw.debt, 141443)
assert.equal(nw.gains, 120000)
console.log("net worth ok")

// currency exchange: send €1,000 via Wise, €5 fee, €995 converted at 106.00 (market 106.50)
import { exchange } from "./core.ts"
const fx = exchange(100000, 500, 10547000, 106.5)
assert.equal(fx.converted, 99500)
assert.equal(fx.rate.toFixed(2), "106.00")
assert.equal(Math.round(fx.rateCost!), 467) // ≈ €4.67 lost to the rate
assert.equal(Math.round(fx.totalCost), 967)
assert.equal(fx.costPct.toFixed(2), "0.97")
assert.equal(exchange(100000, 0, 100000, null).totalCost, 0)
console.log("exchange ok")

// quick add: "29.57 dosaking dining visa"
import { parseQuickAdd } from "./quick-add.ts"
const qw = [
  { id: "v", name: "Visa Card" },
  { id: "n", name: "N26" },
]
const qc = [
  { id: "dining", name: "Dining" },
  { id: "groceries", name: "Groceries" },
]
const qa = parseQuickAdd("29,57 Dosaking dining visa yesterday", qw, qc)
assert.deepEqual(qa, {
  amount: 2957,
  income: false,
  date: "yesterday",
  walletId: "v",
  categoryId: "dining",
  payee: "Dosaking",
  tags: [],
})
const qt = parseQuickAdd("12 #Trip lunch #trip #rome-2026", qw, qc)
assert.deepEqual(qt.tags, ["trip", "rome-2026"])
assert.equal(qt.payee, "lunch")
const qi = parseQuickAdd("+4200 salary n26 di", qw, qc)
assert.equal(qi.amount, 420000)
assert.equal(qi.income, true)
assert.equal(qi.walletId, "n")
assert.equal(qi.categoryId, null) // "di" is under 3 letters
assert.equal(qi.payee, "salary di")
assert.equal(parseQuickAdd("rewe", qw, qc).amount, null)
console.log("quick add ok")

// tags and events
import { eventFor, parseTags, tagList } from "./core.ts"
assert.deepEqual(parseTags("#Trip, food  #trip Café! ##x"), ["trip", "food", "café", "x"])
assert.deepEqual(parseTags(" , # "), [])
assert.deepEqual(tagList('["a","b"]'), ["a", "b"])
assert.deepEqual(tagList("not json"), [])
assert.deepEqual(tagList(null), [])
const evs = [
  { id: "year", start_day: "2026-01-01", end_day: "2026-12-31" },
  { id: "rome", start_day: "2026-11-03", end_day: "2026-11-10" },
  { id: "open", start_day: "2026-12-20", end_day: null },
  { id: "undated", start_day: null, end_day: null },
]
assert.equal(eventFor("2026-11-05", evs), "rome") // overlapping: the later start wins
assert.equal(eventFor("2026-11-10", evs), "rome") // end day included
assert.equal(eventFor("2026-11-11", evs), "year")
assert.equal(eventFor("2027-02-01", evs), "open") // no end: still going
assert.equal(eventFor("2025-06-01", evs), null)
console.log("tags and events ok")

// preferences
import { parsePrefs } from "./core.ts"
assert.deepEqual(parsePrefs({}), {
  theme: "system",
  layout: "boxed",
  motion: "on",
  accent: "teal",
  density: "comfortable",
  figures: "mono",
  hide_amounts: "0",
  round_hero: "0",
  default_wallet: "last",
  add_kind: "expense",
  suggest_category: "1",
  default_auto_pay: "1",
  upcoming_horizon: "month",
  learn_rules: "1",
  ai_enabled: "0",
  ai_share_amount: "1",
  ai_share_payee: "1",
  ai_share_date: "1",
  ai_share_note: "0",
  ai_share_account: "0",
  ai_log_enabled: "1",
  backup_codes_saved_at: null,
})
assert.equal(parsePrefs({ backup_codes_saved_at: "1767225600" }).backup_codes_saved_at, "1767225600")
assert.equal(parsePrefs({ backup_codes_saved_at: "soon" }).backup_codes_saved_at, null)
assert.equal(parsePrefs({ motion: "reduced", accent: "pink" }).motion, "reduced")
assert.equal(parsePrefs({ accent: "pink" }).accent, "teal")
// Violet was removed as an accent, so accounts that picked it fall back to teal.
assert.equal(parsePrefs({ accent: "violet" }).accent, "teal")
assert.equal(parsePrefs({ theme: "dark", layout: "wide" }).layout, "boxed")
assert.equal(parsePrefs({ theme: "dark" }).theme, "dark")
console.log("prefs ok")

// what AI can see
import { redactForAi } from "./core.ts"
const aiTx = { payee: "Dosaking", amount: -2957, currency: "eur", day: "2026-11-04", note: "via Wolt", account: "Visa" }
const all = { amount: true, payee: true, date: true, note: true, account: true }
assert.deepEqual(redactForAi(aiTx, all, "u1"), {
  payee: "Dosaking",
  amount: -29.57,
  currency: "EUR",
  date: "2026-11-04",
  note: "via Wolt",
  account: "Visa",
})
const none = { amount: false, payee: false, date: false, note: false, account: false }
const hidden = redactForAi(aiTx, none, "u1")
assert.deepEqual(Object.keys(hidden), ["payee", "amount", "currency", "month"])
assert.equal(hidden.amount, null)
assert.equal(hidden.month, "2026-11")
assert.match(String(hidden.payee), /^payee_[0-9a-z]+$/)
// Stable per user and payee (case-insensitive), different across users.
assert.equal(redactForAi({ ...aiTx, payee: "DOSAKING" }, none, "u1").payee, hidden.payee)
assert.notEqual(redactForAi(aiTx, none, "u2").payee, hidden.payee)
console.log("ai redaction ok")

// ---------- public API contract ----------

import { OPERATIONS, matchRoute, openApiSpec, operations, parseQuery } from "./api-contract.ts"

const routes = new Set<string>()
for (const [name, o] of operations) {
  assert.match(name, /^[a-z]+(_[a-z]+)+$/, `${name}: tool names are snake_case verb_noun`)
  assert.ok(name.length <= 64, `${name}: at most 64 characters for Claude's directory`)
  assert.ok(!routes.has(`${o.method} ${o.path}`), `${name}: duplicate route`)
  routes.add(`${o.method} ${o.path}`)
  for (const p of o.path.matchAll(/\{(\w+)\}/g)) assert.ok(p[1] in o.input.shape, `${name}: path field ${p[1]}`)
  // The documented examples must be true: inputs parse, outputs match their schema exactly.
  const input = o.input.safeParse(o.example.input)
  assert.ok(input.success, `${name} example input: ${input.error?.message}`)
  for (const k of Object.keys(o.example.input)) assert.ok(k in o.input.shape, `${name} example input: unknown ${k}`)
  assert.deepEqual(o.output.parse(o.example.output), o.example.output, `${name} example output has unknown fields`)
  assert.equal(o.scope === "read", o.method === "GET", `${name}: GET reads, everything else writes`)
}
assert.ok(operations.length <= 40, "Cursor passes only the first 40 tools to its agent")

assert.equal(matchRoute("POST", "/transactions")?.name, "create_transactions")
assert.equal(matchRoute("POST", "/transactions/delete")?.name, "delete_transactions")
assert.deepEqual(matchRoute("PATCH", "/recurring/s%201/payments/2026-11-15/"), {
  name: "update_recurring_payment",
  op: OPERATIONS.update_recurring_payment,
  params: { id: "s 1", dueDay: "2026-11-15" },
})
assert.equal(matchRoute("DELETE", "/transactions"), null)

const q = parseQuery(
  OPERATIONS.search_transactions,
  new URLSearchParams("limit=20&includeCorrections=true&query=12.50&from=2026-01-01")
)
assert.deepEqual(q, { limit: 20, includeCorrections: true, query: "12.50", from: "2026-01-01" })
assert.ok(OPERATIONS.search_transactions.input.safeParse(q).success)

const spec = openApiSpec("https://kosha.example")
assert.equal(spec.servers[0].url, "https://kosha.example/api/v1")
assert.equal(Object.values(spec.paths).flatMap((p) => Object.keys(p)).length, operations.length)
const post = spec.paths["/transactions"].post as {
  requestBody: { content: { "application/json": { example: unknown } } }
}
assert.deepEqual(post.requestBody.content["application/json"].example, OPERATIONS.create_transactions.example.input)
const patch = spec.paths["/accounts/{id}"].patch as { parameters: { name: string; in: string }[]; requestBody: unknown }
assert.deepEqual(
  patch.parameters.map((p) => `${p.in}:${p.name}`),
  ["path:id"]
)
console.log(`api contract ok (${operations.length} operations)`)
