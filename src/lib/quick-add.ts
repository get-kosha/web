// Quick add (⌘K) parses one line of text into a transaction as you type. It is pure, so core.test.ts can check it.
import { cleanTag } from "./core.ts"

export type QuickParse = {
  /** Cents, always positive; `income` carries the sign. */
  amount: number | null
  income: boolean
  /** "today" | "yesterday" when typed (in any language Kosha speaks), else null. */
  date: "today" | "yesterday" | null
  walletId: string | null
  categoryId: string | null
  payee: string
  /** Words typed as #hashtags, cleaned as stored. */
  tags: string[]
}

// Date words the local parser reads, in every language Kosha speaks: a German user types German whatever the UI says.
// Hindi has only "today": "कल" means both yesterday and tomorrow.
const DATES = new Map<string, "today" | "yesterday">([
  ...["today", "heute", "hoy", "aujourd'hui", "hoje", "oggi", "vandaag", "сегодня", "今日", "今天", "오늘", "आज"].map(
    (w) => [w, "today"] as const
  ),
  ...["yesterday", "gestern", "ayer", "hier", "ontem", "ieri", "gisteren", "вчера", "昨日", "昨天", "어제"].map(
    (w) => [w, "yesterday"] as const
  ),
])
// Chinese, Japanese and Korean pack a category into two characters (外食, 餐饮, 급여).
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * `#word` is a tag. The first number is the amount, with `,` or `.` decimals and a leading `+` for income.
 * `today` or `yesterday`, in any language Kosha speaks, sets the date. A word equal to an account's name or its
 * first word sets the account.
 * A word of 3 or more letters (2 in Chinese, Japanese or Korean) that starts a category name sets the category. The remaining words are the payee.
 */
export function parseQuickAdd(
  q: string,
  wallets: { id: string; name: string }[],
  categories: { id: string; name: string }[]
): QuickParse {
  const out: QuickParse = {
    amount: null,
    income: false,
    date: null,
    walletId: null,
    categoryId: null,
    payee: "",
    tags: [],
  }
  const words: string[] = []
  for (const t of q.trim().split(/\s+/)) {
    if (!t) continue
    const low = t.toLowerCase()
    if (t.startsWith("#")) {
      const tag = cleanTag(t)
      if (tag && !out.tags.includes(tag)) out.tags.push(tag)
      continue
    }
    if (out.amount === null && /^[+-]?\d+([.,]\d{1,2})?$/.test(t)) {
      out.amount = Math.round(Math.abs(parseFloat(t.replace(",", "."))) * 100)
      out.income = t.startsWith("+")
      continue
    }
    const date = out.date ? undefined : DATES.get(low)
    if (date) {
      out.date = date
      continue
    }
    const w = out.walletId
      ? null
      : wallets.find((x) => {
          const n = x.name.toLowerCase()
          return n === low || n.split(/\s+/)[0] === low
        })
    if (w) {
      out.walletId = w.id
      continue
    }
    const c =
      out.categoryId || low.length < (CJK.test(low) ? 2 : 3)
        ? null
        : categories.find((x) => x.name.toLowerCase().startsWith(low))
    if (c) {
      out.categoryId = c.id
      continue
    }
    words.push(t)
  }
  out.payee = words.join(" ")
  return out
}

// Words the local parser leaves in the payee that mean the line is a sentence: dates, times, currencies, verbs.
// ponytail: English and German only; other languages reach AI through the long-payee and no-amount rules.
// English first, then German ("Miete 1200 am 3.", "Essen mit Sam letzten Freitag").
const NATURAL =
  /^(at|for|from|with|on|in|via|by|and|paid|pay|spent|spend|bought|got|received|refund|refunded|split|last|ago|this|next|tomorrow|tonight|morning|noon|evening|week|month|(mon|tues?|wed(nes)?|thu(rs)?|fri|satur|sun)(day)?|jan(uary)?|feb(ruary)?|march|april|june|july|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|\d+(st|nd|rd|th|am|pm)|\d{1,2}:\d{2}|eur|usd|gbp|inr|chf|jpy|aud|cad|sgd|aed|bucks|euros?|dollars?|pounds?|quid|rupees?|am|um|für|von|vom|mit|bei|beim|im|über|und|bezahlt|gezahlt|ausgegeben|gekauft|bekommen|erhalten|erstattet|erstattung|geteilt|letzte[nrs]?|vor|diese[nrs]?|nächste[nrs]?|morgen|übermorgen|vorgestern|abends?|morgens|mittags?|tage?n?|woche|monat|(mon|diens|donners|frei|sams|sonn)tag|mittwoch|januar|februar|märz|mai|juni|juli|oktober|dezember|uhr|franken|rupien)$/

/**
 * Whether quick add should ask AI to read the line. Lines the local parser explains in full
 * ("24.90 pizza hut yesterday visa") stay local and instant. A sentence goes to AI: a leftover word
 * like "with", "friday" or "eur", a currency sign or digits inside the payee, a long payee, or no
 * amount in three or more words.
 */
export function needsAi(q: string, p: QuickParse) {
  const tokens = q.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false
  const words = p.payee.toLowerCase().split(/\s+/).filter(Boolean)
  return (
    words.some((w) => NATURAL.test(w) || /[\d€$£₹¥]/.test(w)) ||
    words.length > 3 ||
    (p.amount === null && tokens.length >= 3)
  )
}
