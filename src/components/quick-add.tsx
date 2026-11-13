import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowsClockwiseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ReceiptIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AiMark, imageIn, readReceipt, useAiCategory } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker, TimePicker, dayLabel } from "@/components/date-time"
import { useMeta } from "@/components/shell"
import { readEntry, suggestPayees, type AiEntry, type PayeeSuggestion } from "@/lib/api"
import { addTransaction } from "@/lib/offline"
import { WALLET_KEY, decimalMark, startWallet } from "@/lib/add-defaults"
import { addDays, dayOf, eventFor, fmt, guessCategory, inCurrency, isNeutral, parseAmount, timeOf } from "@/lib/core"
import { needsAi, parseQuickAdd } from "@/lib/quick-add"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/**
 * Quick add parses one monospace line into a transaction as you type. It has no open or close
 * animation because it is keyboard-driven and opened many times a day, so it must appear instantly.
 * `initial` prefills the line, e.g. text carried over from search.
 */
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
  // "Add another" starts a fresh line by remounting the body.
  const [round, setRound] = useState(0)
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
        <DialogTitle className="sr-only">{m.add_quick_title()}</DialogTitle>
        <Body
          key={`${initial}:${round}`}
          initial={initial}
          onDone={(again) => (again ? setRound((r) => r + 1) : onOpenChange(false))}
          pickingRef={pickingRef}
        />
      </DialogContent>
    </Dialog>
  )
}

type Over = {
  amount?: string
  payee?: string
  categoryId?: string
  walletId?: string
  day?: string
  time?: string
  note?: string
  tags?: string[]
}

