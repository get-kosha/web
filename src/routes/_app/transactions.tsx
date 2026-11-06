import { useEffect, useRef, useState, type ReactNode } from "react"
import { MagnifyingGlassIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ActivityPanel } from "@/components/activity-panel"
import { CategoryIcon } from "@/components/category-icon"
import { CategoryPicker, categoryPath } from "@/components/category-picker"
import { PageHeader, isTyping, monthLabel, segment, segmentButton, useGlobals, useMeta } from "@/components/shell"
import { TransactionForm } from "@/components/transaction-form"
import { listTransactions, type Tx } from "@/lib/api"
import { LOCALE, convert, dayOf, fmt, isNeutral, parseAmount } from "@/lib/core"
import { cn } from "@/lib/utils"

const PAGE = 100

const search = z.object({
  // coerce: the router JSON-parses search values, so ?category=1 arrives as a number
  q: z.coerce.string().optional(),
  wallet: z.coerce.string().optional(),
  category: z.coerce.string().optional(),
  /** Amount range in cents, by absolute value. */
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
  type: z.enum(["out", "in", "transfers"]).optional(),
  corrections: z.boolean().optional(),
  limit: z.number().int().min(PAGE).max(2000).optional(),
})
type Search = z.infer<typeof search>

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: search,
  loaderDeps: ({ search: { q, wallet, category, month, min, max, type, corrections, limit } }) => ({
    q,
    wallet,
    category,
    month,
    min,
    max,
    type,
    corrections,
    limit,
  }),
  loader: ({ deps }) => listTransactions({ data: { ...deps, limit: deps.limit ?? PAGE } }),
  head: () => ({ meta: [{ title: "Activity · Kosha" }] }),
  component: Activity,
})

const dayTitle = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const signed = (cents: number, currency: string) => `${cents > 0 ? "+" : ""}${fmt(cents, currency)}`

