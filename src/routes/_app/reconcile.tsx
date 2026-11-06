import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowCounterClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  FileArrowUpIcon,
  LightbulbIcon,
  SpinnerGapIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AiMark } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker, dayLabel } from "@/components/date-time"
import { Pick } from "@/components/pick"
import { PageHeader, PageSkeleton, useMeta } from "@/components/shell"
import { Columns, columnsStatus, fileBase64, fileText } from "@/components/statement-file"
import {
  explainDifference,
  finishReconcile,
  getReconcile,
  importLines,
  readCsvLayout,
  readStatementPdf,
  saveTransaction,
  tidyStatementLines,
  undoReconcile,
  type ReconcileData,
  type ReconcileEntry,
} from "@/lib/api"
import { addDays, dayOf, fmt, guessCategory, isNeutral, parseAmount } from "@/lib/core"
import {
  descriptorKey,
  differenceHints,
  guessDateFormat,
  guessLayout,
  isOfx,
  layoutSignature,
  parseCsv,
  parseOfx,
  payeeFor,
  planReconciliation,
  readCsv,
  type Layout,
  type Line,
} from "@/lib/statement"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/reconcile")({
  validateSearch: z.object({ account: z.coerce.string().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ account: search.account }),
  loader: ({ deps }) => (deps.account ? getReconcile({ data: { walletId: deps.account } }) : null),
  head: () => ({ meta: [{ title: "Reconcile · Kosha" }] }),
  pendingComponent: PageSkeleton,
  component: Reconcile,
})

function Reconcile() {
  const data = Route.useLoaderData()
  return data ? <Session key={data.account.id} data={data} /> : <AccountPicker />
}

// Investments are valued, not reconciled: a broker statement shows market value, which Kosha keeps as gains.
const reconcilable = (type: string) => type !== "investment"

