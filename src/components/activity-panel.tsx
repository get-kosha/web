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
import { Refunds, TransactionForm } from "@/components/transaction-form"
import { Attachments } from "@/components/attachments"
import { DatePicker, TimePicker } from "@/components/date-time"
import { EventPicker, TagInput } from "@/components/tags-events"
import { deleteTransaction, getPayeeHistory, saveTransaction, type Tx } from "@/lib/api"
import {
  CORRECTION_CATEGORY,
  canRefund,
  intlLocale,
  convert,
  dayOf,
  fmt,
  isNeutral,
  parseAmount,
  refundList,
  tagList,
  timeOf,
} from "@/lib/core"
import { cn } from "@/lib/utils"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"

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
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", timeZone: "UTC" })

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
  const isRefund = !!tx.refund_of
  const kind = isTransfer
    ? m.tx_kind_transfer()
    : isRefund
      ? m.tx_kind_refund()
      : tx.category_id === CORRECTION_CATEGORY
        ? m.tx_kind_correction()
        : tx.amount > 0
          ? m.tx_kind_income()
          : m.tx_kind_expense()

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
      toast.error(err instanceof Error ? err.message : m.tx_save_failed())
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
      toast.success(m.tx_deleted())
      onClose()
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_delete_failed())
    }
  }

  async function duplicate() {
    const today = dayOf(Date.now() / 1000, meta.tz)
    try {
      const { id } = await saveTransaction({ data: { ...draft, day: today, time: undefined, paid: true } })
      toast.success(m.tx_duplicated({ amount: fmt(draft.amount, currency) }))
      await router.invalidate()
      onSelect(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_duplicate_failed())
    }
  }

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xs text-muted-foreground" aria-live="polite">
        {status === "saving" ? m.tx_header_saving({ kind }) : status === "saved" ? m.tx_header_saved({ kind }) : kind}
      </h2>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={m.tx_close_panel()}>
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
        placeholder={m.tx_payee()}
        aria-label={m.tx_payee()}
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
        aria-label={m.tx_amount()}
        className={cn(
          "num -mx-2 mt-2 mb-5 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 text-[34px] font-medium tracking-[-0.04em] outline-none hover:bg-muted focus-visible:bg-muted",
          draft.amount > 0 && "text-positive"
        )}
      />

      {isRefund ? (
        // A refund keeps its spending entry's category, which changes with that entry.
        <p className="border-t py-3 text-xs text-muted-foreground">
          {m.tx_refund_for({ name: draft.name || parent?.name || "", category: parent?.name ?? "" })}
        </p>
      ) : (
        <div className={field}>
          <span className={fieldLabel} id="f-cat">
            {m.tx_category()}
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
      )}

      <div className={field}>
        <span className={fieldLabel} id="f-acc">
          {m.tx_account()}
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
        <span className={fieldLabel} id="f-date">
          {m.tx_date()}
        </span>
        <DatePicker
          aria-labelledby="f-date"
          value={draft.day}
          // Moving to another day keeps the time of day.
          onChange={(day) => change({ day, time: shownTime }, 0)}
          className={fieldValue}
        >
          <span>{longDay(draft.day)}</span>
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DatePicker>
      </div>

      <div className={field}>
        <span className={fieldLabel} id="f-time">
          {m.tx_time()}
        </span>
        <TimePicker
          aria-labelledby="f-time"
          value={shownTime}
          onChange={(time) => change({ time }, 0)}
          className={fieldValue}
        >
          <span className="num">{shownTime}</span>
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </TimePicker>
      </div>

      <div className={cn(field, "py-1.5")}>
        <span className={fieldLabel}>{m.tx_tags()}</span>
        <TagInput value={draft.tags} onChange={(tags) => change({ tags }, 0)} linked />
      </div>

      <div className={field}>
        <span className={fieldLabel} id="f-event">
          {m.tx_event()}
        </span>
        <EventPicker
          aria-labelledby="f-event"
          value={draft.eventId}
          day={draft.day}
          onChange={(eventId) => change({ eventId }, 0)}
          className={fieldValue}
        />
      </div>

      <div className={cn(field, "border-b")}>
        <label className={fieldLabel} htmlFor="f-note">
          {m.tx_note()}
        </label>
        <input
          id="f-note"
          value={draft.note}
          onChange={(e) => change({ note: e.target.value }, 700)}
          placeholder={m.tx_note_placeholder()}
          className={cn(fieldValue, "placeholder:text-muted-foreground")}
        />
      </div>

      <Attachments key={tx.id} transactionId={tx.id} className="mt-4" />

      {canRefund(tx) && <Refunds tx={tx} className="mt-4" />}

      {recent.length > 1 && (
        <div className="mt-5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[13px] font-medium">{m.tx_at_payee()}</span>
            <Link
              to="/transactions"
              search={{ q: tx.name }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ParaglideMessage
                message={m.tx_see_all}
                inputs={{ count: history!.count.toLocaleString(intlLocale()) }}
                markup={{ num: ({ children }) => <span className="num">{children}</span> }}
              />
            </Link>
          </div>
          <div
            className="flex h-10 items-end gap-1"
            role="img"
            aria-label={m.tx_recent_payments({ count: recent.length, name: tx.name })}
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
            <Stat label={m.tx_this_year()} value={fmt(Math.abs(yearTotal), cur)} />
            <Stat label={m.tx_average()} value={yearCount ? fmt(Math.abs(yearTotal) / yearCount, cur) : "—"} />
            <Stat label={m.tx_last()} value={last ? shortDay(last.day) : "—"} />
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <span className="text-xs text-muted-foreground">
          {status === "error" ? m.tx_not_saved() : status === "saving" ? m.tx_saving() : m.tx_autosaved()}
        </span>
        <div className="flex gap-1">
          {!isRefund && (
            <Button variant="ghost" onClick={duplicate}>
              {m.tx_duplicate()}
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            {m.common_delete()}
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.tx_delete_transaction_title()}</DialogTitle>
            <DialogDescription>
              <ParaglideMessage
                message={m.tx_delete_summary}
                inputs={{
                  name: draft.name || categoryPath(cat, meta.categories),
                  amount: fmt(draft.amount, currency),
                  day: longDay(draft.day),
                }}
                markup={{ num: ({ children }) => <span className="num">{children}</span> }}
              />
              {refundList(tx.refunds).length > 0 && ` ${m.tx_delete_refunds()}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {m.common_cancel()}
            </Button>
            <Button variant="destructive" onClick={remove}>
              {m.common_delete()}
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
