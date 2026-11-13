import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DatePicker } from "@/components/date-time"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/settings/row"
import { Chip, eventDates } from "@/components/tags-events"
import { ActivityPanel } from "@/components/activity-panel"
import { CategoryIcon } from "@/components/category-icon"
import { CategoryPicker, categoryPath } from "@/components/category-picker"
import {
  PageHeader,
  PageSkeleton,
  bottomSheet,
  isTyping,
  monthLabel,
  segment,
  segmentButton,
  useGlobals,
  useMeta,
} from "@/components/shell"
import { TransactionForm, TransactionSheet } from "@/components/transaction-form"
import { listTransactions, type Tx } from "@/lib/api"
import {
  intlLocale,
  convert,
  dayOf,
  fmt,
  isNeutral,
  parseAmount,
  parsePeriod,
  periodDays,
  periodParam,
  refundList,
  refundedShare,
  shiftPeriod,
  tagList,
  type Period,
} from "@/lib/core"
import { cn } from "@/lib/utils"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"

const PAGE = 100

const search = z.object({
  // Coerce, because the router JSON-parses search values and ?category=1 arrives as a number.
  q: z.coerce.string().optional(),
  wallet: z.coerce.string().optional(),
  category: z.coerce.string().optional(),
  tag: z.coerce.string().optional(),
  event: z.coerce.string().optional(),
  /** The dates to list (see `parsePeriod`). Unset, a search, tag or event covers every date and anything else this month. */
  period: z.coerce.string().optional(),
  /** Amount range in cents, by absolute value. */
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
  type: z.enum(["out", "in", "transfers", "loans"]).optional(),
  loan: z.string().optional(),
  corrections: z.boolean().optional(),
  limit: z.number().int().min(PAGE).max(2000).optional(),
})
type Search = z.infer<typeof search>

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: search,
  loaderDeps: ({ search: { q, wallet, category, tag, event, period, min, max, type, loan, corrections, limit } }) => ({
    q,
    wallet,
    category,
    tag,
    event,
    period,
    min,
    max,
    type,
    loan,
    corrections,
    limit,
  }),
  loader: ({ deps: { period, limit, ...deps } }) =>
    listTransactions({ data: { ...deps, ...periodInput(period), limit: limit ?? PAGE } }),
  head: () => ({ meta: [{ title: `${m.tx_activity()} · Kosha` }] }),
  pendingComponent: PageSkeleton,
  component: Activity,
})

// A day from another year names its year, since a search or a long period can span several.
const dayTitle = (day: string, current: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: day.slice(0, 4) === current.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  })
const signed = (cents: number, currency: string) => `${cents > 0 ? "+" : ""}${fmt(cents, currency)}`

/** The days a period asks the server for. No period leaves the server's default (see `listTransactions`). */
function periodInput(value: string | undefined) {
  const p = parsePeriod(value)
  return p ? (periodDays(p) ?? { all: true }) : {}
}

