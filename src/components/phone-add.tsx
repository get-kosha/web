import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { BackspaceIcon, CalendarBlankIcon, CreditCardIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CategoryStrip, Extras, TransactionForm } from "@/components/transaction-form"
import { bottomSheet, segment, segmentButton, useMeta } from "@/components/shell"
import { deleteTransaction, saveTransaction, suggestPayees, type PayeeSuggestion } from "@/lib/api"
import { WALLET_KEY, startWallet } from "@/lib/add-defaults"
import { LOCALE, addDays, dayOf, eventFor, fmt, guessCategory, isNeutral } from "@/lib/core"
import { cn } from "@/lib/utils"

type Kind = "expense" | "income" | "transfer"

/** Keypad rules: one ".", at most 2 decimals, a leading "0" is replaced, at most 8 digits. */
function pressKey(amount: string, key: string) {
  if (key === "del") return amount.slice(0, -1)
  if (key === ".") return amount.includes(".") ? amount : (amount || "0") + "."
  const dot = amount.indexOf(".")
  if (dot !== -1 && amount.length - dot > 2) return amount
  if (amount.replace(".", "").length >= 8) return amount
  return (amount === "0" ? "" : amount) + key
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"]

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
  // Start on the default or last used account. Read it after mount so server and client render the same first frame.
  useEffect(() => {
    const id = startWallet(
      meta.prefs.default_wallet,
      meta.wallets.filter((w) => !w.archived)
    )
    if (id) setWalletId(id)
  }, [meta.wallets, meta.prefs.default_wallet])
  const [day, setDay] = useState(today)
  const [sheetOpen, setSheetOpen] = useState<"account" | "date" | null>(null)
  const [note, setNote] = useState("")
  const [tags, setTags] = useState<string[]>([])
  // Until you pick an event this stays undefined, and the entry gets the event its day falls in.
  const [pickedEvent, setPickedEvent] = useState<string | null | undefined>(undefined)
  const eventId = pickedEvent !== undefined ? pickedEvent : eventFor(day, meta.events)
  const [match, setMatch] = useState<PayeeSuggestion | null>(null)
  const [saving, setSaving] = useState(false)

  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0]
  const currency = wallet?.currency ?? meta.primary
  const cents = Math.round(Number(amount || "0") * 100)
  const signed = kind === "income" ? cents : -cents

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
  const chosen = categoryId ?? usual ?? null
  const chosenCat = meta.categories.find((c) => c.id === chosen)

  const display = (() => {
    const [whole, dec] = (amount || "0").split(".")
    const sign = kind === "expense" ? "−" : kind === "income" ? "+" : ""
    const symbol = fmt(0, currency).replace(/[\d.,\s]/g, "")
    return `${sign}${symbol}${Number(whole).toLocaleString(LOCALE)}${dec !== undefined ? `.${dec}` : ""}`
  })()

  async function add() {
    if (!cents) return toast.error("Enter an amount")
    if (!chosen) return toast.error("Pick a category")
    if (!wallet) return toast.error("Add an account first")
    setSaving(true)
    try {
      const name = payee.trim()
      const { id } = await saveTransaction({
        data: { walletId: wallet.id, categoryId: chosen, name, note, amount: signed, day, paid: true, tags, eventId },
      })
      try {
        localStorage.setItem(WALLET_KEY, wallet.id)
      } catch {
        // remembering the account is a convenience only
      }
      await router.invalidate()
      toast(`Added ${fmt(signed, currency)} · ${name || chosenCat?.name}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await deleteTransaction({ data: { id } })
            await router.invalidate()
          },
        },
      })
      setAmount("")
      setPayee("")
      setCategoryId(null)
      setNote("")
      setTags([])
      setPickedEvent(undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add")
    } finally {
      setSaving(false)
    }
  }

  // Physical keyboards type into the amount too, unless the payee field has focus.
  useEffect(() => {
    if (kind === "transfer") return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, [role=dialog]"))
        return
      const key = e.key === "Backspace" ? "del" : e.key === "," ? "." : e.key
      if (KEYS.includes(key)) {
        e.preventDefault()
        setAmount((a) => pressKey(a, key))
      } else if (e.key === "Enter") void add()
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

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:min-h-0 md:pt-8">
      <h1 className="sr-only">Add a transaction</h1>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11 text-subtle-foreground"
          nativeButton={false}
          render={<Link to="/" />}
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </Button>
        <div role="group" aria-label="Type" className={cn(segment, "max-md:h-auto")}>
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
        <span className="w-11" />
      </div>

      {kind === "transfer" ? (
        <TransactionForm
          big
          preset={{ amount: cents || undefined }}
          onDone={() => navigate({ to: "/" })}
          onCancel={() => navigate({ to: "/" })}
        />
      ) : (
        <>
          <div className="pt-2.5 text-center">
            <output
              aria-live="polite"
              aria-label="Amount"
              className="num block text-[48px] leading-[1.05] font-medium tracking-[-0.03em]"
            >
              {display}
            </output>
            <div className="mt-3 flex justify-center gap-2">
              <Chip
                onClick={() => setSheetOpen("account")}
                icon={<CreditCardIcon />}
                label={wallet?.name ?? "No account"}
              />
              <Chip onClick={() => setSheetOpen("date")} icon={<CalendarBlankIcon />} label={dayLabel} />
            </div>
          </div>

          <label className="flex h-12 items-center gap-2.5 rounded-xl border bg-card px-3.5">
            <span className="sr-only">Payee</span>
            <input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="Payee"
              list="kosha-titles"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground [&::-webkit-calendar-picker-indicator]:hidden"
            />
            {match && match.avg !== 0 && (
              <span className="num shrink-0 text-xs text-muted-foreground">
                usually {fmt(Math.abs(match.avg), match.currency)}
              </span>
            )}
          </label>
          <datalist id="kosha-titles">
            {meta.titles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <div>
            <div className="mx-0.5 mb-2 text-xs text-muted-foreground">
              Category{usual ? " · this payee's usual first" : ""}
            </div>
            <CategoryStrip categories={ordered} value={chosen} onPick={setCategoryId} />
          </div>

          <Extras
            note={note}
            onNote={setNote}
            tags={tags}
            onTags={setTags}
            eventId={eventId}
            onEvent={setPickedEvent}
            auto={pickedEvent === undefined}
            day={day}
          />

          <div className="flex-1" />

          <div role="group" aria-label="Keypad" className="grid grid-cols-3 gap-1">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k === "del" ? "Delete digit" : k === "." ? "Decimal point" : k}
                onClick={() => setAmount((a) => pressKey(a, k))}
                className="num flex h-12 items-center justify-center rounded-xl text-[22px] transition-[background-color,scale] duration-100 ease-out active:bg-muted motion-safe:active:scale-[0.96] md:hover:bg-muted"
              >
                {k === "del" ? <BackspaceIcon className="size-6" /> : k}
              </button>
            ))}
          </div>

          <Button
            size="lg"
            className="h-[54px] w-full rounded-[14px] text-base"
            disabled={saving || !cents}
            onClick={add}
          >
            {cents ? `Add ${kind} · ${fmt(cents, currency)}` : "Enter an amount"}
          </Button>
        </>
      )}

      <Dialog open={sheetOpen === "account"} onOpenChange={(o) => !o && setSheetOpen(null)}>
        <DialogContent className={bottomSheet}>
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                aria-pressed={w.id === walletId}
                onClick={() => {
                  setWalletId(w.id)
                  setSheetOpen(null)
                }}
                className="flex min-h-11 items-center justify-between rounded-md px-3 text-left text-sm transition-colors hover:bg-muted aria-pressed:bg-selected aria-pressed:font-medium"
              >
                {w.name} <span className="text-xs text-muted-foreground uppercase">{w.currency}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sheetOpen === "date"} onOpenChange={(o) => !o && setSheetOpen(null)}>
        <DialogContent className={bottomSheet}>
          <DialogHeader>
            <DialogTitle>Date</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Pill
              on={day === today}
              onClick={() => {
                setDay(today)
                setSheetOpen(null)
              }}
            >
              Today
            </Pill>
            <Pill
              on={day === addDays(today, -1)}
              onClick={() => {
                setDay(addDays(today, -1))
                setSheetOpen(null)
              }}
            >
              Yesterday
            </Pill>
          </div>
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            aria-label="Pick a date"
            className="h-11 rounded-md border bg-card px-3 text-sm"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Chip = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-11 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] transition-colors hover:bg-muted [&_svg]:size-4 [&_svg]:text-subtle-foreground"
  >
    {icon}
    {label}
  </button>
)

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
  <button
    type="button"
    aria-pressed={!!on}
    onClick={onClick}
    className={cn(
      "inline-flex h-11 items-center gap-1.5 rounded-full border bg-card px-4 text-sm text-subtle-foreground transition-[color,background-color,scale] duration-150 ease-out aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground motion-safe:active:scale-[0.97]",
      className
    )}
  >
    {children}
  </button>
)
