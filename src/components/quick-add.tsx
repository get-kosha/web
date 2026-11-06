import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { CategoryIcon } from "@/components/category-icon"
import { useMeta } from "@/components/shell"
import { deleteTransaction, saveTransaction, suggestPayees, type PayeeSuggestion } from "@/lib/api"
import { WALLET_KEY, startWallet } from "@/lib/add-defaults"
import { LOCALE, addDays, dayOf, fmt, guessCategory, isNeutral, parseAmount } from "@/lib/core"
import { parseQuickAdd } from "@/lib/quick-add"
import { cn } from "@/lib/utils"

/**
 * ⌘K quick add: one monospace line parsed live into a transaction.
 * No open/close animation: it's keyboard-driven and opened many times a day, so it must appear instantly.
 */
/** `initial` prefills the line, e.g. text carried over from search. */
export function QuickAdd({
  open,
  onOpenChange,
  initial = "",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: string
}) {
  // Esc while the category list is open closes the list, not the dialog.
  const pickingRef = useRef<(() => void) | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(o, d) => {
        if (!o && d.reason === "escape-key" && pickingRef.current) {
          d.cancel()
          pickingRef.current()
          return
        }
        onOpenChange(o)
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="data-open:animate-none data-closed:animate-none"
        className="top-[12vh] max-h-[calc(100svh-14vh)] translate-y-0 gap-0 overflow-y-auto rounded-2xl border p-0 ring-0 sm:max-w-[640px] data-open:animate-none data-closed:animate-none"
      >
        <DialogTitle className="sr-only">Quick add</DialogTitle>
        <Body key={initial} initial={initial} onDone={() => onOpenChange(false)} pickingRef={pickingRef} />
      </DialogContent>
    </Dialog>
  )
}

type Over = { amount?: string; payee?: string; categoryId?: string; walletId?: string; day?: string }