const periodLabel = (p: Period) =>
  p.kind === "month"
    ? monthLabel(p.month)
    : p.kind === "year"
      ? p.year
      : p.kind === "all"
        ? m.tx_period_all()
        : new Intl.DateTimeFormat(intlLocale(), {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).formatRange(new Date(`${p.from}T12:00:00Z`), new Date(`${p.to}T12:00:00Z`))

function Activity() {
  const meta = useMeta()
  const data = Route.useLoaderData()
  const s = Route.useSearch()
  const { current, currency: cur } = useGlobals()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState(s.q ?? "")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Tx | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const set = useCallback(
    (patch: Partial<Search>) =>
      navigate({ search: (prev) => ({ ...prev, limit: undefined, ...patch }), replace: true, resetScroll: false }),
    [navigate]
  )

  useEffect(() => {
    const t = setTimeout(() => q !== (s.q ?? "") && set({ q: q || undefined }), 250)
    return () => clearTimeout(t)
  }, [q, s.q, set])
  // Follow outside changes (e.g. "See all" at a payee), but never overwrite what the user is typing.
  // Which field has focus is only known in the browser, so this waits for the effect.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (document.activeElement?.id !== "activity-search") setQ(s.q ?? "")
  }, [s.q])

  const wallets = new Map(meta.wallets.map((w) => [w.id, w]))
  const categories = new Map(meta.categories.map((c) => [c.id, c]))
  const conv = (cents: number, currency: string) => convert(cents, currency, cur, meta.rates)
  const selected = data.rows.find((t) => t.id === selectedId) ?? null

  // Drop the selection when its row leaves the list (deleted, filtered out, other month).
  if (selectedId && !selected) setSelectedId(null)

  // Arrow keys move the selection and Esc closes the panel. List navigation never animates, on purpose.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.("[role=dialog],[data-slot=popover-content]")) return
      if (e.key === "Escape" && (e.target as Element).id !== "activity-search") return setSelectedId(null)
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || isTyping(e.target)) return
      e.preventDefault()
      const i = data.rows.findIndex((t) => t.id === selectedId)
      const next = data.rows[Math.min(Math.max(i + (e.key === "ArrowDown" ? 1 : -1), 0), data.rows.length - 1)]
      if (!next) return
      setSelectedId(next.id)
      const el = listRef.current?.querySelector<HTMLElement>(`[data-tx="${next.id}"]`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: "nearest" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, data.rows])

  function open(t: Tx) {
    if (window.matchMedia("(min-width: 1024px)").matches) setSelectedId(t.id)
    else setEditing(t)
  }

  const groups: { day: string; rows: Tx[] }[] = []
  for (const t of data.rows) {
    const d = dayOf(t.date, meta.tz)
    if (groups.at(-1)?.day !== d) groups.push({ day: d, rows: [] })
    groups.at(-1)!.rows.push(t)
  }

  const out = data.totals.reduce((n, t) => n + conv(t.out, t.currency), 0)
  const inn = data.totals.reduce((n, t) => n + conv(t.inn, t.currency), 0)
  const moved = data.totals.reduce((n, t) => n + conv(t.transfers, t.currency), 0)
  const wallet = s.wallet ? wallets.get(s.wallet) : undefined
  const category = s.category ? categories.get(s.category) : undefined
  const amountLabel =
    s.min !== undefined && s.max !== undefined
      ? `${fmt(s.min, cur)}–${fmt(s.max, cur)}`
      : s.min !== undefined
        ? m.tx_amount_over({ amount: fmt(s.min, cur) })
        : s.max !== undefined
          ? m.tx_amount_under({ amount: fmt(s.max, cur) })
          : null

  const event = s.event ? meta.events.find((e) => e.id === s.event) : undefined
  const period = parsePeriod(s.period)
  const finding = !!(s.q || s.tag || s.event || s.loan)
  // What's listed when no period is set, matching the server's default.
  const shown: Period = period ?? (finding ? { kind: "all" } : { kind: "month", month: current })
  // The current month is the default unless you're finding something, so it stays out of the URL then.
  const pickPeriod = (p: Period) =>
    set({ period: !finding && p.kind === "month" && p.month === current ? undefined : periodParam(p) })
  // Every active filter as a removable chip under the search. `text` names it for screen readers.
  const chips = [
    s.loan && { key: "loan", label: m.loans_title(), text: m.loans_title(), clear: { loan: undefined } },
    wallet && { key: "wallet", label: wallet.name, text: wallet.name, clear: { wallet: undefined } },
    category && {
      key: "category",
      text: categoryPath(category, meta.categories),
      label: (
        <>
          <CategoryIcon
            icon={(category.parent_id ? categories.get(category.parent_id) : category)?.icon}
            className="size-4"
          />
          {categoryPath(category, meta.categories)}
        </>
      ),
      clear: { category: undefined },
    },
    amountLabel && { key: "amount", label: amountLabel, text: amountLabel, clear: { min: undefined, max: undefined } },
    s.tag && { key: "tag", label: `#${s.tag}`, text: `#${s.tag}`, clear: { tag: undefined } },
    event && { key: "event", label: event.name, text: event.name, clear: { event: undefined } },
    s.corrections && {
      key: "corrections",
      label: m.tx_corrections_shown(),
      text: m.tx_corrections_shown(),
      clear: { corrections: undefined },
    },
  ].filter((c) => !!c)
  const [filtering, setFiltering] = useState(false)

  return (
    <div className="pb-8">
      <PageHeader
        title={m.tx_activity()}
        sub={
          <>
            {event && !period
              ? [event.name, eventDates(event)].filter(Boolean).join(" · ")
              : s.tag && !period
                ? m.tx_tag_all_dates({ tag: s.tag })
                : periodLabel(shown)}{" "}
            ·{" "}
            <ParaglideMessage
              message={m.tx_count}
              inputs={{ count: data.total, n: data.total.toLocaleString(intlLocale()) }}
              markup={{ num: ({ children }) => <span className="num">{children}</span> }}
            />
          </>
        }
      />

      <div className="flex flex-col gap-4 px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 md:max-w-[360px]">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="activity-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={m.tx_search_label()}
              placeholder={m.tx_search_placeholder()}
              className="h-9 bg-card pl-9 text-[13px] md:text-[13px]"
            />
          </label>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setFiltering(true)}
            aria-label={chips.length ? m.tx_filters_on({ count: chips.length }) : m.tx_filters()}
            className="relative gap-2 bg-card px-3 text-[13px] font-normal max-md:size-11 max-md:px-0"
          >
            <SlidersHorizontalIcon className="size-4" />
            <span className="max-md:hidden">{m.tx_filters()}</span>
            {chips.length > 0 && (
              <span className="num inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background max-md:absolute max-md:-top-1 max-md:-right-1">
                {chips.length}
              </span>
            )}
          </Button>
          <PeriodPicker shown={shown} current={current} onPick={pickPeriod} />
          <div className="hidden flex-1 md:block" />
          <Segmented
            label={m.tx_show()}
            value={s.type ?? "all"}
            onChange={(v) => set({ type: v === "all" ? undefined : v })}
            options={[
              ["all", m.tx_type_all()],
              ["out", m.tx_out()],
              ["in", m.tx_in()],
              ["transfers", m.tx_type_transfers()],
              ["loans", m.loans_title()],
            ]}
          />
        </div>

        {chips.length > 0 && (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card pr-1 pl-3 text-[13px] max-md:h-10"
              >
                <span className="flex max-w-48 items-center gap-1.5 truncate">{c.label}</span>
                <button
                  type="button"
                  onClick={() => set(c.clear)}
                  aria-label={m.tx_remove_filter({ label: c.text })}
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-8"
                >
                  <XIcon className="size-3.5" />
                </button>
              </span>
            ))}
            {chips.length > 1 && (
              <button
                type="button"
                onClick={() => set(NO_FILTERS)}
                className="inline-flex min-h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:text-foreground max-md:min-h-10"
              >
                {m.tx_clear_all()}
              </button>
            )}
          </div>
        )}

        <dl className="grid grid-cols-3 gap-3 px-0.5 sm:flex sm:gap-10">
          <Total label={m.tx_out()} value={fmt(out, cur)} />
          <Total label={m.tx_in()} value={signed(inn, cur)} className="text-positive" />
          <Total label={m.tx_net()} value={signed(out + inn, cur)} />
          {moved > 0 && (
            <p className="col-span-3 -mt-1 text-xs text-muted-foreground sm:mt-0 sm:self-end sm:pb-0.5">
              <ParaglideMessage
                message={m.tx_moved_not_counted}
                inputs={{ amount: fmt(moved, cur) }}
                markup={{ num: ({ children }) => <span className="num">{children}</span> }}
              />
            </p>
          )}
        </dl>

        <div className="flex flex-wrap items-start gap-5">
          <section
            ref={listRef}
            aria-label={m.tx_transactions()}
            className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border bg-card"
          >
            {groups.length === 0 &&
              (chips.length || s.q || s.type ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <p>{m.tx_no_match()}</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setQ("")
                      set({ ...NO_FILTERS, q: undefined, type: undefined })
                    }}
                  >
                    {m.tx_clear_filters()}
                  </Button>
                </div>
              ) : (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {period ? m.tx_empty_period() : m.tx_empty_month()}
                </p>
              ))}
            {groups.map((g, gi) => {
              const dayTotal = g.rows.reduce(
                (n, t) =>
                  isNeutral(t.category_id) ? n : n + conv(t.amount, wallets.get(t.wallet_id)?.currency ?? meta.primary),
                0
              )
              return (
                <div key={g.day} role="group" aria-label={dayTitle(g.day, current)}>
                  <div
                    className={cn(
                      "flex items-baseline justify-between px-4 pt-4 pb-1.5 text-xs text-muted-foreground",
                      gi > 0 && "border-t"
                    )}
                  >
                    <span className="font-medium text-subtle-foreground">{dayTitle(g.day, current)}</span>
                    <span className="num">{dayTotal ? signed(dayTotal, cur) : ""}</span>
                  </div>
                  {g.rows.map((t) => (
                    <Row
                      key={t.id}
                      t={t}
                      selected={t.id === selectedId}
                      singleWallet={!!s.wallet}
                      onClick={() => open(t)}
                    />
                  ))}
                </div>
              )
            })}
            {data.rows.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  <ParaglideMessage
                    message={m.tx_showing}
                    inputs={{
                      shown: data.rows.length.toLocaleString(intlLocale()),
                      total: data.total.toLocaleString(intlLocale()),
                    }}
                    markup={{ num: ({ children }) => <span className="num">{children}</span> }}
                  />
                </span>
                {data.rows.length < data.total && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      navigate({
                        search: (prev) => ({ ...prev, limit: data.rows.length + PAGE }),
                        replace: true,
                        resetScroll: false,
                      })
                    }
                  >
                    {m.tx_load_earlier()}
                  </Button>
                )}
              </div>
            )}
          </section>

          {selected && (
            <aside
              aria-label={m.tx_details()}
              className="sticky top-4 hidden max-w-[400px] min-w-0 flex-[1_1_320px] rounded-xl border bg-card p-5 duration-150 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 lg:block"
            >
              <ActivityPanel
                key={selected.id}
                tx={selected}
                onClose={() => setSelectedId(null)}
                onSelect={setSelectedId}
              />
            </aside>
          )}
        </div>
      </div>

      <FiltersSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        s={s}
        set={set}
        total={data.total}
        corrections={data.corrections}
      />

      <TransactionSheet
        open={!!editing}
        title={editing?.transfer_id ? m.tx_edit_transfer() : m.tx_edit_transaction()}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <TransactionForm
            key={editing.id}
            initial={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </TransactionSheet>
    </div>
  )
}

