import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BackspaceIcon,
  CalendarBlankIcon,
  ClockIcon,
  CreditCardIcon,
  DotsNineIcon,
  NotePencilIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CategoryIcon } from "@/components/category-icon"
import { TimePicker } from "@/components/date-time"
import { Suggest } from "@/components/suggest"
import { EventPicker, TagInput } from "@/components/tags-events"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExchangeFields, useExchange } from "@/components/transaction-form"
import { bottomSheet, segment, segmentButton, useMeta } from "@/components/shell"
import { saveTransfer, suggestPayees, type PayeeSuggestion, type Wallet } from "@/lib/api"
import { addTransaction } from "@/lib/offline"
import { WALLET_KEY, startWallet } from "@/lib/add-defaults"
import {
  LOCALE,
  addDays,
  dateOfDay,
  dayOf,
  dayOfDate,
  eventFor,
  fmt,
  guessCategory,
  isNeutral,
  pressKey,
  shiftMonth,
  timeOf,
} from "@/lib/core"
import { cn } from "@/lib/utils"

type Kind = "expense" | "income" | "transfer"
type Sheet = "from" | "to" | "date" | "category" | "details" | "exchange" | null

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"]

// The category grid takes one row on short phones, two on most and three on tall ones (5 tiles a row).
// When there are more categories than tiles, the last tile is "All".
const ROWS = [
  { hideBelow: "[@media(max-height:759px)]:hidden", hideAt: "[@media(max-height:759px)]:hidden" },
  {
    hideBelow: "[@media(max-height:879px)]:hidden",
    hideAt: "[@media(min-height:760px)_and_(max-height:879px)]:hidden",
  },
  { hideBelow: "", hideAt: "[@media(min-height:880px)]:hidden" },
]

/**
 * The amount-first add screen. Everything fits on one phone screen: the amount, account, date and
 * note chips, then the payee and a category grid (or, for a transfer, the two accounts and the fee),
 * then the keypad. Each chip opens a sheet. Adding closes the screen; "Add another" keeps it open.
 */
