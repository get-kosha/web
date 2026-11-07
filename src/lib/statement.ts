// Bank statements: reading CSV and OFX files, turning bank text into payees, matching statement lines to
// Kosha's entries, and hints for a reconciliation difference. Pure, so core.test.ts can check it.
import { addDays, parseAmount } from "./core.ts"
import { m } from "../paraglide/messages.js"

/**
 * One line of a statement, in the account's currency. Negative is money out of the account. `replaces` is the
 * ref of an earlier line the bank corrected with this one (OFX's CORRECTFITID).
 */
export type Line = {
  day: string
  amount: number
  description: string
  balance: number | null
  ref: string | null
  replaces?: string
}

// ---------- CSV ----------

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, CRLF and a BOM; the delimiter is detected. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "")
  const sample = src.split(/\r?\n/).slice(0, 20).join("\n")
  const counts = [",", ";", "\t", "|"].map((d) => [d, sample.split(d).length] as const)
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell.trim() === "") quoted = true
    else if (c === delim) {
      row.push(cell.trim())
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export type DateFormat = "ymd" | "dmy" | "mdy" | "text"
/**
 * Which column holds what. `amount` is one signed column; `debit` and `credit` are separate money-out and
 * money-in columns. `invert` flips signs, for exports that show spending as positive (most credit cards).
 */
export type Layout = {
  header: number
  date: number
  dateFormat: DateFormat
  description: number[]
  amount: number | null
  debit: number | null
  credit: number | null
  invert: boolean
  balance: number | null
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n: number) => String(n).padStart(2, "0")
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)
function valid(y: number, m: number, d: number) {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** Reads a statement date in the given format, ignoring any time after it. Returns YYYY-MM-DD or null. */
export function parseDay(raw: string, format: DateFormat): string | null {
  const s = raw.trim().toLowerCase()
  if (format === "text") {
    // "3 Nov 2026", "03-Nov-26", "Nov 3, 2026"
    const a = s.match(/^(\d{1,2})[\s\-./]*([a-z]{3})[a-z]*\.?[\s\-./,]*(\d{2,4})/)
    const b = s.match(/^([a-z]{3})[a-z]*\.?[\s\-./]*(\d{1,2})(?:st|nd|rd|th)?,?[\s\-./]*(\d{2,4})/)
    const [d, mon, y] = a ? [a[1], a[2], a[3]] : b ? [b[2], b[1], b[3]] : ["", "", ""]
    const m = mon ? MONTHS.indexOf(mon) + 1 : 0
    return m ? valid(fullYear(+y), m, +d) : null
  }
  if (/^\d{8}/.test(s) && format === "ymd") return valid(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8))
  const p = s.match(/^(\d{1,4})[-./ ](\d{1,2})[-./ ](\d{1,4})/)
  if (!p) return null
  const [x, y, z] = [+p[1], +p[2], +p[3]]
  if (format === "ymd") return p[1].length === 4 ? valid(x, y, z) : null
  if (p[3].length !== 4 && p[3].length !== 2) return null
  return format === "dmy" ? valid(fullYear(z), y, x) : valid(fullYear(z), x, y)
}

/**
 * The date format that reads every value. Between day-first and month-first, a part over 12 decides; when
 * nothing does, the one that keeps the rows in date order wins, then day-first.
 */
export function guessDateFormat(values: string[]): DateFormat | null {
  const list = values.filter((v) => v.trim()).slice(0, 200)
  if (!list.length) return null
  const ok = (["ymd", "dmy", "mdy", "text"] as const).filter((f) => list.every((v) => parseDay(v, f) !== null))
  if (ok.length < 2) return ok[0] ?? null
  const ordered = (f: DateFormat) => {
    const days = list.map((v) => parseDay(v, f)!)
    let up = 0
    let down = 0
    for (let i = 1; i < days.length; i++) {
      if (days[i] > days[i - 1]) up++
      if (days[i] < days[i - 1]) down++
    }
    return Math.min(up, down)
  }
  return [...ok].sort((a, b) => ordered(a) - ordered(b))[0]
}

const HEAD = {
  date: /(^|\s)(date|datum|fecha|data|posted|booking|buchungstag|dated)(\s|$)|date$|datum$/i,
  valueDate: /value|valuta|wertstellung/i,
  payee: /payee|merchant|counterparty|name|empf|beg(ue|ü)nstigter|auftraggeber|recipient|beneficiary/i,
  description:
    /description|details|narrative|particulars|transaction|text|concepto|libell|verwendungszweck|memo|reference|beschreibung/i,
  amount: /amount|betrag|umsatz|importe|montant|value|sum|bedrag|kwota/i,
  debit: /debit|money out|paid out|withdrawal|outflow|out$|soll|ausgang|cargo|spent/i,
  credit: /credit|money in|paid in|deposit|inflow|in$|haben|eingang|abono|received/i,
  balance: /balance|saldo|solde|kontostand/i,
  skip: /currency|category|type|status|state|fee|local|exchange|emoji|receipt|address|time|card|id$|^id/i,
}
const numeric = (v: string) => v.trim() !== "" && parseAmount(v) !== null && /\d/.test(v) && !/[a-z]{3,}/i.test(v)

