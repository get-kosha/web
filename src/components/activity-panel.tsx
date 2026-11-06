import { useEffect, useRef, useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { CaretDownIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CategoryIcon } from "@/components/category-icon"
import { CategoryPicker, categoryPath } from "@/components/category-picker"
import { useGlobals, useMeta } from "@/components/shell"
import { TransactionForm } from "@/components/transaction-form"
import { EventEditor, TagInput, eventDates } from "@/components/tags-events"
import { deleteTransaction, getPayeeHistory, saveTransaction, type Tx } from "@/lib/api"
import { CORRECTION_CATEGORY, LOCALE, convert, dayOf, fmt, isNeutral, parseAmount, tagList, timeOf } from "@/lib/core"
import { cn } from "@/lib/utils"

type Draft = {
  name: string
  amount: number
  categoryId: string
  subcategoryId: string | null
  walletId: string
  day: string
  /** Left out until you change it, so the server keeps the exact saved time. */
  time?: string
  note: string
  tags: string[]
  eventId: string | null
}
type History = Awaited<ReturnType<typeof getPayeeHistory>>

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" })

const field = "grid min-h-11 grid-cols-[84px_minmax(0,1fr)] items-center gap-3 border-t"
const fieldLabel = "text-xs text-muted-foreground"
const fieldValue =
  "-ml-2 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:bg-muted"

/** Side panel for the selected Activity row. Every field saves itself; transfers reuse the transfer form. */
export function ActivityPanel({
  tx,
  onClose,
  onSelect,
}: {
  tx: Tx
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const meta = useMeta()
  const router = useRouter()
  const { currency: cur } = useGlobals()
  const wallet = meta.wallets.find((w) => w.id === tx.wallet_id)
  const currency = wallet?.currency ?? meta.primary
  const isTransfer = !!tx.transfer_id
  const kind = isTransfer
    ? "Transfer"
    : tx.category_id === CORRECTION_CATEGORY
      ? "Balance correction"
      : tx.amount > 0
        ? "Income"
        : "Expense"

  const initial: Draft = {
    name: tx.name,
    amount: tx.amount,
    categoryId: tx.category_id,
    subcategoryId: tx.subcategory_id ?? null,
    walletId: tx.wallet_id,
    day: dayOf(tx.date, meta.tz),
    note: tx.note,
    tags: tagList(tx.tags),
    eventId: tx.event_id ?? null,
  }
  const [draft, setDraft] = useState(initial)
  const shownTime = draft.time ?? timeOf(tx.date, meta.tz)
  const saved = useRef(initial)
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; next: Draft } | null>(null)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [amountText, setAmountText] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<History | null>(null)

  async function persist(next: Draft) {
    pending.current = null
    setStatus("saving")
    try {
      await saveTransaction({ data: { id: tx.id, ...next, paid: !!tx.paid } })
      saved.current = next
      setStatus("saved")
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
      setDraft(saved.current)
      setStatus("error")
    }
  }

  /** Update the draft and save after a pause, which is longer after typing than after a pick. */
  function change(patch: Partial<Draft>, wait = 250) {
    const next = { ...(pending.current?.next ?? draft), ...patch }
    setDraft(next)
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { next, timer: setTimeout(() => void persist(next), wait) }
  }

  // Switching rows or closing the panel saves any pending change.
  useEffect(
    () => () => {
      if (!pending.current) return
      clearTimeout(pending.current.timer)
      void persist(pending.current.next)
    },
    []
  )

  useEffect(() => {
    if (!tx.name || isTransfer) return setHistory(null)
    let live = true
    getPayeeHistory({ data: { name: tx.name } }).then(
      (h) => live && setHistory(h),
      () => {}
    )
    return () => {
      live = false
    }
  }, [tx.name, isTransfer, tx.amount])

  async function remove() {
    setConfirmDelete(false)
    try {
      await deleteTransaction({ data: { id: tx.id } })
      toast.success("Deleted")
      onClose()
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete")
    }
  }

  async function duplicate() {
    const today = dayOf(Date.now() / 1000, meta.tz)
    try {
      const { id } = await saveTransaction({ data: { ...draft, day: today, time: undefined, paid: true } })
      toast.success(`Duplicated · ${fmt(draft.amount, currency)} today`)
      await router.invalidate()
      onSelect(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate")
    }
  }

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xs text-muted-foreground" aria-live="polite">
        {kind}
        {status === "saving" ? " · saving…" : status === "saved" ? " · edited just now" : ""}
      </h2>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
        <XIcon />
      </Button>
    </div>
  )

  if (isTransfer)
    return (
      <div>
        {header}
        <TransactionForm key={tx.id} initial={tx} onDone={() => void router.invalidate()} onCancel={onClose} />
      </div>
    )

  const cat = meta.categories.find((c) => c.id === (draft.subcategoryId ?? draft.categoryId))
  const parent = meta.categories.find((c) => c.id === draft.categoryId)
  const sign = draft.amount < 0 ? -1 : 1
  const accounts = meta.wallets.filter((w) => !w.archived || w.id === draft.walletId)

  // "At this payee" draws recent payments as bars and highlights this one.
  const recent = history?.recent ?? []
  const peak = Math.max(1, ...recent.map((r) => Math.abs(convert(r.amount, r.currency, cur, meta.rates))))
  const yearTotal = (history?.thisYear ?? []).reduce((t, r) => t + convert(r.amount, r.currency, cur, meta.rates), 0)
  const yearCount = history?.thisYear.length ?? 0
  const last = recent.filter((r) => r.id !== tx.id).at(-1)

  return (
    <div>
      {header}
      <input
        value={draft.name}
        onChange={(e) => change({ name: e.target.value }, 700)}
        placeholder="Payee"
        aria-label="Payee"
        className="-mx-2 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 py-1 text-[17px] font-medium tracking-[-0.01em] outline-none hover:bg-muted focus-visible:bg-muted"
      />
      <input
        value={amountText ?? fmt(draft.amount, currency)}
        onFocus={() => setAmountText((Math.abs(draft.amount) / 100).toFixed(2))}
        onChange={(e) => setAmountText(e.target.value)}
        onBlur={() => {
          const cents = parseAmount(amountText ?? "")
          setAmountText(null)
          if (cents && Math.abs(cents) * sign !== draft.amount) change({ amount: Math.abs(cents) * sign }, 0)
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="decimal"
        aria-label="Amount"
        className={cn(
          "num -mx-2 mt-2 mb-5 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 text-[34px] font-medium tracking-[-0.04em] outline-none hover:bg-muted focus-visible:bg-muted",
          draft.amount > 0 && "text-positive"
        )}
      />

      <div className={field}>
        <span className={fieldLabel} id="f-cat">
          Category
        </span>
        <Popover>
          <PopoverTrigger aria-labelledby="f-cat" className={fieldValue}>
            <span className="flex min-w-0 items-center gap-2">
              <CategoryIcon icon={parent?.icon} />
              <span className="truncate">
                {parent?.name}
                {draft.subcategoryId && cat && <span className="text-muted-foreground"> › {cat.name}</span>}
              </span>
            </span>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-0 p-0">
            <CategoryPicker
              value={cat?.id}
              filter={(c) => !isNeutral(c.id) && !!c.income === draft.amount > 0}
              onPick={(c) =>
                change(
                  c.parent_id
                    ? { categoryId: c.parent_id, subcategoryId: c.id }
                    : { categoryId: c.id, subcategoryId: null },
                  0
                )
              }
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className={field}>
        <span className={fieldLabel} id="f-acc">
          Account
        </span>
        <Popover>
          <PopoverTrigger aria-labelledby="f-acc" className={fieldValue}>
            <span className="truncate">{meta.wallets.find((w) => w.id === draft.walletId)?.name}</span>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 gap-0 p-1">
            {accounts.map((w) => (
              <button
                key={w.id}
                type="button"
                aria-pressed={w.id === draft.walletId}
                onClick={() => change({ walletId: w.id }, 0)}
                className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-muted aria-pressed:font-medium"
              >
                <span className="truncate">{w.name}</span>
                <span className="text-xs text-muted-foreground uppercase">{w.currency}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className={field}>
        <label className={fieldLabel} htmlFor="f-date">
          Date
        </label>
        <span className={cn(fieldValue, "relative focus-within:bg-muted")}>
          <span>{longDay(draft.day)}</span>
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="f-date"
            type="date"
            value={draft.day}
            // Moving to another day keeps the time of day.
            onChange={(e) => e.target.value && change({ day: e.target.value, time: shownTime }, 0)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
      </div>

      <div className={field}>
        <label className={fieldLabel} htmlFor="f-time">
          Time
        </label>
        <span className={cn(fieldValue, "relative focus-within:bg-muted")}>
          <span className="num">{shownTime}</span>
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="f-time"
            type="time"
            value={shownTime}
            onChange={(e) => e.target.value && change({ time: e.target.value }, 0)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
      </div>

      <div className={cn(field, "py-1.5")}>
        <span className={fieldLabel}>Tags</span>
        <TagInput value={draft.tags} onChange={(tags) => change({ tags }, 0)} linked />
      </div>

      <div className={field}>
        <span className={fieldLabel} id="f-event">
          Event
        </span>
        <EventField value={draft.eventId} day={draft.day} onChange={(eventId) => change({ eventId }, 0)} />
      </div>

      <div className={cn(field, "border-b")}>
        <label className={fieldLabel} htmlFor="f-note">
          Note
        </label>
        <input
          id="f-note"
          value={draft.note}
          onChange={(e) => change({ note: e.target.value }, 700)}
          placeholder="Add a note"
          className={cn(fieldValue, "placeholder:text-muted-foreground")}
        />
      </div>

      {recent.length > 1 && (
        <div className="mt-5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[13px] font-medium">At this payee</span>
            <Link
              to="/transactions"
              search={(p) => ({ ...p, q: tx.name })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              See all <span className="num">{history!.count}</span> →
            </Link>
          </div>
          <div
            className="flex h-10 items-end gap-1"
            role="img"
            aria-label={`${recent.length} recent payments at ${tx.name}`}
          >
            {recent.map((r) => (
              <span
                key={r.id}
                className={cn("flex-1 rounded-t-[2px]", r.id === tx.id ? "bg-chart-2" : "bg-chart-4")}
                style={{
                  height: `${Math.max(6, (Math.abs(convert(r.amount, r.currency, cur, meta.rates)) / peak) * 100)}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="This year" value={fmt(Math.abs(yearTotal), cur)} />
            <Stat label="Average" value={yearCount ? fmt(Math.abs(yearTotal) / yearCount, cur) : "—"} />
            <Stat label="Last" value={last ? shortDay(last.day) : "—"} />
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <span className="text-xs text-muted-foreground">
          {status === "error" ? "Not saved" : status === "saving" ? "Saving…" : "Autosaved"}
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={duplicate}>
            Duplicate
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>
              {draft.name || categoryPath(cat, meta.categories)} ·{" "}
              <span className="num">{fmt(draft.amount, currency)}</span> on {longDay(draft.day)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="num mt-0.5 text-sm">{value}</div>
  </div>
)

/** The event row. Its popover lists every event, "No event", and a "New event" editor. */
function EventField({
  value,
  day,
  onChange,
}: {
  value: string | null
  day: string
  onChange: (id: string | null) => void
}) {
  const meta = useMeta()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const current = meta.events.find((e) => e.id === value)
  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setCreating(false)
      }}
    >
      <PopoverTrigger aria-labelledby="f-event" className={fieldValue}>
        <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.name ?? "None"}</span>
        <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-1">
        {creating ? (
          <EventEditor defaultDay={day} onSaved={pick} onCancel={() => setCreating(false)} />
        ) : (
          <>
            {[{ id: null, name: "No event", start_day: null, end_day: null }, ...meta.events].map((e) => (
              <button
                key={e.id ?? "none"}
                type="button"
                aria-pressed={e.id === value}
                onClick={() => pick(e.id)}
                className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-muted aria-pressed:font-medium"
              >
                <span className="truncate">{e.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{eventDates(e)}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              New event…
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