/**
 * ‹ November 2026 › for Activity's dates. The arrows step a month or a year, and the label opens a menu
 * to pick a month, a year, every date or two days.
 */
function PeriodPicker({ shown, current, onPick }: { shown: Period; current: string; onPick: (p: Period) => void }) {
  const meta = useMeta()
  const [choosing, setChoosing] = useState(false)
  // Remounts the dates dialog each time it opens, so it starts from what's shown.
  const [opened, setOpened] = useState(0)
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const days = periodDays(shown)
  // Switching to a month or a year keeps where you are, but never moves past now.
  const month = days && days.to.slice(0, 7) < current ? days.to.slice(0, 7) : current
  const label = periodLabel(shown)
  const prev = shiftPeriod(shown, -1)
  const next = shiftPeriod(shown, 1)
  const year = shown.kind === "year"
  return (
    <div className={cn(segment, "max-md:basis-full")}>
      {prev && (
        <button
          type="button"
          onClick={() => onPick(prev)}
          aria-label={year ? m.tx_previous_year() : m.shell_previous_month()}
          className={segmentButton}
        >
          <CaretLeftIcon className="size-4" />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={m.tx_period_label({ period: label })}
          className={cn(segmentButton, "gap-1.5 px-2.5 text-[13px] font-medium text-foreground max-md:flex-1")}
        >
          {label}
          <CaretDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuRadioGroup value={shown.kind}>
            <DropdownMenuRadioItem closeOnClick value="month" onClick={() => onPick({ kind: "month", month })}>
              {m.tx_period_month()}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              closeOnClick
              value="year"
              onClick={() => onPick({ kind: "year", year: month.slice(0, 4) })}
            >
              {m.tx_period_year()}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="all" onClick={() => onPick({ kind: "all" })}>
              {m.tx_period_all()}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setOpened((n) => n + 1)
              setChoosing(true)
            }}
          >
            {m.tx_period_custom()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {next && (
        <button
          type="button"
          onClick={() => onPick(next)}
          aria-label={year ? m.tx_next_year() : m.shell_next_month()}
          className={segmentButton}
        >
          <CaretRightIcon className="size-4" />
        </button>
      )}
      <DaysDialog
        key={opened}
        open={choosing}
        initial={days ?? { from: `${current}-01`, to: today }}
        onClose={() => setChoosing(false)}
        onPick={(from, to) => onPick({ kind: "range", from, to })}
      />
    </div>
  )
}

function DaysDialog({
  open,
  initial,
  onClose,
  onPick,
}: {
  open: boolean
  initial: { from: string; to: string }
  onClose: () => void
  onPick: (from: string, to: string) => void
}) {
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(bottomSheet, "gap-5 md:max-w-sm")}>
        <DialogHeader>
          <DialogTitle>{m.tx_period_custom_title()}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <span id="period-from" className="text-xs text-muted-foreground">
              {m.tx_date_from()}
            </span>
            <DatePicker aria-labelledby="period-from" value={from} max={to} onChange={setFrom} />
          </div>
          <div className="grid gap-1">
            <span id="period-to" className="text-xs text-muted-foreground">
              {m.tx_until()}
            </span>
            <DatePicker aria-labelledby="period-to" value={to} min={from} onChange={setTo} />
          </div>
        </div>
        <Button
          size="lg"
          className="max-md:h-11"
          onClick={() => {
            onPick(from, to)
            onClose()
          }}
        >
          {m.tx_show()}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  t,
  selected,
  singleWallet,
  onClick,
}: {
  t: Tx
  selected: boolean
  singleWallet: boolean
  onClick: () => void
}) {
  const meta = useMeta()
  const { currency: cur } = useGlobals()
  const c = meta.categories.find((x) => x.id === t.category_id)
  const w = meta.wallets.find((x) => x.id === t.wallet_id)
  const other = t.counter_wallet_id ? meta.wallets.find((x) => x.id === t.counter_wallet_id) : undefined
  const currency = w?.currency ?? meta.primary
  const isTransfer = !!t.transfer_id
  // A transfer's title reads "from → to". In a list filtered to one account, it keeps its sign.
  // Otherwise it is neutral and shows what was sent.
  const title = isTransfer
    ? t.amount < 0
      ? `${w?.name} → ${other?.name}`
      : `${other?.name} → ${w?.name}`
    : t.name || c?.name || m.tx_untitled()
  const amount = isTransfer && !singleWallet ? Math.abs(t.amount) + (t.amount < 0 ? (t.fee ?? 0) : 0) : t.amount
  const foreign = currency !== cur
  const event = t.event_id ? meta.events.find((e) => e.id === t.event_id) : undefined
  const sub: ReactNode[] = [
    t.loan_id && (t.loan_kind === "funding" ? m.loans_original() : m.loans_repayment()),
    !t.paid && kindLabel(t.kind),
    event?.name,
    ...tagList(t.tags).map((x) => (
      <Link
        key={x}
        to="/transactions"
        search={{ tag: x }}
        aria-label={m.tx_tag_link({ tag: x })}
        className="relative z-10 rounded-sm after:absolute after:-inset-x-1.5 after:-inset-y-1 after:content-[''] hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:after:-inset-y-3.5"
      >
        #{x}
      </Link>
    )),
    t.note,
  ].filter(Boolean)
  const shown = isTransfer ? fmt(amount, currency) : signed(amount, currency)
  const refunds = refundList(t.refunds)
  const refunded = refunds.length
    ? refundedShare(
        t.amount,
        currency,
        refunds.map((r) => ({
          amount: r.amount,
          currency: meta.wallets.find((x) => x.id === r.wallet_id)?.currency ?? meta.primary,
        })),
        meta.rates
      )
    : null
  const badge = isTransfer
    ? m.tx_transfer_badge()
    : t.refund_of
      ? m.tx_refund_badge()
      : refunded && (refunded.full ? m.tx_refunded_badge() : m.tx_part_refunded_badge())

  // The row opens with its title button, whose ::after covers the whole row; tags sit above it as links
  // to every transaction with that tag. (A link can't go inside a button.)
  return (
    <div
      data-row
      className={cn(
        "relative grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-1.5 text-left text-sm transition-colors hover:bg-muted has-[button:focus-visible]:bg-muted min-[760px]:grid-cols-[minmax(0,1fr)_116px_104px_112px]",
        selected && "bg-selected hover:bg-selected",
        isTransfer && "text-subtle-foreground",
        !t.paid && "opacity-60"
      )}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center">
          <button
            type="button"
            data-tx={t.id}
            aria-pressed={selected}
            aria-label={[title, shown, badge, c?.name, t.files && m.tx_files_attached({ count: t.files })]
              .filter(Boolean)
              .join(", ")}
            onClick={onClick}
            className="truncate text-left outline-none after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </button>
          {!!t.files && <PaperclipIcon aria-hidden="true" className="ml-1.5 size-3.5 shrink-0 text-muted-foreground" />}
          {badge && (
            <span className="ml-1.5 shrink-0 rounded-sm bg-muted px-1.5 text-[11px] text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        {sub.length > 0 && (
          // clip, not hidden: the tags' taller tap areas may reach above and below the line.
          <span className="block overflow-x-clip text-xs text-ellipsis whitespace-nowrap text-muted-foreground">
            {sub.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </span>
        )}
      </span>
      <span className="hidden min-w-0 items-center gap-2 text-[13px] text-subtle-foreground min-[760px]:flex">
        <CategoryIcon icon={c?.icon} className="size-[17px]" />
        <span className="truncate">{c?.name ?? "—"}</span>
      </span>
      <span className="hidden truncate text-[13px] text-subtle-foreground min-[760px]:block">{w?.name}</span>
      <span className={cn("num text-right", !isTransfer && t.amount > 0 && "text-positive")}>
        {/* Refunded in full: it happened, but costs nothing now. */}
        <span className={cn(refunded?.full && "text-muted-foreground line-through")}>{shown}</span>
        {foreign && (
          <span className="block text-xs text-muted-foreground">
            ≈ {fmt(convert(amount, currency, cur, meta.rates), cur)}
          </span>
        )}
      </span>
    </div>
  )
}

/** An unpaid row's schedule kind, as the sub line shows it. */
function kindLabel(kind: string | null | undefined) {
  const labels: Record<string, () => string> = {
    subscription: m.tx_kind_subscription,
    repetitive: m.tx_kind_repetitive,
    credit: m.tx_kind_credit,
    debt: m.tx_kind_debt,
  }
  return kind ? (labels[kind]?.() ?? kind) : m.tx_kind_upcoming()
}

const NO_FILTERS = {
  wallet: undefined,
  category: undefined,
  min: undefined,
  max: undefined,
  tag: undefined,
  event: undefined,
  corrections: undefined,
} satisfies Partial<Search>

const Total = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={cn("num mt-0.5 truncate text-[15px] font-medium", className)}>{value}</dd>
  </div>
)

