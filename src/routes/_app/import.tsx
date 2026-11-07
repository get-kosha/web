import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  CaretRightIcon,
  CheckCircleIcon,
  FileArrowUpIcon,
  SpinnerGapIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AiMark } from "@/components/ai"
import { dayLabel } from "@/components/date-time"
import { takeFiles } from "@/components/get-started"
import { Pick } from "@/components/pick"
import { PageHeader, PageSkeleton, useMeta } from "@/components/shell"
import { Columns, columnsStatus, fileBase64, fileText } from "@/components/statement-file"
import {
  finishImport,
  getImportMemory,
  getImportEntries,
  importLines,
  importTransferPairs,
  readCsvLayout,
  readStatementPdf,
  recurringSuggestions,
  saveAccount,
  tidyStatementLines,
} from "@/lib/api"
import { dayOf, fmt, guessCategory, intlLocale, isNeutral, parseAmount } from "@/lib/core"
import {
  csvAccountHint,
  descriptorKey,
  guessDateFormat,
  guessLayout,
  isOfx,
  layoutSignature,
  matchLines,
  mergeStatements,
  pairTransfers,
  parseCsv,
  parseOfx,
  payeeFor,
  readCsv,
  starterCategory,
  statementGaps,
  type Layout,
  type Line,
} from "@/lib/statement"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_app/import")({
  loader: () => getImportMemory(),
  head: () => ({ meta: [{ title: m.import_head_title() }] }),
  pendingComponent: PageSkeleton,
  component: Import,
})

type Kind = "bank" | "credit"
type StLine = Line & { payee?: string }
/** A statement read from a file. Balances are as the bank prints them: for a card, what is owed. */
type Stmt = {
  id: string
  file: string
  source: "csv" | "ofx" | "pdf"
  lines: StLine[]
  /** OFX only: refs of earlier lines the bank's corrections deleted. */
  withdrawn?: string[]
  rows?: string[][]
  layout?: Layout
  signature?: string
  remembered?: boolean
  byAi?: boolean
  confident?: boolean
  opening: number | null
  closing: number | null
  closingDay: string | null
  /** For a PDF read by AI: how far its lines miss its closing balance. */
  off: number | null
  currency: string | null
  type: Kind | null
  last4: string | null
  /** Which account it is from: statements with the same key go to the same account. */
  key: string
  /** A name for that account. */
  title: string
  acct: string
}
/** Where a group of statements goes: a new account, or the id of one the person has. */
type Acct = { id: string; target: string; name: string; type: Kind; currency: string; limit: string; closing?: string }
type Row = StLine & { key: string; acct: string }
type Group = {
  id: string
  payee: string
  income: boolean
  raws: string[]
  lines: Row[]
  category: string
  aiPayee: boolean
  aiCategory: boolean
}

const span = (lines: { day: string }[]) =>
  lines.length
    ? lines.reduce((r, l) => ({ from: l.day < r.from ? l.day : r.from, to: l.day > r.to ? l.day : r.to }), {
        from: lines[0].day,
        to: lines[0].day,
      })
    : null