function Body({
  initial,
  onDone,
  pickingRef,
}: {
  initial: string
  onDone: () => void
  pickingRef: React.RefObject<(() => void) | null>
}) {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate()
  const today = dayOf(Date.now() / 1000, meta.tz)
  const [q, setQ] = useState(initial)
  const [over, setOver] = useState<Over>({})
  const [payees, setPayees] = useState<PayeeSuggestion[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const categoryButton = useRef<HTMLButtonElement>(null)

  const wallets = meta.wallets.filter((w) => !w.archived)
  const categories = useMemo(
    () => meta.categories.filter((c) => !c.archived && !c.parent_id && !isNeutral(c.id)),
    [meta.categories]
  )
  const p = parseQuickAdd(q, wallets, categories)

  // Payee suggestions follow the typed words, debounced.
  useEffect(() => {
    let live = true
    const t = setTimeout(
      () =>
        void suggestPayees({ data: { q: p.payee } })
          .then((r) => live && setPayees(r))
          .catch(() => {}),
      120
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [p.payee])

  const closePicker = () => {
    setPicking(false)
    categoryButton.current?.focus()
  }
  useEffect(() => {
    pickingRef.current = picking ? closePicker : null
  })

  // A typed payee that matches a past one becomes that payee, as a guess.
  const best = p.payee ? payees.find((x) => x.name.toLowerCase().includes(p.payee.toLowerCase())) : undefined
  const remembered = startWallet(meta.prefs.default_wallet, wallets)

  const payee = {
    value: over.payee ?? best?.name ?? p.payee,
    state: over.payee || (p.payee && !best) ? "set" : best ? "guess" : "missing",
  } as const
  // Settings › General › Suggest a category off: nothing is guessed, the category waits for you.
  const guessedCat =
    meta.prefs.suggest_category === "1" ? (guessCategory(payee.value, meta.rules) ?? best?.category_id) : undefined
  const categoryId =
    over.categoryId ??
    p.categoryId ??
    (guessedCat && categories.some((c) => c.id === guessedCat) ? guessedCat : undefined)
  const category = categories.find((c) => c.id === categoryId)
  const walletId = over.walletId ?? p.walletId ?? best?.wallet_id ?? remembered ?? wallets[0]?.id
  const wallet = meta.wallets.find((w) => w.id === walletId)
  const day = over.day ?? (p.date === "yesterday" ? addDays(today, -1) : today)

  const overAmount = over.amount !== undefined ? parseAmount(over.amount.replace(/^\+/, "")) : undefined
  const cents = overAmount !== undefined ? (overAmount === null ? null : Math.abs(overAmount)) : p.amount
  // With no amount typed yet, Add opens as Settings › General › Add opens as.
  const income =
    (over.amount !== undefined
      ? over.amount.trim().startsWith("+")
      : p.income || (p.amount === null && meta.prefs.add_kind === "income")) || category?.income === 1
  const signed = cents ? (income ? cents : -cents) : null
  const currency = wallet?.currency ?? meta.primary

  const states = {
    amount: cents ? "set" : "missing",
    category: over.categoryId || p.categoryId ? "set" : category ? "guess" : "missing",
    account: over.walletId || p.walletId ? "set" : "guess",
    day: over.day || p.date ? "set" : "guess",
  } as const

  const hint = !cents
    ? "Start with an amount, then a few words."
    : !category
      ? "No category yet: type one, or Tab to pick."
      : "Grey values are guesses from your history. Tab to change one."

  const searchTerm = (payee.value || q).trim()
  const searchActivity = () => {
    onDone()
    void navigate({ to: "/transactions", search: (s) => ({ ...s, q: searchTerm || undefined }) })
  }

  async function add() {
    if (busy) return
    if (!signed) return toast.error("Enter an amount")
    if (!category) return toast.error("Pick a category")
    if (!wallet) return toast.error("Add an account first")
    setBusy(true)
    try {
      const name = payee.value.trim()
      const { id } = await saveTransaction({
        data: { walletId: wallet.id, categoryId: category.id, name, note: "", amount: signed, day, paid: true },
      })
      try {
        localStorage.setItem(WALLET_KEY, wallet.id)
      } catch {}
      onDone()
      await router.invalidate()
      toast(`Added ${fmt(signed, currency)} · ${name || category.name}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await deleteTransaction({ data: { id } })
            await router.invalidate()
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add")
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          searchActivity()
        }
      }}
    >
      <label className="flex items-center gap-3 border-b px-[18px] py-4 text-muted-foreground">
        <PlusIcon aria-hidden="true" className="size-[18px] shrink-0" />
        <span className="sr-only">Type an amount, payee, category or account</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="29.57 dosaking dining visa"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent font-mono text-lg tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Kbd>esc</Kbd>
      </label>

      <div className="px-[18px] pt-4 pb-1.5">
        <div className="mb-2 text-xs text-muted-foreground">Will add</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[108px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_128px]">
          <Box label="Amount">
            <span className="flex items-baseline">
              <span
                aria-hidden="true"
                className={cn("num shrink-0", states.amount === "missing" && "text-muted-foreground")}
              >
                {income ? "+" : "−"}
                {fmt(0, currency).replace(/[\d.,\s]/g, "")}
              </span>
              <input
                aria-label="Amount"
                inputMode="decimal"
                value={over.amount ?? (cents ? (cents / 100).toFixed(2) : "")}
                onChange={(e) => setOver((o) => ({ ...o, amount: e.target.value }))}
                placeholder="—"
                className={cn(field, "num", states.amount === "missing" && "text-muted-foreground")}
              />
            </span>
          </Box>
          <Box label="Payee">
            <input
              aria-label="Payee"
              value={payee.value}
              onChange={(e) => setOver((o) => ({ ...o, payee: e.target.value }))}
              placeholder="Type a name"
              className={cn(field, payee.state === "guess" && "text-subtle-foreground")}
            />
          </Box>
          <Box label="Category">
            <button
              ref={categoryButton}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
              className={cn(
                field,
                "flex items-center gap-1.5 text-left",
                states.category === "guess" && "text-subtle-foreground",
                states.category === "missing" && "text-muted-foreground"
              )}
            >
              {category && <CategoryIcon icon={category.icon} className="size-4" />}
              <span className="truncate">{category?.name ?? "Pick one"}</span>
            </button>
          </Box>
          <Box label="Account">
            <select
              aria-label="Account"
              value={walletId ?? ""}
              onChange={(e) => setOver((o) => ({ ...o, walletId: e.target.value }))}
              className={cn(field, "appearance-none", states.account === "guess" && "text-subtle-foreground")}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Box>
          <Box label="Date">
            <input
              aria-label="Date"
              type="date"
              value={day}
              max={addDays(today, 366)}
              onChange={(e) => e.target.value && setOver((o) => ({ ...o, day: e.target.value }))}
              className={cn(
                field,
                "num [&::-webkit-calendar-picker-indicator]:hidden",
                states.day === "guess" && "text-subtle-foreground"
              )}
            />
            <span className="sr-only">
              {day === today ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { timeZone: "UTC" })}
            </span>
          </Box>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{hint}</span>
          <Button type="submit" size="lg" disabled={busy} className="gap-2.5 px-4">
            {income ? "Add income" : "Add expense"}
            {signed ? <span className="num font-normal opacity-80">{fmt(signed, currency)}</span> : null}
            <Kbd className="border-current bg-transparent text-current opacity-70">↵</Kbd>
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t px-1.5 py-2">
        {picking ? (
          <CategoryList
            categories={categories}
            onPick={(id) => {
              setOver((o) => ({ ...o, categoryId: id }))
              closePicker()
            }}
          />
        ) : (
          <>
            {payees.length > 0 && <Section>Payees</Section>}
            {payees.slice(0, 3).map((x) => {
              const c = meta.categories.find((c) => c.id === x.category_id)
              const w = meta.wallets.find((w) => w.id === x.wallet_id)
              return (
                <Option
                  key={x.name}
                  onClick={() =>
                    setOver((o) => ({
                      ...o,
                      payee: x.name,
                      categoryId: c && categories.includes(c) ? c.id : o.categoryId,
                      walletId: w && !w.archived ? w.id : o.walletId,
                    }))
                  }
                  end={
                    x.currency && (
                      <span className="num text-xs text-muted-foreground">
                        usually {fmt(Math.abs(x.avg), x.currency)}
                      </span>
                    )
                  }
                >
                  <span className="truncate">{x.name}</span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    · {c && <CategoryIcon icon={c.icon} className="size-3.5" />}
                    <span className="truncate">{[c?.name, w?.name].filter(Boolean).join(" · ")}</span>
                  </span>
                </Option>
              )
            })}
            <Section>Go to</Section>
            <Option onClick={searchActivity} end={<Kbd>⌘↵</Kbd>}>
              <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">Search activity for “{searchTerm || "…"}”</span>
            </Option>
            <Option
              onClick={() => {
                onDone()
                void navigate({ to: "/subscriptions" })
              }}
            >
              <ArrowsClockwiseIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span>Make this recurring…</span>
            </Option>
          </>
        )}
      </div>
    </form>
  )
}

const field =
  "h-6 w-full min-w-0 truncate rounded-sm bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"

function Box({ label, children }: { label: string; children: ReactNode }) {
  // The whole box shows focus for whichever control sits inside it.
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border px-3 py-2.5 transition-colors focus-within:border-ring focus-within:bg-muted/50">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd className={cn("rounded-sm border bg-card px-1.5 font-mono text-[11px] text-muted-foreground", className)}>
    {children}
  </kbd>
)

const Section = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">{children}</div>
)

function Option({ children, end, onClick }: { children: ReactNode; end?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      {end}
    </button>
  )
}

/** Searchable category list: type to filter, ↑/↓ to move, Enter to pick. */
function CategoryList({
  categories,
  onPick,
}: {
  categories: { id: string; name: string; icon: string | null; uses: number }[]
  onPick: (id: string) => void
}) {
  const [filter, setFilter] = useState("")
  const [active, setActive] = useState(0)
  const shown = categories
    .filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => b.uses - a.uses) // most used recently first
  const current = shown[Math.min(active, shown.length - 1)]
  return (
    <div>
      <input
        autoFocus
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))))
          } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            if (current) onPick(current.id)
          }
        }}
        role="combobox"
        aria-expanded="true"
        aria-controls="qa-categories"
        aria-activedescendant={current ? `qa-cat-${current.id}` : undefined}
        aria-label="Find a category"
        placeholder="Find a category"
        className="h-10 w-full rounded-md bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div id="qa-categories" role="listbox" aria-label="Categories" className="max-h-56 overflow-y-auto">
        {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No category matches.</p>}
        {shown.map((c) => (
          <div
            key={c.id}
            id={`qa-cat-${c.id}`}
            role="option"
            aria-selected={c === current}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c.id)}
            className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm aria-selected:bg-muted"
          >
            <CategoryIcon icon={c.icon} />
            {c.name}
          </div>
        ))}
      </div>
    </div>
  )
}
