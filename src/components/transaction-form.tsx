import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowUUpLeftIcon,
  CalendarStarIcon,
  CheckCircleIcon,
  HashIcon,
  NotePencilIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Attachments } from "@/components/attachments"
import { Input } from "@/components/ui/input"
import { WALLET_KEY, startWallet } from "@/lib/add-defaults"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AiMark, useAiCategory } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { segment, segmentButton, useMeta } from "@/components/shell"
import { DatePicker, TimePicker, dayLabel } from "@/components/date-time"
import { Suggest } from "@/components/suggest"
import { EventPicker, TagInput } from "@/components/tags-events"
import {
  deleteTransaction,
  saveRefund,
  saveTransaction,
  saveTransfer,
  type Category,
  type Tx,
  type Wallet,
} from "@/lib/api"
import {
  CORRECTION_CATEGORY,
  canRefund,
  convert,
  dayOf,
  eventFor,
  exchange,
  fmt,
  fmtRate,
  guessCategory,
  intlLocale,
  isNeutral,
  parseAmount,
  refundList,
  refundedShare,
  tagList,
  timeOf,
  unixOf,
  type Refund,
} from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Mode = "expense" | "income" | "transfer"

/**
 * Initial state for editing either half of a transfer. Either half opens in the from-to direction,
 * and the amount sent includes the fee.
 */
function transferSides(t: Tx) {
  const fee = t.fee ?? 0
  return t.amount < 0
    ? {
        from: t.wallet_id,
        to: t.counter_wallet_id ?? "",
        sent: -t.amount + fee,
        fee,
        received: t.counter_amount ?? -t.amount,
      }
    : {
        from: t.counter_wallet_id ?? "",
        to: t.wallet_id,
        sent: Math.abs(t.counter_amount ?? t.amount) + fee,
        fee,
        received: t.amount,
      }
}

const PROVIDERS = ["Wise", "Xe", "Revolut", "Remitly", "Bank"]

const MODE_LABEL = { expense: m.tx_kind_expense, income: m.tx_kind_income, transfer: m.tx_kind_transfer }
const ADD_LABEL = { expense: m.tx_add_expense, income: m.tx_add_income, transfer: m.tx_add_transfer }

const cents2 = (v: number) => (Math.abs(v) / 100).toFixed(2)

type Exchange = ReturnType<typeof useExchange>

/**
 * The exchange side of a transfer: the fee, the provider, and either the rate or the amount received.
 * You type one of those two and it works out the other. `sent` leaves `from` and includes the fee.
 * `start` holds an edited transfer's sides.
 */
export function useExchange(
  from: Wallet | undefined,
  to: Wallet | undefined,
  sent: number,
  start?: { fee: number; received: number } | null,
  startProvider?: string | null
) {
  const meta = useMeta()
  const [fee, setFee] = useState(start?.fee ? cents2(start.fee) : "")
  const [provider, setProvider] = useState(startProvider ?? "")
  const [rateText, setRateText] = useState("")
  const [received, setReceived] = useState(start ? cents2(start.received) : "")
  const [fxInput, setFxInput] = useState<"rate" | "received" | null>(start ? "received" : null)
  const crossCurrency = !!from && !!to && from.currency !== to.currency
  const feeCents = Math.abs(parseAmount(fee) ?? 0)
  const converted = sent - feeCents
  const market = crossCurrency ? convert(100, from.currency, to.currency, meta.rates) / 100 : 1
  const typedRate = Number(rateText.replace(",", "."))
  const receivedCents = !crossCurrency
    ? converted
    : fxInput === "received"
      ? Math.abs(parseAmount(received) ?? 0)
      : Math.round(converted * (fxInput === "rate" ? typedRate || 0 : market))
  return {
    from,
    to,
    fee,
    setFee,
    provider,
    setProvider,
    rateText,
    setRateText,
    received,
    setReceived,
    fxInput,
    setFxInput,
    crossCurrency,
    feeCents,
    converted,
    market,
    receivedCents,
    rate: crossCurrency && converted > 0 ? receivedCents / converted : 1,
    fx: exchange(sent, feeCents, receivedCents, crossCurrency ? market : null),
    reset() {
      setFee("")
      setRateText("")
      setReceived("")
      setFxInput(null)
    },
  }
}