/**
 * Works out a CSV's layout from its header names and values. `confident` is false when it had to guess roles.
 * For a credit `card` without a running balance to go by, mostly positive amounts mean spending is positive.
 */
export function guessLayout(rows: string[][], card = false): { layout: Layout; confident: boolean } {
  const width = Math.max(...rows.slice(0, 30).map((r) => r.length))
  const dateish = (v: string) => (["ymd", "dmy", "mdy", "text"] as const).some((f) => parseDay(v, f))
  // The header is the last row before data starts: data rows have a date in some column.
  const firstData = rows.findIndex((r) => r.some(dateish) && r.some(numeric))
  const header = firstData > 0 && !rows[firstData - 1].some(dateish) ? firstData - 1 : -1
  const names = header >= 0 ? rows[header].map((h) => h.trim()) : []
  const data = rows.slice(header + 1).filter((r) => r.some(dateish))
  const column = (i: number) => data.map((r) => r[i] ?? "")
  const share = (i: number, test: (v: string) => boolean) => {
    const vals = column(i).filter((v) => v.trim())
    return vals.length ? vals.filter(test).length / vals.length : 0
  }
  const cols = Array.from({ length: width }, (_, i) => i)
  const named = (re: RegExp, also: (i: number) => boolean = () => true) =>
    cols.filter((i) => re.test(names[i] ?? "") && !HEAD.skip.test(names[i] ?? "") && also(i))
  const dates = cols.filter((i) => share(i, dateish) > 0.9)
  const date =
    named(HEAD.date, (i) => dates.includes(i) && !HEAD.valueDate.test(names[i]))[0] ??
    named(HEAD.date, (i) => dates.includes(i))[0] ??
    dates[0] ??
    0
  const money = cols.filter(
    (i) => i !== date && share(i, (v) => numeric(v) || !v.trim()) > 0.95 && share(i, numeric) > 0
  )
  const balance = named(HEAD.balance, (i) => money.includes(i))[0] ?? null
  const debit = named(HEAD.debit, (i) => money.includes(i) && i !== balance)[0] ?? null
  const credit = named(HEAD.credit, (i) => money.includes(i) && i !== balance && i !== debit)[0] ?? null
  const pair = debit !== null && credit !== null
  const amount = pair
    ? null
    : (named(HEAD.amount, (i) => money.includes(i) && i !== balance)[0] ??
      money.find((i) => i !== balance && i !== debit && i !== credit) ??
      null)
  const text = cols.filter((i) => i !== date && !money.includes(i) && share(i, (v) => /[a-z]/i.test(v)) > 0.5)
  const description = [
    ...named(HEAD.payee, (i) => text.includes(i)).slice(0, 1),
    ...named(HEAD.description, (i) => text.includes(i)),
  ]
  const avgLength = (i: number) => column(i).reduce((t, v) => t + v.length, 0) / Math.max(1, data.length)
  const desc = [...new Set(description)].slice(0, 2)
  if (!desc.length) {
    const longest = [...text].sort((a, b) => avgLength(b) - avgLength(a))[0]
    if (longest !== undefined) desc.push(longest)
  }
  const dateFormat = guessDateFormat(column(date)) ?? "dmy"
  const layout: Layout = {
    header,
    date,
    dateFormat,
    description: desc,
    amount: pair ? null : amount,
    debit: pair ? debit : null,
    credit: pair ? credit : null,
    invert: false,
    balance,
  }
  // A running balance tells which way the amounts go: each row's balance moves by its amount.
  if (balance !== null && !pair) {
    const lines = readCsv(rows, layout).lines
    let same = 0
    let flipped = 0
    for (let i = 1; i < lines.length; i++) {
      const [a, b] = [lines[i - 1], lines[i]]
      if (a.balance === null || b.balance === null) continue
      const step = b.balance - a.balance
      // Oldest first, the step is this row's amount; newest first, it is minus the previous row's.
      if (step === b.amount || step === -a.amount) same++
      if (step === -b.amount || step === a.amount) flipped++
    }
    layout.invert = flipped > same
  } else if (card && !pair) {
    const amounts = readCsv(rows, layout).lines.map((l) => l.amount)
    layout.invert = amounts.filter((a) => a > 0).length > amounts.length / 2
  }
  const confident = names.length > 0 && (amount !== null || pair) && desc.length > 0 && dates.length > 0
  return { layout, confident }
}

