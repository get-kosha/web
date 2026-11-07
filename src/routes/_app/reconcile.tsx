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
import { ParaglideMessage } from "@inlang/paraglide-js-react"
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
import { addDays, dayOf, fmt, guessCategory, intlLocale, isNeutral, parseAmount } from "@/lib/core"
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
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_app/reconcile")({
  validateSearch: z.object({ account: z.coerce.string().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ account: search.account }),
  loader: ({ deps }) => (deps.account ? getReconcile({ data: { walletId: deps.account } }) : null),
  head: () => ({ meta: [{ title: m.reconcile_head_title() }] }),
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
      <PageHeader title={m.reconcile_title()} sub={m.reconcile_picker_sub()} />
      <div className="px-4 md:px-8">
        <Card className="max-w-xl gap-0 py-1">
          {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">{m.reconcile_picker_empty()}</p>}
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
                  {w.reconciled_day
                    ? m.reconcile_reconciled_to({ day: dayLabel(w.reconciled_day) })
                    : m.reconcile_never_reconciled()}
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
  /** OFX only: refs of earlier lines the bank's corrections deleted. */
  withdrawn?: string[]
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
  const [openGroups, setOpenGroups] = useState<Set<"earlier" | "after">>(new Set())
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

  const name = (e: ReconcileEntry) => {
    if (!e.transfer_id)
      return e.name || meta.categories.find((c) => c.id === e.category_id)?.name || m.reconcile_no_payee()
    const account = meta.wallets.find((w) => w.id === e.counter_wallet_id)?.name
    if (account) return (e.amount < 0 ? m.reconcile_transfer_to_name : m.reconcile_transfer_from_name)({ account })
    return e.amount < 0 ? m.reconcile_transfer_to_other() : m.reconcile_transfer_from_other()
  }
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
      withdrawn: loaded?.withdrawn,
    })
  }, [lines, loaded?.withdrawn, data.open, data.done, day, last, notSame])
  const { close, periodStart, inPeriod, ticks: defaultTick, matched: matchedOpen } = plan
  const missing = plan.missing.map((i) => ({ l: lines[i], i }))
  const closeIds = new Set(close.map((p) => p.entry))
  const withdrawn = new Set(plan.withdrawn)
  // The statement lines each entry of a split is part of.
  const splitLines = new Map<string, number[]>()
  for (const p of plan.pairs)
    if (p.kind === "split") splitLines.set(p.entry, [...(splitLines.get(p.entry) ?? []), p.line])
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
        if (!meta.ai.statements) throw new Error(m.reconcile_pdf_unsupported())
        const r = await readStatementPdf({ data: { walletId: a.id, name: file.name, data: await fileBase64(file) } })
        if (r.currency && r.currency !== cur)
          toast.warning(
            m.reconcile_currency_mismatch({
              statementCurrency: r.currency.toUpperCase(),
              account: a.name,
              currency: cur.toUpperCase(),
            })
          )
        setLoaded({ source: "pdf", name: file.name, lines: r.lines, byAi: true, opening: r.opening, off: r.off })
        if (r.to) setDay(r.to)
        if (r.closing !== null) setBalanceText((r.closing / 100).toFixed(2))
        return
      }
      const text = await fileText(file)
      if (isOfx(text)) {
        const r = parseOfx(text)
        if (!r.lines.length) throw new Error(m.reconcile_ofx_empty())
        setLoaded({ source: "ofx", name: file.name, lines: r.lines, withdrawn: r.withdrawn })
        if (r.closingDay) setDay(r.closingDay)
        // Cards report what's owed as a negative balance.
        if (r.closing !== null) setBalanceText(((credit ? -r.closing : r.closing) / 100).toFixed(2))
        return
      }
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error(m.reconcile_csv_empty())
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
      toast.error(e instanceof Error ? e.message : m.reconcile_read_failed())
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
    if (unsorted.length) return toast.error(m.reconcile_pick_category_first({ count: unsorted.length }))
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
      toast.success(m.reconcile_added({ count: chosen.length, account: a.name }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.reconcile_add_failed())
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
      toast.error(err instanceof Error ? err.message : m.reconcile_change_failed())
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
      toast.error(e instanceof Error ? e.message : m.reconcile_finish_failed())
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
      toast.success(m.reconcile_undone())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.reconcile_undo_failed())
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
                  text: m.reconcile_hint_opening_gap({
                    opening: money(loaded!.opening!),
                    closing: money(last!.printed),
                  }),
                  ids: [],
                },
              ]
            : []),
          ...(single && missing.length > 1
            ? [
                {
                  text: m.reconcile_hint_single_missing({ payee: row(single.l).payee, amount: money(single.l.amount) }),
                  ids: [],
                },
              ]
            : []),
          ...(missing.length && missingTotal === diff
            ? [
                {
                  text: m.reconcile_hint_missing_closes({ count: missing.length }),
                  ids: [],
                },
              ]
            : missing.length
              ? [
                  {
                    text: m.reconcile_hint_missing_count({ count: missing.length, amount: money(missingTotal) }),
                    ids: [],
                  },
                ]
              : []),
          ...[...withdrawn].map((id) => {
            const e = data.open.find((x) => x.id === id)!
            return { text: m.reconcile_hint_withdrawn({ name: name(e), amount: money(e.amount) }), ids: [id] }
          }),
          ...plan.splits.map((g) => {
            const entries = g.entries.map((id) => data.open.find((x) => x.id === id)!)
            return {
              text:
                g.lines.length === 1
                  ? m.reconcile_hint_split({
                      amount: money(lines[g.lines[0]].amount),
                      names: entries.map(name).join(" + "),
                    })
                  : m.reconcile_hint_split_lines({
                      name: name(entries[0]),
                      amounts: g.lines.map((i) => money(lines[i].amount)).join(" + "),
                    }),
              ids: g.entries,
            }
          }),
          ...close.map((p) => {
            const e = data.open.find((x) => x.id === p.entry)!
            return {
              text: m.reconcile_hint_close({
                name: name(e),
                kosha: money(e.amount),
                statement: money(lines[p.line].amount),
              }),
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
      toast.error(e instanceof Error ? e.message : m.reconcile_ask_failed())
    } finally {
      setBusy(null)
    }
  }
  const toggleGroup = (g: "earlier" | "after") =>
    setOpenGroups((s) => {
      const n = new Set(s)
      if (n.has(g)) n.delete(g)
      else n.add(g)
      return n
    })
  // A hinted entry can sit in a collapsed group, whose rows aren't rendered, so Show opens that group first.
  const show = (ids: string[]) => {
    const has = (list: ReconcileEntry[]) => list.some((e) => ids.includes(e.id))
    setOpenGroups((s) => {
      const n = new Set(s)
      if (has(earlier)) n.add("earlier")
      if (has(after)) n.add("after")
      return n
    })
    setFocus(ids)
  }
  // Scrolls once the render that opened the group has committed, so the row exists.
  useEffect(() => {
    if (focus.length)
      document.getElementById(`entry-${focus[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [focus])

  // ---------- page ----------

  const statementLabel = (credit ? m.reconcile_owed_label : m.reconcile_balance_label)({ currency: cur.toUpperCase() })
  const accept = `.csv,.ofx,.qfx,.txt,text/csv${meta.ai.statements ? ",.pdf,application/pdf" : ""}`

  if (done)
    return (
      <div className="pb-8">
        <PageHeader title={m.reconcile_account_title({ account: a.name })} />
        <div className="px-4 md:px-8">
          <Card className="rise-in max-w-xl items-start gap-3 px-6">
            <CheckCircleIcon weight="fill" className="size-8 text-positive" />
            <h2 className="text-lg font-semibold">{m.reconcile_done_title({ account: a.name })}</h2>
            <p className="text-sm text-muted-foreground">
              {m.reconcile_done_checked({
                count: done.entries,
                n: done.entries.toLocaleString(intlLocale()),
                day: dayLabel(done.day),
              })}
              {done.adjustment ? ` ${m.reconcile_done_correction({ amount: money(done.adjustment) })}` : ""}{" "}
              {m.reconcile_done_marked()}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => navigate({ to: "/accounts" })}>{m.reconcile_back_to_accounts()}</Button>
              <Button variant="outline" className="bg-card" disabled={busy === "undo"} onClick={() => undo(done.id)}>
                <ArrowCounterClockwiseIcon /> {m.common_undo()}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )

  return (
    <div className="pb-8 md:max-w-[60rem]">
      <PageHeader
        title={m.reconcile_account_title({ account: a.name })}
        sub={
          <>
            {last ? m.reconcile_last_reconciled({ day: dayLabel(last.statement_day) }) : m.reconcile_check_each()} ·{" "}
            <Link to="/reconcile" className="underline-offset-2 hover:text-foreground hover:underline">
              {m.reconcile_other_account()}
            </Link>
          </>
        }
      />

      <div className="grid gap-5 px-4 md:px-8">
        {drift !== 0 && last && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            {m.reconcile_drift({ day: dayLabel(last.statement_day), amount: money(credit ? -drift : drift) })}
          </p>
        )}
        {loaded?.off != null && loaded.off !== 0 && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            {m.reconcile_pdf_off({ amount: money(Math.abs(loaded.off)) })}
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
                <p className="text-sm">{m.reconcile_reading({ file: reading })}</p>
              </>
            ) : loaded ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{loaded.name}</span> ·{" "}
                  {m.reconcile_file_lines({ count: loaded.lines.length })}
                  {loaded.byAi && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <AiMark className="size-3" /> {m.reconcile_read_by_ai()}
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="bg-card" onClick={() => fileInput.current?.click()}>
                    {m.reconcile_another_file()}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLoaded(null)}>
                    {m.common_remove()}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <FileArrowUpIcon className="size-6 text-muted-foreground" />
                <p className="text-sm">
                  <ParaglideMessage
                    message={m.reconcile_drop}
                    markup={{
                      choose: ({ children }) => (
                        <button
                          type="button"
                          className="font-medium underline underline-offset-2"
                          onClick={() => fileInput.current?.click()}
                        >
                          {children}
                        </button>
                      ),
                    }}
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  {meta.ai.statements ? m.reconcile_drop_formats_pdf() : m.reconcile_drop_formats()}
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
              {m.reconcile_statement_date()}
              <DatePicker
                value={day}
                max={addDays(today, 31)}
                onChange={setDay}
                className="h-10 bg-background text-foreground"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {statementLabel}
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
              <ParaglideMessage
                message={credit ? m.reconcile_quick_owed : m.reconcile_quick_balance}
                inputs={{ amount: money(fromKosha(quickBalance)) }}
                markup={{
                  amount: ({ children }) => <span className="num font-medium text-foreground">{children}</span>,
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                disabled={busy !== null}
                onClick={() => finish(false, { balance: quickBalance, ids: upToToday.map((e) => e.id), day: today })}
              >
                <CheckIcon /> {m.reconcile_same_as_bank()}
              </Button>
            </p>
          )}
        </Card>

        {missing.length > 0 && (
          <Section
            title={m.reconcile_missing_title({ count: missing.length })}
            aside={
              busy === "tidy" ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SpinnerGapIcon className="size-3.5 animate-spin" /> {m.reconcile_naming_payees()}
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
                        aria-label={m.reconcile_payee()}
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
                      aria-label={m.reconcile_category_for({ name: r.payee || l.description })}
                      placeholder={m.reconcile_pick_category()}
                      options={[
                        ...categories
                          .filter((c) => !!c.income === l.amount > 0)
                          .map((c) => ({ value: c.id, label: c.name })),
                        ...others.map((w) => ({
                          value: `transfer:${w.id}`,
                          label: (l.amount < 0 ? m.reconcile_transfer_to : m.reconcile_transfer_from)({
                            account: w.name,
                          }),
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
                    aria-label={r.skip ? m.reconcile_include_line() : m.reconcile_leave_out_line()}
                    aria-pressed={!r.skip}
                    onClick={() => pick(l.ref!, { skip: !r.skip })}
                  >
                    {r.skip ? <ArrowCounterClockwiseIcon /> : <XIcon />}
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 max-md:px-4">
              <span className="text-xs text-muted-foreground">{m.reconcile_saving_teaches()}</span>
              <Button disabled={busy !== null || missing.every(({ l }) => row(l).skip)} onClick={addMissing}>
                {busy === "add" && <SpinnerGapIcon className="animate-spin" />}
                {m.reconcile_add_to_kosha({ count: missing.filter(({ l }) => !row(l).skip).length })}
              </Button>
            </div>
          </Section>
        )}

        {close.length > 0 && (
          <Section title={m.reconcile_close_title({ count: close.length })}>
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
                      {(p.kind === "corrected" ? m.reconcile_corrected_detail : m.reconcile_close_detail)({
                        kosha: money(e.amount),
                        koshaDay: dayLabel(e.day),
                        statement: money(l.amount),
                        statementDay: dayLabel(l.day),
                      })}
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
                        {m.reconcile_use_amount({ amount: money(l.amount) })}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setNotSame((s) => new Set(s).add(l.ref ?? ""))}>
                      {m.reconcile_not_same()}
                    </Button>
                  </div>
                </div>
              )
            })}
          </Section>
        )}

        <Section
          title={loaded ? m.reconcile_in_kosha() : m.reconcile_tick_title()}
          aside={
            <span className="text-xs text-muted-foreground">{m.reconcile_ticked_count({ count: ticked.length })}</span>
          }
        >
          {earlier.length > 0 && (
            <Group
              label={m.reconcile_before_group({ count: earlier.length })}
              hint={m.reconcile_before_hint()}
              open={openGroups.has("earlier")}
              onToggle={() => toggleGroup("earlier")}
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
            <p className="px-5 py-4 text-sm text-muted-foreground">{m.reconcile_nothing({ day: dayLabel(day) })}</p>
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
                  ? m.reconcile_note_amount_differs()
                  : withdrawn.has(e.id)
                    ? m.reconcile_note_withdrawn()
                    : splitLines.has(e.id)
                      ? splitLines.get(e.id)!.length === 1
                        ? m.reconcile_note_part_of({ amount: money(lines[splitLines.get(e.id)![0]].amount) })
                        : m.reconcile_note_split_lines()
                      : loaded && !matchedOpen.has(e.id)
                        ? e.day > addDays(day, -3)
                          ? m.reconcile_note_next_statement()
                          : m.reconcile_note_not_on_statement()
                        : !e.paid
                          ? m.reconcile_note_still_due()
                          : undefined
              }
              onToggle={() => toggle(e)}
            />
          ))}
          {after.length > 0 && (
            <Group
              label={m.reconcile_after_group({ day: dayLabel(day), count: after.length })}
              hint={m.reconcile_after_hint()}
              open={openGroups.has("after")}
              onToggle={() => toggleGroup("after")}
            >
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
            title={m.reconcile_finding_title()}
            aside={
              canAskAi ? (
                <Button variant="outline" size="sm" className="bg-card" disabled={busy !== null} onClick={askAi}>
                  {busy === "ai" ? <SpinnerGapIcon className="animate-spin" /> : <AiMark className="size-3" />}{" "}
                  {m.reconcile_ask_ai()}
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
          <Section title={m.reconcile_past()}>
            {data.history.map((h, i) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm first:border-t-0 max-md:px-4"
              >
                <span>
                  {dayLabel(h.statement_day)} · <span className="num">{money(h.printed)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {m.reconcile_history_entries({ count: h.entries })}
                    {h.adjustment ? ` · ${m.reconcile_corrected_by({ amount: money(h.adjustment) })}` : ""}
                  </span>
                </span>
                {i === 0 && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => undo(h.id)}>
                    <ArrowCounterClockwiseIcon /> {m.common_undo()}
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
                label={credit ? m.reconcile_figure_statement_owed() : m.reconcile_figure_statement()}
                value={statement === null ? "—" : money(fromKosha(statement))}
              />
              <Figure
                label={credit ? m.reconcile_figure_ticked_owed() : m.reconcile_figure_ticked()}
                value={money(fromKosha(cleared))}
              />
              <Figure
                label={m.reconcile_figure_difference()}
                value={diff === null ? "—" : diff === 0 ? m.reconcile_figure_none() : money(credit ? -diff : diff)}
                tone={diff === null ? undefined : diff === 0 ? "good" : "bad"}
              />
            </dl>
            <div className="flex flex-wrap gap-2">
              {diff !== null && diff !== 0 && (
                <Button variant="outline" className="bg-card" disabled={busy !== null} onClick={() => finish(true)}>
                  {m.reconcile_finish_with_correction({ amount: money(Math.abs(diff)) })}
                </Button>
              )}
              <Button disabled={busy !== null || diff !== 0} onClick={() => finish(false)}>
                {busy === "finish" && <SpinnerGapIcon className="animate-spin" />}
                {statement === null ? m.reconcile_enter_balance() : m.reconcile_finish()}
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

function Group({
  label,
  hint,
  open,
  onToggle,
  children,
}: {
  label: string
  hint: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
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
          {m.reconcile_show()}
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
