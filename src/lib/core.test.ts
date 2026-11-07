// node src/lib/core.test.ts
import assert from "node:assert/strict"
import {
  cleanTag,
  convert,
  cumulative,
  daysInMonth,
  dateOfDay,
  dayOfDate,
  guessCategory,
  monthRange,
  parseAmount,
  pressKey,
  unixOf,
  dayOf,
  entryDate,
  timeOf,
  usualCurve,
} from "./core.ts"

assert.equal(["1", "2", ".", "5", "7", "9"].reduce(pressKey, ""), "12.57")
assert.equal(["0", "4"].reduce(pressKey, ""), "4")
assert.equal([".", ".", "5"].reduce(pressKey, ""), "0.5")
assert.equal(pressKey("12.5", "del"), "12.")
assert.equal(pressKey("12345678", "9"), "12345678")

assert.equal(parseAmount("12,50"), 1250)
assert.equal(parseAmount("-1.234,56"), -123456)
assert.equal(parseAmount("1,234.5"), 123450)
assert.equal(parseAmount("€ 45"), 4500)
assert.equal(parseAmount("1,234"), 123400)
assert.equal(parseAmount("500.00 Dr"), -50000)
assert.equal(parseAmount("abc"), null)

assert.equal(Math.round(convert(10000, "eur", "jpy", { eur: 0.9, jpy: 90 })), 1000000)

const tz = "Europe/Paris"
assert.equal(dayOf(unixOf("2026-11-05", tz, 0), tz), "2026-11-05")
assert.equal(dayOf(unixOf("2026-07-01", tz, 0), tz), "2026-07-01")
const [s, e] = monthRange("2026-12", tz)
assert.equal(dayOf(s, tz), "2026-12-01")
assert.equal(dayOf(e - 1, tz), "2026-12-31")

const now = unixOf("2026-11-06", tz, 15, 42) + 17
assert.equal(timeOf(now, tz), "15:42")
const at = entryDate("2026-07-01", tz, now, "09:05")
assert.equal(dayOf(at, tz), "2026-07-01")
assert.equal(timeOf(at, tz), "09:05")
assert.equal(entryDate("2026-11-06", tz, now), now)
assert.equal(timeOf(entryDate("2026-11-01", tz, now), tz), "12:00")
assert.equal(entryDate("2026-11-01", tz, now, undefined, at + 86_400 * 123), at + 86_400 * 123)

const rules = [
  { title: "tesco", category_id: "groceries", exact: 0 },
  { title: "tesco cafe", category_id: "dining", exact: 0 },
  { title: "o2", category_id: "utilities", exact: 1 },
]
assert.equal(guessCategory("TESCO Cafe London", rules), "dining")
assert.equal(guessCategory("Tesco Extra", rules), "groceries")
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
const bank = { type: "bank" as const, currency: "jpy", balance: 9000, credit_limit: null, gain: null }
assert.equal(accountWorth(card), -141443)
assert.equal(accountWorth(fund), 2565438)
const nw = netWorth([card, fund, bank], "eur", { eur: 1, jpy: 90 })
assert.equal(Math.round(nw.total), -141443 + 2565438 + 100)
assert.equal(nw.debt, 141443)
assert.equal(nw.gains, 120000)
console.log("net worth ok")

// new accounts from what people know today
import { guessCurrency, openingFigures } from "./core.ts"
// A card owing 500 with a 2,000 limit keeps 1,500 of credit; its worth is minus what is owed, sign typed or not.
assert.deepEqual(openingFigures("credit", 50000, 200000), { balance: 150000, credit_limit: 200000, gain: null })
assert.equal(accountWorth({ ...openingFigures("credit", -50000, 200000), type: "credit", currency: "eur" }), -50000)
// Without a limit, the debt still counts.
assert.equal(accountWorth({ ...openingFigures("credit", 50000, null), type: "credit", currency: "eur" }), -50000)
// 10,000 put in, worth 12,500 today: a 2,500 gain. Only a value counts it all as money put in.
assert.deepEqual(openingFigures("investment", 1000000, 1250000), { balance: 1000000, credit_limit: null, gain: 250000 })
assert.deepEqual(openingFigures("investment", null, 800000), { balance: 800000, credit_limit: null, gain: 0 })
assert.deepEqual(openingFigures("investment", 500000, null), { balance: 500000, credit_limit: null, gain: null })
assert.deepEqual(openingFigures("bank", -2500, null), { balance: -2500, credit_limit: null, gain: null })
assert.equal(openingFigures("cash", null, null).balance, 0)
const rates = { eur: 1, gbp: 1, usd: 1, inr: 1 }
assert.equal(guessCurrency(["en", "en-GB"], rates, "eur"), "gbp")
assert.equal(guessCurrency(["de-DE"], rates, "usd"), "eur")
assert.equal(guessCurrency(["hi"], rates, "eur"), "inr")
assert.equal(guessCurrency(["en"], rates, "eur"), "usd")
assert.equal(guessCurrency(["ja-JP"], rates, "eur"), "eur")
assert.equal(guessCurrency(["not a tag"], rates, "eur"), "eur")
console.log("new accounts ok")

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

