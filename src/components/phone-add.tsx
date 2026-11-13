import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowsClockwiseIcon,
  ArrowsDownUpIcon,
  BackspaceIcon,
  CalendarBlankIcon,
  CameraIcon,
  CaretRightIcon,
  ClockIcon,
  NotePencilIcon,
  PaperclipIcon,
  SparkleIcon,
  SpinnerGapIcon,
  SquaresFourIcon,
  WalletIcon,
  XIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { AiMark, readReceipt, useAiCategory } from "@/components/ai"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Switch } from "@/components/ui/switch"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker, TimePicker } from "@/components/date-time"
import { Suggest } from "@/components/suggest"
import { EventPicker, TagInput } from "@/components/tags-events"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExchangeFields, useExchange } from "@/components/transaction-form"
import { bottomSheet, segment, segmentButton, useMeta } from "@/components/shell"
import {
  addRecurring,
  readEntry,
  saveTransfer,
  suggestPayees,
  type AiEntry,
  type PayeeSuggestion,
  type Wallet,
} from "@/lib/api"
import { addTransaction } from "@/lib/offline"
import { Attachments, uploadFiles } from "@/components/attachments"
import { WALLET_KEY, decimalMark, startWallet } from "@/lib/add-defaults"
import {
  intlLocale,
  ATTACHMENT_LIMIT,
  TRANSFER_CATEGORY,
  addDays,
  convert,
  dateOfDay,
  dayOf,
  dayOfDate,
  eventFor,
  fmt,
  guessCategory,
  inCurrency,
  isNeutral,
  keypadCents,
  pressKey,
  shiftMonth,
  timeOf,
  type Unit,
} from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Kind = "expense" | "income" | "transfer"
const KIND_LABEL = { expense: m.add_kind_expense, income: m.add_kind_income, transfer: m.add_kind_transfer }
const ADD_KIND = { expense: m.add_add_expense, income: m.add_add_income, transfer: m.add_add_transfer }
type Sheet = "from" | "to" | "date" | "category" | "details" | "exchange" | "describe" | "repeat" | null
/** Repeat on Add: the entry becomes a schedule (bill, subscription, recurring income or transfer) from its day. */
type Repeat = {
  every: number
  unit: Unit
  kind: "repetitive" | "subscription"
  endDay: string | null
  autoPay: boolean
}

const EVERY = { day: m.subs_every_day, week: m.subs_every_week, month: m.subs_every_month, year: m.subs_every_year }
const INTERVAL = {
  day: m.subs_interval_day,
  week: m.subs_interval_week,
  month: m.subs_interval_month,
  year: m.subs_interval_year,
}
/** "Every month", "Every 2 weeks": the "every …" messages with a capital, to start a label. */
const frequency = (r: Pick<Repeat, "every" | "unit">) => {
  const text = EVERY[r.unit]({ count: r.every })
  return text.charAt(0).toLocaleUpperCase(intlLocale()) + text.slice(1)
}

// The calculator keypad, as on the phone apps: digits on the left, ÷ × − + down the right.
const KEYS = ["1", "2", "3", "/", "4", "5", "6", "*", "7", "8", "9", "-", ".", "0", "del", "+"]
const OPS: Record<string, string> = { "/": "÷", "*": "×", "-": "−", "+": "+" }
const OP_LABEL: Record<string, () => string> = {
  "/": m.app_key_divide,
  "*": m.app_key_multiply,
  "-": m.app_key_subtract,
  "+": m.app_key_add,
}

/** One typed number with the language's grouping and decimal mark, as typed: "1204.5" reads "1,204.5". */
const group = (n: string) => {
  const [whole, dec] = n.split(".")
  return `${Number(whole || 0).toLocaleString(intlLocale())}${dec !== undefined ? `${decimalMark()}${dec}` : ""}`
}