/** A count for a plural message: the number to pick the form, and how it shows. */
const num = (count: number) => ({ count, n: count.toLocaleString(intlLocale()) })
const fileTitle = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[\d_\-.()[\]]+/g, " ")
    .replace(/\b(statement|export|transactions?|download|account)\b/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
// Words that don't tell one account from another, so "Account ••1234" doesn't match "Savings account".
const GENERIC = /^(account|current|checking|cheque|savings?|credit|card|bank|joint|main|personal|everyday)$/
const words = (s: string) =>
  descriptorKey(s)
    .split(" ")
    .filter((w) => w && !GENERIC.test(w))
const sameAccount = (a: Stmt, b: Omit<Stmt, "acct">) => {
  if (a.key !== b.key) return false
  if (/^(ofx|last4):/.test(a.key)) return true
  // Two exports in the same format that cover the same days without sharing a line are two accounts.
  const x = span(a.lines)
  const y = span(b.lines)
  if (!x || !y || x.to < y.from || y.to < x.from) return true
  const refs = new Set(a.lines.map((l) => l.ref))
  return b.lines.some((l) => refs.has(l.ref))
}
// Raw payee groups are the bank text's merchant words and the direction of the money.
const rawKey = (l: StLine) =>
  `${descriptorKey(l.description) || l.description.toLowerCase().trim().slice(0, 60)}|${l.amount < 0 ? "out" : "in"}`

/** The CSV's lines and balances with a layout. A card's running balance is ambiguous, so it's left out. */
function csvStmt(rows: string[][], layout: Layout, card: boolean) {
  const { lines } = readCsv(rows, layout)
  const asc = lines.length > 1 && lines[0].day <= lines[lines.length - 1].day
  const latest = asc ? lines[lines.length - 1] : lines[0]
  const oldest = asc ? lines[0] : lines[lines.length - 1]
  return {
    lines,
    layout,
    closing: card ? null : (latest?.balance ?? null),
    opening: card || oldest?.balance == null ? null : oldest.balance - oldest.amount,
    closingDay: span(lines)?.to ?? null,
  }
}

function Import() {
  const meta = useMeta()
  const router = useRouter()
  const memory = Route.useLoaderData()
  const [step, setStep] = useState<"files" | "review" | "saving" | "done">("files")
  // One state, so placing a statement updates both lists in one pure step.
  const [book, setBook] = useState<{ stmts: Stmt[]; accts: Acct[] }>({ stmts: [], accts: [] })
  const { stmts, accts } = book
  const setStmts = (f: (list: Stmt[]) => Stmt[]) => setBook((b) => ({ ...b, stmts: f(b.stmts) }))
  const setAccts = (f: (list: Acct[]) => Acct[]) => setBook((b) => ({ ...b, accts: f(b.accts) }))
  const [reading, setReading] = useState<{ id: string; name: string }[]>([])
  const [failed, setFailed] = useState<{ id: string; name: string; error: string }[]>([])
  const [already, setAlready] = useState<Record<string, Set<string>>>({})
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const today = dayOf(Date.now() / 1000, meta.tz)
  const accept = `.csv,.ofx,.qfx,.txt,text/csv${meta.ai.statements ? ",.pdf,application/pdf" : ""}`
  const wallets = meta.wallets.filter((w) => !w.archived && w.type !== "investment")
  const currencies = [...new Set([meta.primary, ...meta.wallets.map((w) => w.currency), "eur", "inr", "usd", "gbp"])]
  /** An account's details, from the wallet when it goes into one the person has. */
  const info = (a: Acct) => {
    const w = wallets.find((x) => x.id === a.target)
    return w
      ? { name: w.name, type: w.type, currency: w.currency, limit: w.credit_limit ?? 0, wallet: w }
      : {
          name: a.name.trim() || m.import_new_account(),
          type: a.type,
          currency: a.currency,
          limit: parseAmount(a.limit) ?? 0,
        }
  }

  // ---------- reading files ----------

  async function read(file: File): Promise<Omit<Stmt, "acct">> {
    const id = crypto.randomUUID()
    const base = { id, file: file.name, off: null, currency: null, opening: null, closing: null, closingDay: null }
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (!meta.ai.statements) throw new Error(m.import_error_pdf())
      const r = await readStatementPdf({ data: { name: file.name, data: await fileBase64(file) } })
      const credit = r.account.type === "credit"
      return {
        ...base,
        source: "pdf",
        lines: r.lines,
        byAi: true,
        opening: r.opening,
        closing: r.closing,
        closingDay: r.to ?? span(r.lines)?.to ?? null,
        off: r.off,
        currency: r.currency,
        type: r.account.type,
        last4: r.account.last4,
        key: r.account.last4
          ? `last4:${r.account.last4}`
          : r.account.name
            ? `name:${r.account.name.toLowerCase()}`
            : `file:${id}`,
        title:
          r.account.name ??
          `${credit ? m.import_type_card() : m.import_type_bank()}${r.account.last4 ? ` ••${r.account.last4}` : ""}`,
      }
    }
    const text = await fileText(file)
    if (isOfx(text)) {
      const r = parseOfx(text)
      if (!r.lines.length) throw new Error(m.import_error_no_transactions())
      const credit = r.account.type === "credit"
      const last4 = r.account.id?.slice(-4) ?? null
      return {
        ...base,
        source: "ofx",
        lines: r.lines,
        withdrawn: r.withdrawn,
        // Cards report what's owed as a negative balance.
        closing: r.closing === null ? null : credit ? -r.closing : r.closing,
        closingDay: r.closingDay ?? span(r.lines)?.to ?? null,
        currency: r.currency,
        type: r.account.type,
        last4,
        key: r.account.id ? `ofx:${r.account.id}` : `file:${id}`,
        title: `${credit ? m.import_type_card() : m.import_type_bank()}${last4 ? ` ••${last4}` : ""}`,
      }
    }
    const rows = parseCsv(text)
    if (rows.length < 2) throw new Error(m.import_error_no_rows())
    const card = /card|credit|visa|amex|master/i.test(file.name)
    const guess = guessLayout(rows, card)
    const signature = layoutSignature(rows, guess.layout)
    let layout = memory.layouts[signature] ?? guess.layout
    let byAi = false
    if (!memory.layouts[signature] && !guess.confident && meta.ai.statements) {
      try {
        const roles = await readCsvLayout({ data: { rows: rows.slice(0, 12).map((r) => r.slice(0, 60)) } })
        layout = {
          ...layout,
          ...roles,
          dateFormat:
            guessDateFormat(rows.slice(roles.header + 1).map((r) => r[roles.date] ?? "")) ?? layout.dateFormat,
        }
        byAi = true
      } catch {} // the guess stands, and the columns stay open to fix
    }
    const last4 = csvAccountHint(rows, layout)
    // Some exports (Monzo, Revolut) have a currency column; its first value is the account's currency.
    const ci = layout.header >= 0 ? rows[layout.header].findIndex((h) => /^currency$/i.test(h.trim())) : -1
    const currency = ci >= 0 ? (rows[layout.header + 1]?.[ci] ?? "").trim().toLowerCase() : ""
    return {
      ...base,
      ...csvStmt(rows, layout, card),
      source: "csv",
      currency: /^[a-z]{3}$/.test(currency) ? currency : null,
      rows,
      signature,
      remembered: !!memory.layouts[signature],
      byAi,
      confident: guess.confident || byAi,
      type: card ? "credit" : null,
      last4,
      key: last4 ? `last4:${last4}` : `sig:${signature}`,
      title: `${fileTitle(file.name) || (card ? m.import_type_card() : m.import_type_bank())}${last4 ? ` ••${last4}` : ""}`,
    }
  }

  /** Puts a statement with its account: one it shares a key with, else a new one, matched to a wallet if one fits. */
  function place(s: Omit<Stmt, "acct">) {
    const acct = crypto.randomUUID()
    setBook(({ stmts: list, accts: all }) => {
      const same = list.find((f) => sameAccount(f, s))
      if (same) return { stmts: [...list, { ...s, acct: same.acct }], accts: all }
      const taken = new Set(all.map((a) => a.target))
      const fits = wallets.filter(
        (w) =>
          !taken.has(w.id) &&
          ((s.last4 && w.name.includes(s.last4)) ||
            (words(w.name).length > 0 && words(w.name).every((x) => words(s.title).includes(x))))
      )
      const target = fits.length === 1 ? fits[0].id : "new"
      return {
        stmts: [...list, { ...s, acct }],
        accts: [
          ...all,
          { id: acct, target, name: s.title, type: s.type ?? "bank", currency: s.currency ?? meta.primary, limit: "" },
        ],
      }
    })
  }

  async function add(files: File[]) {
    const queue = files.map((file) => ({ id: crypto.randomUUID(), file }))
    setReading((r) => [...r, ...queue.map((q) => ({ id: q.id, name: q.file.name }))])
    // Three at a time: a PDF read by AI takes a while, and a year of them shouldn't queue behind each other.
    let next = 0
    const worker = async () => {
      while (next < queue.length) {
        const q = queue[next++]
        try {
          place(await read(q.file))
        } catch (e) {
          setFailed((f) => [
            ...f,
            { id: q.id, name: q.file.name, error: e instanceof Error ? e.message : m.import_error_unreadable() },
          ])
        } finally {
          setReading((r) => r.filter((x) => x.id !== q.id))
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }

  // Statements dropped on the Get started banner arrive with the page.
  useEffect(() => {
    const files = takeFiles()
    if (files.length) void add(files)
  }, [])

  // ---------- accounts ----------

  const live = accts.filter((a) => stmts.some((s) => s.acct === a.id))
  const patch = (id: string, p: Partial<Acct>) => setAccts((all) => all.map((a) => (a.id === id ? { ...a, ...p } : a)))
  function setType(a: Acct, type: Kind) {
    patch(a.id, { type })
    // A card's CSV often shows spending as positive; its running balance decides when it has one.
    setStmts((list) =>
      list.map((s) =>
        s.acct !== a.id || s.source !== "csv" || s.remembered || s.layout!.balance !== null
          ? s
          : {
              ...s,
              ...csvStmt(
                s.rows!,
                { ...s.layout!, invert: guessLayout(s.rows!, type === "credit").layout.invert },
                type === "credit"
              ),
            }
      )
    )
  }
  function move(s: Stmt, to: string) {
    const id = to === "new" ? crypto.randomUUID() : to
    setBook((b) => ({
      stmts: b.stmts.map((x) => (x.id === s.id ? { ...x, acct: id } : x)),
      accts:
        to === "new"
          ? [
              ...b.accts,
              {
                id,
                target: "new",
                name: s.title,
                type: s.type ?? "bank",
                currency: s.currency ?? meta.primary,
                limit: "",
              },
            ]
          : b.accts,
    }))
  }
  const linesOf = (a: Acct) => mergeStatements(stmts.filter((s) => s.acct === a.id))
  /** The closing balance from the latest statement that gives one, as the bank prints it. */
  const closingOf = (a: Acct) => {
    const list = stmts.filter((s) => s.acct === a.id && s.closing !== null && s.closingDay)
    const latest = list.sort((x, y) => y.closingDay!.localeCompare(x.closingDay!))[0]
    const day = latest?.closingDay ?? span(linesOf(a))?.to ?? today
    const text = a.closing ?? (latest ? (latest.closing! / 100).toFixed(2) : "")
    return { day, text, fromFile: a.closing === undefined && !!latest }
  }

  async function toReview() {
    setBusy(true)
    try {
      // Lines already in an account Kosha has are left out: by bank id, or the same amount within a few days.
      const found: Record<string, Set<string>> = {}
      for (const a of live) {
        const w = wallets.find((x) => x.id === a.target)
        if (!w?.entry_count) continue
        const lines = linesOf(a)
        const r = span(lines)
        if (!r) continue
        // An entry the bank withdrew stays as it is, but matches nothing. A line that corrects an entry counts as found.
        const gone = new Set(stmts.flatMap((s) => (s.acct === a.id ? (s.withdrawn ?? []) : [])))
        const entries = (await getImportEntries({ data: { walletId: w.id, ...r } })).filter(
          (e) => !gone.has(e.ref ?? "")
        )
        const m = matchLines(lines, entries)
        found[a.id] = new Set(m.pairs.filter((p) => p.kind !== "close").map((p) => lines[p.line].ref!))
      }
      setAlready(found)
      setStep("review")
      window.scrollTo({ top: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.import_error_check())
    } finally {
      setBusy(false)
    }
  }

  // ---------- review: payees, categories and transfers ----------

  const [edits, setEdits] = useState<Record<string, { payee?: string; category?: string }>>({})
  const [unpaired, setUnpaired] = useState<Set<string>>(new Set())
  const [tidy, setTidy] = useState<Record<string, { payee: string; categoryId: string | null }>>({})
  const [naming, setNaming] = useState(false)
  const guessing = meta.prefs.suggest_category === "1"
  const categories = meta.categories.filter((c) => !c.archived && !c.parent_id && !isNeutral(c.id))
  const have = new Set(categories.map((c) => c.id))

  const plan = useMemo(() => {
    if (step === "files") return null
    const rows: Row[] = live.flatMap((a) =>
      linesOf(a)
        .filter((l) => !already[a.id]?.has(l.ref!))
        .map((l) => ({ ...l, key: `${a.id}:${l.ref}`, acct: a.id }))
    )
    const byKey = new Map(rows.map((r) => [r.key, r]))
    // Money out of one account and into another on the same days is a transfer between them.
    const curOf = new Map(live.map((a) => [a.id, info(a).currency]))
    const pairs = [...new Set(curOf.values())]
      .flatMap((cur) =>
        pairTransfers(rows.filter((r) => curOf.get(r.acct) === cur).map((r) => ({ ...r, account: r.acct })))
      )
      .filter(([o]) => !unpaired.has(o))
      .map(([o, i]) => [byKey.get(o)!, byKey.get(i)!] as const)
    const paired = new Set(pairs.flatMap(([o, i]) => [o.key, i.key]))

    const fits = (id: string | null | undefined, income: boolean) =>
      id && categories.some((c) => c.id === id && !!c.income === income) ? id : undefined
    // What Kosha would pick for a raw group by itself: remembered names, rules, AI, then well-known merchants.
    const guess = (l: StLine) => {
      const key = descriptorKey(l.description)
      const income = l.amount > 0
      const ai = tidy[key]
      const own = memory.aliases[key] ?? l.payee
      const payee = own ?? ai?.payee ?? payeeFor(l.description, meta.titles, memory.aliases)
      const ruled = guessing
        ? (fits(guessCategory(payee, meta.rules), income) ?? fits(guessCategory(l.description, meta.rules), income))
        : undefined
      const byAi = guessing && !ruled ? fits(ai?.categoryId, income) : undefined
      const category =
        ruled ?? byAi ?? (guessing ? starterCategory(`${payee} ${l.description}`, income, have) : null) ?? ""
      return { payee, category, aiPayee: !own && !!ai, aiCategory: !!byAi }
    }
    const raws = new Map<string, Row[]>()
    for (const r of rows) if (!paired.has(r.key)) raws.set(rawKey(r), [...(raws.get(rawKey(r)) ?? []), r])
    const groups = new Map<string, Group>()
    for (const [raw, lines] of [...raws].sort((x, y) => y[1].length - x[1].length)) {
      const g = guess(lines[0])
      const payee = (edits[raw]?.payee ?? g.payee).trim() || g.payee
      const income = lines[0].amount > 0
      const id = `${payee.toLowerCase()}|${income}`
      const group = groups.get(id)
      if (group) {
        group.raws.push(raw)
        group.lines.push(...lines)
        if (!group.category) group.category = edits[raw]?.category ?? g.category
      } else
        groups.set(id, {
          id,
          payee,
          income,
          raws: [raw],
          lines: [...lines],
          category: edits[raw]?.category ?? g.category,
          aiPayee: edits[raw]?.payee === undefined && g.aiPayee,
          aiCategory: edits[raw]?.category === undefined && g.aiCategory,
        })
    }
    // A category chosen for any part of a merged group goes for all of it.
    for (const g of groups.values()) {
      const chosen = g.raws.map((r) => edits[r]?.category).find(Boolean)
      if (chosen) Object.assign(g, { category: chosen, aiCategory: false })
    }
    const list = [...groups.values()].sort((x, y) => y.lines.length - x.lines.length)
    return { rows, pairs, list, guess, raws }
  }, [step, stmts, accts, already, unpaired, edits, tidy])

  // AI names payees and sorts what Kosha can't place itself, once, in chunks a model answers well.
  const tidyAsked = useRef(false)
  useEffect(() => {
    if (step !== "review" || !plan || tidyAsked.current) return
    if (!meta.ai.statements || meta.prefs.ai_share_payee !== "1") return
    tidyAsked.current = true
    const todo = new Map<string, { key: string; text: string; amount: number }>()
    for (const lines of plan.raws.values()) {
      const l = lines[0]
      const key = descriptorKey(l.description)
      if (!key || memory.aliases[key] || todo.has(key)) continue
      const g = plan.guess(l)
      if (!l.payee || !g.category) todo.set(key, { key, text: l.description, amount: l.amount })
    }
    const items = [...todo.values()]
    if (!items.length) return
    setNaming(true)
    void (async () => {
      for (let i = 0; i < items.length; i += 150) {
        try {
          const got = await tidyStatementLines({ data: { items: items.slice(i, i + 150) } })
          setTidy((t) => ({ ...t, ...got }))
        } catch {
          break // Kosha's own names stand
        }
      }
      setNaming(false)
    })()
  }, [step, plan])

  function editGroup(g: Group, p: { payee?: string; category?: string }) {
    setEdits((all) => {
      const next = { ...all }
      for (const r of g.raws) next[r] = { ...next[r], ...p }
      return next
    })
  }

  // ---------- saving ----------

  const [progress, setProgress] = useState({ done: 0, total: 1, label: "" })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    accounts: { name: string; lines: number; reconciled: string | null }[]
    lines: number
    transfers: number
    spotted: number
  } | null>(null)
  // What's already saved, so trying again after a failure carries on rather than starting over.
  const run = useRef({
    ids: {} as Record<string, string>,
    lines: {} as Record<string, number>,
    pairs: 0,
    remembered: false,
    finished: {} as Record<string, { reconciled: boolean }>,
  })

  async function save() {
    if (!plan) return
    setStep("saving")
    setError(null)
    window.scrollTo({ top: 0 })
    const r = run.current
    const groupOf = new Map(plan.list.flatMap((g) => g.lines.map((l) => [l.key, g])))
    const payload = (a: Acct) =>
      plan.rows
        .filter((l) => l.acct === a.id && groupOf.get(l.key) && groupOf.get(l.key)!.category !== "skip")
        .map((l) => {
          const g = groupOf.get(l.key)!
          const to = g.category.startsWith("t:")
            ? r.ids[g.category.slice(2)]
            : g.category.startsWith("w:")
              ? g.category.slice(2)
              : null
          return {
            day: l.day,
            amount: l.amount,
            name: to ? "" : g.payee,
            note: to ? g.payee : "",
            ...(to ? { transferWith: to } : { categoryId: g.category }),
            ref: l.ref!,
          }
        })
    const total = live.length * 2 + plan.rows.length - plan.pairs.length * 2 + plan.pairs.length + 1
    let done = 0
    const tick = (n: number, label: string) => {
      done += n
      setProgress({ done, total, label })
    }
    try {
      for (const a of live) {
        tick(0, m.import_progress_setup({ name: info(a).name }))
        if (!r.ids[a.id])
          r.ids[a.id] =
            a.target !== "new"
              ? a.target
              : (
                  await saveAccount({
                    data: {
                      name: info(a).name,
                      type: a.type,
                      currency: a.currency,
                      creditLimit: a.type === "credit" ? (parseAmount(a.limit) ?? 0) : null,
                      archived: false,
                      balance: null,
                    },
                  })
                ).id
        tick(1, m.import_progress_setup({ name: info(a).name }))
      }
      // Kosha remembers each bank's columns and the payee names, so the next statement reads straight away.
      const layouts = [
        ...new Map(
          stmts
            .filter((s) => s.source === "csv")
            .map((s) => [s.signature!, { signature: s.signature!, layout: s.layout! }])
        ).values(),
      ].slice(0, 50)
      const aliases = [
        ...new Map(
          plan.list.flatMap((g) =>
            g.raws.map((raw) => {
              const key = raw.slice(0, raw.lastIndexOf("|"))
              return [key, { key, payee: g.payee }] as const
            })
          )
        ).values(),
      ]
        .filter((x) => x.key && x.payee && x.key === descriptorKey(x.key))
        .slice(0, 2000)
      for (const a of live) {
        const list = payload(a)
        for (let i = r.lines[a.id] ?? 0; i < list.length; i += 500) {
          tick(0, m.import_progress_adding({ ...num(list.length), name: info(a).name }))
          await importLines({
            data: {
              walletId: r.ids[a.id],
              layouts: r.remembered ? [] : layouts,
              aliases: r.remembered ? [] : aliases,
              lines: list.slice(i, i + 500),
            },
          })
          r.remembered = true
          r.lines[a.id] = i + 500
          tick(Math.min(500, list.length - i), m.import_progress_adding({ ...num(list.length), name: info(a).name }))
        }
      }
      for (let i = r.pairs; i < plan.pairs.length; i += 200) {
        tick(0, m.import_progress_transfers())
        await importTransferPairs({
          data: {
            pairs: plan.pairs.slice(i, i + 200).map(([o, n]) => ({
              fromWalletId: r.ids[o.acct],
              toWalletId: r.ids[n.acct],
              sent: -o.amount,
              received: n.amount,
              day: o.day,
              refFrom: o.ref!,
              refTo: n.ref!,
            })),
          },
        })
        r.pairs = i + 200
        tick(Math.min(200, plan.pairs.length - i), m.import_progress_transfers())
      }
      for (const a of live) {
        tick(0, m.import_progress_checking({ name: info(a).name }))
        if (!r.finished[a.id]) {
          const own = plan.rows.filter((l) => l.acct === a.id)
          const c = closingOf(a)
          const printed = parseAmount(c.text)
          const credit = info(a).type === "credit"
          r.finished[a.id] = await finishImport({
            data: {
              walletId: r.ids[a.id],
              firstDay: span(own)?.from ?? c.day,
              closing:
                printed === null ? null : { day: c.day, balance: credit ? info(a).limit - Math.abs(printed) : printed },
              keep: a.target === "new" ? null : (info(a).wallet?.balance ?? 0),
            },
          })
        }
        tick(1, m.import_progress_checking({ name: info(a).name }))
      }
      await router.invalidate()
      const spotted = await recurringSuggestions()
        .then((s) => s.length)
        .catch(() => 0)
      tick(1, m.common_done())
      setResult({
        accounts: live.map((a) => ({
          name: info(a).name,
          lines: plan.rows.filter((l) => l.acct === a.id).length,
          reconciled: r.finished[a.id]?.reconciled ? closingOf(a).day : null,
        })),
        lines: plan.rows.length,
        transfers: plan.pairs.length,
        spotted,
      })
      setStep("done")
    } catch (e) {
      setError(e instanceof Error ? e.message : m.common_something_went_wrong())
    }
  }

  // ---------- pages ----------

  if (step === "saving")
    return (
      <div className="pb-8">
        <PageHeader title={m.import_importing()} />
        <div className="px-4 md:px-8">
          <Card className="max-w-xl gap-4 px-6 max-md:px-4" aria-live="polite">
            {error ? (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                  {m.import_failed({ error })}
                </p>
                <div className="flex gap-2">
                  <Button onClick={save}>{m.common_try_again()}</Button>
                  <Button variant="outline" className="bg-card" onClick={() => setStep("review")}>
                    {m.import_back_to_review()}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <SpinnerGapIcon className="size-4 animate-spin text-brand" /> {progress.label}…
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full origin-left rounded-full bg-brand transition-transform duration-300 ease-out"
                    style={{ transform: `scaleX(${Math.min(1, progress.done / progress.total)})` }}
                  />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    )

  if (step === "done" && result)
    return (
      <div className="pb-8">
        <div className="px-4 pt-6 md:px-8 md:pt-10">
          <Card className="rise-in max-w-xl gap-5 px-7 py-8 max-md:px-5">
            <CheckCircleIcon weight="fill" className="size-10 text-positive" />
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{m.import_done_title()}</h1>
              <p className="mt-1.5 text-[15px] text-subtle-foreground">
                {result.transfers
                  ? m.import_done_summary_transfers({
                      ...num(result.lines),
                      accounts: result.accounts.length,
                      a: num(result.accounts.length).n,
                      transfers: result.transfers,
                      t: num(result.transfers).n,
                    })
                  : m.import_done_summary({
                      ...num(result.lines),
                      accounts: result.accounts.length,
                      a: num(result.accounts.length).n,
                    })}
              </p>
            </div>
            <ul className="grid gap-2 text-sm">
              {result.accounts.map((a) => (
                <li key={a.name} className="flex items-baseline justify-between gap-3 border-t pt-2 first:border-t-0">
                  <span className="min-w-0 truncate font-medium">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.reconciled
                      ? m.import_done_matches({ day: dayLabel(a.reconciled) })
                      : m.import_transactions(num(a.lines))}
                  </span>
                </li>
              ))}
            </ul>
            {result.spotted > 0 && (
              <Link
                to="/subscriptions"
                className="flex items-center justify-between gap-3 rounded-xl bg-brand-soft/60 px-4 py-3 text-sm transition-colors hover:bg-brand-soft"
              >
                {m.import_done_recurring(num(result.spotted))}
                <ArrowRightIcon className="size-4 shrink-0" />
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link to="/" />} size="lg" className="h-11 px-5">
                {m.import_done_overview()}
              </Button>
              <Button
                nativeButton={false}
                render={<Link to="/transactions" />}
                variant="outline"
                size="lg"
                className="h-11 bg-card px-5"
              >
                {m.import_done_transactions()}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )

  if (step === "review" && plan)
    return (
      <ReviewStep
        list={plan.list}
        pairs={plan.pairs}
        total={plan.rows.length}
        accounts={live.map((a) => ({ id: a.id, ...info(a) }))}
        others={wallets.filter((w) => !live.some((a) => a.target === w.id))}
        categories={categories}
        naming={naming}
        onEdit={editGroup}
        onUnpair={(key) => setUnpaired((u) => new Set(u).add(key))}
        onBack={() => setStep("files")}
        onImport={save}
      />
    )

  // ---------- files and accounts ----------

  const totalLines = live.reduce((t, a) => t + linesOf(a).length, 0)
  const unnamed = live.some((a) => a.target === "new" && !a.name.trim())
  const empty = !stmts.length && !reading.length

  const dropZone = (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed text-center transition-colors",
        empty ? "px-6 py-14" : "px-4 py-5",
        over ? "border-brand bg-brand-soft/40" : "border-border"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) void add([...e.dataTransfer.files])
      }}
    >
      {empty && <FileArrowUpIcon className="size-7 text-muted-foreground" />}
      <p className="text-sm">
        <ParaglideMessage
          message={empty ? m.import_drop : m.import_drop_more}
          inputs={{}}
          markup={{
            choose: ({ children }) => (
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => input.current?.click()}
              >
                {children}
              </button>
            ),
          }}
        />
      </p>
      {empty && (
        <p className="max-w-[46ch] text-xs text-muted-foreground">
          {meta.ai.statements ? m.import_drop_hint_pdf() : m.import_drop_hint()}
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          if (files.length) void add(files)
        }}
      />
    </div>
  )

  return (
    <div className="pb-28">
      <div className="relative">
        <PageHeader title={m.import_title()} sub={m.import_sub()} />
        {/* Phones show this page without the tab bar, so it needs its own way out. */}
        <Link
          to="/"
          aria-label={m.common_close()}
          className="absolute top-3 right-2 inline-flex size-11 items-center justify-center rounded-md text-subtle-foreground transition-colors active:bg-muted md:hidden"
        >
          <XIcon className="size-5" />
        </Link>
      </div>
      <div className="grid max-w-3xl gap-5 px-4 md:px-8">
        {dropZone}
        {(reading.length > 0 || failed.length > 0) && (
          <Card className="gap-0 py-1" aria-live="polite">
            {reading.map((r) => (
              <p key={r.id} className="flex min-h-11 items-center gap-2.5 border-t px-5 text-sm first:border-t-0">
                <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-brand" />
                <span className="min-w-0 truncate">{m.import_reading({ name: r.name })}</span>
              </p>
            ))}
            {failed.map((f) => (
              <div key={f.id} className="flex min-h-11 items-center gap-2.5 border-t px-5 text-sm first:border-t-0">
                <WarningIcon className="size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{f.name}</span>: {f.error}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="max-md:size-11"
                  aria-label={m.import_dismiss({ name: f.name })}
                  onClick={() => setFailed((list) => list.filter((x) => x.id !== f.id))}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </Card>
        )}
        {live.map((a) => (
          <AccountCard
            key={a.id}
            a={a}
            stmts={stmts.filter((s) => s.acct === a.id)}
            others={live.filter((x) => x.id !== a.id).map((x) => ({ value: x.id, label: info(x).name }))}
            wallets={wallets.filter((w) => w.id === a.target || !live.some((x) => x.target === w.id))}
            currencies={[...new Set([...currencies, a.currency])]}
            lines={linesOf(a)}
            closing={closingOf(a)}
            onPatch={(p) => patch(a.id, p)}
            onType={(t) => setType(a, t)}
            onMove={move}
            onRemove={(s) => setStmts((list) => list.filter((x) => x.id !== s.id))}
            onColumns={(s, layout) =>
              setStmts((list) =>
                list.map((x) =>
                  x.id === s.id
                    ? { ...x, ...csvStmt(x.rows!, layout, info(a).type === "credit"), remembered: false, byAi: false }
                    : x
                )
              )
            }
          />
        ))}
      </div>
      {live.length > 0 && (
        <Bar>
          <span className="text-sm text-muted-foreground">
            {reading.length
              ? m.import_reading_files(num(reading.length))
              : m.import_summary({ ...num(totalLines), accounts: live.length, a: num(live.length).n })}
          </span>
          <Button
            size="lg"
            className="h-11 px-5"
            disabled={busy || reading.length > 0 || !totalLines || unnamed}
            onClick={toReview}
          >
            {busy && <SpinnerGapIcon className="animate-spin" />}
            {m.import_check_payees()} <ArrowRightIcon />
          </Button>
        </Bar>
      )}
    </div>
  )
}

/** The step's next action, kept in view at the bottom of the column while the page scrolls. */
function Bar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mt-5 max-w-3xl px-4 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3 shadow-[0_12px_32px_rgba(17,17,19,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </div>
  )
}

type Wallet = ReturnType<typeof useMeta>["wallets"][number]
type Category = ReturnType<typeof useMeta>["categories"][number]

function AccountCard({
  a,
  stmts,
  others,
  wallets,
  currencies,
  lines,
  closing,
  onPatch,
  onType,
  onMove,
  onRemove,
  onColumns,
}: {
  a: Acct
  stmts: Stmt[]
  others: { value: string; label: string }[]
  wallets: Wallet[]
  currencies: string[]
  lines: Line[]
  closing: { day: string; text: string; fromFile: boolean }
  onPatch: (p: Partial<Acct>) => void
  onType: (t: Kind) => void
  onMove: (s: Stmt, to: string) => void
  onRemove: (s: Stmt) => void
  onColumns: (s: Stmt, layout: Layout) => void
}) {
  const wallet = wallets.find((w) => w.id === a.target)
  const credit = (wallet?.type ?? a.type) === "credit"
  const currency = wallet?.currency ?? a.currency
  const range = span(lines)
  const read = stmts.reduce((t, s) => t + s.lines.length, 0)
  const gaps = statementGaps(
    stmts.flatMap((s) => {
      const r = span(s.lines)
      return r ? [{ name: s.file, ...r, opening: s.opening, closing: s.closing }] : []
    }),
    (v) => fmt(v, currency),
    dayLabel
  )
  const foreign = stmts.find((s) => s.currency && s.currency !== currency)
  return (
    <Card className="rise-in gap-0 py-0">
      <div className="grid gap-4 px-6 py-5 max-md:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[15px] font-semibold">
            {wallet?.name ?? (a.name.trim() || m.import_new_account())}
          </h2>
          <Pick
            value={a.target}
            onChange={(v) => v && onPatch({ target: v })}
            aria-label={m.import_into()}
            placeholder={m.import_into()}
            options={[
              { value: "new", label: m.import_new_account_option() },
              ...wallets.map((w) => ({ value: w.id, label: m.import_into_wallet({ name: w.name }) })),
            ]}
            className="h-9 bg-background max-md:h-11"
          />
        </div>
        {!wallet && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_7rem]">
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {m.import_field_name()}
              <Input
                value={a.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                className="h-10 bg-background text-foreground"
              />
            </label>
            <div className="grid gap-1.5 text-xs text-muted-foreground">
              {m.import_field_type()}
              <div className="flex rounded-lg bg-muted p-1" role="group" aria-label={m.import_field_type()}>
                {(
                  [
                    ["bank", m.import_type_bank()],
                    ["credit", m.import_type_card()],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={a.type === t}
                    onClick={() => onType(t)}
                    className={cn(
                      "h-8 flex-1 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors max-md:h-11",
                      a.type === t
                        ? "bg-card text-foreground shadow-sm"
                        : "text-subtle-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {m.import_field_currency()}
              <Pick
                value={a.currency}
                onChange={(v) => v && onPatch({ currency: v })}
                aria-label={m.import_field_currency()}
                placeholder={m.import_field_currency()}
                options={currencies.map((c) => ({ value: c, label: c.toUpperCase() }))}
                className="h-10 w-full bg-background text-foreground"
              />
            </label>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {(credit ? m.import_owed_on : m.import_balance_on)({
              day: dayLabel(closing.day),
              currency: currency.toUpperCase(),
            })}
            <Input
              value={closing.text}
              onChange={(e) => onPatch({ closing: e.target.value })}
              inputMode="decimal"
              placeholder={m.import_closing_placeholder()}
              className={cn("h-10 bg-background text-foreground", closing.text && "num")}
            />
            <span>{closing.fromFile ? m.import_closing_from_file() : m.import_closing_hint()}</span>
          </label>
          {!wallet && a.type === "credit" && (
            <label className="grid content-start gap-1.5 text-xs text-muted-foreground">
              {m.import_credit_limit({ currency: currency.toUpperCase() })}
              <Input
                value={a.limit}
                onChange={(e) => onPatch({ limit: e.target.value })}
                inputMode="decimal"
                placeholder={m.import_optional()}
                className={cn("h-10 bg-background text-foreground", a.limit && "num")}
              />
            </label>
          )}
        </div>
        {[
          ...gaps,
          ...(foreign
            ? [
                m.import_foreign({
                  file: foreign.file,
                  from: foreign.currency!.toUpperCase(),
                  to: currency.toUpperCase(),
                }),
              ]
            : []),
          ...stmts
            .filter((s) => s.off)
            .map((s) => m.import_off({ file: s.file, amount: fmt(Math.abs(s.off!), currency) })),
        ].map((w) => (
          <p key={w} role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            {w}
          </p>
        ))}
      </div>
      <ul className="border-t">
        {stmts.map((s) => {
          const r = span(s.lines)
          return (
            <li key={s.id} className="border-t px-6 py-3 first:border-t-0 max-md:px-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm">
                    {s.byAi && <AiMark className="size-3 shrink-0" />}
                    <span className="truncate">{s.file}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r
                      ? m.import_stmt_lines({ ...num(s.lines.length), from: dayLabel(r.from), to: dayLabel(r.to) })
                      : m.import_stmt_no_lines()}
                  </p>
                </div>
                <Pick
                  value=""
                  onChange={(v) => v && onMove(s, v)}
                  aria-label={m.import_move_label({ file: s.file })}
                  placeholder={m.import_move_placeholder()}
                  options={[...others, { value: "new", label: m.import_new_account_option() }]}
                  className="h-9 bg-background text-xs max-md:h-11"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground max-md:size-11"
                  aria-label={m.import_remove({ file: s.file })}
                  onClick={() => onRemove(s)}
                >
                  <XIcon />
                </Button>
              </div>
              {s.source === "csv" && (
                <div className="mt-2">
                  <Columns
                    rows={s.rows!}
                    layout={s.layout!}
                    count={s.lines.length}
                    byAi={s.byAi}
                    status={columnsStatus(s)}
                    open={!s.remembered && !s.confident}
                    onChange={(layout) => onColumns(s, layout)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {range && (
        <p className="border-t px-6 py-3 text-xs text-muted-foreground max-md:px-4">
          {m.import_account_range({ ...num(lines.length), from: dayLabel(range.from), to: dayLabel(range.to) })}
          {read > lines.length && ` ${m.import_account_dupes(num(read - lines.length))}`}
        </p>
      )}
    </Card>
  )
}

const PAGE = 60

function ReviewStep({
  list,
  pairs,
  total,
  accounts,
  others,
  categories,
  naming,
  onEdit,
  onUnpair,
  onBack,
  onImport,
}: {
  list: Group[]
  pairs: (readonly [Row, Row])[]
  total: number
  accounts: { id: string; name: string; currency: string }[]
  others: Wallet[]
  categories: Category[]
  naming: boolean
  onEdit: (g: Group, p: { payee?: string; category?: string }) => void
  onUnpair: (outKey: string) => void
  onBack: () => void
  onImport: () => void
}) {
  const open = list.filter((g) => !g.category)
  const [tab, setTab] = useState<"check" | "all" | "transfers">(open.length ? "check" : "all")
  // Rows sorted while on "To check" stay in view until the tab changes, so a choice doesn't make its row jump away.
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const [rest, setRest] = useState("")
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? ""
  const money = (v: number, acct: string) => fmt(v, accounts.find((a) => a.id === acct)?.currency ?? "usd")
  const rows =
    tab === "check" ? list.filter((g) => !g.category || g.raws.some((r) => kept.has(r))) : tab === "all" ? list : []
  const go = (t: typeof tab) => {
    setTab(t)
    setKept(new Set())
    setShown(PAGE)
  }
  const choose = (g: Group, category: string) => {
    if (tab === "check") setKept((k) => new Set([...k, ...g.raws]))
    onEdit(g, { category })
  }
  const counted = list.filter((g) => g.category !== "skip").reduce((t, g) => t + g.lines.length, 0) + pairs.length * 2
  return (
    <div className="pb-8">
      <PageHeader
        title={m.import_review_title()}
        sub={
          !total
            ? m.import_review_nothing()
            : pairs.length
              ? m.import_review_sub_transfers({
                  ...num(total),
                  payees: list.length,
                  p: num(list.length).n,
                  transfers: pairs.length,
                  t: num(pairs.length).n,
                })
              : m.import_review_sub({ ...num(total), payees: list.length, p: num(list.length).n })
        }
      >
        <Button variant="outline" className="bg-card max-md:h-11" onClick={onBack}>
          <ArrowLeftIcon /> {m.import_review_back()}
        </Button>
      </PageHeader>
      <div className={cn("grid max-w-3xl gap-4 px-4 md:px-8", !total && "hidden")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg bg-muted p-1" role="group" aria-label={m.import_review_show()}>
            {(
              [
                ["check", m.import_tab_check({ n: open.length })],
                ["all", m.import_tab_all({ n: list.length })],
                ...(pairs.length ? [["transfers", m.import_tab_transfers({ n: pairs.length })] as const] : []),
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => go(t)}
                className={cn(
                  "min-h-9 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors max-md:min-h-11",
                  tab === t ? "bg-card text-foreground shadow-sm" : "text-subtle-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {naming && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <SpinnerGapIcon className="size-3.5 animate-spin" /> {m.import_naming()}
            </span>
          )}
        </div>

        {tab === "check" && open.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-subtle-foreground">
            {m.import_rest()}
            <Pick
              value={rest}
              onChange={setRest}
              aria-label={m.import_rest_label()}
              placeholder={m.import_rest_placeholder()}
              options={[
                ...categories.map((c) => ({ value: c.id, label: c.name })),
                { value: "skip", label: m.import_leave_them_out() },
              ]}
              className="h-9 bg-background max-md:h-11"
            />
            <Button
              variant="outline"
              className="bg-card max-md:h-11"
              disabled={!rest}
              onClick={() => {
                const c = categories.find((x) => x.id === rest)
                for (const g of open) if (rest === "skip" || (c && !!c.income === g.income)) choose(g, rest)
                setRest("")
              }}
            >
              {m.import_apply()}
            </Button>
          </div>
        )}

        {tab === "transfers" ? (
          <Card className="gap-0 py-0">
            {pairs.map(([o, i]) => (
              <div
                key={o.key}
                className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 first:border-t-0 max-md:px-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ArrowsLeftRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {m.import_transfer_pair({ from: name(o.acct), to: name(i.acct) })}
                    </p>
                    <p className="text-xs text-muted-foreground">{dayLabel(o.day)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-sm">{money(-o.amount, o.acct)}</span>
                  <Button variant="ghost" size="sm" className="max-md:h-11" onClick={() => onUnpair(o.key)}>
                    {m.import_not_transfer()}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        ) : rows.length ? (
          <Card className="gap-0 py-0">
            {rows.slice(0, shown).map((g) => (
              <PayeeRow
                key={g.id}
                g={g}
                name={name}
                money={money}
                options={[
                  ...categories.filter((c) => !!c.income === g.income).map((c) => ({ value: c.id, label: c.name })),
                  ...accounts
                    .filter((a) => !g.lines.some((l) => l.acct === a.id))
                    .map((a) => ({
                      value: `t:${a.id}`,
                      label: (g.income ? m.import_transfer_from : m.import_transfer_to)({ name: a.name }),
                    })),
                  ...others.map((w) => ({
                    value: `w:${w.id}`,
                    label: (g.income ? m.import_transfer_from : m.import_transfer_to)({ name: w.name }),
                  })),
                  { value: "skip", label: m.import_leave_out() },
                ]}
                onPayee={(payee) => onEdit(g, { payee })}
                onCategory={(c) => choose(g, c)}
              />
            ))}
            {rows.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="min-h-11 border-t text-sm text-subtle-foreground transition-colors hover:bg-muted/60"
              >
                {m.import_show_more({ n: Math.min(PAGE, rows.length - shown) })}
              </button>
            )}
          </Card>
        ) : (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <CheckCircleIcon className="size-4 text-positive" /> {m.import_all_sorted()}
          </p>
        )}
      </div>
      <Bar>
        <span className="text-sm text-muted-foreground">
          {!total
            ? m.import_nothing_new()
            : open.length
              ? m.import_without_category(num(open.length))
              : m.import_ready()}
        </span>
        <Button size="lg" className="h-11 px-5" disabled={open.length > 0 || !counted} onClick={onImport}>
          {m.import_button(num(counted))}
        </Button>
      </Bar>
    </div>
  )
}

function PayeeRow({
  g,
  name,
  money,
  options,
  onPayee,
  onCategory,
}: {
  g: Group
  name: (acct: string) => string
  money: (v: number, acct: string) => string
  options: { value: string; label: string }[]
  onPayee: (p: string) => void
  onCategory: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  const r = span(g.lines)!
  const total = g.lines.every((l) => l.acct === g.lines[0].acct) ? g.lines.reduce((t, l) => t + l.amount, 0) : null
  const sample = g.lines[0].description
  return (
    <div className={cn("border-t first:border-t-0", g.category === "skip" && "opacity-60")}>
      <div className="grid gap-2 px-5 py-3 max-md:px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_6.5rem_2.75rem] md:items-center">
        <div className="min-w-0">
          <div className="relative">
            {/* Committed on blur, so a name that matches another payee merges once, not on every keystroke. */}
            <Input
              key={g.payee}
              aria-label={m.import_payee_for({ text: sample })}
              defaultValue={g.payee}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== g.payee) onPayee(v)
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-9 bg-background pr-7 max-md:h-11"
            />
            {g.aiPayee && <AiMark className="absolute top-1/2 right-2.5 size-3 -translate-y-1/2" />}
          </div>
          <p className="mt-1 flex min-w-0 gap-3 text-xs text-muted-foreground">
            <span className="shrink-0">
              {g.lines.length > 1
                ? m.import_payments_range({ ...num(g.lines.length), from: dayLabel(r.from), to: dayLabel(r.to) })
                : dayLabel(r.from)}
            </span>
            {sample.toLowerCase() !== g.payee.toLowerCase() && (
              <span className="truncate" title={sample}>
                {sample}
              </span>
            )}
          </p>
        </div>
        <div className="relative">
          <Pick
            value={g.category}
            onChange={onCategory}
            aria-label={m.import_category_for({ payee: g.payee })}
            placeholder={m.import_pick_category()}
            options={options}
            className={cn("h-9 w-full bg-background max-md:h-11", !g.category && "text-muted-foreground")}
          />
          {g.aiCategory && <AiMark className="pointer-events-none absolute top-1/2 right-8 size-3 -translate-y-1/2" />}
        </div>
        <span className={cn("num text-sm md:text-right", g.income && "text-positive")}>
          {total === null ? "" : money(total, g.lines[0].acct)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="justify-self-end text-muted-foreground max-md:hidden"
          aria-label={open ? m.import_hide_lines() : m.import_show_lines()}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <CaretRightIcon className={cn("transition-transform duration-150", open && "rotate-90")} />
        </Button>
      </div>
      {open && (
        <ul className="border-t bg-muted/30 py-1">
          {g.lines.map((l) => (
            <li
              key={l.key}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-1.5 text-xs max-md:px-4"
            >
              <span className="num text-muted-foreground">{dayLabel(l.day)}</span>
              <span className="truncate text-subtle-foreground" title={l.description}>
                {name(l.acct)}: {l.description}
              </span>
              <span className="num">{money(l.amount, l.acct)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