// quick add: "24.90 pizza hut dining visa"
import { needsAi, parseQuickAdd } from "./quick-add.ts"
const qw = [
  { id: "v", name: "Visa Card" },
  { id: "n", name: "Main account" },
]
const qc = [
  { id: "dining", name: "Dining" },
  { id: "groceries", name: "Groceries" },
]
const qa = parseQuickAdd("29,57 Pizza Hut dining visa yesterday", qw, qc)
assert.deepEqual(qa, {
  amount: 2957,
  income: false,
  date: "yesterday",
  walletId: "v",
  categoryId: "dining",
  payee: "Pizza Hut",
  tags: [],
  currency: false,
})
const qt = parseQuickAdd("12 #Trip lunch #trip #rome-2026", qw, qc)
assert.deepEqual(qt.tags, ["trip", "rome-2026"])
assert.equal(qt.payee, "lunch")
const qi = parseQuickAdd("+4200 salary main di", qw, qc)
assert.equal(qi.amount, 420000)
assert.equal(qi.income, true)
assert.equal(qi.walletId, "n")
assert.equal(qi.categoryId, null) // "di" is under 3 letters
assert.equal(qi.payee, "salary di")
assert.equal(parseQuickAdd("tesco", qw, qc).amount, null)
// date words in other languages, and two-character CJK categories
assert.equal(parseQuickAdd("12,50 tesco ayer", qw, qc).date, "yesterday")
assert.equal(parseQuickAdd("12.50 tesco 昨天", qw, qc).payee, "tesco")
assert.equal(parseQuickAdd("9000 외식", qw, [{ id: "d", name: "외식" }]).categoryId, "d")
assert.equal(cleanTag("#काम"), "काम") // Devanagari vowel signs are marks, not letters
// Only sentences go to AI; lines the parser explains stay local.
const ai = (q: string) => needsAi(q, parseQuickAdd(q, qw, qc))
assert.equal(ai("24.90 pizza hut yesterday visa"), false)
assert.equal(ai("coffee 4.5"), false)
assert.equal(ai("+3200 salary"), false)
assert.equal(ai("tesco"), false)
assert.equal(ai("lunch with sam at nandos 18.50 last friday"), true)
assert.equal(ai("€12 coffee"), true)
assert.equal(ai("uber 23 eur"), true)
assert.equal(ai("rent 1200 on the 3rd"), true)
assert.equal(ai("twelve fifty nandos"), true)
// German date words work whatever the UI language is.
const qg = parseQuickAdd("12,50 Lebensmittel gestern", qw, [{ id: "food", name: "Lebensmittel" }])
assert.equal(qg.amount, 1250)
assert.equal(qg.date, "yesterday")
assert.equal(qg.categoryId, "food")
assert.equal(qg.payee, "")
assert.equal(parseQuickAdd("Bäcker 3 heute", qw, qc).date, "today")
assert.equal(parseQuickAdd("constructor 3", qw, qc).date, null)
assert.equal(ai("Bäcker 4,20 gestern visa"), false)
assert.equal(ai("Miete 1200 am 3."), true)
assert.equal(ai("Essen mit Sam 18,50 letzten Freitag"), true)
assert.equal(ai("Kino 12 vorgestern"), true)
console.log("quick add ok")