function Activity() {
  const meta = useMeta()
  const data = Route.useLoaderData()
  const s = Route.useSearch()
  const { month, currency: cur } = useGlobals()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState(s.q ?? "")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Tx | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, limit: undefined, ...patch }), replace: true, resetScroll: false })

  useEffect(() => {
    const t = setTimeout(() => q !== (s.q ?? "") && set({ q: q || undefined }), 250)
    return () => clearTimeout(t)
  }, [q])
  // Follow outside changes (e.g. "See all" at a payee), but never overwrite what is being typed.
  useEffect(() => {
    if (document.activeElement?.id !== "activity-search") setQ(s.q ?? "")
  }, [s.q])

  const wallets = new Map(meta.wallets.map((w) => [w.id, w]))
  const categories = new Map(meta.categories.map((c) => [c.id, c]))
  const conv = (cents: number, currency: string) => convert(cents, currency, cur, meta.rates)
  const selected = data.rows.find((t) => t.id === selectedId) ?? null

  // Drop the selection when its row leaves the list (deleted, filtered out, other month).
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  // ↑/↓ move the selection, Esc closes the panel. Instant on purpose: list navigation never animates.
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
        ? `Over ${fmt(s.min, cur)}`
        : s.max !== undefined
          ? `Under ${fmt(s.max, cur)}`
          : null

  return (
    <div className="pb-8">
      <PageHeader
        title="Activity"
        sub={
          <>
            {monthLabel(month)} · <span className="num">{data.total}</span> transactions
          </>
        }
      />

      <div className="flex flex-col gap-4 px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[1_1_260px] md:max-w-[360px]">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="activity-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search activity"
              placeholder="Search payee, note or amount"
              className="h-9 bg-card pl-9 text-[13px] md:text-[13px]"
            />
          </label>

          <Filter label="Account" value={wallet?.name} onClear={() => set({ wallet: undefined })}>
            {(close) => (
              <div className="flex flex-col p-1">
                {meta.wallets
                  .filter((w) => !w.archived || w.id === s.wallet)
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={w.id === s.wallet}
                      onClick={() => {
                        set({ wallet: w.id })
                        close()
                      }}
                      className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-muted aria-pressed:font-medium"
                    >
                      <span className="truncate">{w.name}</span>
                      <span className="text-xs text-muted-foreground uppercase">{w.currency}</span>
                    </button>
                  ))}
              </div>
            )}
          </Filter>

          <Filter
            label="Category"
            value={
              category && (
                <>
                  <CategoryIcon
                    icon={(category.parent_id ? categories.get(category.parent_id) : category)?.icon}
                    className="size-4"
                  />
                  {categoryPath(category, meta.categories)}
                </>
              )
            }
            onClear={() => set({ category: undefined })}
          >
            {(close) => (
              <CategoryPicker
                value={s.category}
                onPick={(c) => {
                  set({ category: c.id })
                  close()
                }}
              />
            )}
          </Filter>

          <Filter label="Amount" value={amountLabel} onClear={() => set({ min: undefined, max: undefined })}>
            {(close) => (
              <AmountRange
                min={s.min}
                max={s.max}
                currency={cur}
                onApply={(min, max) => {
                  set({ min, max })
                  close()
                }}
              />
            )}
          </Filter>

          {(data.corrections > 0 || s.corrections) && (
            <button
              type="button"
              aria-pressed={!!s.corrections}
              onClick={() => set({ corrections: s.corrections ? undefined : true })}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground/40 aria-pressed:text-foreground max-md:h-11"
            >
              <span className="num">{data.corrections}</span> {data.corrections === 1 ? "correction" : "corrections"}{" "}
              {s.corrections ? "shown" : "hidden"}
            </button>
          )}

          <div className="hidden flex-1 md:block" />
          <div role="group" aria-label="Show" className={segment}>
            {(
              [
                [undefined, "All"],
                ["out", "Out"],
                ["in", "In"],
                ["transfers", "Transfers"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={s.type === value}
                onClick={() => set({ type: value })}
                className={segmentButton}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 px-0.5 text-[13px] text-muted-foreground">
          <span>
            Out <span className="num ml-1.5 text-[15px] text-foreground">{fmt(out, cur)}</span>
          </span>
          <span>
            In <span className="num ml-1.5 text-[15px] text-positive">{signed(inn, cur)}</span>
          </span>
          <span>
            Net <span className="num ml-1.5 text-[15px] text-foreground">{signed(out + inn, cur)}</span>
          </span>
          {moved > 0 && (
            <span>
              Transfers <span className="num ml-1.5 text-[15px] text-subtle-foreground">{fmt(moved, cur)}</span>{" "}
              <span className="ml-1">not counted</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <section
            ref={listRef}
            aria-label="Transactions"
            className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border bg-card"
          >
            {groups.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No transactions match.</p>
            )}
            {groups.map((g, gi) => {
              const dayTotal = g.rows.reduce(
                (n, t) =>
                  isNeutral(t.category_id) ? n : n + conv(t.amount, wallets.get(t.wallet_id)?.currency ?? meta.primary),
                0
              )
              return (
                <div key={g.day} role="group" aria-label={dayTitle(g.day)}>
                  <div
                    className={cn(
                      "flex items-baseline justify-between px-4 pt-4 pb-1.5 text-xs text-muted-foreground",
                      gi > 0 && "border-t"
                    )}
                  >
                    <span className="font-medium text-subtle-foreground">{dayTitle(g.day)}</span>
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
                  Showing <span className="num">{data.rows.length}</span> of <span className="num">{data.total}</span>
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
                    Load earlier days
                  </Button>
                )}
              </div>
            )}
          </section>

          {selected && (
            <aside
              aria-label="Transaction details"
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          {editing && <TransactionForm key={editing.id} initial={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
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
  // Transfers read from → to; on a single account they keep their sign, otherwise they're neutral and show what was sent.
  const title = isTransfer
    ? t.amount < 0
      ? `${w?.name} → ${other?.name}`
      : `${other?.name} → ${w?.name}`
    : t.name || c?.name || "Untitled"
  const amount = isTransfer && !singleWallet ? Math.abs(t.amount) + (t.amount < 0 ? (t.fee ?? 0) : 0) : t.amount
  const foreign = currency !== cur

  return (
    <button
      type="button"
      data-tx={t.id}
      data-row
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:bg-muted min-[760px]:grid-cols-[minmax(0,1fr)_116px_104px_112px]",
        selected && "bg-selected hover:bg-selected",
        isTransfer && "text-subtle-foreground",
        !t.paid && "opacity-60"
      )}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center">
          <span className="truncate">{title}</span>
          {isTransfer && (
            <span className="ml-1.5 shrink-0 rounded-sm bg-muted px-1.5 text-[11px] text-muted-foreground">
              transfer
            </span>
          )}
        </span>
        {(t.note || !t.paid) && (
          <span className="block truncate text-xs text-muted-foreground">
            {[!t.paid && (t.kind ?? "upcoming"), t.note].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <span className="hidden min-w-0 items-center gap-2 text-[13px] text-subtle-foreground min-[760px]:flex">
        <CategoryIcon icon={c?.icon} className="size-[17px]" />
        <span className="truncate">{c?.name ?? "—"}</span>
      </span>
      <span className="hidden truncate text-[13px] text-subtle-foreground min-[760px]:block">{w?.name}</span>
      <span className={cn("num text-right", !isTransfer && t.amount > 0 && "text-positive")}>
        {isTransfer ? fmt(amount, currency) : signed(amount, currency)}
        {foreign && (
          <span className="block text-xs text-muted-foreground">
            ≈ {fmt(convert(amount, currency, cur, meta.rates), cur)}
          </span>
        )}
      </span>
    </button>
  )
}

/** A dashed "+ Label" pill that opens a popover; once set it turns into a solid chip with a remove button. */
function Filter({
  label,
  value,
  onClear,
  children,
}: {
  label: string
  value: ReactNode
  onClear: () => void
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const active = value !== undefined && value !== null && value !== false
  return (
    <div
      className={cn(
        "inline-flex h-[34px] items-center rounded-full border bg-card text-[13px] max-md:h-[46px]",
        active ? "border-foreground/40" : "border-dashed"
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-full px-3 transition-colors hover:text-foreground",
            active ? "pr-1.5 text-foreground" : "text-subtle-foreground"
          )}
        >
          {active ? (
            <span className="flex max-w-48 items-center gap-1.5 truncate">{value}</span>
          ) : (
            <>
              <PlusIcon className="size-4" aria-hidden="true" />
              {label}
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-0 p-0">
          {children(() => setOpen(false))}
        </PopoverContent>
      </Popover>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label.toLowerCase()} filter`}
          className="mr-1 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

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
  return (
    <form
      className="grid gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(cents(lo), cents(hi))
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            At least <span className="uppercase">({currency})</span>
          </span>
          <Input autoFocus value={lo} onChange={(e) => setLo(e.target.value)} inputMode="decimal" className="num" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">At most</span>
          <Input value={hi} onChange={(e) => setHi(e.target.value)} inputMode="decimal" className="num" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Compares each amount in its own currency, ignoring the sign.</p>
      <Button type="submit">Apply</Button>
    </form>
  )
}