function AccountPicker() {
  const meta = useMeta()
  const list = meta.wallets.filter((w) => !w.archived && reconcilable(w.type))
  return (
    <div className="pb-8">
      <PageHeader title="Reconcile" sub="Check an account against your bank's statement, or import the statement." />
      <div className="px-4 md:px-8">
        <Card className="max-w-xl gap-0 py-1">
          {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">Add a bank account or card first.</p>}
          {list.map((w) => (
            <Link
              key={w.id}
              to="/reconcile"
              search={{ account: w.id }}
              className="flex min-h-14 items-center justify-between gap-3 border-t px-5 py-3 transition-colors first:border-t-0 hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {w.reconciled_day ? `Reconciled to ${dayLabel(w.reconciled_day)}` : "Never reconciled"}
                </span>
              </span>
              <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      </div>
    </div>
  )
}

type StLine = Line & { payee?: string }
/** A statement read from a file. CSV keeps its rows, so a changed column choice re-reads them. */
type Loaded = {
  source: "csv" | "ofx" | "pdf"
  name: string
  lines: StLine[]
  rows?: string[][]
  layout?: Layout
  signature?: string
  /** True when the columns came from a layout Kosha remembered for this bank. */
  remembered?: boolean
  /** True when AI chose the columns. */
  byAi?: boolean
  confident?: boolean
  /** The statement's opening balance, as printed, when the file gives one. */
  opening?: number | null
  /** For a PDF read by AI: how far its lines miss its closing balance (0 when they add up). */
  off?: number | null
}
/** What the person chose for a line missing from Kosha. `category` is a category id or "transfer:<account id>". */
type Pickd = { payee?: string; category?: string; skip?: boolean }
type Draft = { day: string; balance: string; ticks: Record<string, boolean> }

const draftKey = (id: string) => `kosha:reconcile:${id}`
function readDraft(id: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null")
  } catch {
    return null
  }
}

function Session({ data }: { data: ReconcileData }) {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate()
  const a = data.account
  const credit = a.type === "credit"
  const limit = a.credit_limit ?? 0
  const cur = a.currency
  const money = (v: number) => fmt(v, cur)
  const today = dayOf(Date.now() / 1000, meta.tz)
  const last = data.history[0]
  // Statement figures are as the bank prints them: a balance, or for a card what is owed.
  const toKosha = (v: number) => (credit ? limit - v : v)
  const fromKosha = (v: number) => (credit ? limit - v : v)

  const [day, setDay] = useState(today)
  const [balanceText, setBalanceText] = useState("")
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, Pickd>>({})
  const [tidy, setTidy] = useState<Record<string, { payee: string; categoryId: string | null }>>({})
  const [notSame, setNotSame] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; entries: number; adjustment: number; day: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // A half-done reconciliation survives leaving the page. A statement file has to be dropped in again.
  useEffect(() => {
    const d = readDraft(a.id)
    if (d) {
      setDay(d.day)
      setBalanceText(d.balance)
      setTicks(d.ticks)
    }
  }, [a.id])
  useEffect(() => {
    try {
      if (done) localStorage.removeItem(draftKey(a.id))
      else localStorage.setItem(draftKey(a.id), JSON.stringify({ day, balance: balanceText, ticks }))
    } catch {}
  }, [day, balanceText, ticks, done, a.id])

  const statementValue = parseAmount(balanceText)
  const statement = statementValue === null ? null : toKosha(statementValue)

  // ---------- matching an imported statement ----------

  const name = (e: ReconcileEntry) =>
    e.transfer_id
      ? `${e.amount < 0 ? "To" : "From"} ${meta.wallets.find((w) => w.id === e.counter_wallet_id)?.name ?? "another account"}`
      : e.name || meta.categories.find((c) => c.id === e.category_id)?.name || "No payee"
  const lines = loaded?.lines ?? []
  // What matches, what's missing and what counts as ticked: the same plan the public API uses.
  const plan = useMemo(() => {
    const entry = (e: ReconcileEntry) => ({
      id: e.id,
      day: e.day,
      amount: e.amount,
      name: name(e),
      ref: e.bank_ref,
      paid: e.paid,
    })
    return planReconciliation({
      lines,
      open: data.open.map(entry),
      done: data.done.map(entry),
      statementDay: day,
      lastDay: last?.statement_day ?? null,
      rejected: notSame,
    })
  }, [lines, data.open, data.done, day, last, notSame])
  const { close, periodStart, inPeriod, ticks: defaultTick, matched: matchedOpen } = plan
  const missing = plan.missing.map((i) => ({ l: lines[i], i }))
  const closeIds = new Set(close.map((p) => p.entry))
  const isTicked = (e: ReconcileEntry) => ticks[e.id] ?? defaultTick(e)
  const toggle = (e: ReconcileEntry) => setTicks((t) => ({ ...t, [e.id]: !isTicked(e) }))

  const earlier = data.open.filter((e) => e.day <= day && !inPeriod(e))
  const period = data.open.filter(inPeriod)
  const after = data.open.filter((e) => e.day > day)
  const ticked = data.open.filter(isTicked)
  const cleared = data.reconciled + ticked.reduce((t, e) => t + e.amount, 0)
  const diff = statement === null ? null : statement - cleared

  // ---------- payees and categories for lines missing from Kosha ----------

  const guessing = meta.prefs.suggest_category === "1"
  const categories = meta.categories.filter((c) => !c.archived && !c.parent_id && !isNeutral(c.id))
  const others = meta.wallets.filter((w) => !w.archived && w.id !== a.id)
  const known = meta.titles
  const basePayee = (l: StLine) => l.payee || payeeFor(l.description, known, data.aliases)
  const row = (l: StLine) => {
    const p = picks[l.ref ?? ""] ?? {}
    const ai = tidy[descriptorKey(l.description)]
    const payee = p.payee ?? (data.aliases[descriptorKey(l.description)] ? basePayee(l) : (ai?.payee ?? basePayee(l)))
    const fits = (id: string | null | undefined) =>
      id && categories.some((c) => c.id === id && !!c.income === l.amount > 0) ? id : undefined
    const ruled = guessing
      ? (fits(guessCategory(payee, meta.rules)) ?? fits(guessCategory(l.description, meta.rules)))
      : undefined
    const category = p.category ?? ruled ?? (guessing ? fits(ai?.categoryId) : undefined) ?? ""
    return {
      payee,
      category,
      skip: !!p.skip,
      aiPayee: !p.payee && !!ai && payee === ai.payee && ai.payee !== basePayee(l),
      aiCategory: !p.category && !ruled && !!category && category === ai?.categoryId,
    }
  }
  const pick = (ref: string, patch: Pickd) => setPicks((p) => ({ ...p, [ref]: { ...p[ref], ...patch } }))

  // AI tidies the payee names and categories Kosha couldn't work out itself, once per statement.
  const tidyAsked = useRef<string | null>(null)
  useEffect(() => {
    if (!meta.ai.statements || meta.prefs.ai_share_payee !== "1" || !loaded || !missing.length) return
    const sig = `${loaded.name}:${lines.length}`
    if (tidyAsked.current === sig) return
    tidyAsked.current = sig
    const todo = new Map<string, { key: string; text: string; amount: number }>()
    for (const { l } of missing) {
      const key = descriptorKey(l.description)
      if (!key || data.aliases[key]) continue
      const r = row(l)
      const unknownPayee = !l.payee && !known.some((k) => k === r.payee)
      if (unknownPayee || !r.category) todo.set(key, { key, text: l.description, amount: l.amount })
    }
    if (!todo.size) return
    setBusy("tidy")
    tidyStatementLines({ data: { items: [...todo.values()].slice(0, 300) } })
      .then(setTidy)
      .catch(() => {}) // without it, Kosha's own names stand
      .finally(() => setBusy((b) => (b === "tidy" ? null : b)))
  }, [loaded, missing.length])

  // ---------- reading a file ----------

  async function read(file: File) {
    setReading(file.name)
    try {
      const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
      if (pdf) {
        if (!meta.ai.statements)
          throw new Error("Kosha reads CSV, OFX and QFX files. Export one of those from your bank.")
        const r = await readStatementPdf({ data: { walletId: a.id, name: file.name, data: await fileBase64(file) } })
        if (r.currency && r.currency !== cur)
          toast.warning(`This statement is in ${r.currency.toUpperCase()}, and ${a.name} is in ${cur.toUpperCase()}.`)
        setLoaded({ source: "pdf", name: file.name, lines: r.lines, byAi: true, opening: r.opening, off: r.off })
        if (r.to) setDay(r.to)
        if (r.closing !== null) setBalanceText((r.closing / 100).toFixed(2))
        return
      }
      const text = await fileText(file)
      if (isOfx(text)) {
        const r = parseOfx(text)
        if (!r.lines.length) throw new Error("That OFX file has no transactions")
        setLoaded({ source: "ofx", name: file.name, lines: r.lines })
        if (r.closingDay) setDay(r.closingDay)
        // Cards report what's owed as a negative balance.
        if (r.closing !== null) setBalanceText(((credit ? -r.closing : r.closing) / 100).toFixed(2))
        return
      }
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error("That file has no rows Kosha can read")
      const guess = guessLayout(rows, credit)
      const signature = layoutSignature(rows, guess.layout)
      let layout = data.layouts[signature] ?? guess.layout
      let byAi = false
      if (!data.layouts[signature] && !guess.confident && meta.ai.statements) {
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
      openCsv({
        source: "csv",
        name: file.name,
        lines: [],
        rows,
        layout,
        signature,
        remembered: !!data.layouts[signature],
        byAi,
        confident: guess.confident || byAi,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file")
    } finally {
      setReading(null)
    }
  }

  function openCsv(next: Loaded) {
    const { lines: read } = readCsv(next.rows!, next.layout!)
    setLoaded({ ...next, lines: read })
    if (!read.length) return
    const latest = read.reduce((m, l) => (l.day > m.day ? l : m), read[0])
    setDay(latest.day)
    // The running balance after the latest line is the closing balance. A card's balance column is ambiguous.
    const ascending = read[0].day <= read[read.length - 1].day
    const closing = ascending ? read[read.length - 1].balance : read[0].balance
    if (closing !== null && !credit) setBalanceText((closing / 100).toFixed(2))
    // The balance before the oldest line is where the statement opened.
    const oldest = ascending ? read[0] : read[read.length - 1]
    if (oldest.balance !== null && !credit) setLoaded({ ...next, lines: read, opening: oldest.balance - oldest.amount })
  }

  // ---------- actions ----------

  async function addMissing() {
    const chosen = missing.filter(({ l }) => !row(l).skip)
    const unsorted = chosen.filter(({ l }) => !row(l).category)
    if (unsorted.length)
      return toast.error(`Pick a category for ${unsorted.length === 1 ? "1 line" : `${unsorted.length} lines`} first`)
    setBusy("add")
    try {
      await importLines({
        data: {
          walletId: a.id,
          layouts: loaded?.source === "csv" ? [{ signature: loaded.signature!, layout: loaded.layout! }] : [],
          aliases: chosen
            .map(({ l }) => ({ key: descriptorKey(l.description), payee: row(l).payee.trim() }))
            .filter((x) => x.key && x.payee),
          lines: chosen.map(({ l }) => {
            const r = row(l)
            const transfer = r.category.startsWith("transfer:")
            return {
              day: l.day,
              amount: l.amount,
              name: transfer ? "" : r.payee.trim(),
              note: transfer ? r.payee.trim() : "",
              ...(transfer ? { transferWith: r.category.slice(9) } : { categoryId: r.category }),
              ref: l.ref!,
            }
          }),
        },
      })
      await router.invalidate()
      toast.success(`Added ${chosen.length === 1 ? "1 entry" : `${chosen.length} entries`} to ${a.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add them")
    } finally {
      setBusy(null)
    }
  }

  /** Makes Kosha's entry carry the statement's amount, for a close match the person confirms. */
  async function takeAmount(e: ReconcileEntry, amount: number) {
    setBusy(e.id)
    try {
      await saveTransaction({
        data: {
          id: e.id,
          walletId: a.id,
          categoryId: e.category_id,
          name: e.name,
          note: e.note,
          amount,
          day: e.day,
          paid: !!e.paid,
        },
      })
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change it")
    } finally {
      setBusy(null)
    }
  }

  async function finish(adjust: boolean, override?: { balance: number; ids: string[]; day: string }) {
    const body = override ?? { balance: statement!, ids: ticked.map((e) => e.id), day }
    setBusy("finish")
    try {
      const r = await finishReconcile({
        data: { walletId: a.id, statementDay: body.day, balance: body.balance, ids: body.ids, adjust },
      })
      setDone({ id: r.id, entries: body.ids.length, adjustment: r.adjustment, day: body.day })
      setTicks({})
      setLoaded(null)
      await router.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't finish")
    } finally {
      setBusy(null)
    }
  }

  // The quick check: the bank shows the same balance as Kosha, so everything up to today is reconciled.
  const upToToday = data.open.filter((e) => e.paid && e.day <= today)
  const quickBalance = data.reconciled + upToToday.reduce((t, e) => t + e.amount, 0)

  async function undo(id: string) {
    setBusy("undo")
    try {
      await undoReconcile({ data: { id } })
      setDone(null)
      await router.invalidate()
      toast.success("Reconciliation undone")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't undo it")
    } finally {
      setBusy(null)
    }
  }

  // ---------- finding a difference ----------

  const item = (e: ReconcileEntry) => ({ id: e.id, amount: e.amount, day: e.day, name: name(e) })
  const missingTotal = missing.filter(({ l }) => !row(l).skip).reduce((t, { l }) => t + l.amount, 0)
  // Reconciled entries should still add up to the last statement, unless one was changed since.
  const drift = last ? data.reconciled - last.balance : 0
  const openingGap =
    loaded?.opening != null && last && !credit && loaded.opening !== last.printed ? loaded.opening - last.printed : 0
  const single = missing.find(({ l }) => l.amount === diff)
  const hints =
    diff === null || diff === 0
      ? []
      : [
          ...(openingGap
            ? [
                {
                  text: `This statement opens at ${money(loaded!.opening!)}, but the last one you reconciled closed at ${money(last!.printed)}. A statement in between may be missing.`,
                  ids: [],
                },
              ]
            : []),
          ...(single && missing.length > 1
            ? [
                {
                  text: `${row(single.l).payee} (${money(single.l.amount)}) on the statement is exactly the difference. Add it to Kosha.`,
                  ids: [],
                },
              ]
            : []),
          ...(missing.length && missingTotal === diff
            ? [
                {
                  text: `Adding the ${missing.length === 1 ? "line" : `${missing.length} lines`} missing from Kosha closes the difference exactly.`,
                  ids: [],
                },
              ]
            : missing.length
              ? [
                  {
                    text: `${missing.length === 1 ? "1 line" : `${missing.length} lines`} on the statement ${missing.length === 1 ? "isn't" : "aren't"} in Kosha yet (${money(missingTotal)}).`,
                    ids: [],
                  },
                ]
              : []),
          ...close.map((p) => {
            const e = data.open.find((x) => x.id === p.entry)!
            return {
              text: `${name(e)}: Kosha has ${money(e.amount)}, the statement ${money(lines[p.line].amount)}.`,
              ids: [e.id],
            }
          }),
          // Its last-resort "look for a fee" only helps when nothing above already explains the gap.
          ...differenceHints(
            diff,
            ticked.map(item),
            [...earlier, ...period].filter((e) => !isTicked(e)).map(item),
            day,
            money
          ).filter((h) => h.ids.length || (!missing.length && !close.length && !openingGap)),
        ].slice(0, 6)
  const [ai, setAi] = useState<{ summary: string; suggestions: { text: string; ids: string[] }[] } | null>(null)
  const canAskAi = meta.ai.statements && meta.prefs.ai_share_payee === "1" && meta.prefs.ai_share_amount === "1"
  async function askAi() {
    if (diff === null) return
    setBusy("ai")
    try {
      const nearby = (e: ReconcileEntry) => e.day >= addDays(periodStart, -30)
      setAi(
        await explainDifference({
          data: {
            statementDay: day,
            diff,
            currency: cur,
            ticked: ticked.filter(nearby).slice(-400).map(item),
            unticked: [...earlier, ...period]
              .filter((e) => !isTicked(e) && nearby(e))
              .slice(-400)
              .map(item),
            missing: missing.slice(0, 400).map(({ l }) => ({ day: l.day, amount: l.amount, text: l.description })),
            close: close.map((p) => ({ id: p.entry, statementAmount: lines[p.line].amount })),
          },
        })
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't ask")
    } finally {
      setBusy(null)
    }
  }
  const show = (ids: string[]) => {
    setFocus(ids)
    requestAnimationFrame(() =>
      document.getElementById(`entry-${ids[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    )
  }

  // ---------- page ----------

  const statementLabel = credit ? "Owed on the statement" : "Closing balance"
  const accept = `.csv,.ofx,.qfx,.txt,text/csv${meta.ai.statements ? ",.pdf,application/pdf" : ""}`

  if (done)
    return (
      <div className="pb-8">
        <PageHeader title={`Reconcile ${a.name}`} />
        <div className="px-4 md:px-8">
          <Card className="rise-in max-w-xl items-start gap-3 px-6">
            <CheckCircleIcon weight="fill" className="size-8 text-positive" />
            <h2 className="text-lg font-semibold">{a.name} matches your statement</h2>
            <p className="text-sm text-muted-foreground">
              {done.entries === 1 ? "1 entry" : `${done.entries.toLocaleString()} entries`} checked to{" "}
              {dayLabel(done.day)}.
              {done.adjustment ? ` A correction of ${money(done.adjustment)} closed the difference.` : ""} Kosha marks
              them reconciled and tells you before you change one.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => navigate({ to: "/accounts" })}>Back to accounts</Button>
              <Button variant="outline" className="bg-card" disabled={busy === "undo"} onClick={() => undo(done.id)}>
                <ArrowCounterClockwiseIcon /> Undo
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )

  return (
    <div className="pb-8 md:max-w-[60rem]">
      <PageHeader
        title={`Reconcile ${a.name}`}
        sub={
          <>
            {last
              ? `Last reconciled to ${dayLabel(last.statement_day)}`
              : "Check each entry against your bank's statement."}{" "}
            ·{" "}
            <Link to="/reconcile" className="underline-offset-2 hover:text-foreground hover:underline">
              Other account
            </Link>
          </>
        }
      />

      <div className="grid gap-5 px-4 md:px-8">
        {drift !== 0 && last && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            Entries reconciled on {dayLabel(last.statement_day)} have changed by {money(credit ? -drift : drift)} since,
            so they no longer add up to that statement. One was edited or deleted; undo that reconciliation to check
            them again.
          </p>
        )}
        {loaded?.off != null && loaded.off !== 0 && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            The lines read from this PDF miss its closing balance by {money(Math.abs(loaded.off))}. A line may have been
            misread; check them against the PDF before adding any.
          </p>
        )}
        <Card className="gap-4 px-6 max-md:px-4">
          <div
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              reading && "border-brand"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) void read(f)
            }}
          >
            {reading ? (
              <>
                <SpinnerGapIcon className="size-6 animate-spin text-brand" />
                <p className="text-sm">Reading {reading}…</p>
              </>
            ) : loaded ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{loaded.name}</span> · {loaded.lines.length} lines
                  {loaded.byAi && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <AiMark className="size-3" /> read by AI
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="bg-card" onClick={() => fileInput.current?.click()}>
                    Another file
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLoaded(null)}>
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <>
                <FileArrowUpIcon className="size-6 text-muted-foreground" />
                <p className="text-sm">
                  Drop your statement here, or{" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => fileInput.current?.click()}
                  >
                    choose a file
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  CSV, OFX or QFX from your bank{meta.ai.statements ? ", or a PDF statement" : ""}. Kosha ticks what
                  matches and lists what's missing.
                </p>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={accept}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (f) void read(f)
              }}
            />
          </div>

          {loaded?.source === "csv" && (
            <Columns
              rows={loaded.rows!}
              layout={loaded.layout!}
              count={loaded.lines.length}
              byAi={loaded.byAi}
              status={columnsStatus(loaded)}
              open={!loaded.remembered && !loaded.confident}
              onChange={(layout) => openCsv({ ...loaded, layout, remembered: false, byAi: false })}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Statement date
              <DatePicker
                value={day}
                max={addDays(today, 31)}
                onChange={setDay}
                className="h-10 bg-background text-foreground"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {statementLabel} ({cur.toUpperCase()})
              <Input
                value={balanceText}
                onChange={(e) => setBalanceText(e.target.value)}
                inputMode="decimal"
                placeholder={(fromKosha(quickBalance) / 100).toFixed(2)}
                className="num h-10 bg-background"
              />
            </label>
          </div>
          {!loaded && statement === null && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
              Kosha shows {credit ? "you owe " : ""}
              <span className="num font-medium text-foreground">{money(fromKosha(quickBalance))}</span> today. Compare
              it with your bank's current balance, not the available one.
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                disabled={busy !== null}
                onClick={() => finish(false, { balance: quickBalance, ids: upToToday.map((e) => e.id), day: today })}
              >
                <CheckIcon /> My bank shows the same
              </Button>
            </p>
          )}
        </Card>

        {missing.length > 0 && (
          <Section
            title={`On the statement, not in Kosha (${missing.length})`}
            aside={
              busy === "tidy" ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SpinnerGapIcon className="size-3.5 animate-spin" /> Naming payees…
                </span>
              ) : undefined
            }
          >
            {missing.map(({ l }) => {
              const r = row(l)
              return (
                <div
                  key={l.ref}
                  className={cn(
                    "grid gap-2 border-t px-5 py-3 first:border-t-0 max-md:px-4 md:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,11rem)_6.5rem_2.75rem] md:items-center",
                    r.skip && "opacity-50"
                  )}
                >
                  <span className="num text-xs text-muted-foreground">{dayLabel(l.day)}</span>
                  <div className="min-w-0">
                    <div className="relative">
                      <Input
                        aria-label="Payee"
                        value={r.payee}
                        onChange={(e) => pick(l.ref!, { payee: e.target.value })}
                        className="h-9 bg-background pr-7"
                      />
                      {r.aiPayee && <AiMark className="absolute top-1/2 right-2.5 size-3 -translate-y-1/2" />}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={l.description}>
                      {l.description}
                    </p>
                  </div>
                  <div className="relative">
                    <Pick
                      value={r.category}
                      onChange={(v) => pick(l.ref!, { category: v })}
                      aria-label={`Category for ${r.payee || l.description}`}
                      placeholder="Pick a category"
                      options={[
                        ...categories
                          .filter((c) => !!c.income === l.amount > 0)
                          .map((c) => ({ value: c.id, label: c.name })),
                        ...others.map((w) => ({
                          value: `transfer:${w.id}`,
                          label: `${l.amount < 0 ? "Transfer to" : "Transfer from"} ${w.name}`,
                        })),
                      ]}
                      className={cn("h-9 w-full bg-background", !r.category && "text-muted-foreground")}
                    />
                    {r.aiCategory && (
                      <AiMark className="pointer-events-none absolute top-1/2 right-8 size-3 -translate-y-1/2" />
                    )}
                  </div>
                  <span className={cn("num text-right text-sm", l.amount > 0 && "text-positive")}>
                    {money(l.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-end text-muted-foreground max-md:size-11"
                    aria-label={r.skip ? "Add this line" : "Leave this line out"}
                    aria-pressed={!r.skip}
                    onClick={() => pick(l.ref!, { skip: !r.skip })}
                  >
                    {r.skip ? <ArrowCounterClockwiseIcon /> : <XIcon />}
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 max-md:px-4">
              <span className="text-xs text-muted-foreground">
                Saving teaches Kosha these payee names for your next statement.
              </span>
              <Button disabled={busy !== null || missing.every(({ l }) => row(l).skip)} onClick={addMissing}>
                {busy === "add" && <SpinnerGapIcon className="animate-spin" />}
                Add {missing.filter(({ l }) => !row(l).skip).length} to Kosha
              </Button>
            </div>
          </Section>
        )}

        {close.length > 0 && (
          <Section title={`Close, but not the same amount (${close.length})`}>
            {close.map((p) => {
              const e = data.open.find((x) => x.id === p.entry)!
              const l = lines[p.line]
              return (
                <div
                  key={p.entry}
                  className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 first:border-t-0 max-md:px-4"
                >
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">{name(e)}</div>
                    <div className="num text-xs text-muted-foreground">
                      Kosha {money(e.amount)} on {dayLabel(e.day)} · statement {money(l.amount)} on {dayLabel(l.day)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!e.transfer_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        disabled={busy !== null}
                        onClick={() => takeAmount(e, l.amount)}
                      >
                        Use {money(l.amount)}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setNotSame((s) => new Set(s).add(l.ref ?? ""))}>
                      Not the same
                    </Button>
                  </div>
                </div>
              )
            })}
          </Section>
        )}

        <Section
          title={loaded ? "In Kosha" : `Tick what's on the statement`}
          aside={<span className="text-xs text-muted-foreground">{ticked.length} ticked</span>}
        >
          {earlier.length > 0 && (
            <Group
              label={`Before this statement (${earlier.length})`}
              hint="Ticked, as they were on earlier statements"
            >
              {earlier.map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  name={name(e)}
                  money={money}
                  ticked={isTicked(e)}
                  focus={focus.includes(e.id)}
                  onToggle={() => toggle(e)}
                />
              ))}
            </Group>
          )}
          {period.length === 0 && earlier.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">Nothing to reconcile up to {dayLabel(day)}.</p>
          )}
          {period.map((e) => (
            <EntryRow
              key={e.id}
              e={e}
              name={name(e)}
              money={money}
              ticked={isTicked(e)}
              focus={focus.includes(e.id)}
              note={
                closeIds.has(e.id)
                  ? "Amount differs"
                  : loaded && !matchedOpen.has(e.id)
                    ? e.day > addDays(day, -3)
                      ? "Likely on the next statement"
                      : "Not on the statement"
                    : !e.paid
                      ? "Still due"
                      : undefined
              }
              onToggle={() => toggle(e)}
            />
          ))}
          {after.length > 0 && (
            <Group label={`After ${dayLabel(day)} (${after.length})`} hint="For the next statement">
              {after.map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  name={name(e)}
                  money={money}
                  ticked={isTicked(e)}
                  focus={focus.includes(e.id)}
                  onToggle={() => toggle(e)}
                />
              ))}
            </Group>
          )}
        </Section>

        {diff !== null && diff !== 0 && (hints.length > 0 || canAskAi) && (
          <Section
            title="Finding the difference"
            aside={
              canAskAi ? (
                <Button variant="outline" size="sm" className="bg-card" disabled={busy !== null} onClick={askAi}>
                  {busy === "ai" ? <SpinnerGapIcon className="animate-spin" /> : <AiMark className="size-3" />} Ask AI
                </Button>
              ) : undefined
            }
          >
            {ai && (
              <div className="grid gap-2 border-t bg-brand-soft/40 px-5 py-3 first:border-t-0 max-md:px-4">
                <p className="flex items-start gap-2 text-sm">
                  <AiMark className="mt-1 size-3" />
                  {ai.summary}
                </p>
                {ai.suggestions.map((s, i) => (
                  <Hint key={i} text={s.text} ids={s.ids} onShow={show} />
                ))}
              </div>
            )}
            {hints.map((h, i) => (
              <Hint key={i} text={h.text} ids={h.ids} onShow={show} icon />
            ))}
          </Section>
        )}

        {data.history.length > 0 && (
          <Section title="Past reconciliations">
            {data.history.map((h, i) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm first:border-t-0 max-md:px-4"
              >
                <span>
                  {dayLabel(h.statement_day)} · <span className="num">{money(h.printed)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {h.entries} entries{h.adjustment ? ` · corrected by ${money(h.adjustment)}` : ""}
                  </span>
                </span>
                {i === 0 && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => undo(h.id)}>
                    <ArrowCounterClockwiseIcon /> Undo
                  </Button>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* The totals stay in view at the bottom of the column while the lists scroll. */}
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border bg-card px-5 py-3.5 shadow-[0_12px_32px_rgba(17,17,19,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Figure
                label={credit ? "Statement says owed" : "Statement"}
                value={statement === null ? "—" : money(fromKosha(statement))}
              />
              <Figure label={credit ? "Owed per ticked" : "Ticked in Kosha"} value={money(fromKosha(cleared))} />
              <Figure
                label="Difference"
                value={diff === null ? "—" : diff === 0 ? "None" : money(credit ? -diff : diff)}
                tone={diff === null ? undefined : diff === 0 ? "good" : "bad"}
              />
            </dl>
            <div className="flex flex-wrap gap-2">
              {diff !== null && diff !== 0 && (
                <Button variant="outline" className="bg-card" disabled={busy !== null} onClick={() => finish(true)}>
                  Finish with a {money(Math.abs(diff))} correction
                </Button>
              )}
              <Button disabled={busy !== null || diff !== 0} onClick={() => finish(false)}>
                {busy === "finish" && <SpinnerGapIcon className="animate-spin" />}
                {statement === null ? "Enter the statement balance" : "Finish reconciling"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mx-1 mb-2.5 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-subtle-foreground">{title}</h2>
        {aside}
      </div>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  )
}

function Group({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 px-5 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 max-md:px-4"
      >
        <CaretRightIcon
          className={cn("size-4 text-muted-foreground transition-transform duration-150", open && "rotate-90")}
        />
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </button>
      {open && children}
    </div>
  )
}

function EntryRow({
  e,
  name,
  money,
  ticked,
  focus,
  note,
  onToggle,
}: {
  e: ReconcileEntry
  name: string
  money: (v: number) => string
  ticked: boolean
  focus: boolean
  note?: string
  onToggle: () => void
}) {
  const meta = useMeta()
  const cat = meta.categories.find((c) => c.id === e.category_id)
  return (
    <label
      id={`entry-${e.id}`}
      className={cn(
        "grid min-h-12 cursor-pointer grid-cols-[1.25rem_4.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t px-5 py-2.5 transition-colors first:border-t-0 hover:bg-muted/50 max-md:px-4",
        focus && "bg-warning/10 ring-2 ring-warning/40 ring-inset"
      )}
    >
      <input
        type="checkbox"
        checked={ticked}
        onChange={onToggle}
        className="size-4 accent-[var(--brand)]"
        aria-label={`${name}, ${money(e.amount)}`}
      />
      <span className="num text-xs text-muted-foreground">{dayLabel(e.day).replace(/ \d{4}$/, "")}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {cat && !e.transfer_id && <CategoryIcon icon={cat.icon} className="size-4 shrink-0 text-muted-foreground" />}
        <span className="truncate">{name}</span>
        {note && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-subtle-foreground">{note}</span>
        )}
      </span>
      <span className={cn("num text-sm", e.amount > 0 && "text-positive", !ticked && "text-muted-foreground")}>
        {money(e.amount)}
      </span>
    </label>
  )
}

function Hint({
  text,
  ids,
  onShow,
  icon,
}: {
  text: string
  ids: string[]
  onShow: (ids: string[]) => void
  icon?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t px-5 py-3 text-sm first:border-t-0 max-md:px-4">
      <p className="flex items-start gap-2">
        {icon && <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-warning" />}
        {text}
      </p>
      {ids.length > 0 && (
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onShow(ids)}>
          Show
        </Button>
      )}
    </div>
  )
}

const Figure = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={cn("num font-medium", tone === "good" && "text-positive", tone === "bad" && "text-warning")}>
      {tone === "bad" && <WarningIcon className="mr-1 inline size-3.5 -translate-y-px" />}
      {value}
    </dd>
  </div>
)