// quick add in all 12 languages: number formats, day words, scripts without spaces, sentences for AI
{
  const q = (s: string, locale: string) => parseQuickAdd(s, qw, qc, locale)
  const ai = (s: string, locale: string) => needsAi(s, q(s, locale), locale)
  const local = (s: string, locale: string) => {
    const p = q(s, locale)
    return [p.amount, p.date, p.payee, needsAi(s, p, locale)]
  }
  // number formats: grouping, decimal commas, Indian lakh, Devanagari and full-width digits, 万 and 만
  assert.equal(q("1,234.56 rent", "en").amount, 123456)
  assert.equal(q("1.234,56 Miete", "de").amount, 123456)
  assert.equal(q("1'200.50 Miete", "de").amount, 120050)
  assert.equal(q("1,234 rent", "en").amount, 123400) // three digits after a separator group thousands
  assert.equal(q("0,5 café", "fr").amount, 50)
  assert.equal(q("1,00,000 किराया", "hi").amount, 10000000)
  assert.equal(q("３万円 家賃", "ja").amount, 3000000)
  assert.equal(q("1.5万 房租", "zh").amount, 1500000)
  // one line per language: [amount, date, payee, needs AI]
  assert.deepEqual(local("24.90 pizza hut yesterday", "en"), [2490, "yesterday", "pizza hut", false])
  assert.deepEqual(local("Bäcker 4,20 heute", "de"), [420, "today", "Bäcker", false])
  assert.deepEqual(local("12,50 mercadona ayer", "es"), [1250, "yesterday", "mercadona", false])
  assert.deepEqual(local("4,20 boulangerie aujourd’hui", "fr"), [420, "today", "boulangerie", false])
  assert.deepEqual(local("3,50 bar ieri", "it"), [350, "yesterday", "bar", false])
  assert.deepEqual(local("padaria 8,90 hj", "pt"), [890, "today", "padaria", false])
  assert.deepEqual(local("6,95 albert heijn gister", "nl"), [695, "yesterday", "albert heijn", false])
  assert.deepEqual(local("350 пятёрочка вчера", "ru"), [35000, "yesterday", "пятёрочка", false])
  assert.deepEqual(local("दूध ५० आज", "hi"), [5000, "today", "दूध", false])
  assert.deepEqual(local("昨日ランチ850", "ja"), [85000, "yesterday", "ランチ", false])
  assert.deepEqual(local("昨天午饭35", "zh"), [3500, "yesterday", "午饭", false])
  assert.deepEqual(local("점심 9000 오늘", "ko"), [900000, "today", "점심", false])
  assert.deepEqual(local("１２００ 本屋 きのう", "ja"), [120000, "yesterday", "本屋", false])
  assert.equal(q("11月3日 家賃 80000", "ja").amount, 8000000) // dates are not split into amounts
  // "hier" is yesterday in French and "here" in German and Dutch: the UI language decides
  assert.equal(q("hier boulangerie 4,20", "fr").date, "yesterday")
  assert.equal(q("hier boulangerie 4,20", "en").date, "yesterday")
  assert.equal(q("hier Bäcker 4,20", "de").date, null)
  // a currency sign or unit is read as the amount, and AI checks the currency
  assert.deepEqual([q("어제 점심 9000원", "ko").amount, q("어제 점심 9000원", "ko").payee], [900000, "점심"])
  assert.equal(q("3만원 택시", "ko").amount, 3000000)
  assert.equal(q("500₽ такси", "ru").currency, true)
  assert.equal(q("R$ 20 padaria", "pt").amount, 2000)
  assert.equal(q("35元午饭", "zh").payee, "午饭")
  for (const [s, l] of [
    ["12,50 € café", "fr"],
    ["35元 打车", "zh"],
    ["スタバ 500円", "ja"],
    ["500 руб такси", "ru"],
  ])
    assert.equal(ai(s, l), true, s)
  // sentences go to AI in every language
  for (const [s, l] of [
    ["café con Ana 4,50 el viernes", "es"],
    ["déjeuner avec Paul 18,50 vendredi", "fr"],
    ["pizza con Marco 25 sabato", "it"],
    ["almoço com a Ana 30 sexta-feira", "pt"],
    ["lunch met Sanne 15 vrijdag", "nl"],
    ["обед с Машей 800 в пятницу", "ru"],
    ["कल दूध 50", "hi"],
    ["スタバで500", "ja"],
    ["一昨日 ランチ 900", "ja"],
    ["在星巴克花了35", "zh"],
    ["스타벅스에서 5000", "ko"],
    ["Essen 20 vorgestern", "de"],
  ])
    assert.equal(ai(s, l), true, s)
  assert.equal(ai("mars 1,20", "en"), false) // the chocolate bar, not the French month
  assert.equal(ai("mars 1,20 courses", "fr"), true)
  console.log("quick add languages ok")
}

// search: a question leads with Ask Kosha in every language
import { isQuestion } from "./question.ts"
for (const [s, l] of [
  ["how much did I spend on food", "en"],
  ["wie viel habe ich im Oktober ausgegeben", "de"],
  ["¿cuánto gasté en comida", "es"],
  ["cuanto gaste en octubre", "es"],
  ["combien j'ai dépensé en courses", "fr"],
  ["qu’est-ce que j'ai acheté hier", "fr"],
  ["quanto ho speso a ottobre", "it"],
  ["dov'è finito lo stipendio", "it"],
  ["o que comprei ontem", "pt"],
  ["hoeveel heb ik uitgegeven", "nl"],
  ["сколько я потратил на еду", "ru"],
  ["трачу ли я больше, чем в прошлом месяце", "ru"],
  ["मैंने खाने पर कितना खर्च किया", "hi"],
  ["kitna kharcha hua", "hi"],
  ["今月いくら使った", "ja"],
  ["食費使いすぎ？", "ja"],
  ["这个月花了多少钱", "zh"],
  ["이번 달 얼마 썼어", "ko"],
  ["dove", "it"],
  ["何记", "ja"],
])
  assert.equal(isQuestion(s, l), true, s)
for (const [s, l] of [
  ["tesco", "en"],
  ["dove", "en"], // the soap
  ["quick", "fr"],
  ["mercadona", "es"],
  ["albert heijn", "nl"],
  ["пятёрочка", "ru"],
  ["दूध", "hi"],
  ["スタバ", "ja"],
  ["星巴克", "zh"],
  ["何记", "zh"], // a shop, not "what"
  ["스타벅스", "ko"],
])
  assert.equal(isQuestion(s, l), false, s)