/** The key a bank's CSV layout is remembered by: its header names, lowercased. */
export const layoutSignature = (rows: string[][], layout: Layout) =>
  layout.header >= 0 ? rows[layout.header].map((h) => h.trim().toLowerCase()).join("|") : `cols:${rows[0]?.length ?? 0}`

/** Reads the lines of a CSV with a layout. Rows without a readable date or amount (totals, notes) are skipped. */
export function readCsv(rows: string[][], layout: Layout) {
  const lines: Line[] = []
  let skipped = 0
  for (const r of rows.slice(layout.header + 1)) {
    const day = parseDay(r[layout.date] ?? "", layout.dateFormat)
    const abs = (i: number | null) => (i === null ? 0 : Math.abs(parseAmount(r[i] ?? "") ?? 0))
    const amount = layout.amount !== null ? parseAmount(r[layout.amount] ?? "") : abs(layout.credit) - abs(layout.debit)
    if (!day || amount === null || amount === 0) {
      skipped++
      continue
    }
    const description = layout.description
      .map((i) => (r[i] ?? "").trim())
      .filter((v, i, all) => v && !all.slice(0, i).some((x) => x.toLowerCase().includes(v.toLowerCase())))
      .join(" · ")
    const balance = layout.balance === null ? null : parseAmount(r[layout.balance] ?? "")
    lines.push({ day, amount: layout.invert ? -amount : amount, description, balance, ref: null })
  }
  return { lines: withRefs(lines), skipped }
}

/**
 * Gives each line without a bank id a stable one from its day, amount and text, numbered when the same
 * line appears twice, so importing a file again finds what it added the first time.
 */
