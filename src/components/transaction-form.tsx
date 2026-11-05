import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { ArrowDownIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { deleteTransaction, saveTransaction, saveTransfer, type Tx, type Wallet } from "@/lib/api"
import {
  CORRECTION_CATEGORY,
  convert,
  dayOf,
  exchange,
  fmt,
  fmtRate,
  guessCategory,
  isNeutral,
  parseAmount,
} from "@/lib/core"
import { cn } from "@/lib/utils"

const WALLET_KEY = "kosha:wallet"
type Mode = "expense" | "income" | "transfer"

/** Initial state for editing either half of a transfer: always shown as from → to, total sent including the fee. */
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

/**
 * Add or edit a transaction or transfer.
 * `preset` starts a new transfer into `transferTo` (e.g. paying off a card) with `amount` cents prefilled.
 */
export function TransactionForm({
  initial,
  onDone,
  big,
  preset,
}: {
  initial?: Tx
  onDone?: () => void
  big?: boolean
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
    sides || (!initial && preset?.transferTo) ? "transfer" : initial && initial.amount > 0 ? "income" : "expense"
  )
  const [amount, setAmount] = useState(
    sides ? cents2(sides.sent) : initial ? cents2(initial.amount) : preset?.amount ? cents2(preset.amount) : ""
  )
  // Exchange details. Either the rate or the received amount is typed; the other follows.
  const [fee, setFee] = useState(sides?.fee ? cents2(sides.fee) : "")
  const [provider, setProvider] = useState(initial?.provider ?? "")
  const [rateText, setRateText] = useState("")
  const [received, setReceived] = useState(sides ? cents2(sides.received) : "")
  const [fxInput, setFxInput] = useState<"rate" | "received" | null>(sides ? "received" : null)
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
  const [paid, setPaid] = useState(initial ? !!initial.paid : true)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const income = mode === "income"
  const transfer = mode === "transfer"

  // Remember the last used account for quick entry.
  useEffect(() => {
    if (initial) return
    try {
      const saved = localStorage.getItem(WALLET_KEY)
      if (saved && saved !== presetTo && activeWallets.some((w) => w.id === saved)) setWalletId(saved)
    } catch {}
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
  const crossCurrency = transfer && !!wallet && !!toWallet && wallet.currency !== toWallet.currency
  const feeCents = transfer ? Math.abs(parseAmount(fee) ?? 0) : 0
  const converted = Math.abs(cents ?? 0) - feeCents
  const market = crossCurrency ? convert(100, wallet.currency, toWallet.currency, meta.rates) / 100 : 1
  const typedRate = Number(rateText.replace(",", "."))
  const receivedCents = !crossCurrency
    ? converted
    : fxInput === "received"
      ? Math.abs(parseAmount(received) ?? 0)
      : Math.round(converted * (fxInput === "rate" ? typedRate || 0 : market))
  const rate = crossCurrency && converted > 0 ? receivedCents / converted : 1
  const fx = exchange(Math.abs(cents ?? 0), feeCents, receivedCents, crossCurrency ? market : null)

  function onName(v: string) {
    setName(v)
    if (categoryTouched) return
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
      if (converted <= 0) return toast.error("The fee must be less than the amount")
      if (!receivedCents) return toast.error("Enter the amount received")
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
            fee: feeCents,
            received: receivedCents,
            provider,
            day,
            note,
          },
        })
        toast.success(`${fmt(Math.abs(cents), wallet?.currency ?? meta.primary)} · ${wallet?.name} → ${toWallet?.name}`)
      } else {
        const signed = Math.abs(cents) * (income ? 1 : -1)
        // Switching an existing transfer to expense/income: replace it.
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
            paid,
          },
        })
        const cat = meta.categories.find((c) => c.id === categoryId)
        toast.success(`${fmt(signed, wallet?.currency ?? meta.primary)} · ${name || cat?.name}`)
      }
      try {
        localStorage.setItem(WALLET_KEY, walletId)
      } catch {}
      await router.invalidate()
      if (initial) onDone?.()
      else {
        setAmount("")
        setReceived("")
        setRateText("")
        setFee("")
        setFxInput(null)
        setName("")
        setNote("")
        setCategoryTouched(false)
        amountRef.current?.focus()
        onDone?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save")
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
      toast.error(err instanceof Error ? err.message : "Could not delete")
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
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
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value || today)}
          className="rounded-md bg-transparent text-sm text-muted-foreground outline-none"
          aria-label="Date"
        />
      </div>

      <label className="flex flex-col items-center gap-1">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{wallet?.currency}</span>
        <input
          ref={amountRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!initial}
          aria-label="Amount"
          className={cn(
            "num w-full min-w-0 bg-transparent text-center font-semibold tracking-tight outline-none",
            big ? "text-6xl" : "text-5xl",
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
          <div className="grid gap-3 rounded-lg border p-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  Fee <span className="uppercase">({wallet?.currency})</span>
                </span>
                <Input
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  inputMode="decimal"
                  className="num h-9"
                  aria-label="Fee"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Via</span>
                <Input
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  list="kosha-providers"
                  className="h-9"
                  aria-label="Provider"
                />
                <datalist id="kosha-providers">
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
            </div>
            {crossCurrency && (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Rate · 1 {wallet.currency.toUpperCase()} =</span>
                  <Input
                    value={fxInput === "rate" ? rateText : fmtRate(rate)}
                    onChange={(e) => {
                      setRateText(e.target.value)
                      setFxInput("rate")
                    }}
                    inputMode="decimal"
                    className="num h-9"
                    aria-label="Exchange rate"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    Received <span className="uppercase">({toWallet.currency})</span>
                  </span>
                  <Input
                    value={fxInput === "received" ? received : receivedCents ? cents2(receivedCents) : ""}
                    onChange={(e) => {
                      setReceived(e.target.value)
                      setFxInput("received")
                    }}
                    inputMode="decimal"
                    className="num h-9"
                    aria-label="Amount received"
                  />
                </label>
              </div>
            )}
            {(feeCents > 0 || crossCurrency) && converted > 0 && (
              <p className="num text-xs text-muted-foreground">
                {fmt(converted, wallet?.currency ?? meta.primary)}{" "}
                {crossCurrency ? `converted → ${fmt(receivedCents, toWallet.currency)}` : "arrives"}
                {crossCurrency && ` · market ≈ ${fmtRate(market)}`}
                {fx.totalCost > 0.5 &&
                  ` · costs ${fmt(fx.totalCost, wallet?.currency ?? meta.primary)} (${fx.costPct.toFixed(2)}%)`}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Moves money between your accounts. Not counted as spending or income; the fee is.
          </p>
        </>
      ) : (
        <>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Title</span>
            <Input
              value={name}
              onChange={(e) => onName(e.target.value)}
              list="kosha-titles"
              autoComplete="off"
              className="h-10"
            />
          </label>
          <datalist id="kosha-titles">
            {meta.titles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id)
                  setCategoryTouched(true)
                }}
                aria-pressed={c.id === categoryId}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border border-transparent px-1 py-2.5 text-[11px] leading-tight text-muted-foreground transition-colors hover:bg-muted",
                  c.id === categoryId && "border-foreground bg-muted text-foreground"
                )}
              >
                <CategoryIcon icon={c.icon} className={cn("size-5", c.id === categoryId && "text-foreground")} />
                <span className="line-clamp-1 w-full text-center">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Note (optional)</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-10" />
      </label>

      {initial && !initial.paid && !transfer && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid
        </label>
      )}

      <div
        className={cn(
          "flex gap-2",
          big && "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] bg-background py-2 md:bottom-0"
        )}
      >
        {initial && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
        <Button type="submit" disabled={busy || !cents} className="h-11 flex-1 text-base">
          {initial ? "Save" : `Add ${mode}`}
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{initial?.transfer_id ? "Delete this transfer?" : "Delete this transaction?"}</DialogTitle>
            {initial?.transfer_id && <DialogDescription>It is removed from both accounts.</DialogDescription>}
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