console.log("questions ok")

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
  language: null,
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
  ai_categorise: "1",
  ai_quick_add: "1",
  ai_receipts: "1",
  ai_recap: "1",
  ai_ask: "1",
  ai_statements: "1",
  ai_recap_hidden: null,
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
const aiTx = {
  payee: "Pizza Hut",
  amount: -2957,
  currency: "eur",
  day: "2026-11-04",
  note: "Delivery",
  account: "Visa",
}
const all = { amount: true, payee: true, date: true, note: true, account: true }
assert.deepEqual(redactForAi(aiTx, all, "u1"), {
  payee: "Pizza Hut",
  amount: -29.57,
  currency: "EUR",
  date: "2026-11-04",
  note: "Delivery",
  account: "Visa",
})
const none = { amount: false, payee: false, date: false, note: false, account: false }
const hidden = redactForAi(aiTx, none, "u1")
assert.deepEqual(Object.keys(hidden), ["payee", "amount", "currency", "month"])
assert.equal(hidden.amount, null)
assert.equal(hidden.month, "2026-11")
assert.match(String(hidden.payee), /^payee_[0-9a-z]+$/)
// Stable per user and payee (case-insensitive), different across users.
assert.equal(redactForAi({ ...aiTx, payee: "PIZZA HUT" }, none, "u1").payee, hidden.payee)
assert.notEqual(redactForAi(aiTx, none, "u2").payee, hidden.payee)
// Real names go back in place of the codes a model was given.
import { aiFeatures, payeeCode, readJson, unmask } from "./core.ts"
const names = new Map([
  [payeeCode("u1", "Pizza Hut"), "Pizza Hut"],
  ["account_2", "Visa"],
])
assert.equal(
  unmask(`Most went to ${payeeCode("u1", "pizza hut")} on account_2, not account_3.`, names),
  "Most went to Pizza Hut on Visa, not account_3."
)
assert.equal(unmask("payee_abc", new Map()), "payee_abc")
assert.deepEqual(readJson('Sure! ```json\n{"category": "dining"}\n```'), { category: "dining" })
assert.equal(readJson("no json here"), null)
assert.equal(readJson("[1, 2]"), null)
assert.equal(readJson("{broken"), null)

// A feature is live only with AI on, a provider connected, its own switch on and the field it needs shared.
const on = parsePrefs({ ai_enabled: "1" })
assert.deepEqual(aiFeatures(on, true), {
  categorise: true,
  quick_add: true,
  receipts: true,
  recap: true,
  ask: true,
  statements: true,
})
assert.equal(Object.values(aiFeatures(on, false)).some(Boolean), false)
assert.equal(Object.values(aiFeatures(parsePrefs({}), true)).some(Boolean), false)
assert.equal(aiFeatures({ ...on, ai_share_payee: "0" }, true).categorise, false)
assert.equal(aiFeatures({ ...on, suggest_category: "0" }, true).categorise, false)
assert.equal(aiFeatures({ ...on, ai_share_amount: "0" }, true).recap, false)
assert.equal(aiFeatures({ ...on, ai_ask: "0" }, true).ask, false)
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
// Cursor passes only the first 40 tools to its agent, so past those come only AI tools and rare undo and dismiss ones.
for (const [name, o] of operations.slice(40))
  assert.ok(o.tag === "AI" || /^(undo|dismiss)_/.test(name), `${name} is past the first 40 tools; move it up`)
assert.ok(
  operations.slice(0, 40).every(([, o]) => o.tag !== "AI"),
  "AI tools come after the first 40"
)
// Operations that use the AI model say so, which documents their ai_unavailable error.
for (const [name, o] of operations) if (o.tag === "AI") assert.ok(o.ai, `${name} uses AI: set ai`)

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

// Calendar widgets round-trip days, including DST change days.
for (const d of ["2026-03-29", "2026-10-25", "2024-02-29", "2026-01-01"]) assert.equal(dayOfDate(dateOfDay(d)), d)

// ---------- statements ----------

import {
  descriptorKey,
  differenceHints,
  guessDateFormat,
  guessLayout,
  isOfx,
  layoutSignature,
  matchLines,
  parseCsv,
  parseDay,
  parseOfx,
  payeeFor,
  readCsv,
  similarity,
} from "./statement.ts"

assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2'), [
  ["a", "b"],
  ["x, y", 'say "hi"'],
  ["1", "2"],
])
assert.deepEqual(parseCsv("﻿Datum;Betrag\n03.11.2026;-12,50"), [
  ["Datum", "Betrag"],
  ["03.11.2026", "-12,50"],
])
assert.equal(parseDay("03/11/2026", "dmy"), "2026-11-03")
assert.equal(parseDay("11/03/2026", "mdy"), "2026-11-03")
assert.equal(parseDay("2026-11-03T10:22:00", "ymd"), "2026-11-03")
assert.equal(parseDay("3 Nov 2026", "text"), "2026-11-03")
assert.equal(parseDay("Nov 3, 2026", "text"), "2026-11-03")
assert.equal(parseDay("31/02/2026", "dmy"), null)
// A day over 12 decides; otherwise date order does.
assert.equal(guessDateFormat(["13/10/2026", "01/11/2026"]), "dmy")
assert.equal(guessDateFormat(["10/13/2026", "11/01/2026"]), "mdy")
assert.equal(guessDateFormat(["01/10/2026", "05/10/2026", "02/11/2026"]), "dmy")
assert.equal(guessDateFormat(["2026-10-01"]), "ymd")

// A UK bank with money out and money in columns, a preamble and a trailing total.
const uk = parseCsv(`Account,Current account 1234
Date,Description,Money out,Money in,Balance
01/11/2026,CARD PAYMENT TO TESCO STORES 3211 ON 31 OCT,12.50,,987.50
02/11/2026,SALARY NORTHWIND,,2000.00,2987.50
Total,,12.50,2000.00,`)
const ukLayout = guessLayout(uk)
assert.equal(ukLayout.confident, true)
assert.deepEqual(ukLayout.layout, {
  header: 1,
  date: 0,
  dateFormat: "dmy",
  description: [1],
  amount: null,
  debit: 2,
  credit: 3,
  invert: false,
  balance: 4,
})
assert.equal(layoutSignature(uk, ukLayout.layout), "date|description|money out|money in|balance")
const ukLines = readCsv(uk, ukLayout.layout)
assert.equal(ukLines.skipped, 1)
assert.deepEqual(
  ukLines.lines.map((l) => [l.day, l.amount, l.balance]),
  [
    ["2026-11-01", -1250, 98750],
    ["2026-11-02", 200000, 298750],
  ]
)
// The same file read twice gives the same refs, and a repeated line gets its own.
assert.equal(readCsv(uk, ukLayout.layout).lines[0].ref, ukLines.lines[0].ref)
assert.ok(ukLines.lines[0].ref?.startsWith("h:"))
// A card export with charges as positive amounts, newest first: the running balance shows they need flipping.
const cardCsv = parseCsv(`Date,Description,Amount,Balance
2026-11-02,AMAZON,20.00,-70.00
2026-11-01,UBER,50.00,-50.00`)
const cardLayout = guessLayout(cardCsv).layout
assert.equal(cardLayout.invert, true)
assert.deepEqual(
  readCsv(cardCsv, cardLayout).lines.map((l) => l.amount),
  [-2000, -5000]
)

const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>GBP<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000[0:GMT]<TRNAMT>-12.50<FITID>A1<NAME>TESCO STORES<MEMO>3211</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261104<TRNAMT>100.00<FITID>A2<NAME>REFUND &amp; CO</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>1234.56<DTASOF>20261105</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
assert.equal(isOfx(ofx), true)
const o = parseOfx(ofx)
assert.deepEqual(
  o.lines.map((l) => [l.day, l.amount, l.description, l.ref]),
  [
    ["2026-11-03", -1250, "TESCO STORES · 3211", "ofx:A1"],
    ["2026-11-04", 10000, "REFUND & CO", "ofx:A2"],
  ]
)
assert.deepEqual([o.closing, o.closingDay, o.currency], [123456, "2026-11-05", "gbp"])

assert.equal(descriptorKey("CARD PAYMENT TO TESCO STORES 3211 ON 03 NOV"), "tesco stores")
assert.equal(descriptorKey("PAYPAL *SPOTIFY P2B3C4"), "spotify")
assert.equal(payeeFor("CARD PAYMENT TO TESCO STORES 3211", ["Tesco", "Uber"], {}), "Tesco")
assert.equal(payeeFor("SQ *BLUE BOTTLE COFFEE", [], {}), "Blue Bottle Coffee")
assert.equal(payeeFor("DD THAMES WATER 99", [], { "thames water": "Thames Water" }), "Thames Water")
assert.equal(similarity("TESCO STORES 3211", "Tesco"), 1)
assert.equal(similarity("UBER TRIP", "Tesco"), 0)

// Matching: bank ids first, then the same amount a few days later, then a close amount to confirm.
const stLines = [
  { day: "2026-11-03", amount: -1250, description: "TESCO STORES", balance: null, ref: "ofx:A1" },
  { day: "2026-11-05", amount: -2000, description: "UBER TRIP", balance: null, ref: null },
  { day: "2026-11-06", amount: -2315, description: "BLUE BOTTLE", balance: null, ref: null },
  { day: "2026-11-06", amount: -999, description: "NETFLIX", balance: null, ref: null },
]
const stEntries = [
  { id: "t1", day: "2026-11-01", amount: -1250, name: "Tesco", ref: "ofx:A1" },
  { id: "u1", day: "2026-11-02", amount: -2000, name: "Uber", ref: null },
  { id: "b1", day: "2026-11-05", amount: -2015, name: "Blue Bottle", ref: null },
  { id: "x1", day: "2026-10-01", amount: -2000, name: "Uber", ref: null },
]
const m = matchLines(stLines, stEntries)
assert.deepEqual(m.pairs, [
  { line: 0, entry: "t1", kind: "ref" },
  { line: 1, entry: "u1", kind: "exact" },
  { line: 2, entry: "b1", kind: "close" },
])
assert.deepEqual(m.missing, [3])
assert.deepEqual(m.extra, ["x1"])

