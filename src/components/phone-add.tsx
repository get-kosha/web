import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { BackspaceIcon, CalendarBlankIcon, CreditCardIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CategoryIcon } from "@/components/category-icon"
import { TransactionForm } from "@/components/transaction-form"
import { segment, segmentButton, useMeta } from "@/components/shell"
import { deleteTransaction, saveTransaction, suggestPayees, type PayeeSuggestion } from "@/lib/api"
import { LOCALE, addDays, dayOf, fmt, guessCategory, isNeutral } from "@/lib/core"
import { cn } from "@/lib/utils"

type Kind = "expense" | "income" | "transfer"
const WALLET_KEY = "kosha:wallet" // shared with TransactionForm and quick add: the last account used

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

// Bottom sheet: the Dialog popup pinned to the bottom edge, sliding up with the drawer curve.
const sheet =
  "top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-none ease-drawer data-open:duration-300 data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:data-open:slide-in-from-bottom-0 md:data-closed:slide-out-to-bottom-0"

export function PhoneAdd() {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate()
  const today = dayOf(Date.now() / 1000, meta.tz)
  const wallets = meta.wallets.filter((w) => !w.archived)
  const [kind, setKind] = useState<Kind>("expense")
  const [amount, setAmount] = useState("")
  const [payee, setPayee] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "")
  // The last account used; read after mount so server and client render the same first frame.
  useEffect(() => {
    try {
      const last = localStorage.getItem(WALLET_KEY)
      if (last && meta.wallets.some((w) => w.id === last && !w.archived)) setWalletId(last)
    } catch {
      // storage unavailable: keep the first account
    }
  }, [meta.wallets])
  const [day, setDay] = useState(today)
  const [sheetOpen, setSheetOpen] = useState<"account" | "date" | "category" | null>(null)
  const [match, setMatch] = useState<PayeeSuggestion | null>(null)
  const [saving, setSaving] = useState(false)

  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0]
  const currency = wallet?.currency ?? meta.primary
  const cents = Math.round(Number(amount || "0") * 100)
  const signed = kind === "income" ? cents : -cents

  // The payee's past: usual amount, category and account.
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
    match && candidates.some((c) => c.id === match.category_id) ? match.category_id : guessCategory(payee, meta.rules)
  const pills = useMemo(() => {
    const top = [...candidates].sort((a, b) => b.uses - a.uses)
    const first = usual ? top.filter((c) => c.id === usual) : []
    return [...first, ...top.filter((c) => c.id !== usual)].slice(0, 3)
  }, [candidates, usual])
  const chosen = categoryId ?? usual ?? null
  const chosenCat = meta.categories.find((c) => c.id === chosen)
  const pillsShown = chosenCat && !pills.some((c) => c.id === chosenCat.id) ? [chosenCat, ...pills.slice(0, 2)] : pills

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
        data: { walletId: wallet.id, categoryId: chosen, name, note: "", amount: signed, day, paid: true },
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add")
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
        <TransactionForm big preset={{ amount: cents || undefined }} onDone={() => navigate({ to: "/" })} />
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
              Category{usual ? " · this payee’s usual first" : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              {pillsShown.map((c) => (
                <Pill key={c.id} on={c.id === chosen} onClick={() => setCategoryId(c.id)}>
                  <CategoryIcon icon={c.icon} className={cn("size-4", c.id === chosen && "text-primary-foreground")} />{" "}
                  {c.name}
                </Pill>
              ))}
              <Pill onClick={() => setSheetOpen("category")} className="text-muted-foreground">
                More…
              </Pill>
            </div>
          </div>

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
        <DialogContent className={sheet}>
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
        <DialogContent className={sheet}>
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

      <Dialog open={sheetOpen === "category"} onOpenChange={(o) => !o && setSheetOpen(null)}>
        <DialogContent className={sheet}>
          <DialogHeader>
            <DialogTitle>Category</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60svh] grid-cols-3 gap-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === chosen}
                onClick={() => {
                  setCategoryId(c.id)
                  setSheetOpen(null)
                }}
                className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 text-xs text-subtle-foreground transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              >
                <CategoryIcon icon={c.icon} className="size-5" />
                <span className="line-clamp-1">{c.name}</span>
              </button>
            ))}
          </div>
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
