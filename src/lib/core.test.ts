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
})
const qi = parseQuickAdd("+4200 salary n26 di", qw, qc)
assert.equal(qi.amount, 420000)
assert.equal(qi.income, true)
assert.equal(qi.walletId, "n")
assert.equal(qi.categoryId, null) // "di" is under 3 letters
assert.equal(qi.payee, "salary di")
assert.equal(parseQuickAdd("rewe", qw, qc).amount, null)
console.log("quick add ok")
