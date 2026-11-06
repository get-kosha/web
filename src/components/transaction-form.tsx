import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { ArrowDownIcon, CalendarStarIcon, HashIcon, NotePencilIcon, TrashIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { CategoryIcon } from "@/components/category-icon"
import { segment, segmentButton, useMeta } from "@/components/shell"
import { DatePicker, TimePicker, dayLabel } from "@/components/date-time"
import { Suggest } from "@/components/suggest"
import { EventPicker, TagInput } from "@/components/tags-events"
import { deleteTransaction, saveTransaction, saveTransfer, type Category, type Tx, type Wallet } from "@/lib/api"
import {
  CORRECTION_CATEGORY,
  convert,
  dayOf,
  eventFor,
  exchange,
  fmt,
  fmtRate,
  guessCategory,
  isNeutral,
  parseAmount,
  tagList,
  timeOf,
} from "@/lib/core"
import { cn } from "@/lib/utils"

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
          <span className="text-xs text-muted-foreground">
            Fee <span className="uppercase">({from})</span>
          </span>
          <Input
            value={x.fee}
            onChange={(e) => x.setFee(e.target.value)}
            inputMode="decimal"
            className="num h-9"
            aria-label="Fee"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Via</span>
          <Suggest
            value={x.provider}
            onChange={x.setProvider}
            options={PROVIDERS}
            render={<Input className="h-9" />}
            aria-label="Provider"
          />
        </label>
      </div>
      {x.crossCurrency && x.to && (
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Rate, 1 {from.toUpperCase()} =</span>
            <Input
              value={x.fxInput === "rate" ? x.rateText : fmtRate(x.rate)}
              onChange={(e) => {
                x.setRateText(e.target.value)
                x.setFxInput("rate")
              }}
              inputMode="decimal"
              className="num h-9"
              aria-label="Exchange rate"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              Received <span className="uppercase">({x.to.currency})</span>
            </span>
            <Input
              value={x.fxInput === "received" ? x.received : x.receivedCents ? cents2(x.receivedCents) : ""}
              onChange={(e) => {
                x.setReceived(e.target.value)
                x.setFxInput("received")
              }}
              inputMode="decimal"
              className="num h-9"
              aria-label="Amount received"
            />
          </label>
        </div>
      )}
      {(x.feeCents > 0 || x.crossCurrency) && x.converted > 0 && (
        <p className="num text-xs text-muted-foreground">
          {x.crossCurrency && x.to
            ? `${fmt(x.converted, from)} becomes ${fmt(x.receivedCents, x.to.currency)}, market rate ${fmtRate(x.market)}.`
            : `${fmt(x.converted, from)} arrives.`}
          {x.fx.totalCost > 0.5 && ` It costs ${fmt(x.fx.totalCost, from)} (${x.fx.costPct.toFixed(2)}%).`}
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
            !!c.income === income &&
            (!c.archived || c.id === initial?.category_id) &&
            (!isNeutral(c.id) || (c.id === CORRECTION_CATEGORY && initial?.category_id === c.id))
        )
        .sort((a, b) => b.uses - a.uses),
    [meta.categories, income, initial]
  )
  const wallet = meta.wallets.find((w) => w.id === walletId)
  const toWallet = meta.wallets.find((w) => w.id === toWalletId)
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
    if (!cents) return toast.error("Enter an amount")
    if (transfer) {
      if (!toWalletId || toWalletId === walletId) return toast.error("Pick the account the money goes to")
      if (x.converted <= 0) return toast.error("The fee must be less than the amount")
      if (!x.receivedCents) return toast.error("Enter the amount received")
    } else if (!categoryId || !categories.some((c) => c.id === categoryId)) return toast.error("Pick a category")
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
          `Moved ${fmt(Math.abs(cents), wallet?.currency ?? meta.primary)} from ${wallet?.name} to ${toWallet?.name}`
        )
      } else {
        const signed = Math.abs(cents) * (income ? 1 : -1)
        // When an existing transfer becomes an expense or income, delete it and save a new transaction.
        if (initial?.transfer_id) await deleteTransaction({ data: { id: initial.id } })
        await saveTransaction({
          data: {
            id: initial?.transfer_id ? undefined : initial?.id,
            walletId,
            categoryId,
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
        const cat = meta.categories.find((c) => c.id === categoryId)
        toast.success(
          `${initial ? "Saved" : "Added"} ${fmt(signed, wallet?.currency ?? meta.primary)}, ${name || cat?.name}`
        )
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
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial) return
    setConfirming(false)
    try {
      await deleteTransaction({ data: { id: initial.id } })
      toast.success("Deleted")
      await router.invalidate()
      onDone?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete")
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div role="group" aria-label="Type" className={segment}>
          {(["expense", "income", "transfer"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m)
                setCategoryId("")
                setCategoryTouched(false)
              }}
              className={cn(segmentButton, "px-3 text-[13px] capitalize")}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <DatePicker
            aria-label="Date"
            value={day}
            onChange={setDay}
            className="rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted max-md:min-h-11"
          >
            {day === today ? "Today" : dayLabel(day)}
          </DatePicker>
          <TimePicker
            aria-label="Time"
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
          aria-label="Amount"
          className={cn(
            "num w-full min-w-0 bg-transparent text-center text-5xl font-semibold tracking-tight outline-none",
            income && "text-positive"
          )}
        />
      </label>

      {transfer && <div className="-mb-3 text-xs text-muted-foreground">From</div>}
      <WalletChips wallets={activeWallets} value={walletId} onChange={setWalletId} />

      {transfer ? (
        <>
          <div className="-mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowDownIcon className="size-3" /> To
          </div>
          <WalletChips
            wallets={activeWallets.filter((w) => w.id !== walletId)}
            value={toWalletId}
            onChange={setToWalletId}
          />
          <ExchangeFields x={x} />
          <p className="text-xs text-muted-foreground">
            Moves money between your accounts. It doesn't count as spending or income, but the fee does.
          </p>
        </>
      ) : (
        <>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Payee</span>
            <Suggest value={name} onChange={onName} options={meta.titles} render={<Input className="h-10" />} />
          </label>

          <CategoryStrip
            categories={categories}
            value={categoryId}
            onPick={(id) => {
              setCategoryId(id)
              setCategoryTouched(true)
            }}
          />
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

      {initial && !initial.paid && !transfer && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid
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
            aria-label={initial.transfer_id ? "Delete transfer" : "Delete transaction"}
          >
            <TrashIcon className="size-5" />
          </Button>
        )}
        <div className="flex-1" />
        {onCancel && (
          <Button type="button" variant="outline" size="lg" className="min-w-24" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" disabled={busy || !cents} className="min-w-28">
          {initial ? "Save" : `Add ${mode}`}
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{initial?.transfer_id ? "Delete this transfer?" : "Delete this transaction?"}</DialogTitle>
            {initial?.transfer_id && <DialogDescription>This removes it from both accounts.</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove}>
              Delete
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
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close" className="-mr-2">
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
  onPick,
}: {
  categories: Category[]
  value: string | null
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
      aria-label="Category"
      className="-mx-4 grid snap-x scroll-px-4 [scrollbar-width:none] auto-cols-[76px] grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-1 md:[scrollbar-width:thin]"
    >
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          aria-pressed={c.id === value}
          className="flex h-[68px] snap-start flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 text-[11px] leading-tight text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
        >
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
    !show.note && { key: "note" as const, icon: <NotePencilIcon />, label: "Add note" },
    onTags && !show.tags && { key: "tags" as const, icon: <HashIcon />, label: "Add tags" },
    onEvent && !show.event && { key: "event" as const, icon: <CalendarStarIcon />, label: "Add to event" },
  ].filter((l) => !!l)

  return (
    <div className="grid gap-4">
      {show.note && (
        <Extra
          label="Note"
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
            aria-label="Note"
            className="field-sizing-content min-h-16 w-full resize-none rounded-md border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Extra>
      )}
      {show.tags && onTags && (
        <Extra
          label="Tags"
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
          label={auto && eventId ? "Event · picked by date" : "Event"}
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

function Extra({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Remove ${label.split(" ")[0].toLowerCase()}`}
          className="-my-2 -mr-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}