// Difference hints: the classic checks.
const money = (c: number) => (c / 100).toFixed(2)
const hint = (
  diff: number,
  ticked: { id: string; amount: number }[],
  unticked: { id: string; amount: number }[] = []
) =>
  differenceHints(
    diff,
    ticked.map((e) => ({ ...e, day: "2026-11-10", name: e.id })),
    unticked.map((e) => ({ ...e, day: "2026-11-10", name: e.id })),
    "2026-11-30",
    money
  )
assert.deepEqual(hint(0, []), [])
assert.deepEqual(hint(-1250, [], [{ id: "a", amount: -1250 }])[0].ids, ["a"])
assert.match(hint(-2000, [{ id: "a", amount: 1000 }])[0].text, /wrong way round, money out rather than in/)
// Typed 54.00 for 45.00: off by 9.00, divisible by 9.
assert.match(hint(900, [{ id: "a", amount: -5400 }])[0].text, /Was a -45\.00 rather than -54\.00/)
assert.deepEqual(
  hint(
    -3000,
    [],
    [
      { id: "a", amount: -1000 },
      { id: "b", amount: -2000 },
    ]
  )[0].ids,
  ["a", "b"]
)
assert.match(hint(-777, [])[0].text, /a fee, a charge or interest of 7\.77/)
console.log("statements ok")

// ---------- spotting recurring payments ----------

import { findRecurring } from "./core.ts"
const pay = (name: string, days: string[], amount: number | number[]) =>
  days.map((day, i) => ({
    id: `${name}${i}`,
    name,
    day,
    amount: Array.isArray(amount) ? amount[i] : amount,
    category_id: "c",
    wallet_id: "w",
  }))
const found = findRecurring(
  [
    ...pay("Netflix", ["2026-07-12", "2026-08-12", "2026-09-12", "2026-10-13", "2026-11-12"], -1599),
    // Energy varies but comes monthly.
    ...pay("Octopus", ["2026-08-01", "2026-09-01", "2026-10-02"], [-8000, -9500, -7000]),
    // Weekly groceries vary, so they aren't a recurring payment.
    ...pay(
      "Tesco",
      ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"],
      [-4000, -6500, -2200, -5100, -3300]
    ),
    // Stopped in the summer.
    ...pay("Gym", ["2026-03-05", "2026-04-05", "2026-05-05"], -3000),
    // Yearly, twice.
    ...pay("Domain", ["2024-11-20", "2025-11-19"], -1200),
    // Irregular.
    ...pay("Uber", ["2026-10-01", "2026-10-03", "2026-10-20"], -1500),
    ...pay("Salary", ["2026-08-28", "2026-09-28", "2026-10-28"], 300000),
  ],
  "2026-11-14"
)
assert.deepEqual(
  found.map((f) => [f.name, f.amount, f.variable, f.every, f.unit, f.nextDay, f.count]),
  [
    ["Salary", 300000, false, 1, "month", "2026-11-28", 3],
    // November's bill hasn't shown yet, so the next one expected is December's.
    ["Octopus", -8000, true, 1, "month", "2026-12-02", 3],
    ["Netflix", -1599, false, 1, "month", "2026-12-12", 5],
    ["Domain", -1200, false, 1, "year", "2026-11-19", 2],
  ]
)
// Two yearly payments two years ago have stopped.
assert.deepEqual(findRecurring(pay("Domain", ["2023-11-20", "2024-11-19"], -1200), "2026-11-01"), [])
console.log("recurring ok")
// A card export without a balance column: mostly positive amounts are charges.
assert.equal(
  guessLayout(
    parseCsv("Date,Description,Amount\n2026-11-01,UBER,50.00\n2026-11-02,PAYMENT,-20.00\n2026-11-03,TESCO,9.00"),
    true
  ).layout.invert,
  true
)
assert.equal(
  guessLayout(parseCsv("Date,Description,Amount\n2026-11-01,UBER,-50.00\n2026-11-03,TESCO,-9.00")).layout.invert,
  false
)
// Typed 164.67 for 1,646.70: a slid decimal point.
assert.match(
  hint(-148203, [{ id: "a", amount: -16467 }])[0].text,
  /Was a -1646\.70 rather than -164\.67\? The decimal point/
)
assert.match(hint(148203, [{ id: "a", amount: -164670 }])[0].text, /Was a -164\.67 rather than -1646\.70/)
assert.equal(descriptorKey("CARD PAYMENT TO PRET A MANGER 1043 ON 21 OCT"), "pret a manger")
assert.equal(descriptorKey("Lastschrift STADTWERKE MUENCHEN"), "stadtwerke muenchen")