export function withRefs(lines: Line[]) {
  const seen = new Map<string, number>()
  return lines.map((l) => {
    if (l.ref) return l
    const base = `${l.day}|${l.amount}|${descriptorKey(l.description)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...l, ref: `h:${hash(`${base}|${n}`)}` }
  })
}

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

// ---------- OFX / QFX ----------

/** True for OFX and QFX files, both the SGML (1.x) and XML (2.x) kinds. */
export const isOfx = (text: string) => /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))

/**
 * Reads an OFX or QFX statement: its lines, and the closing (ledger) balance with its day when given. A bank's
 * corrections apply within the file: CORRECTACTION REPLACE swaps out the line with the CORRECTFITID, and
 * DELETE drops it. The replacing line keeps that ref in `replaces`, and `withdrawn` lists the deleted refs,
 * so an entry imported from an earlier download can be found again.
 */
export function parseOfx(text: string) {
  // SGML OFX leaves leaf tags unclosed, so a value runs to the next tag or line end.
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1].trim() ?? ""
  const ofxDay = (v: string) => (v.length >= 8 ? valid(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8)) : null)
  const lines: Line[] = []
  const gone = new Set<string>()
  const withdrawn: string[] = []
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1]
    const fixes = tag(b, "CORRECTFITID") ? `ofx:${tag(b, "CORRECTFITID")}` : ""
    if (fixes) gone.add(fixes)
    if (fixes && tag(b, "CORRECTACTION").toUpperCase() === "DELETE") {
      withdrawn.push(fixes)
      continue
    }
    const day = ofxDay(tag(b, "DTPOSTED") || tag(b, "DTUSER"))
    const amount = parseAmount(tag(b, "TRNAMT"))
    if (!day || !amount) continue
    const name = tag(b, "NAME") || tag(b, "PAYEE")
    const memo = tag(b, "MEMO")
    const description = [name, memo && memo !== name ? memo : ""].filter(Boolean).join(" · ").replace(/&amp;/g, "&")
    const ref = tag(b, "FITID") ? `ofx:${tag(b, "FITID")}` : null
    lines.push({ day, amount, description, balance: null, ref, ...(fixes ? { replaces: fixes } : {}) })
  }
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[1] ?? ""
  const balance = ledger ? parseAmount(tag(ledger, "BALAMT")) : null
  const accountId = tag(text, "ACCTID")
  return {
    // A correction can come before the line it corrects, so they go once every line is read.
    lines: withRefs(lines.filter((l) => !l.ref || !gone.has(l.ref))),
    withdrawn,
    closing: balance,
    closingDay: ledger ? ofxDay(tag(ledger, "DTASOF")) : null,
    currency: tag(text, "CURDEF").toLowerCase() || null,
    /** Which account it is: a card statement (CCSTMTRS) or a bank one, and the bank's account number. */
    account: {
      id: accountId || null,
      type: /<CCSTMTRS>|<CCACCTFROM>/i.test(text) ? ("credit" as const) : ("bank" as const),
    },
  }
}

/** The account number a CSV's lines above its header name, as its last four digits ("Account ****5678"). */
export function csvAccountHint(rows: string[][], layout: Layout) {
  // Dates in the preamble ("Statement 01/10/2026") aren't account numbers.
  const above = rows
    .slice(0, Math.max(0, layout.header))
    .flat()
    .join(" ")
    .replace(/\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/g, " ")
  const masked = above.match(/(?:\*|x|X|•){2,}\s?(\d{4})\b/)?.[1]
  if (masked) return masked
  const runs = (above.match(/\d[\d -]*\d/g) ?? []).map((r) => r.replace(/\D/g, "")).filter((r) => r.length >= 4)
  return runs.sort((x, y) => y.length - x.length)[0]?.slice(-4) ?? null
}

// ---------- bank text to payees ----------

// Card processors and wallets that prefix the merchant: "PAYPAL *SPOTIFY", "SQ *BLUE BOTTLE".
const PROCESSOR =
  /^(paypal|pp|sq|sqr|tst|sp|sumup|zettle|iz|izettle|google|gpay|apple pay|amzn mktp|crv|wpy|pay)\s?\*\s?/i
// Words banks add around the merchant, in English, German, French, Spanish and Dutch.
const NOISE = new Set(
  [
    "card payment purchase pos debit credit visa mastercard maestro contactless cnp direct dd so standing order",
    "faster payments fps fpi fpo bacs transfer trf tfr to from on at via ref reference gb gbr uk usa us ie de fr nl",
    "es it eur usd gbp ltd limited inc plc llc gmbh bv sarl www com net org co the and",
    "kartenzahlung lastschrift basislastschrift gutschrift überweisung ueberweisung dauerauftrag sepa",
    "paiement carte cb prelevement prélèvement virement achat compra pago tarjeta transferencia recibo",
    "betaalautomaat pinbetaling incasso overboeking",
  ]
    .join(" ")
    .split(" ")
)

/** Bank text reduced to the words that name the merchant, for matching and for remembering payees. */
export function descriptorKey(text: string) {
  const words = text
    .toLowerCase()
    .replace(PROCESSOR, "")
    .replace(/\b(on|date)\s+\d{1,2}\s*[a-z]{3}\b.*$/, "") // "… ON 03 NOV …" to the end
    .replace(/\S*\d\S*/g, " ") // card numbers, references and amounts: any word with a digit in it
    .replace(/[^\p{L}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
  return words.slice(0, 3).join(" ")
}

const title = (s: string) => s.replace(/\p{L}[\p{L}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())

/**
 * The payee for a statement line: a remembered alias first, then a past payee the text names, then the text
 * itself tidied ("CARD PAYMENT TO TESCO STORES 3211 ON 03 NOV" is "Tesco Stores").
 */
export function payeeFor(description: string, known: string[], aliases: Record<string, string>) {
  const key = descriptorKey(description)
  if (aliases[key]) return aliases[key]
  const words = ` ${key} `
  let best = ""
  for (const name of known) {
    const k = descriptorKey(name)
    if (k && words.includes(` ${k} `) && k.length > descriptorKey(best).length) best = name
  }
  if (best) return best
  // "Boots · BOOTS 1123" names the merchant twice.
  return title([...new Set(key.split(" "))].join(" ")) || description.trim().slice(0, 60)
}

/** How alike two payee texts are, from 0 to 1: the share of the shorter one's words found in the other. */
export function similarity(a: string, b: string) {
  const x = new Set(descriptorKey(a).split(" ").filter(Boolean))
  const y = new Set(descriptorKey(b).split(" ").filter(Boolean))
  if (!x.size || !y.size) return 0
  let common = 0
  for (const w of x) if (y.has(w) || [...y].some((v) => v.length > 3 && (v.startsWith(w) || w.startsWith(v)))) common++
  return common / Math.min(x.size, y.size)
}

// ---------- matching ----------

/** A Kosha entry that a statement line can match. */
export type Entry = { id: string; day: string; amount: number; name: string; ref: string | null }
/**
 * A statement line matched to an entry. A "split" is one line that is several entries (or several lines that
 * are one entry), so it shows up as one pair per line and entry. "corrected" is a bank correction of an entry
 * imported earlier with a different amount, which, like "close", the person settles.
 */
export type Pair = { line: number; entry: string; kind: "ref" | "exact" | "split" | "close" | "corrected" }
/** Lines and entries whose amounts add up, but which aren't matched on their own since another way could. */
export type Split = { lines: number[]; entries: string[] }

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Groups of 2 or 3 items whose values add up to `total`. */
function sums<T>(items: T[], total: number, value: (t: T) => number) {
  const out: T[][] = []
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++) {
      const ab = value(items[a]) + value(items[b])
      if (ab === total) out.push([items[a], items[b]])
      for (let c = b + 1; c < items.length; c++)
        if (ab + value(items[c]) === total) out.push([items[a], items[b], items[c]])
    }
  return out
}

/**
 * Pairs statement lines with Kosha entries, each used once. A bank id that Kosha stored matches first, also
 * through a bank's correction of it. Then the same amount within `before` days before or `after` days after the
 * entry (banks post a few days late), closest and most alike first. Then splits: a line that is 2 or 3 entries
 * together, or the other way round, matched only when it is the one way to make that sum and the names agree;
 * other ways come back in `splits` to suggest. Lines left over that look like an entry with a different amount
 * (a tip, a currency rate) become "close" pairs to confirm. What is left is missing from Kosha, or not on the
 * statement.
 */
export function matchLines(lines: Line[], entries: Entry[], before = 3, after = 7) {
  const pairs: Pair[] = []
  const usedLine = new Set<number>()
  const usedEntry = new Set<string>()
  const take = (line: number, entry: string, kind: Pair["kind"]) => {
    pairs.push({ line, entry, kind })
    usedLine.add(line)
    usedEntry.add(entry)
  }
  const byRef = new Map(entries.filter((e) => e.ref).map((e) => [e.ref!, e]))
  lines.forEach((l, i) => {
    const own = l.ref ? byRef.get(l.ref) : undefined
    const e = own ?? (l.replaces ? byRef.get(l.replaces) : undefined)
    if (!e || usedEntry.has(e.id)) return
    take(i, e.id, own || l.amount === e.amount ? "ref" : "corrected")
  })
  const near = (l: Line, e: Entry) => {
    const d = dayDiff(e.day, l.day)
    return d >= -before && d <= after
  }
  const scored = (kind: "exact" | "close") => {
    const list: { line: number; entry: string; score: number }[] = []
    lines.forEach((l, i) => {
      if (usedLine.has(i)) return
      for (const e of entries) {
        if (usedEntry.has(e.id) || !near(l, e)) continue
        const d = dayDiff(e.day, l.day)
        const sim = similarity(l.description, e.name)
        if (kind === "exact") {
          if (l.amount !== e.amount) continue
          list.push({ line: i, entry: e.id, score: Math.abs(d) + (1 - sim) * 4 })
        } else {
          const off = Math.abs(l.amount - e.amount)
          const same = Math.sign(l.amount) === Math.sign(e.amount)
          if (!same || sim < 0.5 || Math.abs(d) > 3 || off > Math.max(Math.abs(e.amount) * 0.25, 500)) continue
          list.push({ line: i, entry: e.id, score: Math.abs(d) + off / Math.abs(e.amount) })
        }
      }
    })
    for (const c of list.sort((a, b) => a.score - b.score))
      if (!usedLine.has(c.line) && !usedEntry.has(c.entry)) take(c.line, c.entry, kind)
  }
  scored("exact")

  // Parts have the same sign and are smaller than their whole. ponytail: only the 12 nearest parts are tried,
  // so a split with a part further off stays unmatched.
  const parts = <T>(whole: number, list: T[], amount: (t: T) => number, gap: (t: T) => number) =>
    list
      .filter((t) => Math.sign(amount(t)) === Math.sign(whole) && Math.abs(amount(t)) < Math.abs(whole))
      .sort((a, b) => gap(a) - gap(b))
      .slice(0, 12)
  const open = entries.filter((e) => !usedEntry.has(e.id))
  const free = lines.map((l, i) => ({ l, i })).filter(({ i }) => !usedLine.has(i))
  const groups: (Split & { alike: boolean })[] = []
  for (const { l, i } of free) {
    const list = parts(
      l.amount,
      open.filter((e) => near(l, e)),
      (e) => e.amount,
      (e) => Math.abs(dayDiff(e.day, l.day))
    )
    for (const g of sums(list, l.amount, (e) => e.amount))
      groups.push({
        lines: [i],
        entries: g.map((e) => e.id),
        alike: g.every((e) => similarity(l.description, e.name) >= 0.5),
      })
  }
  for (const e of open) {
    const list = parts(
      e.amount,
      free.filter(({ l }) => near(l, e)),
      ({ l }) => l.amount,
      ({ l }) => Math.abs(dayDiff(e.day, l.day))
    )
    for (const g of sums(list, e.amount, ({ l }) => l.amount))
      groups.push({
        lines: g.map(({ i }) => i),
        entries: [e.id],
        alike: g.every(({ l }) => similarity(l.description, e.name) >= 0.5),
      })
  }
  // A group is sure when nothing it holds could be part of another group.
  const uses = new Map<string, number>()
  const keys = (g: Split) => [...g.lines.map((i) => `l${i}`), ...g.entries.map((id) => `e${id}`)]
  for (const g of groups) for (const k of keys(g)) uses.set(k, (uses.get(k) ?? 0) + 1)
  const sure = groups.filter((g) => g.alike && keys(g).every((k) => uses.get(k) === 1))
  for (const g of sure) for (const i of g.lines) for (const id of g.entries) take(i, id, "split")

  scored("close")
  return {
    pairs,
    missing: lines.map((_, i) => i).filter((i) => !usedLine.has(i)),
    extra: entries.filter((e) => !usedEntry.has(e.id)).map((e) => e.id),
    splits: groups
      .filter((g) => !sure.includes(g) && g.lines.every((i) => !usedLine.has(i)))
      .filter((g) => g.entries.every((id) => !usedEntry.has(id)))
      .map(({ lines, entries }): Split => ({ lines, entries })),
  }
}

// ---------- finding a difference ----------

export type Hint = { text: string; ids: string[] }
type Item = { id: string; amount: number; day: string; name: string }

/** Every amount made by swapping two neighbouring digits of `cents`, e.g. 5400 gives 4500 and 5040. */
function swaps(cents: number) {
  const s = String(Math.abs(cents)).padStart(3, "0")
  const out = new Set<number>()
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1]) continue
    out.add(Number(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2)) * Math.sign(cents))
  }
  return [...out]
}

/**
 * Bookkeepers' checks for a reconciliation that is out by `diff` (statement minus what's ticked), most
 * specific first. Each hint names the entries it is about. `money` formats cents for the text.
 */
export function differenceHints(
  diff: number,
  ticked: Item[],
  unticked: Item[],
  statementDay: string,
  money: (cents: number) => string
): Hint[] {
  if (!diff) return []
  const out: Hint[] = []
  const name = (e: Item) => e.name || m.reconcile_hint_an_entry()
  // Ticking one more entry, or unticking one, closes it.
  for (const e of unticked.filter((e) => e.amount === diff))
    out.push({
      text: m.reconcile_hint_exact_unticked({ name: name(e), amount: money(e.amount) }),
      ids: [e.id],
    })
  for (const e of ticked.filter((e) => e.amount === -diff))
    out.push({
      text: m.reconcile_hint_exact_ticked({ name: name(e), amount: money(e.amount) }),
      ids: [e.id],
    })
  // An entry with the wrong sign is off by twice its amount.
  if (diff % 2 === 0)
    for (const e of ticked.filter((e) => e.amount === -diff / 2))
      out.push({
        text: (e.amount < 0 ? m.reconcile_hint_wrong_way_in : m.reconcile_hint_wrong_way_out)({ name: name(e) }),
        ids: [e.id],
      })
  // Two digits swapped while typing always leave a difference divisible by 9.
  if (Math.abs(diff) % 9 === 0)
    for (const e of ticked) {
      const meant = swaps(e.amount).find((v) => v - e.amount === diff)
      if (meant !== undefined)
        out.push({
          text: m.reconcile_hint_swapped({ name: name(e), meant: money(meant), amount: money(e.amount) }),
          ids: [e.id],
        })
    }
  // A misplaced decimal point (164.67 for 1,646.70) is off by the entry times 9, 99 or 999.
  for (const e of ticked)
    for (const k of [10, 100, 1000]) {
      if (diff === e.amount * (k - 1))
        out.push({
          text: m.reconcile_hint_decimal({ name: name(e), meant: money(e.amount * k), amount: money(e.amount) }),
          ids: [e.id],
        })
      else if (diff * k === -e.amount * (k - 1) && e.amount % k === 0)
        out.push({
          text: m.reconcile_hint_decimal({ name: name(e), meant: money(e.amount / k), amount: money(e.amount) }),
          ids: [e.id],
        })
    }
  // Two unticked entries that together make the difference.
  const small = unticked.slice(0, 80)
  for (let i = 0; i < small.length && out.length < 6; i++)
    for (let j = i + 1; j < small.length; j++)
      if (small[i].amount + small[j].amount === diff) {
        out.push({
          text: m.reconcile_hint_pair({ first: name(small[i]), second: name(small[j]) }),
          ids: [small[i].id, small[j].id],
        })
        break
      }
  // The same payment entered twice.
  for (const e of ticked)
    for (const f of ticked)
      if (
        e.id < f.id &&
        e.amount === f.amount &&
        e.amount === -diff &&
        Math.abs(dayDiff(e.day, f.day)) <= 3 &&
        similarity(e.name, f.name) >= 0.5
      )
        out.push({ text: m.reconcile_hint_duplicate({ name: name(e) }), ids: [e.id, f.id] })
  // Entries at the very end of the period often reach the bank on the next statement.
  const late = ticked.filter((e) => e.day > addDays(statementDay, -3) && e.day <= statementDay)
  if (late.length && !out.length)
    out.push({
      text: m.reconcile_hint_late(),
      ids: late.map((e) => e.id),
    })
  if (!out.length)
    out.push({
      text: (diff < 0 ? m.reconcile_hint_look_out : m.reconcile_hint_look_in)({ amount: money(Math.abs(diff)) }),
      ids: [],
    })
  return out.slice(0, 6)
}

// ---------- planning a reconciliation ----------

/**
 * What a reconciliation starts from: which statement lines match Kosha's entries, which are missing, and
 * which entries count as ticked. With a statement, its period starts at its first line; an entry from before
 * then that matches no line was on an earlier statement, so it counts as ticked, and in the period only
 * matched entries are. Every entry of a split counts as matched. A close match (a tip, a currency rate) or a
 * bank's correction to another amount is never ticked until settled. Without a statement, every paid entry up
 * to the statement day is ticked. `rejected` holds the refs of lines the person said aren't the same as their
 * close match. `withdrawn` holds refs a bank's correction deleted: their entries match nothing and come back in
 * `withdrawn` for the person to look at, since Kosha never deletes an entry by itself.
 */
export function planReconciliation(o: {
  lines: Line[]
  open: (Entry & { paid: number })[]
  done: Entry[]
  statementDay: string
  lastDay: string | null
  rejected?: Set<string>
  withdrawn?: string[]
}) {
  const gone = new Set(o.withdrawn)
  const entries = [...o.open, ...o.done].filter((e) => !e.ref || !gone.has(e.ref))
  const match = o.lines.length ? matchLines(o.lines, entries) : null
  const openIds = new Set(o.open.map((e) => e.id))
  const settle = (p: Pair) => p.kind === "close" || p.kind === "corrected"
  const pairs = (match?.pairs ?? []).filter((p) => !(settle(p) && o.rejected?.has(o.lines[p.line].ref ?? "")))
  const paired = new Set(pairs.map((p) => p.line))
  const matched = new Set(pairs.filter((p) => !settle(p) && openIds.has(p.entry)).map((p) => p.entry))
  const close = pairs.filter((p) => settle(p) && openIds.has(p.entry))
  const withdrawn = new Set(o.open.filter((e) => e.ref && gone.has(e.ref)).map((e) => e.id))
  const firstLine = o.lines.reduce((m, l) => (l.day < m ? l.day : m), "9999-12-31")
  const periodStart = o.lines.length ? firstLine : o.lastDay ? addDays(o.lastDay, 1) : addDays(o.statementDay, -45)
  const inPeriod = (e: { id: string; day: string }) =>
    e.day <= o.statementDay && (e.day >= periodStart || matched.has(e.id) || withdrawn.has(e.id))
  const ticks = (e: { id: string; day: string; paid: number }) =>
    e.day <= o.statementDay && (o.lines.length ? !inPeriod(e) || matched.has(e.id) : e.paid === 1)
  return {
    pairs,
    missing: o.lines.map((_, i) => i).filter((i) => !paired.has(i)),
    matched,
    close,
    splits: (match?.splits ?? []).filter((s) => s.entries.every((id) => openIds.has(id))),
    withdrawn: [...withdrawn],
    periodStart,
    inPeriod,
    ticks,
  }
}

// ---------- getting started: many statements at once ----------

// Common merchants and words, mapped to Kosha's starting categories, so a first import sorts much of itself
// even without AI or any rules yet. Only categories the person still has are used.
const STARTER: [RegExp, string, "in" | "out"][] = [
  [
    /\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co ?op|ocado|rewe|edeka|kaufland|netto|penny|carrefour|auchan|leclerc|intermarche|mercadona|albert heijn|jumbo|whole foods|trader joe|safeway|kroger|publix|supermarket|grocer)/,
    "groceries",
    "out",
  ],
  [
    /\b(restaurant|cafe|caffe|coffee|starbucks|costa|pret|mcdonald|burger king|kfc|subway|nando|pizza|domino|deliveroo|uber ?eats|just ?eat|doordash|grubhub|wolt|bistro|sushi|trattoria|bakery|pub)/,
    "dining",
    "out",
  ],
  [
    /\b(amazon|amzn|ebay|etsy|zara|primark|uniqlo|ikea|argos|john lewis|decathlon|zalando|asos|apple store|best buy|target)/,
    "shopping",
    "out",
  ],
  [
    /\b(uber|lyft|bolt|free ?now|taxi|tfl|transport for london|trainline|railway|deutsche bahn|sncf|renfe|metro|bus|shell|esso|texaco|fuel|petrol|parking|citymapper)/,
    "transit",
    "out",
  ],
  [/\b(rent|landlord|mortgage|letting)/, "home", "out"],
  [
    /\b(electric|energy|octopus|british gas|edf|eon|water|council tax|broadband|vodafone|o2|ee|three|verizon|t mobile|insurance|account fee|monthly fee|service charge|overdraft)/,
    "bills",
    "out",
  ],
  [
    /\b(netflix|spotify|disney|hbo|prime video|youtube|apple tv|audible|cinema|odeon|steam|playstation|xbox|nintendo|ticketmaster)/,
    "entertainment",
    "out",
  ],
  [/\b(pharmacy|boots|chemist|apotheke|doctor|dentist|hospital|clinic|optician|gym|puregym|fitness)/, "health", "out"],
  [
    /\b(airline|airways|ryanair|easyjet|wizz|lufthansa|klm|air france|vueling|hotel|airbnb|booking com|expedia|hostel)/,
    "travel",
    "out",
  ],
  [/\b(salary|payroll|wages|gehalt|salaire)/, "salary", "in"],
  [/\b(interest|refund|cashback|dividend|reimburse)/, "other_income", "in"],
]

/** A starting category for a payee from a few well-known names and words, or null. */
export function starterCategory(text: string, income: boolean, have: Set<string>) {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ")} `
  for (const [re, id, way] of STARTER) if ((way === "in") === income && have.has(id) && re.test(t)) return id
  return null
}

/**
 * Lines of different accounts that look like one transfer: money out of one and the same amount into the
 * other within `days` days, closest first, each line used once. Returns pairs of line keys, out first.
 */
export function pairTransfers(
  lines: { key: string; account: string; day: string; amount: number }[],
  days = 3
): [string, string][] {
  const outs = lines.filter((l) => l.amount < 0)
  const ins = lines.filter((l) => l.amount > 0)
  const cands: { o: string; i: string; d: number }[] = []
  for (const o of outs)
    for (const i of ins) {
      if (i.account === o.account || i.amount !== -o.amount) continue
      const d = Math.abs(dayDiff(o.day, i.day))
      if (d <= days) cands.push({ o: o.key, i: i.key, d })
    }
  const used = new Set<string>()
  const out: [string, string][] = []
  for (const c of cands.sort((a, b) => a.d - b.d)) {
    if (used.has(c.o) || used.has(c.i)) continue
    used.add(c.o)
    used.add(c.i)
    out.push([c.o, c.i])
  }
  return out
}

/**
 * Checks one account's statements join up: a gap of more than a few days between one and the next, or a
 * statement that doesn't open where the one before closed, means one is likely missing.
 */
export function statementGaps(
  files: { name: string; from: string; to: string; opening: number | null; closing: number | null }[],
  money: (cents: number) => string,
  label: (day: string) => string
) {
  const sorted = [...files].sort((a, b) => a.from.localeCompare(b.from))
  const out: string[] = []
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]]
    if (dayDiff(a.to, b.from) > 5)
      out.push(m.reconcile_gap_uncovered({ from: label(addDays(a.to, 1)), to: label(addDays(b.from, -1)) }))
    else if (a.closing !== null && b.opening !== null && a.closing !== b.opening)
      out.push(
        m.reconcile_gap_opening({
          next: b.name,
          opening: money(b.opening),
          previous: a.name,
          closing: money(a.closing),
        })
      )
  }
  return out
}