/**
 * The amount-first add screen, laid out like the phone apps' Add. Everything fits on one phone screen:
 * the amount with the account under it, the category, date and note tiles, the payee (or, for a transfer,
 * the two accounts and the fee), then the calculator keypad. Each tile opens a sheet. Adding closes the
 * screen; "Add another" keeps it open.
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
  // Files to attach once the entry is saved, including a receipt AI read.
  const [files, setFiles] = useState<File[]>([])
  // Until you pick an event this stays undefined, and the entry gets the event its day falls in.
  const [pickedEvent, setPickedEvent] = useState<string | null | undefined>(undefined)
  const eventId = pickedEvent !== undefined ? pickedEvent : eventFor(day, meta.events)
  const [match, setMatch] = useState<PayeeSuggestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [repeat, setRepeat] = useState<Repeat | null>(null)
  // Set when Next opened the category sheet: picking one then adds the entry.
  const [next, setNext] = useState(false)
  // Natural-language add and receipt scanning fill the screen; `filled` says which, until the next reset.
  const [reading, setReading] = useState<"text" | "receipt" | null>(null)
  const [filled, setFilled] = useState<"text" | "receipt" | null>(null)
  const [described, setDescribed] = useState("")
  const [aiCategoryId, setAiCategoryId] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  // Holding backspace: the timer, and whether it fired, so the click that ends the hold deletes nothing.
  const holding = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)

  const transfer = kind === "transfer"
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0]
  const toWallet = wallets.find((w) => w.id === toWalletId && w.id !== wallet?.id)
  const currency = wallet?.currency ?? meta.primary
  // The keypad offers as many decimals as the currency has, up to 2 (amounts are always kept in hundredths).
  const decimals = Math.min(
    2,
    new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions()
      .maximumFractionDigits ?? 2
  )
  const press = (key: string) => setAmount((a) => pressKey(a, key, decimals))
  const value = keypadCents(amount, decimals)
  const cents = value && value > 0 ? value : 0
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
  const guessing = meta.prefs.suggest_category === "1"
  const fromHistory = !guessing
    ? null
    : match && candidates.some((c) => c.id === match.category_id)
      ? match.category_id
      : guessCategory(payee, meta.rules)
  // Auto-categorise asks only about a payee that history and rules can't place.
  const aiCat = useAiCategory(
    payee,
    kind === "income" ? "income" : "expense",
    meta.ai.categorise && !transfer && !fromHistory && !categoryId && !aiCategoryId
  )
  const aiGuess = [aiCategoryId, aiCat.id].find((id) => guessing && id && candidates.some((c) => c.id === id)) ?? null
  const usual = fromHistory ?? aiGuess
  // Most used first, with this payee's usual category at the front.
  const ordered = useMemo(() => {
    const top = [...candidates].sort((a, b) => b.uses - a.uses)
    return [...top.filter((c) => c.id === usual), ...top.filter((c) => c.id !== usual)]
  }, [candidates, usual])
  // A pick only counts while it fits the kind, so switching to income never saves an expense category.
  const chosen = [categoryId, usual].find((id) => id && candidates.some((c) => c.id === id)) ?? null
  const chosenCat = meta.categories.find((c) => c.id === chosen)
  const ready = !!cents && (transfer || !!chosenCat)

  // With an operator the amount shows the result, else the number as typed. "…" when it divides by zero.
  const calculating = /[-+*/]/.test(amount)
  const display = (() => {
    const sign = kind === "expense" ? "−" : kind === "income" ? "+" : ""
    if (calculating) {
      if (value === null) return "…"
      return value > 0 ? sign + fmt(value, currency) : value < 0 ? `−${fmt(-value, currency)}` : fmt(0, currency)
    }
    const zero = fmt(0, currency)
    const symbol = zero.replace(/[\d.,\s]/g, "")
    // Kept with "." while typed, shown with the language's mark, and the symbol on the side the language puts it.
    const number = group(amount || "0")
    const s = amount ? sign : ""
    return /^\d/.test(zero) ? `${s}${number}\u00a0${symbol}` : `${s}${symbol}${number}`
  })()
  const expression = calculating ? amount.replace(/[-+*/]|[^-+*/]+/g, (t) => (OPS[t] ? ` ${OPS[t]} ` : group(t))) : ""
  const converted =
    !transfer && cents && currency !== meta.primary ? convert(cents, currency, meta.primary, meta.rates) : 0
  const hint = transfer
    ? m.app_add_transfer_note()
    : !amount
      ? savedOnce
        ? m.app_add_ready_next()
        : m.app_add_start()
      : converted
        ? m.app_add_converted({ amount: fmt(Math.round(converted), meta.primary) })
        : kind === "income"
          ? m.app_add_income_note()
          : null

  // Back to the page you came from, or Overview when the app opened straight here.
  const leave = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: "/" }))

  function reset() {
    setAmount("")
    setPayee("")
    setCategoryId(null)
    setAiCategoryId(null)
    setFilled(null)
    setDescribed("")
    setNote("")
    setTags([])
    setFiles([])
    setPickedEvent(undefined)
    setTime(null)
    setRepeat(null)
    x.reset()
  }

  /** The primary button: Next opens the categories when Kosha can't guess one, else it adds and closes. */
  function primary() {
    if (!cents) return
    if (!transfer && !chosenCat) {
      setNext(true)
      return setSheet("category")
    }
    void add()
  }

  /** Saves the entry. `again` keeps the screen open; `cat` is a category picked after Next. */
  async function add(again = false, cat = chosenCat) {
    if (saving) return
    if (!cents) return toast.error(m.add_error_amount())
    if (!wallet) return toast.error(m.add_error_no_account())
    if (transfer) {
      if (!toWallet) {
        setSheet("to")
        return toast.error(m.add_error_to_account())
      }
      if (x.converted <= 0) return toast.error(m.add_error_fee())
      if (!x.receivedCents) return toast.error(m.add_error_received())
    } else if (!cat) return toast.error(m.add_error_category())
    setSaving(true)
    const sendTime = time ?? (day === today ? undefined : shownTime)
    try {
      if (repeat) {
        // A repeating entry is a schedule, so it needs a connection; its first payment gets the tags and files.
        const { paid } = await addRecurring({
          data: {
            name: payee.trim() || (transfer && toWallet ? `${wallet.name} → ${toWallet.name}` : (cat?.name ?? "")),
            walletId: wallet.id,
            categoryId: transfer ? TRANSFER_CATEGORY : cat!.id,
            amount: transfer ? -cents : signed,
            note: note.trim(),
            every: repeat.every,
            unit: repeat.unit,
            nextDay: day,
            endDay: repeat.endDay,
            autoPay: repeat.autoPay,
            kind: kind === "expense" ? repeat.kind : "repetitive",
            toWalletId: transfer ? toWallet!.id : null,
            toAmount: transfer && x.crossCurrency ? x.receivedCents : null,
            tags: transfer ? [] : tags,
            eventId: transfer ? undefined : (eventId ?? null),
          },
        })
        if (paid && !transfer && files.length) await uploadFiles(paid, files)
        await router.invalidate()
        toast.success(
          transfer
            ? m.subs_transfer_added()
            : kind === "income"
              ? m.subs_income_added()
              : repeat.kind === "subscription"
                ? m.subs_subscription_added()
                : m.subs_bill_added()
        )
      } else if (transfer && toWallet) {
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
        toast.success(m.add_toast_moved({ amount: fmt(cents, currency), from: wallet.name, to: toWallet.name }))
      } else if (cat) {
        const name = payee.trim()
        const { queued, undo, id } = await addTransaction(meta.user.id, {
          walletId: wallet.id,
          categoryId: cat.id,
          name,
          note,
          amount: signed,
          day,
          time: sendTime,
          paid: true,
          tags,
          eventId,
        })
        if (id && files.length) await uploadFiles(id, files)
        if (queued && files.length) toast.error(m.add_toast_offline_files())
        if (!queued) await router.invalidate()
        const msg = queued ? m.add_toast_saved_offline : m.add_toast_added
        toast(msg({ amount: fmt(signed, currency), name: name || cat.name }), {
          action: {
            label: m.common_undo(),
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
      if (again) {
        reset()
        setSavedOnce(true)
      } else leave()
    } catch (e) {
      toast.error(
        repeat && !navigator.onLine ? m.app_add_repeat_offline() : e instanceof Error ? e.message : m.add_error_add()
      )
    } finally {
      setSaving(false)
    }
  }

  /** Puts what AI read into the screen. Fields it couldn't read keep what they had. */
  function fill(e: AiEntry, from: "text" | "receipt") {
    const w = wallets.find((x) => x.id === e.walletId) ?? wallet
    const fit = inCurrency(e, w?.currency ?? currency, meta.rates)
    if (w) setWalletId(w.id)
    if (fit.amount) setAmount((fit.amount / 100).toFixed(decimals).replace(/\.00$/, ""))
    if (fit.amount || e.categoryId) setKind(e.income ? "income" : "expense")
    if (e.payee) setPayee(e.payee)
    setCategoryId(null)
    setAiCategoryId(e.categoryId)
    if (e.day) setDay(e.day)
    if (e.time) setTime(e.time)
    if (fit.note) setNote(fit.note)
    if (e.tags.length) setTags((t) => [...new Set([...t, ...e.tags])])
    setFilled(from)
  }

  async function describe() {
    const text = described.trim()
    if (!text || reading) return
    setSheet(null)
    setReading("text")
    try {
      fill(await readEntry({ data: { text } }), "text")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.add_error_read())
    } finally {
      setReading(null)
    }
  }

  async function scan(file: File) {
    setSheet(null)
    setReading("receipt")
    try {
      fill(await readReceipt(file), "receipt")
      // Keep the photo with the entry, unless it's too big to store.
      if (meta.attachments && file.size <= ATTACHMENT_LIMIT) setFiles((f) => [...f, file])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.add_error_receipt())
    } finally {
      setReading(null)
    }
  }

  // Physical keyboards type into the amount too, operators included, unless a field or a sheet has focus.
  // Enter adds (or picks a category first), Shift+Enter adds another and Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [role=dialog]"))
        return
      const key = e.key === "Backspace" ? "del" : e.key === "," ? "." : e.key === "x" ? "*" : e.key
      if (KEYS.includes(key)) {
        e.preventDefault()
        press(key)
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) {
          if (ready) void add(true)
        } else primary()
      } else if (e.key === "Escape") leave()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const dayLabel =
    day === today
      ? m.add_today()
      : day === addDays(today, -1)
        ? m.add_yesterday()
        : new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          })
  const month = today.slice(0, 7)
  const presets = [
    [m.add_today(), today],
    [m.add_yesterday(), addDays(today, -1)],
    [m.add_start_of_month(), `${month}-01`],
    [m.add_end_of_month(), addDays(`${shiftMonth(month, 1)}-01`, -1)],
  ] as const

  // The note chip names what is set: the note, else the event (picked by date too), else the first tag.
  const event = transfer ? undefined : meta.events.find((e) => e.id === eventId)
  const details = [
    note.trim(),
    event?.name,
    ...(transfer ? [] : tags.map((t) => `#${t}`)),
    !transfer && files.length > 0 && m.add_files({ count: files.length }),
  ].filter((d): d is string => !!d)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] max-md:flex-1 md:pt-8">
      <h1 className="sr-only">{m.add_heading()}</h1>
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11 text-subtle-foreground"
          onClick={leave}
          aria-label={m.common_close()}
        >
          <XIcon className="size-5" />
        </Button>
        <div role="group" aria-label={m.add_type()} className={cn(segment, "justify-self-center")}>
          {(["expense", "income", "transfer"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(segmentButton, "px-3 text-[13px]")}
            >
              {KIND_LABEL[k]()}
            </button>
          ))}
        </div>
        {(meta.ai.quick_add || meta.ai.receipts) && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 justify-self-end text-subtle-foreground"
            disabled={!!reading}
            // With only receipts on, the button goes straight to the camera.
            onClick={() => (meta.ai.quick_add ? setSheet("describe") : camera.current?.click())}
            aria-label={meta.ai.quick_add ? m.add_describe_or_scan() : m.add_scan_receipt()}
          >
            {meta.ai.quick_add ? <SparkleIcon className="size-5" /> : <CameraIcon className="size-5" />}
          </Button>
        )}
        {meta.ai.receipts && (
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void scan(file)
            }}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-3 text-center md:min-h-56">
        {reading ? (
          <p role="status" className="flex items-center justify-center gap-2 text-[15px] text-muted-foreground">
            <SpinnerGapIcon aria-hidden="true" className="size-5 animate-spin text-brand" />
            {reading === "receipt" ? m.add_hint_reading_receipt() : m.add_reading_text()}
          </p>
        ) : (
          <>
            {filled && (
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <AiMark className="size-3" />
                {filled === "receipt" ? m.add_filled_receipt() : m.add_filled_ai()}
              </p>
            )}
            <div>
              {/* The sum being worked out, above the amount it comes to. */}
              <p aria-hidden="true" className="num min-h-5 truncate text-[15px] text-muted-foreground">
                {expression}
              </p>
              <output
                aria-live="polite"
                aria-label={m.add_amount()}
                className={cn(
                  "num block max-w-full py-1 leading-[1.05] font-medium tracking-[-0.03em] whitespace-nowrap",
                  display.length > 11 ? "text-[34px]" : display.length > 8 ? "text-[44px]" : "text-[56px]",
                  !amount && "text-muted-foreground",
                  kind === "income" && cents > 0 && "text-positive"
                )}
              >
                {display}
              </output>
              {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
            </div>
            <div className="flex max-w-full min-w-0 justify-center gap-2">
              {!transfer && (
                <Chip
                  onClick={() => setSheet("from")}
                  icon={<WalletIcon />}
                  label={wallet?.name ?? m.add_no_account()}
                  aria-label={wallet ? m.add_chip_account({ name: wallet.name }) : m.add_chip_account_none()}
                />
              )}
              <Chip
                onClick={() => setSheet("repeat")}
                icon={<ArrowsClockwiseIcon />}
                label={repeat ? frequency(repeat) : m.app_add_repeat_once()}
                aria-label={m.app_add_repeat_label({ frequency: repeat ? frequency(repeat) : m.app_add_repeat_once() })}
                quiet={!repeat}
              />
            </div>
          </>
        )}
      </div>

      <div className={cn("grid gap-1.5", transfer ? "grid-cols-2" : "grid-cols-3")}>
        {!transfer && (
          <FieldTile
            onClick={() => {
              setNext(false)
              setSheet("category")
            }}
            icon={chosenCat ? <CategoryIcon icon={chosenCat.icon} /> : <SquaresFourIcon />}
            label={chosenCat?.name ?? m.add_category()}
            state={!chosenCat ? "empty" : chosen === categoryId ? "set" : "guess"}
            ai={!!chosenCat && !categoryId && !fromHistory && chosen === aiGuess}
            aria-label={
              !chosenCat
                ? m.app_add_category_none()
                : chosen === categoryId
                  ? m.app_add_category_picked({ name: chosenCat.name })
                  : chosen === aiGuess && !fromHistory
                    ? m.app_add_category_ai({ name: chosenCat.name })
                    : m.app_add_category_usual({ name: chosenCat.name })
            }
          />
        )}
        <FieldTile
          onClick={() => setSheet("date")}
          icon={<CalendarBlankIcon />}
          label={dayLabel}
          aria-label={m.add_chip_date({ day: dayLabel, time: shownTime })}
        />
        <FieldTile
          onClick={() => setSheet("details")}
          icon={details.length === 1 && files.length > 0 ? <PaperclipIcon /> : <NotePencilIcon />}
          label={details.length ? details[0] + (details.length > 1 ? ` +${details.length - 1}` : "") : m.add_note()}
          state={details.length ? "set" : "guess"}
          aria-label={
            details.length ? `${m.add_note()}, ${details[0]}` : transfer ? m.add_note() : m.add_note_tags_event()
          }
        />
      </div>

      {transfer ? (
        <div className="mt-3 grid gap-3">
          <div className="relative divide-y rounded-[14px] border bg-card">
            <SideRow label={m.add_from()} wallet={wallet} onClick={() => setSheet("from")} />
            <SideRow label={m.add_to()} wallet={toWallet} onClick={() => setSheet("to")} />
            {wallet && toWallet && (
              <Button
                variant="outline"
                size="icon-lg"
                className="absolute top-1/2 right-10 size-11 -translate-y-1/2 rounded-full bg-card"
                onClick={() => {
                  setWalletId(toWallet.id)
                  setToWalletId(wallet.id)
                }}
                aria-label={m.app_add_swap()}
              >
                <ArrowsDownUpIcon className="size-5" />
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSheet("exchange")}
            className={cn(
              field,
              "gap-3 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            )}
          >
            <span className="shrink-0 text-muted-foreground">
              {x.crossCurrency ? m.add_fee_and_rate() : m.add_fee()}
            </span>
            <span className="num min-w-0 flex-1 truncate text-right text-[13px] text-muted-foreground">
              {x.crossCurrency && x.to
                ? [
                    x.feeCents > 0 && m.app_add_fee_amount({ amount: fmt(x.feeCents, currency) }),
                    m.add_arrives({ amount: fmt(x.receivedCents, x.to.currency) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : x.feeCents
                  ? m.app_add_fee_amount({ amount: fmt(x.feeCents, currency) })
                  : m.add_fee_none()}
            </span>
            <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <label className={cn(field, "mt-3 focus-within:border-ring")}>
          <span className="sr-only">{m.add_payee()}</span>
          <Suggest
            value={payee}
            onChange={(v) => {
              setPayee(v)
              // A category read with an earlier payee doesn't speak for the new one.
              setAiCategoryId(null)
            }}
            options={meta.titles}
            placeholder={m.add_payee()}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {match && match.usual !== 0 && (
            <span className="num shrink-0 text-xs text-muted-foreground">
              {m.add_usually({ amount: fmt(Math.abs(match.usual), match.currency) })}
            </span>
          )}
        </label>
      )}

      <div role="group" aria-label={m.add_keypad()} className="mt-3 grid grid-cols-4 gap-x-2 gap-y-0.5">
        {KEYS.map((k) =>
          k === "." && decimals === 0 ? (
            <span key={k} />
          ) : k === "del" ? (
            <button
              key={k}
              type="button"
              aria-label={m.app_key_delete()}
              onClick={() => {
                if (held.current) held.current = false
                else press("del")
              }}
              // Holding backspace clears the amount, as on the phone apps.
              onPointerDown={() => {
                held.current = false
                clearTimeout(holding.current)
                holding.current = setTimeout(() => {
                  held.current = true
                  setAmount("")
                }, 500)
              }}
              onPointerUp={() => clearTimeout(holding.current)}
              onPointerLeave={() => clearTimeout(holding.current)}
              onPointerCancel={() => clearTimeout(holding.current)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(key, "text-muted-foreground")}
            >
              <BackspaceIcon className="size-7" />
            </button>
          ) : OPS[k] ? (
            <button
              key={k}
              type="button"
              aria-label={OP_LABEL[k]()}
              aria-pressed={amount.endsWith(k)}
              onClick={() => press(k)}
              className={cn(
                key,
                "my-[3px] ml-1.5 h-auto rounded-xl bg-muted text-[26px] text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground md:hover:bg-muted md:aria-pressed:hover:bg-primary"
              )}
            >
              {OPS[k]}
            </button>
          ) : (
            <button
              key={k}
              type="button"
              aria-label={k === "." ? m.add_key_decimal() : k}
              onClick={() => press(k)}
              className={key}
            >
              {k === "." ? decimalMark() : k}
            </button>
          )
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="h-[52px] rounded-[14px] px-4 text-[15px]"
          disabled={saving || !ready}
          onClick={() => add(true)}
        >
          {m.add_another()}
        </Button>
        <Button
          size="lg"
          className="h-[52px] min-w-0 flex-1 rounded-[14px] text-base"
          disabled={saving || !cents}
          onClick={primary}
        >
          {!cents ? m.add_enter_amount() : !transfer && !chosenCat ? m.app_next() : ADD_KIND[kind]()}
        </Button>
      </div>
      <Sheet
        open={sheet === "from" || sheet === "to"}
        onClose={() => setSheet(null)}
        title={transfer ? (sheet === "to" ? m.add_to() : m.add_from()) : m.add_account()}
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

      <Sheet open={sheet === "describe"} onClose={() => setSheet(null)} title={m.add_describe()}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void describe()
          }}
        >
          <textarea
            autoFocus
            value={described}
            onChange={(e) => setDescribed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void describe()
              }
            }}
            rows={2}
            maxLength={500}
            aria-label={m.add_describe_label()}
            placeholder={m.add_describe_placeholder()}
            className="field-sizing-content min-h-20 w-full resize-none rounded-xl border bg-card px-3.5 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">{m.add_describe_help()}</p>
          <div className="flex gap-2">
            {meta.ai.receipts && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 rounded-[14px] px-4"
                onClick={() => camera.current?.click()}
              >
                <CameraIcon className="size-5" /> {m.add_scan_receipt()}
              </Button>
            )}
            <Button type="submit" size="lg" className="h-12 flex-1 rounded-[14px]" disabled={!described.trim()}>
              {m.add_fill_in()}
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "category"}
        onClose={() => setSheet(null)}
        title={next ? m.tx_pick_category() : m.add_category()}
      >
        <p className="-mt-2 text-sm text-muted-foreground">
          {!next
            ? m.app_add_most_used_first()
            : payee.trim()
              ? (kind === "income" ? m.app_add_why_income_new : m.app_add_why_expense_new)({ payee: payee.trim() })
              : kind === "income"
                ? m.app_add_why_income()
                : m.app_add_why_expense()}
        </p>
        <div className="-mx-1 grid max-h-[60svh] grid-cols-4 gap-1 overflow-y-auto overscroll-contain px-1 sm:grid-cols-5">
          {ordered.map((c) => (
            <Tile
              key={c.id}
              pressed={c.id === chosen}
              suggested={c.id === chosen && !categoryId && !fromHistory && c.id === aiGuess}
              onClick={() => {
                setCategoryId(c.id)
                setSheet(null)
                // After Next, picking the category is the last step.
                if (next) void add(false, c)
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
        title={transfer ? m.add_note() : m.add_note_tags_event()}
      >
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">{m.add_note()}</span>
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
                <span className="text-xs text-muted-foreground">{m.add_tags()}</span>
                <TagInput value={tags} onChange={setTags} />
              </div>
              <div className="grid gap-1.5">
                <span id="add-event" className="text-xs text-muted-foreground">
                  {pickedEvent === undefined && eventId ? m.add_event_by_date() : m.add_event()}
                </span>
                <EventPicker value={eventId ?? null} onChange={setPickedEvent} day={day} aria-labelledby="add-event" />
              </div>
              <Attachments staged={files} onStage={setFiles} />
            </>
          )}
          <Button size="lg" className="h-11" onClick={() => setSheet(null)}>
            {m.common_done()}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "exchange"}
        onClose={() => setSheet(null)}
        title={x.crossCurrency ? m.add_fee_and_rate() : m.add_fee()}
      >
        <div className="grid gap-4">
          <ExchangeFields x={x} />
          <Button size="lg" className="h-11" onClick={() => setSheet(null)}>
            {m.common_done()}
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "repeat"} onClose={() => setSheet(null)} title={m.app_add_repeat()}>
        <RepeatPanel
          value={repeat}
          day={day}
          today={today}
          expense={kind === "expense"}
          autoPay={meta.prefs.default_auto_pay === "1"}
          onDone={(r) => {
            setRepeat(r)
            setSheet(null)
          }}
        />
      </Sheet>

      <Sheet open={sheet === "date"} onClose={() => setSheet(null)} title={m.add_date_and_time()}>
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
          <span className="text-sm text-muted-foreground">{m.add_time()}</span>
          <TimePicker
            aria-label={m.add_time()}
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

/** One side of a transfer, as a row: "From" or "To", then the account with its balance and currency. */
function SideRow({ label, wallet, onClick }: { label: string; wallet?: Wallet; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={wallet ? m.add_side_account({ side: label, name: wallet.name }) : m.add_side_pick({ side: label })}
      className="flex min-h-15 w-full items-center gap-3 py-2 pr-3 pl-4 text-left transition-colors outline-none first:rounded-t-[13px] last-of-type:rounded-b-[13px] hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="w-11 shrink-0 text-xs text-muted-foreground">{label}</span>
      {wallet ? (
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[15px] font-medium">{wallet.name}</span>
          <span className="num truncate text-xs text-muted-foreground">
            {fmt(wallet.balance, wallet.currency)} · {wallet.currency.toUpperCase()}
          </span>
        </span>
      ) : (
        <span className="flex-1 text-[15px] text-muted-foreground">{m.add_pick_one()}</span>
      )}
      <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

// A keypad key: tall enough for a thumb on phones, shorter at desk widths where a keyboard does the typing.
const key =
  "num flex h-[clamp(2.875rem,7svh,3.75rem)] items-center justify-center rounded-[14px] text-[26px] transition-[background-color,scale] duration-100 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted motion-safe:active:scale-[0.96] md:h-12 md:hover:bg-muted"

/**
 * A tile in the row under the amount (category, date, note): an icon over a short label. Empty is dashed,
 * a guess has a quieter label, and `ai` adds the sparkle when the guess is AI's.
 */
function FieldTile({
  icon,
  label,
  state = "set",
  ai,
  onClick,
  "aria-label": ariaLabel,
}: {
  icon: ReactNode
  label: string
  state?: "empty" | "guess" | "set"
  ai?: boolean
  onClick: () => void
  "aria-label": string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[14px] border bg-card px-1.5 py-2 text-[12.5px] leading-tight transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px] [&_svg]:shrink-0",
        state === "empty" ? "border-dashed text-muted-foreground" : "[&_svg]:text-muted-foreground",
        state === "guess" && "text-muted-foreground"
      )}
    >
      {ai && <AiMark className="absolute top-1 right-1.5 size-2.5!" />}
      {icon}
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )
}

/** A category tile. `wrap` lets the name take two lines, for the full list where tiles can grow. */
function Tile({
  icon,
  label,
  pressed,
  suggested,
  wrap,
  onClick,
  className,
  "aria-label": ariaLabel,
}: {
  icon: ReactNode
  label: string
  pressed?: boolean
  /** Picked by auto-categorise, so it wears a sparkle until you choose. */
  suggested?: boolean
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
      aria-label={ariaLabel ?? (suggested ? m.add_suggested({ name: label }) : undefined)}
      className={cn(
        "relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 py-2 text-xs leading-tight text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        className
      )}
    >
      {suggested && <AiMark className="absolute top-1.5 right-1.5 size-3" />}
      {icon}
      <span className={cn("w-full text-center", wrap ? "line-clamp-2 break-words" : "truncate")}>{label}</span>
    </button>
  )
}

/** The account, as a pill under the amount. A long name is cut off, and stays readable on hover. */
const Chip = ({
  icon,
  label,
  quiet,
  onClick,
  "aria-label": ariaLabel,
}: {
  icon: ReactNode
  label: string
  /** Nothing set yet, as "Doesn't repeat": a quieter label. */
  quiet?: boolean
  onClick: () => void
  "aria-label": string
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    title={ariaLabel}
    className={cn(
      "inline-flex h-11 max-w-[14rem] min-w-0 items-center gap-1.5 rounded-full border bg-card px-4 text-[15px] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground",
      quiet && "text-muted-foreground"
    )}
  >
    {icon}
    <span className="truncate">{label}</span>
  </button>
)

/**
 * The Repeat sheet: doesn't repeat, every week, month or year, or custom; for an expense, bill or subscription;
 * an end; and auto-record. It edits a draft, and Done applies it.
 */
function RepeatPanel({
  value,
  day,
  today,
  expense,
  autoPay,
  onDone,
}: {
  value: Repeat | null
  day: string
  today: string
  expense: boolean
  autoPay: boolean
  onDone: (r: Repeat | null) => void
}) {
  const [on, setOn] = useState(!!value)
  const [draft, setDraft] = useState<Repeat>(
    value ?? { every: 1, unit: "month", kind: "repetitive", endDay: null, autoPay }
  )
  const [custom, setCustom] = useState(!!value && (value.every !== 1 || value.unit === "day"))
  // The interval as typed, so it can be cleared on the way to another number.
  const [everyText, setEveryText] = useState(String(value?.every ?? 1))
  const set = (patch: Partial<Repeat>) => setDraft((d) => ({ ...d, ...patch }))
  const option = (label: string, selected: boolean, pick: () => void) => (
    <button
      key={label}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={pick}
      className="flex min-h-11 items-center justify-between rounded-md px-3 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:bg-selected aria-checked:font-medium"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn("size-4 rounded-full border", selected && "border-[5px] border-primary")}
      />
    </button>
  )
  return (
    <div className="grid max-h-[70svh] gap-4 overflow-y-auto overscroll-contain">
      <div role="radiogroup" aria-label={m.app_add_repeat()} className="grid gap-1">
        {option(m.app_add_repeat_once(), !on, () => setOn(false))}
        {(["week", "month", "year"] as const).map((unit) =>
          option(frequency({ every: 1, unit }), on && !custom && draft.every === 1 && draft.unit === unit, () => {
            setOn(true)
            setCustom(false)
            set({ every: 1, unit })
          })
        )}
        {option(m.app_add_repeat_custom(), on && custom, () => {
          setOn(true)
          setCustom(true)
        })}
      </div>
      {on && custom && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{m.subs_repeats_every()}</span>
          <input
            value={everyText}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, "").slice(0, 3)
              setEveryText(text)
              if (Number(text) >= 1) set({ every: Math.min(365, Number(text)) })
            }}
            onBlur={() => setEveryText(String(draft.every))}
            inputMode="numeric"
            aria-label={m.subs_interval()}
            className="num h-11 w-14 rounded-md border bg-card px-2 text-center text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div role="group" aria-label={m.subs_interval()} className={segment}>
            {(["day", "week", "month", "year"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={draft.unit === unit}
                onClick={() => set({ unit })}
                className={segmentButton}
              >
                {INTERVAL[unit]({ count: draft.every })}
              </button>
            ))}
          </div>
        </div>
      )}
      {on && (
        <>
          {expense && (
            <div role="group" aria-label={m.subs_type()} className={cn(segment, "w-full")}>
              {(["repetitive", "subscription"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => set({ kind: k })}
                  className={cn(segmentButton, "flex-1")}
                >
                  {k === "subscription" ? m.subs_kind_subscription() : m.subs_kind_bill()}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span id="repeat-ends" className="text-sm">
              {m.subs_ends()}
            </span>
            <DatePicker
              aria-labelledby="repeat-ends"
              value={draft.endDay ?? ""}
              min={day}
              onChange={(d) => set({ endDay: d || null })}
              clearable
              placeholder={m.subs_never()}
              className="w-auto min-w-36"
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            {m.subs_auto_pay()}
            <Switch checked={draft.autoPay} onCheckedChange={(v) => set({ autoPay: v })} />
          </label>
          <p className="text-xs text-muted-foreground">
            {m.app_add_repeat_note()}
            {draft.autoPay && day < today && ` ${m.subs_backfill_hint({ date: day })}`}
          </p>
        </>
      )}
      <Button size="lg" className="h-11" onClick={() => onDone(on ? draft : null)}>
        {m.common_done()}
      </Button>
    </div>
  )
}

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