/** The sheet holds every filter. Changes apply as you make them, and the button shows how many match. */
function FiltersSheet({
  open,
  onClose,
  s,
  set,
  total,
  corrections,
}: {
  open: boolean
  onClose: () => void
  s: Search
  set: (patch: Partial<Search>) => void
  total: number
  corrections: number
}) {
  const meta = useMeta()
  const { currency: cur } = useGlobals()
  const [pickingCategory, setPickingCategory] = useState(false)
  const category = s.category ? meta.categories.find((c) => c.id === s.category) : undefined
  const toggle = <K extends keyof Search>(key: K, value: Search[K]) =>
    set({ [key]: s[key] === value ? undefined : value })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(bottomSheet, "max-h-[88svh] gap-5 md:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{m.tx_filters()}</DialogTitle>
        </DialogHeader>

        <FilterSection label={m.tx_account()}>
          {meta.wallets
            .filter((w) => !w.archived || w.id === s.wallet)
            .map((w) => (
              <Chip key={w.id} on={w.id === s.wallet} onClick={() => toggle("wallet", w.id)}>
                {w.name}
              </Chip>
            ))}
        </FilterSection>

        <FilterSection label={m.tx_category()}>
          <Chip on={!!category} onClick={() => setPickingCategory((v) => !v)} label={m.tx_pick_category()}>
            {category ? (
              <>
                <CategoryIcon icon={category.icon} className="size-4" /> {categoryPath(category, meta.categories)}
              </>
            ) : (
              m.tx_any_category()
            )}
          </Chip>
          {category && (
            <Chip onClick={() => set({ category: undefined })} className="text-muted-foreground">
              {m.tx_clear()}
            </Chip>
          )}
          {pickingCategory && (
            <div className="basis-full overflow-hidden rounded-lg border">
              <CategoryPicker
                value={s.category}
                onPick={(c) => {
                  set({ category: c.id })
                  setPickingCategory(false)
                }}
              />
            </div>
          )}
        </FilterSection>

        <FilterSection label={m.tx_amount()}>
          <AmountRange
            key={`${s.min}-${s.max}`}
            min={s.min}
            max={s.max}
            currency={cur}
            onApply={(min, max) => set({ min, max })}
          />
        </FilterSection>

        {meta.tags.length > 0 && (
          <FilterSection label={m.tx_tag()} note={m.tx_tag_note()}>
            {meta.tags.map((t) => (
              <Chip key={t} on={t === s.tag} onClick={() => toggle("tag", t)}>
                #{t}
              </Chip>
            ))}
          </FilterSection>
        )}

        {meta.events.length > 0 && (
          <FilterSection label={m.tx_event()} note={m.tx_event_note()}>
            {meta.events.map((e) => (
              <Chip key={e.id} on={e.id === s.event} onClick={() => toggle("event", e.id)}>
                {e.name}
              </Chip>
            ))}
          </FilterSection>
        )}

        {(corrections > 0 || s.corrections) && (
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>
              <ParaglideMessage
                message={m.tx_show_corrections}
                inputs={{ count: corrections.toLocaleString(intlLocale()) }}
                markup={{ num: ({ children }) => <span className="num text-muted-foreground">{children}</span> }}
              />
            </span>
            <Switch checked={!!s.corrections} onCheckedChange={(on) => set({ corrections: on || undefined })} />
          </label>
        )}

        <div className="sticky -bottom-5 -mx-5 -mb-5 flex gap-2 border-t bg-popover px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" size="lg" onClick={() => set(NO_FILTERS)}>
            {m.tx_clear_all()}
          </Button>
          <Button size="lg" className="flex-1" onClick={onClose}>
            <ParaglideMessage
              message={m.tx_show_count}
              inputs={{ count: total, n: total.toLocaleString(intlLocale()) }}
              markup={{ num: ({ children }) => <span className="num">{children}</span> }}
            />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FilterSection({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-medium text-subtle-foreground">{label}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}

/** The "At least" and "At most" fields. Each applies when it loses focus or on Enter. */
function AmountRange({
  min,
  max,
  currency,
  onApply,
}: {
  min?: number
  max?: number
  currency: string
  onApply: (min?: number, max?: number) => void
}) {
  const [lo, setLo] = useState(min !== undefined ? String(min / 100) : "")
  const [hi, setHi] = useState(max !== undefined ? String(max / 100) : "")
  const cents = (v: string) => {
    const c = parseAmount(v)
    return c === null ? undefined : Math.abs(c)
  }
  const apply = () => {
    if (cents(lo) !== min || cents(hi) !== max) onApply(cents(lo), cents(hi))
  }
  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => set(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="decimal"
        placeholder="—"
        className="num bg-card"
      />
    </label>
  )
  return (
    <div className="grid basis-full gap-2">
      <div className="grid grid-cols-2 gap-2">
        {field(m.tx_at_least({ currency: currency.toUpperCase() }), lo, setLo)}
        {field(m.tx_at_most(), hi, setHi)}
      </div>
      <p className="text-xs text-muted-foreground">{m.tx_amount_note()}</p>
    </div>
  )
}