/** Fee and provider, plus the rate and amount received when the currencies differ, with what it cost. */
export function ExchangeFields({ x }: { x: Exchange }) {
  const meta = useMeta()
  const from = x.from?.currency ?? meta.primary
  return (
    <div className="grid gap-3 rounded-lg border p-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{m.tx_fee_currency({ currency: from.toUpperCase() })}</span>
          <Input
            value={x.fee}
            onChange={(e) => x.setFee(e.target.value)}
            inputMode="decimal"
            className="num h-9"
            aria-label={m.tx_fee()}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{m.tx_via()}</span>
          <Suggest
            value={x.provider}
            onChange={x.setProvider}
            options={PROVIDERS}
            render={<Input className="h-9" />}
            aria-label={m.tx_provider()}
          />
        </label>
      </div>
      {x.crossCurrency && x.to && (
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{m.tx_rate_label({ currency: from.toUpperCase() })}</span>
            <Input
              value={x.fxInput === "rate" ? x.rateText : fmtRate(x.rate)}
              onChange={(e) => {
                x.setRateText(e.target.value)
                x.setFxInput("rate")
              }}
              inputMode="decimal"
              className="num h-9"
              aria-label={m.tx_exchange_rate()}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {m.tx_received_currency({ currency: x.to.currency.toUpperCase() })}
            </span>
            <Input
              value={x.fxInput === "received" ? x.received : x.receivedCents ? cents2(x.receivedCents) : ""}
              onChange={(e) => {
                x.setReceived(e.target.value)
                x.setFxInput("received")
              }}
              inputMode="decimal"
              className="num h-9"
              aria-label={m.tx_amount_received()}
            />
          </label>
        </div>
      )}
      {(x.feeCents > 0 || x.crossCurrency) && x.converted > 0 && (
        <p className="num text-xs text-muted-foreground">
          {x.crossCurrency && x.to
            ? m.tx_fx_becomes({
                sent: fmt(x.converted, from),
                received: fmt(x.receivedCents, x.to.currency),
                rate: fmtRate(x.market),
              })
            : m.tx_fx_arrives({ amount: fmt(x.converted, from) })}
          {x.fx.totalCost > 0.5 &&
            ` ${m.tx_fx_cost({
              cost: fmt(x.fx.totalCost, from),
              pct: x.fx.costPct.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            })}`}
        </p>
      )}
    </div>
  )
}

/**
 * Add or edit a transaction or transfer. It ends in a sticky footer with Delete (when editing), Cancel and Save.
 * `preset` starts a new transfer into `transferTo` (e.g. paying off a card) with `amount` cents prefilled.
 */