// ---------- why an AI feature can't run ----------

import { aiBlocker, inCurrency } from "./core.ts"
const aiOn = parsePrefs({ ai_enabled: "1" })
assert.match(
  aiBlocker(parsePrefs({}), false, "ask")!,
  /^AI isn't set up\. .*turn on Use AI features and connect a provider/
)
assert.match(aiBlocker(aiOn, false, "ask")!, /^No AI provider is connected/)
assert.match(aiBlocker(parsePrefs({}), true, "ask")!, /^AI is turned off/)
assert.equal(
  aiBlocker({ ...aiOn, ai_receipts: "0" }, true, "receipts"),
  "Receipt scanning is turned off. Turn it on in Kosha under Settings › AI › Features."
)
assert.equal(
  aiBlocker({ ...aiOn, ai_share_amount: "0" }, true, "recap"),
  "Monthly recap needs amounts shared, under Settings › AI › What AI can see."
)
assert.equal(
  aiBlocker({ ...aiOn, suggest_category: "0" }, true, "categorise"),
  "Auto-categorise needs Suggest a category turned on, under Settings › General."
)
assert.equal(aiBlocker(aiOn, true, "statements"), null)
// A receipt in another currency is converted, and the note says what was paid.
assert.deepEqual(inCurrency({ amount: 2015, currency: "usd", note: "" }, "eur", { usd: 1, eur: 0.9 }), {
  amount: 1814,
  note: "Paid US$20.15",
})
assert.deepEqual(inCurrency({ amount: 2015, currency: "usd", note: "lunch" }, "usd", {}), {
  amount: 2015,
  note: "lunch",
})
console.log("ai blockers ok")

// Planning a reconciliation from a statement: the earlier unmatched entry counts as ticked, the close one doesn't.
import { planReconciliation } from "./statement.ts"
const plan = planReconciliation({
  lines: stLines,
  open: [
    ...stEntries.map((e) => ({ ...e, paid: 1 })),
    { id: "old", day: "2026-10-30", amount: -500, name: "Kiosk", ref: null, paid: 1 },
  ],
  done: [],
  statementDay: "2026-11-30",
  lastDay: null,
})
assert.deepEqual(plan.missing, [3])
assert.deepEqual([...plan.matched].sort(), ["t1", "u1"])
assert.deepEqual(
  plan.close.map((p) => p.entry),
  ["b1"]
)
const ticked = (id: string) =>
  plan.ticks({ id, day: [...stEntries, { id: "old", day: "2026-10-30" }].find((e) => e.id === id)!.day, paid: 1 })
assert.deepEqual(["t1", "u1", "b1", "x1", "old"].map(ticked), [true, true, false, true, true])
// Without a statement, every paid entry up to the statement day is ticked.
const manual = planReconciliation({ lines: [], open: [], done: [], statementDay: "2026-11-30", lastDay: "2026-10-31" })
assert.equal(manual.periodStart, "2026-11-01")
assert.equal(manual.ticks({ id: "a", day: "2026-11-12", paid: 1 }), true)
assert.equal(manual.ticks({ id: "a", day: "2026-11-12", paid: 0 }), false)
console.log("reconciliation plan ok")

// ---------- getting started ----------