export function PhoneAdd() {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate()
  const today = dayOf(Date.now() / 1000, meta.tz)
  const wallets = meta.wallets.filter((w) => !w.archived)
  const [kind, setKind] = useState<Kind>(meta.prefs.add_kind)
  const [amount, setAmount] = useState("")
  const [payee, setPayee] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "")
  const [toWalletId, setToWalletId] = useState("")
  // Start on the default or last used account. Read it after mount so server and client render the same first frame.
  useEffect(() => {
    const id = startWallet(
      meta.prefs.default_wallet,
      meta.wallets.filter((w) => !w.archived)
    )
    if (id) setWalletId(id)
  }, [meta.wallets, meta.prefs.default_wallet])
  const [day, setDay] = useState(today)
  // null until you change it, and it shows now. Untouched on today, the server stamps the exact moment.
  const [time, setTime] = useState<string | null>(null)
  const shownTime = time ?? timeOf(Date.now() / 1000, meta.tz)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [note, setNote] = useState("")
  const [tags, setTags] = useState<string[]>([])
  // Until you pick an event this stays undefined, and the entry gets the event its day falls in.
  const [pickedEvent, setPickedEvent] = useState<string | null | undefined>(undefined)
  const eventId = pickedEvent !== undefined ? pickedEvent : eventFor(day, meta.events)
  const [match, setMatch] = useState<PayeeSuggestion | null>(null)
  const [saving, setSaving] = useState(false)

  const transfer = kind === "transfer"
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0]
  const toWallet = wallets.find((w) => w.id === toWalletId && w.id !== wallet?.id)
  const currency = wallet?.currency ?? meta.primary
  const cents = Math.round(Number(amount || "0") * 100)
  const signed = kind === "income" ? cents : -cents
  const x = useExchange(transfer ? wallet : undefined, toWallet, cents)

  // Look up the payee's usual amount, category and account.
  useEffect(() => {
    const q = payee.trim()
    if (q.length < 2) return setMatch(null)
    let live = true
    const t = setTimeout(() => {
      void suggestPayees({ data: { q } })
        .then((r) => live && setMatch(r.find((x) => x.name.toLowerCase() === q.toLowerCase()) ?? r[0] ?? null))
        .catch(() => {})
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [payee])

  const candidates = meta.categories.filter(
    (c) => !c.archived && !isNeutral(c.id) && !c.parent_id && !!c.income === (kind === "income")
  )
  const usual =
    meta.prefs.suggest_category !== "1"
      ? null
      : match && candidates.some((c) => c.id === match.category_id)
        ? match.category_id
        : guessCategory(payee, meta.rules)
  // Most used first, with this payee's usual category at the front.
  const ordered = useMemo(() => {
    const top = [...candidates].sort((a, b) => b.uses - a.uses)
    return [...top.filter((c) => c.id === usual), ...top.filter((c) => c.id !== usual)]
  }, [candidates, usual])
  // A pick only counts while it fits the kind, so switching to income never saves an expense category.
  const chosen = [categoryId, usual].find((id) => id && candidates.some((c) => c.id === id)) ?? null
  const chosenCat = meta.categories.find((c) => c.id === chosen)
  // A category picked from the full list moves to the front, so the grid always shows the choice.
  const shown =
    chosenCat && ordered.findIndex((c) => c.id === chosen) >= 4
      ? [chosenCat, ...ordered.filter((c) => c.id !== chosen)]
      : ordered

  const display = (() => {
    const [whole, dec] = (amount || "0").split(".")
    const sign = kind === "expense" ? "−" : kind === "income" ? "+" : ""
    const symbol = fmt(0, currency).replace(/[\d.,\s]/g, "")
    return `${sign}${symbol}${Number(whole).toLocaleString(LOCALE)}${dec !== undefined ? `.${dec}` : ""}`
  })()

  // Back to the page you came from, or Overview when the app opened straight here.
  const leave = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: "/" }))

  function reset() {
    setAmount("")
    setPayee("")
    setCategoryId(null)
    setNote("")
    setTags([])
    setPickedEvent(undefined)
    setTime(null)
    x.reset()
  }

  async function add(again = false) {
    if (saving) return
    if (!cents) return toast.error("Enter an amount")
    if (!wallet) return toast.error("Add an account first")
    if (transfer) {
      if (!toWallet) {
        setSheet("to")
        return toast.error("Pick the account the money goes to")
      }
      if (x.converted <= 0) return toast.error("The fee must be less than the amount")
      if (!x.receivedCents) return toast.error("Enter the amount received")
    } else if (!chosenCat) return toast.error("Pick a category")
    setSaving(true)
    const sendTime = time ?? (day === today ? undefined : shownTime)
    try {
      if (transfer && toWallet) {
        await saveTransfer({
          data: {
            fromWalletId: wallet.id,
            toWalletId: toWallet.id,
            sent: cents,
            fee: x.feeCents,
            received: x.receivedCents,
            provider: x.provider,
            day,
            time: sendTime,
            note,
          },
        })
        await router.invalidate()
        toast.success(`Moved ${fmt(cents, currency)} from ${wallet.name} to ${toWallet.name}`)
      } else if (chosenCat) {
        const name = payee.trim()
        const { queued, undo } = await addTransaction(meta.user.id, {
          walletId: wallet.id,
          categoryId: chosenCat.id,
          name,
          note,
          amount: signed,
          day,
          time: sendTime,
          paid: true,
          tags,
          eventId,
        })
        if (!queued) await router.invalidate()
        toast(`${queued ? "Saved offline" : "Added"} ${fmt(signed, currency)}, ${name || chosenCat.name}`, {
          action: {
            label: "Undo",
            onClick: async () => {
              await undo()
              if (!queued) await router.invalidate()
            },
          },
        })
      }
      try {
        localStorage.setItem(WALLET_KEY, wallet.id)
      } catch {
        // remembering the account is a convenience only
      }
      if (again) reset()
      else leave()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add")
    } finally {
      setSaving(false)
    }
  }

  // Physical keyboards type into the amount too, unless a field or a sheet has focus. Enter adds and closes,
  // Shift+Enter adds another and Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [role=dialog]"))
        return
      const key = e.key === "Backspace" ? "del" : e.key === "," ? "." : e.key
      if (KEYS.includes(key)) {
        e.preventDefault()
        setAmount((a) => pressKey(a, key))
      } else if (e.key === "Enter") {
        e.preventDefault()
        void add(e.shiftKey)
      } else if (e.key === "Escape") leave()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const dayLabel =
    day === today
      ? "Today"
      : day === addDays(today, -1)
        ? "Yesterday"
        : new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" })
  const month = today.slice(0, 7)
  const presets = [
    ["Today", today],
    ["Yesterday", addDays(today, -1)],
    ["Start of month", `${month}-01`],
    ["End of month", addDays(`${shiftMonth(month, 1)}-01`, -1)],
  ] as const

  // The note chip names what is set: the note, else the event (picked by date too), else the first tag.
  const event = transfer ? undefined : meta.events.find((e) => e.id === eventId)
  const details = [note.trim(), event?.name, ...(transfer ? [] : tags.map((t) => `#${t}`))].filter(
    (d): d is string => !!d
  )

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] max-md:flex-1 md:pt-8">
      <h1 className="sr-only">Add a transaction</h1>
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11 text-subtle-foreground"
          onClick={leave}
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </Button>
        <div role="group" aria-label="Type" className={cn(segment, "justify-self-center")}>
          {(["expense", "income", "transfer"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(segmentButton, "px-3 text-[13px] capitalize")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3 text-center">
        <output
          aria-live="polite"
          aria-label="Amount"
          className={cn(
            "num block text-[48px] leading-[1.05] font-medium tracking-[-0.03em]",
            !cents && "text-muted-foreground",
            kind === "income" && cents && "text-positive"
          )}
        >
          {display}
        </output>
        <div className="mt-3 flex justify-center gap-2">
          {!transfer && (
            <Chip
              onClick={() => setSheet("from")}
              icon={<CreditCardIcon />}
              label={wallet?.name ?? "No account"}
              aria-label={`Account, ${wallet?.name ?? "none"}`}
            />
          )}
          <Chip
            onClick={() => setSheet("date")}
            icon={<CalendarBlankIcon />}
            label={time ? `${dayLabel}, ${time}` : dayLabel}
            aria-label={`Date and time, ${dayLabel} ${shownTime}`}
            fixed
          />
          <Chip
            onClick={() => setSheet("details")}
            icon={<NotePencilIcon />}
            label={details.length ? details[0] + (details.length > 1 ? ` +${details.length - 1}` : "") : "Note"}
            set={details.length > 0}
            fixed={!details.length}
            aria-label={transfer ? "Note" : "Note, tags and event"}
          />
        </div>
      </div>

      {transfer ? (
        <div className="mt-4 grid gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
            <AccountButton label="From" wallet={wallet} onClick={() => setSheet("from")} />
            <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <AccountButton label="To" wallet={toWallet} onClick={() => setSheet("to")} />
          </div>
          <button
            type="button"
            onClick={() => setSheet("exchange")}
            className={cn(field, "justify-between gap-3 transition-colors hover:bg-muted")}
          >
            <span className="text-muted-foreground">{x.crossCurrency ? "Fee and rate" : "Fee"}</span>
            <span className="num truncate">
              {x.crossCurrency && x.to
                ? `${fmt(x.receivedCents, x.to.currency)} arrives`
                : x.feeCents
                  ? fmt(x.feeCents, currency)
                  : "None"}
            </span>
          </button>
          {x.fx.totalCost > 0.5 && x.converted > 0 && (
            <p className="num px-1 text-xs text-muted-foreground">
              It costs {fmt(x.fx.totalCost, currency)} ({x.fx.costPct.toFixed(2)}%) against the market rate.
            </p>
          )}
        </div>
      ) : (
        <>
          <label className={cn(field, "mt-4 focus-within:border-ring")}>
            <span className="sr-only">Payee</span>
            <Suggest
              value={payee}
              onChange={setPayee}
              options={meta.titles}
              placeholder="Payee"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {match && match.avg !== 0 && (
              <span className="num shrink-0 text-xs text-muted-foreground">
                usually {fmt(Math.abs(match.avg), match.currency)}
              </span>
            )}
          </label>
          <div role="group" aria-label="Category" className="mt-3 grid grid-cols-5 gap-1">
            {shown.slice(0, ordered.length > 15 ? 14 : 15).map((c, i) => (
              <Tile
                key={c.id}
                pressed={c.id === chosen}
                onClick={() => setCategoryId(c.id)}
                icon={<CategoryIcon icon={c.icon} className="size-5" />}
                label={c.name}
                // Hidden on screens with fewer rows, where it falls in or past the "All" slot.
                className={cn(ROWS.map((r, row) => i >= row * 5 + 4 && ordered.length > row * 5 + 5 && r.hideBelow))}
              />
            ))}
            {ordered.length > 5 && (
              <Tile
                onClick={() => setSheet("category")}
                icon={<DotsNineIcon className="size-5" />}
                label="All"
                aria-label="All categories"
                className={cn(ROWS.map((r, row) => ordered.length <= row * 5 + 5 && r.hideAt))}
              />
            )}
          </div>
        </>
      )}

      <div className="min-h-3 flex-1" />

      <div role="group" aria-label="Keypad" className="grid grid-cols-3 gap-1">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === "del" ? "Delete digit" : k === "." ? "Decimal point" : k}
            onClick={() => setAmount((a) => pressKey(a, k))}
            className="num flex h-[clamp(2.875rem,6.5svh,3.5rem)] items-center justify-center rounded-xl text-[22px] transition-[background-color,scale] duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted motion-safe:active:scale-[0.96] md:h-12 md:hover:bg-muted"
          >
            {k === "del" ? <BackspaceIcon className="size-6" /> : k}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="h-[52px] rounded-[14px] px-4 text-[15px]"
          disabled={saving || !cents}
          onClick={() => add(true)}
        >
          Add another
        </Button>
        <Button
          size="lg"
          className="h-[52px] min-w-0 flex-1 rounded-[14px] text-base"
          disabled={saving || !cents}
          onClick={() => add()}
        >
          {cents ? `Add ${kind}` : "Enter an amount"}
        </Button>
      </div>

      <Sheet
        open={sheet === "from" || sheet === "to"}
        onClose={() => setSheet(null)}
        title={transfer ? (sheet === "to" ? "To" : "From") : "Account"}
      >
        <AccountList
          wallets={sheet === "to" ? wallets.filter((w) => w.id !== wallet?.id) : wallets}
          value={sheet === "to" ? toWallet?.id : wallet?.id}
          onPick={(id) => {
            if (sheet === "to") setToWalletId(id)
            else setWalletId(id)
            setSheet(null)
          }}
        />
      </Sheet>

      <Sheet open={sheet === "category"} onClose={() => setSheet(null)} title="Category">
        <div className="-mx-1 grid max-h-[60svh] grid-cols-4 gap-1 overflow-y-auto overscroll-contain px-1">
          {ordered.map((c) => (
            <Tile
              key={c.id}
              pressed={c.id === chosen}
              onClick={() => {
                setCategoryId(c.id)
                setSheet(null)
              }}
              icon={<CategoryIcon icon={c.icon} className="size-5" />}
              label={c.name}
              wrap
            />
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "details"}
        onClose={() => setSheet(null)}
        title={transfer ? "Note" : "Note, tags and event"}
      >
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="field-sizing-content min-h-16 w-full resize-none rounded-md border bg-card px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
          </label>
          {!transfer && (
            <>
              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">Tags</span>
                <TagInput value={tags} onChange={setTags} />
              </div>
              <div className="grid gap-1.5">
                <span id="add-event" className="text-xs text-muted-foreground">
                  {pickedEvent === undefined && eventId ? "Event, picked by date" : "Event"}
                </span>
                <EventPicker value={eventId ?? null} onChange={setPickedEvent} day={day} aria-labelledby="add-event" />
              </div>
            </>
          )}
          <Button size="lg" className="h-11" onClick={() => setSheet(null)}>
            Done
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "exchange"}
        onClose={() => setSheet(null)}
        title={x.crossCurrency ? "Fee and rate" : "Fee"}
      >
        <div className="grid gap-4">
          <ExchangeFields x={x} />
          <Button size="lg" className="h-11" onClick={() => setSheet(null)}>
            Done
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "date"} onClose={() => setSheet(null)} title="Date and time">
        <div className="flex flex-wrap gap-2">
          {presets.map(([label, d]) => (
            <Pill
              key={label}
              on={day === d}
              onClick={() => {
                setDay(d)
                setSheet(null)
              }}
            >
              {label}
            </Pill>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={dateOfDay(day)}
          defaultMonth={dateOfDay(day)}
          weekStartsOn={1}
          onSelect={(d) => {
            if (d) setDay(dayOfDate(d))
            setSheet(null)
          }}
          className="mx-auto rounded-xl border bg-card [--cell-size:--spacing(11)]"
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Time</span>
          <TimePicker
            aria-label="Time"
            value={shownTime}
            onChange={setTime}
            className={cn(pill, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50", time && pillOn)}
          >
            <ClockIcon className="size-4" />
            <span className="num">{shownTime}</span>
          </TimePicker>
        </div>
      </Sheet>
    </div>
  )
}

// A 48px bordered row: the payee field and the transfer fee button.
const field =
  "flex h-12 w-full items-center gap-2.5 rounded-xl border bg-card px-3.5 text-left text-base transition-colors md:text-[15px]"

function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={bottomSheet}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function AccountList({ wallets, value, onPick }: { wallets: Wallet[]; value?: string; onPick: (id: string) => void }) {
  return (
    <div className="grid gap-1">
      {wallets.map((w) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={w.id === value}
          onClick={() => onPick(w.id)}
          className="flex min-h-11 items-center justify-between rounded-md px-3 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-selected aria-pressed:font-medium"
        >
          {w.name} <span className="text-xs text-muted-foreground uppercase">{w.currency}</span>
        </button>
      ))}
    </div>
  )
}

/** One side of a transfer: what it is ("From", "To"), then the account and its currency. */
function AccountButton({ label, wallet, onClick }: { label: string; wallet?: Wallet; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${wallet?.name ?? "pick an account"}`}
      className="flex h-16 min-w-0 flex-col justify-center gap-0.5 rounded-xl border bg-card px-3.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("flex min-w-0 items-baseline gap-1.5 text-[15px]", !wallet && "text-muted-foreground")}>
        <span className="truncate">{wallet?.name ?? "Pick one"}</span>
        {wallet && <span className="shrink-0 text-xs text-muted-foreground uppercase">{wallet.currency}</span>}
      </span>
    </button>
  )
}

/** A category tile. `wrap` lets the name take two lines, for the full list where tiles can grow. */
function Tile({
  icon,
  label,
  pressed,
  wrap,
  onClick,
  className,
  "aria-label": ariaLabel,
}: {
  icon: ReactNode
  label: string
  pressed?: boolean
  wrap?: boolean
  onClick: () => void
  className?: string
  "aria-label"?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 py-2 text-xs leading-tight text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        className
      )}
    >
      {icon}
      <span className={cn("w-full text-center", wrap ? "line-clamp-2 break-words" : "truncate")}>{label}</span>
    </button>
  )
}

// Chips share one row and never wrap: the account name and the note shrink and truncate, the date stays whole.
const Chip = ({
  icon,
  label,
  set,
  fixed,
  onClick,
  "aria-label": ariaLabel,
}: {
  icon: ReactNode
  label: string
  set?: boolean
  fixed?: boolean
  onClick: () => void
  "aria-label": string
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    // A truncated label stays readable on hover, and the empty note chip says it holds tags and the event too.
    title={ariaLabel}
    className={cn(
      "inline-flex h-11 max-w-[11rem] min-w-0 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground",
      fixed && "shrink-0",
      set === false && "text-muted-foreground",
      set && "border-foreground/40"
    )}
  >
    {icon}
    <span className="truncate">{label}</span>
  </button>
)

const pill =
  "inline-flex h-11 items-center gap-1.5 rounded-full border bg-card px-4 text-sm text-subtle-foreground transition-[color,background-color,scale] duration-150 ease-out motion-safe:active:scale-[0.97]"
const pillOn = "border-primary bg-primary text-primary-foreground"

const Pill = ({
  on,
  onClick,
  className,
  children,
}: {
  on?: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) => (
  <button type="button" aria-pressed={!!on} onClick={onClick} className={cn(pill, on && pillOn, className)}>
    {children}
  </button>
)