/**
 * One account's lines from several statements, each line once. Statements that overlap (a yearly export and
 * a monthly one, or the same file twice) share lines: the same bank id, or in days an earlier statement
 * covers, the same day and amount. Within one statement, two equal lines are two payments. A line another
 * statement's bank correction replaced or withdrew is left out.
 */
export function mergeStatements<L extends Line>(files: { lines: L[]; withdrawn?: string[] }[]) {
  const corrected = new Set(files.flatMap((f) => [...(f.withdrawn ?? []), ...f.lines.flatMap((l) => l.replaces ?? [])]))
  const span = (f: { lines: L[] }) => [
    Math.min(...f.lines.map((l) => +l.day.replace(/-/g, ""))),
    Math.max(...f.lines.map((l) => +l.day.replace(/-/g, ""))),
  ]
  const sorted = files.filter((f) => f.lines.length).sort((a, b) => span(a)[0] - span(b)[0])
  const refs = new Set<string>()
  const counts = new Map<string, number>()
  const covered: number[][] = []
  const out: L[] = []
  for (const f of sorted) {
    const kept: L[] = []
    for (const l of f.lines) {
      const k = `${l.day}|${l.amount}`
      const d = +l.day.replace(/-/g, "")
      const seen = covered.some(([a, b]) => d >= a && d <= b) ? (counts.get(k) ?? 0) : 0
      if (seen) counts.set(k, seen - 1)
      if (seen || (l.ref && (refs.has(l.ref) || corrected.has(l.ref)))) continue
      kept.push(l)
    }
    for (const l of kept) {
      if (l.ref) refs.add(l.ref)
      counts.set(`${l.day}|${l.amount}`, (counts.get(`${l.day}|${l.amount}`) ?? 0) + 1)
    }
    covered.push(span(f))
    out.push(...kept)
  }
  return out
}