import { csvAccountHint, mergeStatements, pairTransfers, starterCategory, statementGaps } from "./statement.ts"
assert.deepEqual(parseOfx(ofx).account, { id: null, type: "bank" })
assert.deepEqual(parseOfx("<OFX><CCSTMTRS><CCACCTFROM><ACCTID>4111222233334444</CCACCTFROM></OFX>").account, {
  id: "4111222233334444",
  type: "credit",
})
assert.equal(csvAccountHint(uk, ukLayout.layout), "1234")
const have = new Set(["groceries", "dining", "salary", "transit"])
assert.equal(starterCategory("CARD PAYMENT TO TESCO STORES 3211", false, have), "groceries")
assert.equal(starterCategory("Uber Trip", false, have), "transit")
assert.equal(starterCategory("SALARY NORTHWIND", true, have), "salary")
assert.equal(starterCategory("SALARY NORTHWIND", false, have), null)
assert.equal(starterCategory("Netflix", false, have), null) // no Entertainment category any more
assert.deepEqual(
  pairTransfers([
    { key: "a", account: "main", day: "2026-10-02", amount: -50000 },
    { key: "b", account: "savings", day: "2026-10-03", amount: 50000 },
    { key: "c", account: "main", day: "2026-10-02", amount: -50000 },
    { key: "d", account: "main", day: "2026-10-09", amount: 50000 },
  ]),
  [["a", "b"]]
)
const gaps = statementGaps(
  [
    { name: "Jan", from: "2026-01-01", to: "2026-01-31", opening: 1000, closing: 2000 },
    { name: "Feb", from: "2026-02-01", to: "2026-02-28", opening: 2500, closing: 3000 },
    { name: "Apr", from: "2026-04-01", to: "2026-04-30", opening: 3000, closing: 3500 },
  ],
  (c) => (c / 100).toFixed(2),
  (d) => d
)
assert.deepEqual(gaps, [
  "Feb opens at 25.00, but Jan closes at 20.00. A statement may be missing.",
  "No statement covers 2026-03-01 to 2026-03-31.",
])
// A payee column and a description column that says the same thing in capitals read as one.
const monzo = parseCsv(
  "Date,Name,Amount,Description\n09/10/2026,Sam Lee,40.00,SAM LEE\n12/10/2026,Spotify,-11.99,SPOTIFY STOCKHOLM"
)
const monzoLines = readCsv(monzo, guessLayout(monzo).layout).lines
assert.deepEqual(
  monzoLines.map((l) => l.description),
  ["Sam Lee", "Spotify · SPOTIFY STOCKHOLM"]
)
assert.equal(payeeFor("Boots · BOOTS 1123", [], {}), "Boots")
// A yearly export and a monthly one overlap: the monthly lines are already there, even with other bank ids.
const ln = (day: string, amount: number, ref: string) => ({ day, amount, description: "", balance: null, ref })
const merged = mergeStatements([
  { lines: [ln("2026-03-02", -450, "m1"), ln("2026-03-02", -450, "m2"), ln("2026-03-09", -900, "m3")] },
  {
    lines: [
      ln("2026-01-05", -100, "y1"),
      ln("2026-03-02", -450, "y2"),
      ln("2026-03-02", -450, "y3"),
      ln("2026-12-01", -70, "y4"),
    ],
  },
  { lines: [ln("2026-01-05", -100, "y1")] }, // the yearly file again
])
assert.deepEqual(
  merged.map((l) => l.ref),
  ["y1", "y2", "y3", "y4", "m3"]
)
console.log("getting started ok")

// Attachments are typed by their bytes, not their name.
{
  const { fileKind, archiveNames } = await import("./core.ts")
  const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
  assert.equal(fileKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg")
  assert.equal(fileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), "image/png")
  assert.equal(fileKind(bytes("RIFF\0\0\0\0WEBPVP8 ")), "image/webp")
  assert.equal(fileKind(bytes("%PDF-1.7")), "application/pdf")
  assert.equal(fileKind(bytes("<html><script>")), null)
  assert.equal(fileKind(new Uint8Array()), null)
  assert.deepEqual(
    archiveNames([
      { day: "2026-10-27", name: "payslip.pdf" },
      { day: "2026-11-27", name: "payslip.pdf" },
      { day: "2026-11-27", name: "payslip.pdf" },
      { day: "2026-11-27", name: "a/b" },
    ]),
    ["2026-10 payslip.pdf", "2026-11 payslip.pdf", "2026-11 payslip (2).pdf", "2026-11 a-b"]
  )
  console.log("attachments ok")
}

// languages: every message exists in every locale, and formats follow the language
import { m as messages } from "../paraglide/messages.js"
import { locales } from "../paraglide/runtime.js"
import { fmt } from "./core.ts"
import { readdirSync, readFileSync } from "node:fs"
const keysOf = (l: string) =>
  readdirSync(`messages/${l}`).flatMap((f) =>
    Object.keys(JSON.parse(readFileSync(`messages/${l}/${f}`, "utf8"))).filter((k) => k !== "$schema")
  )
const english = new Set(keysOf("en"))
for (const l of locales) {
  const keys = new Set(keysOf(l))
  assert.deepEqual(
    [...english].filter((k) => !keys.has(k)),
    [],
    `missing in messages/${l}`
  )
  assert.deepEqual(
    [...keys].filter((k) => !english.has(k)),
    [],
    `not in English, in messages/${l}`
  )
}
assert.equal(messages.common_save({}, { locale: "de" }), "Speichern")
// every plural message has a variant for every count in every language (a miss shows the key)
const plurals = readdirSync("messages/en").flatMap((f) =>
  Object.entries(JSON.parse(readFileSync(`messages/en/${f}`, "utf8"))).filter(([, v]) => Array.isArray(v))
) as [string, [{ declarations: string[] }]][]
for (const [key, [{ declarations }]] of plurals) {
  const inputs = declarations.filter((d) => d.startsWith("input ")).map((d) => d.slice(6))
  for (const locale of locales)
    for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 101, 1000000]) {
      const out = (messages as unknown as Record<string, (i: object, o: object) => string>)[key](
        Object.fromEntries(inputs.map((i) => [i, n])),
        { locale }
      )
      assert.notEqual(out, key, `${key} has no ${locale} variant for ${n}`)
    }
}
assert.equal(fmt(123456, "eur"), "€1,234.56")
console.log("languages ok")