function Body({
  initial,
  onDone,
  pickingRef,
}: {
  initial: string
  /** `again` keeps quick add open for the next entry. */
  onDone: (again?: boolean) => void
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
  const fileInput = useRef<HTMLInputElement>(null)
  // Natural-language add: AI's reading of the line, kept only while the line is the one it read.
  const [read, setRead] = useState<{ q: string; entry: AiEntry } | null>(null)
  const [reading, setReading] = useState<"line" | "receipt" | null>(null)
  const [fromReceipt, setFromReceipt] = useState(false)
  const [dropping, setDropping] = useState(false)

  const wallets = meta.wallets.filter((w) => !w.archived)
  const categories = useMemo(
    () => meta.categories.filter((c) => !c.archived && !c.parent_id && !isNeutral(c.id)),
    [meta.categories]
  )
  const p = parseQuickAdd(q, wallets, categories)
  // Settings › General › Suggest a category off means no guessed category, from history or from AI.
  const guessing = meta.prefs.suggest_category === "1"

  // A sentence the local parser can't explain goes to AI once typing pauses. A short line stays instant.
  const askAi = meta.ai.quick_add && needsAi(q, p)
  useEffect(() => {
    if (!askAi || read?.q === q) return
    let live = true
    const t = setTimeout(() => {
      setReading("line")
      readEntry({ data: { text: q } })
        .then((entry) => live && setRead({ q, entry }))
        .catch(() => {}) // without an answer, the local parse stands
        .finally(() => live && setReading((r) => (r === "line" ? null : r)))
    }, 650)
    return () => {
      live = false
      clearTimeout(t)
      setReading((r) => (r === "line" ? null : r))
    }
  }, [q, askAi])
  const ai = read && read.q === q ? read.entry : null

  // Payee suggestions follow the typed words (or the payee AI read), debounced.
  const lookup = ai?.payee || p.payee
  useEffect(() => {
    let live = true
    const t = setTimeout(
      () =>
        void suggestPayees({ data: { q: lookup } })
          .then((r) => live && setPayees(r))
          .catch(() => {}),
      120
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [lookup])

  const closePicker = () => {
    setPicking(false)
    categoryButton.current?.focus()
  }
  useEffect(() => {
    pickingRef.current = picking ? closePicker : null
  })

  // A typed payee that matches a past one becomes that payee, as a guess.
  const best = lookup ? payees.find((x) => x.name.toLowerCase().includes(lookup.toLowerCase())) : undefined
  const remembered = startWallet(meta.prefs.default_wallet, wallets)

  const payee = {
    value: over.payee ?? best?.name ?? ai?.payee ?? p.payee,
    state: over.payee || (p.payee && !best && !ai?.payee) ? "set" : best || ai?.payee ? "guess" : "missing",
  } as const
  const fits = (id: string | null | undefined) => (id && categories.some((c) => c.id === id) ? id : undefined)
  // Guesses in order: a payee rule, the payee's history, then the category AI read from the line.
  const guessedCat = guessing
    ? (fits(guessCategory(payee.value, meta.rules)) ?? fits(best?.category_id) ?? fits(ai?.categoryId))
    : undefined
  // The direction as typed, before the category's own type has a say.
  const typedIncome =
    over.amount !== undefined
      ? over.amount.trim().startsWith("+")
      : ai?.amount
        ? ai.income
        : p.income || (p.amount === null && meta.prefs.add_kind === "income")
  // Auto-categorise: only for a payee nothing else could place.
  const aiCat = useAiCategory(
    payee.value,
    typedIncome ? "income" : "expense",
    meta.ai.categorise && !over.categoryId && !p.categoryId && !guessedCat && !reading
  )
  const categoryId = over.categoryId ?? p.categoryId ?? guessedCat ?? fits(aiCat.id)
  const category = categories.find((c) => c.id === categoryId)
  const suggested = !!category && category.id === aiCat.id && !over.categoryId && !p.categoryId && !guessedCat
  const walletId = over.walletId ?? p.walletId ?? ai?.walletId ?? best?.wallet_id ?? remembered ?? wallets[0]?.id
  const wallet = meta.wallets.find((w) => w.id === walletId)
  const currency = wallet?.currency ?? meta.primary
  const fitted = ai ? inCurrency(ai, currency, meta.rates) : null
  const day = over.day ?? ai?.day ?? (p.date === "yesterday" ? addDays(today, -1) : today)
  // Shows now until you change it. Untouched on today, the server stamps the exact moment.
  const time = over.time ?? ai?.time ?? timeOf(Date.now() / 1000, meta.tz)
  const note = over.note ?? fitted?.note ?? ""
  const tags = [...new Set([...p.tags, ...(ai?.tags ?? []), ...(over.tags ?? [])])]
  // The server files a new entry under the event its day falls in, so show that event here.
  const event = meta.events.find((e) => e.id === eventFor(day, meta.events))

  const overAmount = over.amount !== undefined ? parseAmount(over.amount.replace(/^\+/, "")) : undefined
  const cents =
    overAmount !== undefined ? (overAmount === null ? null : Math.abs(overAmount)) : (fitted?.amount ?? p.amount)
  const income = typedIncome || category?.income === 1
  const signed = cents ? (income ? cents : -cents) : null

  const states = {
    amount: over.amount !== undefined || (cents && !fitted?.amount) ? "set" : cents ? "guess" : "missing",
    category: over.categoryId || p.categoryId ? "set" : category ? "guess" : "missing",
    account: over.walletId || p.walletId ? "set" : "guess",
    day: over.day || p.date ? "set" : "guess",
    time: over.time ? "set" : "guess",
  } as const

  const hint =
    reading === "receipt"
      ? m.add_hint_reading_receipt()
      : !cents
        ? reading === "line"
          ? m.add_hint_reading_line()
          : meta.ai.receipts
            ? m.add_hint_start_receipt()
            : m.add_hint_start()
        : !category
          ? aiCat.loading
            ? m.add_hint_finding_category()
            : m.add_hint_no_category()
          : suggested
            ? m.add_hint_suggested({ category: category.name })
            : ai || fromReceipt
              ? m.add_hint_guesses()
              : m.add_hint_guesses_history()

  // Receipt scanning: a photo fills every field it can, as if typed in by hand.
  async function scan(file: File) {
    if (reading === "receipt") return
    setReading("receipt")
    try {
      const e = await readReceipt(file)
      const w = wallets.find((x) => x.id === (e.walletId ?? walletId))
      const fit = inCurrency(e, w?.currency ?? currency, meta.rates)
      setOver((o) => ({
        ...o,
        ...(fit.amount && {
          amount: `${e.income ? "+" : ""}${(fit.amount / 100).toFixed(2).replace(".", decimalMark())}`,
        }),
        ...(e.payee && { payee: e.payee }),
        ...(guessing && fits(e.categoryId) && { categoryId: e.categoryId! }),
        ...(w && { walletId: w.id }),
        ...(e.day && { day: e.day }),
        ...(e.time && { time: e.time }),
        ...(fit.note && { note: fit.note }),
        ...(e.tags.length && { tags: e.tags }),
      }))
      setFromReceipt(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.add_error_receipt())
    } finally {
      setReading(null)
    }
  }

  const searchTerm = (payee.value || q).trim()
  const searchActivity = () => {
    onDone()
    void navigate({ to: "/transactions", search: { q: searchTerm || undefined } })
  }

  async function add(again = false) {
    if (busy) return
    if (!signed) return toast.error(m.add_error_amount())
    if (!category) return toast.error(m.add_error_category())
    if (!wallet) return toast.error(m.add_error_no_account())
    setBusy(true)
    try {
      const name = payee.value.trim()
      const { queued, undo } = await addTransaction(meta.user.id, {
        walletId: wallet.id,
        categoryId: category.id,
        name,
        note,
        amount: signed,
        day,
        time: over.time ?? ai?.time ?? (day === today ? undefined : time),
        paid: true,
        tags,
      })
      try {
        localStorage.setItem(WALLET_KEY, wallet.id)
      } catch {}
      onDone(again)
      if (!queued) await router.invalidate()
      const msg = queued ? m.add_toast_saved_offline : m.add_toast_added
      toast(msg({ amount: fmt(signed, currency), name: name || category.name }), {
        action: {
          label: m.common_undo(),
          onClick: async () => {
            await undo()
            if (!queued) await router.invalidate()
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.add_error_add())
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
      {...(meta.ai.receipts && {
        onPaste: (e: React.ClipboardEvent) => {
          const file = imageIn(e.clipboardData)
          if (!file) return
          e.preventDefault()
          void scan(file)
        },
        onDragOver: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes("Files")) return
          e.preventDefault()
          setDropping(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        },
        onDrop: (e: React.DragEvent) => {
          const file = imageIn(e.dataTransfer)
          setDropping(false)
          if (!file) return
          e.preventDefault()
          void scan(file)
        },
      })}
      className={cn(
        "relative",
        dropping &&
          "after:pointer-events-none after:absolute after:inset-1.5 after:rounded-xl after:border-2 after:border-dashed after:border-brand"
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          searchActivity()
        } else if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault()
          void add(true)
        }
      }}
    >
      <label className="flex items-center gap-3 border-b px-[18px] py-4 text-muted-foreground">
        <PlusIcon aria-hidden="true" className="size-[18px] shrink-0" />
        <span className="sr-only">{m.add_quick_input_label()}</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={meta.ai.quick_add ? m.add_quick_placeholder_ai() : m.add_quick_placeholder()}
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent font-mono text-lg tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {reading === "line" && (
          <SpinnerGapIcon aria-hidden="true" className="size-4 shrink-0 animate-spin text-brand" />
        )}
        {meta.ai.receipts && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) void scan(file)
              }}
            />
            <button
              type="button"
              aria-label={m.add_scan_receipt()}
              title={m.add_scan_receipt_hint()}
              disabled={reading === "receipt"}
              onClick={() => fileInput.current?.click()}
              className="-my-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:size-11"
            >
              {reading === "receipt" ? (
                <SpinnerGapIcon className="size-[18px] animate-spin text-brand" />
              ) : (
                <ReceiptIcon className="size-[18px]" />
              )}
            </button>
          </>
        )}
        <Kbd>esc</Kbd>
      </label>

      <div className="px-[18px] pt-4 pb-1.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {m.add_will_add()}
          {(ai || fromReceipt) && (
            <span className="inline-flex items-center gap-1 text-subtle-foreground">
              · <AiMark className="size-3" /> {fromReceipt ? m.add_read_from_receipt() : m.add_read_by_ai()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[100px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_104px_72px]">
          <Box label={m.add_amount()}>
            <span className="flex items-baseline">
              <span
                aria-hidden="true"
                className={cn("num shrink-0", states.amount === "missing" && "text-muted-foreground")}
              >
                {income ? "+" : "−"}
                {fmt(0, currency).replace(/[\d.,\s]/g, "")}
              </span>
              <input
                aria-label={m.add_amount()}
                inputMode="decimal"
                value={over.amount ?? (cents ? (cents / 100).toFixed(2).replace(".", decimalMark()) : "")}
                onChange={(e) => setOver((o) => ({ ...o, amount: e.target.value }))}
                placeholder="—"
                className={cn(
                  field,
                  "num",
                  states.amount === "missing" && "text-muted-foreground",
                  states.amount === "guess" && "text-subtle-foreground"
                )}
              />
            </span>
          </Box>
          <Box label={m.add_payee()}>
            <input
              aria-label={m.add_payee()}
              value={payee.value}
              onChange={(e) => setOver((o) => ({ ...o, payee: e.target.value }))}
              placeholder={m.add_payee_placeholder()}
              className={cn(field, payee.state === "guess" && "text-subtle-foreground")}
            />
          </Box>
          <Box
            label={
              <>
                {m.add_category()} {suggested && <AiMark className="size-2.5" />}
              </>
            }
          >
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
              <span className="truncate">
                {category?.name ?? (aiCat.loading ? m.add_finding_one() : m.add_pick_one())}
              </span>
            </button>
          </Box>
          <Box label={m.add_account()}>
            <Select
              items={wallets.map((w) => ({ value: w.id, label: w.name }))}
              value={walletId ?? ""}
              onValueChange={(v) => v && setOver((o) => ({ ...o, walletId: v as string }))}
            >
              <SelectTrigger
                aria-label={m.add_account()}
                className={cn(
                  field,
                  "h-6 w-full border-0 p-0 dark:bg-transparent dark:hover:bg-transparent [&>svg]:hidden",
                  states.account === "guess" && "text-subtle-foreground"
                )}
              >
                <SelectValue className="block min-w-0 truncate" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
          <Box label={m.add_date()}>
            <DatePicker
              aria-label={m.add_date()}
              value={day}
              max={addDays(today, 366)}
              onChange={(d) => setOver((o) => ({ ...o, day: d }))}
              className={cn(field, "num text-left", states.day === "guess" && "text-subtle-foreground")}
            >
              {day === today ? m.add_today() : dayLabel(day)}
            </DatePicker>
          </Box>
          <Box label={m.add_time()}>
            <TimePicker
              aria-label={m.add_time()}
              value={time}
              onChange={(t) => setOver((o) => ({ ...o, time: t }))}
              className={cn(field, "num text-left", states.time === "guess" && "text-subtle-foreground")}
            >
              {time}
            </TimePicker>
          </Box>
        </div>
        {(note || tags.length > 0 || event) && (
          <p className="mt-2.5 text-xs text-muted-foreground">
            {[
              note && m.add_note_line({ note }),
              tags.map((t) => `#${t}`).join(" "),
              event && m.add_goes_to_event({ event: event.name }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{hint}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={busy}
              className="gap-2.5 px-3"
              onClick={() => add(true)}
            >
              {m.add_another()}
              <Kbd>⇧↵</Kbd>
            </Button>
            <Button type="submit" size="lg" disabled={busy} className="gap-2.5 px-4">
              {income ? m.add_add_income() : m.add_add_expense()}
              {signed ? <span className="num font-normal opacity-80">{fmt(signed, currency)}</span> : null}
              <Kbd className="border-current bg-transparent text-current opacity-70">↵</Kbd>
            </Button>
          </div>
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
            {payees.length > 0 && <Section>{m.add_section_payees()}</Section>}
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
                        {m.add_usually({ amount: fmt(Math.abs(x.usual), x.currency) })}
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
            <Section>{m.add_section_go_to()}</Section>
            <Option onClick={searchActivity} end={<Kbd>⌘↵</Kbd>}>
              <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{m.add_search_activity({ term: searchTerm || "…" })}</span>
            </Option>
            <Option
              onClick={() => {
                onDone()
                void navigate({ to: "/subscriptions" })
              }}
            >
              <ArrowsClockwiseIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span>{m.add_make_recurring()}</span>
            </Option>
          </>
        )}
      </div>
    </form>
  )
}

const field =
  "h-6 w-full min-w-0 truncate rounded-sm bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"

function Box({ label, children }: { label: ReactNode; children: ReactNode }) {
  // The whole box shows focus for whichever control sits inside it.
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border px-3 py-2.5 transition-colors focus-within:border-ring focus-within:bg-muted/50">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">{label}</span>
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

/** Searchable category list. Type to filter, use the arrow keys to move and press Enter to pick. */
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
        aria-label={m.add_find_category()}
        placeholder={m.add_find_category()}
        className="h-10 w-full rounded-md bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div id="qa-categories" role="listbox" aria-label={m.add_categories()} className="max-h-56 overflow-y-auto">
        {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{m.add_no_category_match()}</p>}
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
