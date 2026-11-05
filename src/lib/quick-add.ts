// Quick add (⌘K): one line of text, parsed live into a transaction. Pure, so core.test.ts can check it.

export type QuickParse = {
  /** Cents, always positive; `income` carries the sign. */
  amount: number | null
  income: boolean
  /** "today" | "yesterday" when typed, else null. */
  date: "today" | "yesterday" | null
  walletId: string | null
  categoryId: string | null
  payee: string
}

/**
 * First number is the amount (`,` or `.` decimals, leading `+` = income); `today`/`yesterday` set the date;
 * a word equal to an account's name or its first word sets the account; a 3+ letter word that prefixes a
 * category name sets the category; the remaining words are the payee.
 */
export function parseQuickAdd(
  q: string,
  wallets: { id: string; name: string }[],
  categories: { id: string; name: string }[]
): QuickParse {
  const out: QuickParse = { amount: null, income: false, date: null, walletId: null, categoryId: null, payee: "" }
  const words: string[] = []
  for (const t of q.trim().split(/\s+/)) {
    if (!t) continue
    const low = t.toLowerCase()
    if (out.amount === null && /^[+-]?\d+([.,]\d{1,2})?$/.test(t)) {
      out.amount = Math.round(Math.abs(parseFloat(t.replace(",", "."))) * 100)
      out.income = t.startsWith("+")
      continue
    }
    if (!out.date && (low === "today" || low === "yesterday")) {
      out.date = low
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
    const c = out.categoryId || low.length < 3 ? null : categories.find((x) => x.name.toLowerCase().startsWith(low))
    if (c) {
      out.categoryId = c.id
      continue
    }
    words.push(t)
  }
  out.payee = words.join(" ")
  return out
}