export function TransactionForm({
  initial,
  onDone,
  onCancel,
  preset,
}: {
  initial?: Tx
  onDone?: () => void
  onCancel?: () => void
  preset?: { transferTo?: string; amount?: number }
}) {
  const meta = useMeta()
  const router = useRouter()
  const amountRef = useRef<HTMLInputElement>(null)
  const today = dayOf(Date.now() / 1000, meta.tz)
  const sides = initial?.transfer_id ? transferSides(initial) : null
  const activeWallets = meta.wallets.filter(
    (w) => !w.archived || w.id === initial?.wallet_id || w.id === sides?.to || w.id === sides?.from
  )

  const [mode, setMode] = useState<Mode>(
    sides || (!initial && preset?.transferTo)
      ? "transfer"
      : initial
        ? initial.amount > 0
          ? "income"
          : "expense"
        : meta.prefs.add_kind
  )
  const [amount, setAmount] = useState(
    sides ? cents2(sides.sent) : initial ? cents2(initial.amount) : preset?.amount ? cents2(preset.amount) : ""
  )
  const [name, setName] = useState(initial?.name ?? "")
  const [note, setNote] = useState(initial?.note ?? "")
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "")
  const [categoryTouched, setCategoryTouched] = useState(!!initial)
  const presetTo = !initial ? preset?.transferTo : undefined
  const [walletId, setWalletId] = useState(
    sides?.from ||
      initial?.wallet_id ||
      activeWallets.find((w) => w.id !== presetTo && w.type !== "credit")?.id ||
      activeWallets[0]?.id ||
      ""
  )
  const [toWalletId, setToWalletId] = useState(sides?.to ?? presetTo ?? "")
  const [day, setDay] = useState(initial ? dayOf(initial.date, meta.tz) : today)
  // null until you change it. It shows the entry's own time, or now for a new one.
  const [time, setTime] = useState<string | null>(null)
  const shownTime = time ?? timeOf(initial ? initial.date : Date.now() / 1000, meta.tz)
  // Untouched on its own day, the server keeps an edit's exact time or stamps a new entry with now.
  const sendTime = time ?? (day === (initial ? dayOf(initial.date, meta.tz) : today) ? undefined : shownTime)
  const [paid, setPaid] = useState(initial ? !!initial.paid : true)
  const [tags, setTags] = useState(() => tagList(initial?.tags))
  // Until you pick an event this stays undefined. An edit keeps its event, and a new entry gets the
  // event its day falls in.
  const [pickedEvent, setPickedEvent] = useState<string | null | undefined>(undefined)
  const eventId =
    pickedEvent !== undefined ? pickedEvent : initial ? (initial.event_id ?? null) : eventFor(day, meta.events)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const income = mode === "income"
  const transfer = mode === "transfer"
  // A refund is money in that keeps its spending entry's category, so it lists spending categories.
  const refund = !!initial?.refund_of

  // A new entry starts on the default or last used account.
  useEffect(() => {
    if (initial) return
    const saved = startWallet(meta.prefs.default_wallet, activeWallets, presetTo)
    if (saved) setWalletId(saved)
  }, [])

  const categories = useMemo(
    () =>
      meta.categories
        .filter(
          (c) =>
            !c.parent_id &&
            !!c.income === (income && !refund) &&
            (!c.archived || c.id === initial?.category_id) &&
            (!isNeutral(c.id) || (c.id === CORRECTION_CATEGORY && initial?.category_id === c.id))
        )
        .sort((a, b) => b.uses - a.uses),
    [meta.categories, income, refund, initial]
  )
  const wallet = meta.wallets.find((w) => w.id === walletId)
  const toWallet = meta.wallets.find((w) => w.id === toWalletId)
  // Auto-categorise: a new entry whose payee no rule placed gets AI's pick, marked until you choose.
  const aiCat = useAiCategory(
    name,
    income ? "income" : "expense",
    meta.ai.categorise && !initial && !transfer && !categoryTouched && !categoryId
  )
  const suggested = !categoryId && aiCat.id && categories.some((c) => c.id === aiCat.id) ? aiCat.id : null
  const pickedCategory = categoryId || suggested || ""
  const cents = parseAmount(amount)
  const x = useExchange(transfer ? wallet : undefined, toWallet, Math.abs(cents ?? 0), sides, initial?.provider)

  function onName(v: string) {
    setName(v)
    if (categoryTouched || meta.prefs.suggest_category !== "1") return
    const guess = guessCategory(v, meta.rules)
    const cat = guess && meta.categories.find((c) => c.id === guess)
    if (cat) {
      setCategoryId(cat.id)
      setMode(cat.income ? "income" : "expense")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!cents) return toast.error(m.tx_enter_amount())
    if (transfer) {
      if (!toWalletId || toWalletId === walletId) return toast.error(m.tx_pick_to_account())
      if (x.converted <= 0) return toast.error(m.tx_fee_too_big())
      if (!x.receivedCents) return toast.error(m.tx_enter_received())
    } else if (!pickedCategory || !categories.some((c) => c.id === pickedCategory))
      return toast.error(m.tx_pick_category_error())
    setBusy(true)
    try {
      if (transfer) {
        await saveTransfer({
          data: {
            transferId: initial?.transfer_id ?? undefined,
            fromWalletId: walletId,
            toWalletId,
            sent: Math.abs(cents),
            fee: x.feeCents,
            received: x.receivedCents,
            provider: x.provider,
            day,
            time: sendTime,
            note,
          },
        })
        toast.success(
          m.tx_moved({
            amount: fmt(Math.abs(cents), wallet?.currency ?? meta.primary),
            from: wallet?.name ?? "",
            to: toWallet?.name ?? "",
          })
        )
      } else {
        const signed = Math.abs(cents) * (income ? 1 : -1)
        // When an existing transfer becomes an expense or income, delete it and save a new transaction.
        // ponytail: the transfer's attachments go with it; move them to the new row if people attach to transfers.
        if (initial?.transfer_id) await deleteTransaction({ data: { id: initial.id } })
        await saveTransaction({
          data: {
            id: initial?.transfer_id ? undefined : initial?.id,
            walletId,
            categoryId: pickedCategory,
            name,
            note,
            amount: signed,
            day,
            time: sendTime,
            paid,
            tags,
            eventId,
          },
        })
        const cat = meta.categories.find((c) => c.id === pickedCategory)
        const done = { amount: fmt(signed, wallet?.currency ?? meta.primary), name: name || cat?.name || "" }
        toast.success(initial ? m.tx_saved_toast(done) : m.tx_added_toast(done))
      }
      try {
        localStorage.setItem(WALLET_KEY, walletId)
      } catch {}
      await router.invalidate()
      if (initial) onDone?.()
      else {
        setAmount("")
        x.reset()
        setName("")
        setNote("")
        setTags([])
        setPickedEvent(undefined)
        setTime(null)
        setCategoryTouched(false)
        amountRef.current?.focus()
        onDone?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_save_failed())
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial) return
    setConfirming(false)
    try {
      await deleteTransaction({ data: { id: initial.id } })
      toast.success(m.tx_deleted())
      await router.invalidate()
      onDone?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_delete_failed())
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        {refund ? (
          <span className="flex min-h-8 items-center gap-1.5 text-sm font-medium">
            <ArrowUUpLeftIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {m.tx_kind_refund()}
          </span>
        ) : (
          <div role="group" aria-label={m.tx_type()} className={segment}>
            {(["expense", "income", "transfer"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => {
                  setMode(k)
                  setCategoryId("")
                  setCategoryTouched(false)
                }}
                className={cn(segmentButton, "px-3 text-[13px]")}
              >
                {MODE_LABEL[k]()}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <DatePicker
            aria-label={m.tx_date()}
            value={day}
            onChange={setDay}
            className="rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted max-md:min-h-11"
          >
            {day === today ? m.tx_today() : dayLabel(day)}
          </DatePicker>
          <TimePicker
            aria-label={m.tx_time()}
            value={shownTime}
            onChange={setTime}
            className="num rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted max-md:min-h-11"
          >
            {shownTime}
          </TimePicker>
        </div>
      </div>

      <label className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground uppercase">{wallet?.currency}</span>
        <input
          ref={amountRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!initial}
          aria-label={m.tx_amount()}
          className={cn(
            "num w-full min-w-0 bg-transparent text-center text-5xl font-semibold tracking-tight outline-none",
            income && "text-positive"
          )}
        />
      </label>

      {transfer && <div className="-mb-3 text-xs text-muted-foreground">{m.tx_from()}</div>}
      <WalletChips wallets={activeWallets} value={walletId} onChange={setWalletId} />

      {transfer ? (
        <>
          <div className="-mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowDownIcon className="size-3" /> {m.tx_to()}
          </div>
          <WalletChips
            wallets={activeWallets.filter((w) => w.id !== walletId)}
            value={toWalletId}
            onChange={setToWalletId}
          />
          <ExchangeFields x={x} />
          <p className="text-xs text-muted-foreground">{m.tx_transfer_note()}</p>
        </>
      ) : (
        <>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{m.tx_payee()}</span>
            <Suggest value={name} onChange={onName} options={meta.titles} render={<Input className="h-10" />} />
          </label>

          {refund ? (
            <p className="text-xs text-muted-foreground">
              {m.tx_refund_for({
                name: name || meta.categories.find((c) => c.id === pickedCategory)?.name || "",
                category: meta.categories.find((c) => c.id === pickedCategory)?.name ?? "",
              })}
            </p>
          ) : (
            <CategoryStrip
              // The suggestion leads the strip, so it's in view.
              categories={
                suggested
                  ? [...categories.filter((c) => c.id === suggested), ...categories.filter((c) => c.id !== suggested)]
                  : categories
              }
              value={pickedCategory}
              suggested={suggested}
              onPick={(id) => {
                setCategoryId(id)
                setCategoryTouched(true)
              }}
            />
          )}
        </>
      )}

      <Extras
        note={note}
        onNote={setNote}
        {...(!transfer && {
          tags,
          onTags: setTags,
          eventId,
          onEvent: setPickedEvent,
          auto: pickedEvent === undefined && !initial,
          day,
        })}
      />

      {initial && <Attachments key={initial.id} transactionId={initial.id} />}

      {initial && canRefund(initial) && <Refunds tx={initial} />}

      {initial?.reconciled_id && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <CheckCircleIcon weight="fill" className="mt-px size-4 shrink-0 text-positive" />
          {m.tx_reconciled_note()}
        </p>
      )}

      {initial && !initial.paid && !transfer && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> {m.tx_paid()}
        </label>
      )}

      <div
        className={cn(
          "sticky bottom-0 z-10 mt-auto flex items-center gap-2 border-t bg-background py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          // In a sheet the footer runs edge to edge; in the side panel it sits on the card.
          "in-data-[slot=dialog-content]:-mx-4 in-data-[slot=dialog-content]:-mb-4 in-data-[slot=dialog-content]:bg-popover in-data-[slot=dialog-content]:px-4 in-[aside]:bg-card"
        )}
      >
        {initial && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
            aria-label={initial.transfer_id ? m.tx_delete_transfer() : m.tx_delete_transaction()}
          >
            <TrashIcon className="size-5" />
          </Button>
        )}
        <div className="flex-1" />
        {onCancel && (
          <Button type="button" variant="outline" size="lg" className="min-w-24" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
        )}
        <Button type="submit" size="lg" disabled={busy || !cents} className="min-w-28">
          {initial ? m.common_save() : ADD_LABEL[mode]()}
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {initial?.transfer_id ? m.tx_delete_transfer_title() : m.tx_delete_transaction_title()}
            </DialogTitle>
            {(initial?.transfer_id || initial?.reconciled_id || refundList(initial?.refunds).length > 0) && (
              <DialogDescription>
                {[
                  initial?.transfer_id && m.tx_delete_transfer_both(),
                  initial?.reconciled_id && m.tx_delete_reconciled(),
                  refundList(initial?.refunds).length > 0 && m.tx_delete_refunds(),
                ]
                  .filter(Boolean)
                  .join(" ")}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="button" variant="destructive" onClick={remove}>
              {m.common_delete()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function WalletChips({
  wallets,
  value,
  onChange,
}: {
  wallets: Wallet[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1">
      {wallets.map((w) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={w.id === value}
          onClick={() => onChange(w.id)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors",
            w.id === value && "border-foreground text-foreground"
          )}
        >
          {w.name}
        </button>
      ))}
    </div>
  )
}

/**
 * Money that came back for a spending entry: all of it or part, in one go or several, into any account (a shop
 * may refund a card payment to a bank account). Each refund is its own entry, so balances and statements see it,
 * and totals count it as spending undone rather than income. Removing one deletes that entry.
 */
export function Refunds({ tx, className }: { tx: Tx; className?: string }) {
  const meta = useMeta()
  const router = useRouter()
  const today = dayOf(Date.now() / 1000, meta.tz)
  const walletOf = (id: string) => meta.wallets.find((w) => w.id === id)
  const currencyOf = (id: string) => walletOf(id)?.currency ?? meta.primary
  const currency = currencyOf(tx.wallet_id)
  // Kept here, since the edit sheet holds the entry as it was when it opened.
  const [list, setList] = useState(() => refundList(tx.refunds))
  const [open, setOpen] = useState(false)
  const [walletId, setWalletId] = useState(tx.wallet_id)
  // null until typed: what's still to come back, in the chosen account's currency.
  const [amount, setAmount] = useState<string | null>(null)
  const [day, setDay] = useState(today)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<Refund | null>(null)
  const share = refundedShare(
    tx.amount,
    currency,
    list.map((r) => ({ amount: r.amount, currency: currencyOf(r.wallet_id) })),
    meta.rates
  )
  const target = walletOf(walletId)
  const left = Math.round(convert(share.left, currency, currencyOf(walletId), meta.rates))
  const shownAmount = amount ?? (left ? cents2(left) : "")
  const accounts = meta.wallets.filter((w) => !w.archived || w.id === tx.wallet_id)
  const money = (r: Refund) => fmt(r.amount, currencyOf(r.wallet_id))

  async function add() {
    const cents = Math.abs(parseAmount(shownAmount) ?? 0)
    if (!cents) return toast.error(m.tx_enter_amount())
    setBusy(true)
    try {
      const { id } = await saveRefund({ data: { of: tx.id, walletId, amount: cents, day } })
      setList((l) => [...l, { id, wallet_id: walletId, amount: cents, date: unixOf(day, meta.tz, 12) }])
      toast.success(m.tx_refund_saved({ amount: fmt(cents, currencyOf(walletId)) }))
      setOpen(false)
      setAmount(null)
      setDay(today)
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_refund_failed())
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: Refund) {
    setRemoving(null)
    try {
      await deleteTransaction({ data: { id: r.id } })
      setList((l) => l.filter((x) => x.id !== r.id))
      toast.success(m.tx_refund_removed())
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_delete_failed())
    }
  }

  return (
    <div className={cn("grid grid-cols-1 gap-1.5", className)}>
      {list.length > 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">{m.tx_refunds()}</span>
          <span className={cn("text-xs", share.full ? "text-positive" : "text-muted-foreground")}>
            {share.full
              ? m.tx_refunded_full()
              : m.tx_refunded_part({ refunded: fmt(share.refunded, currency), spent: fmt(-tx.amount, currency) })}
          </span>
        </div>
      )}
      {list.map((r) => (
        <div key={r.id} className="flex min-h-11 items-center gap-2.5 rounded-md border bg-card pr-1 pl-2.5 text-sm">
          <ArrowUUpLeftIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="num shrink-0 text-positive">+{money(r)}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {walletOf(r.wallet_id)?.name} · {dayLabel(dayOf(r.date, meta.tz))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground max-md:size-11"
            aria-label={m.tx_remove_refund({ amount: money(r) })}
            onClick={() => setRemoving(r)}
          >
            <XIcon />
          </Button>
        </div>
      ))}

      {open ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {m.tx_refund_amount()} <span className="uppercase">{target?.currency}</span>
            </span>
            <Input
              value={shownAmount}
              onChange={(e) => setAmount(e.target.value)}
              // Enter saves the refund, not the form around it.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                e.preventDefault()
                void add()
              }}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="num h-10"
            />
          </label>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">{m.tx_refund_to()}</span>
            <WalletChips wallets={accounts} value={walletId} onChange={setWalletId} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DatePicker
              aria-label={m.tx_date()}
              value={day}
              onChange={setDay}
              min={dayOf(tx.date, meta.tz)}
              className="-ml-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted max-md:min-h-11"
            >
              {day === today ? m.tx_today() : dayLabel(day)}
            </DatePicker>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-11"
                onClick={() => {
                  setOpen(false)
                  setAmount(null)
                }}
              >
                {m.common_cancel()}
              </Button>
              <Button type="button" className="max-md:h-11" disabled={busy} onClick={() => void add()}>
                {m.tx_save_refund()}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        !share.full && (
          <Button
            type="button"
            variant="outline"
            className="justify-start max-md:h-11"
            onClick={() => {
              setWalletId(tx.wallet_id)
              setOpen(true)
            }}
          >
            <ArrowUUpLeftIcon />
            {list.length ? m.tx_add_refund() : m.tx_mark_refunded()}
          </Button>
        )
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.tx_remove_refund_title()}</DialogTitle>
            {removing && (
              <DialogDescription>
                {m.tx_remove_refund_body({
                  amount: money(removing),
                  account: walletOf(removing.wallet_id)?.name ?? "",
                })}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              {m.common_cancel()}
            </Button>
            <Button type="button" variant="destructive" onClick={() => removing && void remove(removing)}>
              {m.common_remove()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// A full-screen page that slides up on phones, and a centred dialog from md up.
const pageSheet =
  "inset-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-5 rounded-none pt-0 ring-0 sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-bottom-6 data-closed:zoom-out-100 data-closed:slide-out-to-bottom-6 md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100svh-4rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:ring-1 md:data-open:zoom-in-[0.97] md:data-open:slide-in-from-bottom-0 md:data-closed:zoom-out-[0.97] md:data-closed:slide-out-to-bottom-0"

/** The add and edit form as its own page, with a title bar and close button above the form and its footer. */
export function TransactionSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className={pageSheet}>
        <div className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center justify-between gap-3 border-b bg-popover px-4 pt-[env(safe-area-inset-top)] md:static md:min-h-12 md:border-0 md:pt-2">
          <DialogTitle className="text-[17px] font-semibold md:text-base md:font-medium">{title}</DialogTitle>
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label={m.common_close()} className="-mr-2">
            <XIcon className="size-5" />
          </Button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Categories in a two-row strip that scrolls sideways. On open, it scrolls the chosen one into view. */
function CategoryStrip({
  categories,
  value,
  suggested,
  onPick,
}: {
  categories: Category[]
  value: string | null
  /** Auto-categorise's pick, marked with a sparkle. */
  suggested?: string | null
  onPick: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>("[aria-pressed=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [])
  return (
    <div
      ref={ref}
      role="group"
      aria-label={m.tx_category()}
      className="-mx-4 grid snap-x scroll-px-4 [scrollbar-width:none] auto-cols-[76px] grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-1 md:[scrollbar-width:thin]"
    >
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          aria-pressed={c.id === value}
          aria-label={c.id === suggested ? m.tx_suggested({ name: c.name }) : undefined}
          className="relative flex h-[68px] snap-start flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 text-[11px] leading-tight text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          {c.id === suggested && <AiMark className="absolute top-1.5 right-1.5 size-3" />}
          <CategoryIcon icon={c.icon} className="size-5" />
          <span className="line-clamp-1 w-full text-center">{c.name}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Note, tags and event. Each stays behind an "Add …" link until it has a value or you open it.
 * Without `onTags` (transfers), it offers only the note. `auto` marks an event picked by date.
 */
function Extras({
  note,
  onNote,
  tags,
  onTags,
  eventId,
  onEvent,
  auto,
  day,
}: {
  note: string
  onNote: (v: string) => void
  tags?: string[]
  onTags?: (t: string[]) => void
  eventId?: string | null
  onEvent?: (id: string | null) => void
  auto?: boolean
  day?: string
}) {
  const [opened, setOpened] = useState<"note" | "tags" | "event" | null>(null)
  const show = {
    note: !!note || opened === "note",
    tags: !!onTags && (!!tags?.length || opened === "tags"),
    event: !!onEvent && (!!eventId || opened === "event"),
  }
  const links = [
    !show.note && { key: "note" as const, icon: <NotePencilIcon />, label: m.tx_add_note() },
    onTags && !show.tags && { key: "tags" as const, icon: <HashIcon />, label: m.tx_add_tags() },
    onEvent && !show.event && { key: "event" as const, icon: <CalendarStarIcon />, label: m.tx_add_to_event() },
  ].filter((l) => !!l)

  return (
    <div className="grid gap-4">
      {show.note && (
        <Extra
          label={m.tx_note()}
          removeLabel={m.tx_remove_note()}
          onClose={() => {
            onNote("")
            setOpened(null)
          }}
        >
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            autoFocus={opened === "note"}
            rows={2}
            maxLength={2000}
            aria-label={m.tx_note()}
            className="field-sizing-content min-h-16 w-full resize-none rounded-md border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Extra>
      )}
      {show.tags && onTags && (
        <Extra
          label={m.tx_tags()}
          removeLabel={m.tx_remove_tags()}
          onClose={() => {
            onTags([])
            setOpened(null)
          }}
        >
          <TagInput value={tags ?? []} onChange={onTags} autoFocus={opened === "tags"} />
        </Extra>
      )}
      {show.event && onEvent && (
        <Extra
          label={auto && eventId ? m.tx_event_by_date() : m.tx_event()}
          removeLabel={m.tx_remove_event()}
          onClose={() => {
            onEvent(null)
            setOpened(null)
          }}
        >
          <EventPicker value={eventId ?? null} onChange={onEvent} day={day ?? ""} />
        </Extra>
      )}
      {links.length > 0 && (
        <div className="-ml-2 flex flex-wrap gap-x-1">
          {links.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setOpened(l.key)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:min-h-11 [&_svg]:size-4"
            >
              {l.icon}
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Extra({
  label,
  removeLabel,
  onClose,
  children,
}: {
  label: string
  removeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={removeLabel}
          className="-my-2 -mr-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}
