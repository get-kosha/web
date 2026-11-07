// The landing page's later chapters: statements and reconciling, accounts, and AI and the API. Like
// landing-demos.tsx, each mock runs the app's own pure code on invented data and never calls the server.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, CopyIcon, FileTextIcon, LinkSimpleIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { AiMark } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { Meta, RATES, Rolling, appWindow, mockButton, mockPrimary, out, sum } from "@/components/landing-demos"
import { Switch } from "@/components/ui/switch"
import { convert, exchange, fmt, redactForAi, type AiShares } from "@/lib/core"
import { differenceHints, payeeFor, starterCategory } from "@/lib/statement"
import { cn } from "@/lib/utils"

// ---------- Statements: bank text becomes payees ----------

const FILES = [
  { name: "current-nov.csv" },
  { name: "visa-nov.ofx" },
  { name: "savings-2026.qfx" },
  { name: "wise-nov.pdf", ai: true },
]
const BANK_LINES = [
  { text: "CARD PAYMENT TO TESCO STORES 3211 ON 03 NOV", amount: -4321 },
  { text: "PAYPAL *SPOTIFY P2B91C", amount: -1099 },
  { text: "DD OCTOPUS ENERGY 88213041", amount: -8640 },
  { text: "CONTACTLESS PRET A MANGER LONDON GB", amount: -895 },
  { text: "CARD PAYMENT TO TRAINLINE.COM ON 07 NOV", amount: -5750 },
  { text: "DIRECT DEBIT VODAFONE LTD 7731", amount: -2499 },
  { text: "FASTER PAYMENT FROM NORTHWIND LTD SALARY NOV", amount: 420000 },
]
/** Payees this person already has, so a bank's longer name lands on the one they use. */
const KNOWN = ["Tesco", "Northwind Ltd"]
const STARTERS: Record<string, { name: string; icon: string }> = {
  groceries: { name: "Groceries", icon: "ph:shopping-cart" },
  dining: { name: "Dining", icon: "ph:fork-knife" },
  bills: { name: "Bills", icon: "ph:lightning" },
  transit: { name: "Transit", icon: "ph:train" },
  entertainment: { name: "Entertainment", icon: "ph:film-slate" },
  salary: { name: "Salary", icon: "ph:briefcase" },
}
const HAVE = new Set(Object.keys(STARTERS))
const IMPORTED = BANK_LINES.map((l) => ({
  ...l,
  payee: payeeFor(l.text, KNOWN, {}),
  category: STARTERS[starterCategory(l.text, l.amount > 0, HAVE) ?? ""],
}))

export function ImportDemo() {
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <ul className="flex flex-wrap gap-1.5 border-b px-4 py-3 @min-[480px]:px-5" aria-label="Statement files">
        {FILES.map((f) => (
          <li
            key={f.name}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 font-mono text-[11px]"
          >
            <FileTextIcon className="size-3.5 text-subtle-foreground" aria-hidden="true" />
            {f.name}
            {f.ai && <AiMark className="size-3" />}
          </li>
        ))}
      </ul>
      <ul className="divide-y">
        {IMPORTED.map((l) => (
          <li
            key={l.text}
            className="grid min-h-14 items-center gap-x-3 gap-y-1 px-4 py-2.5 @min-[480px]:px-5 @min-[560px]:grid-cols-[minmax(0,1fr)_16px_minmax(0,0.85fr)_auto]"
          >
            <span className="truncate font-mono text-[11px] text-muted-foreground">{l.text}</span>
            <ArrowRightIcon className="size-3.5 text-muted-foreground @max-[559px]:hidden" aria-hidden="true" />
            <span className="flex min-w-0 items-center gap-2 text-[13px]">
              <CategoryIcon icon={l.category?.icon} className="size-4" />
              <span className="truncate">{l.payee}</span>
              <span className="truncate text-xs text-muted-foreground">{l.category?.name}</span>
            </span>
            <span className={cn("num text-[13px] @max-[559px]:hidden", l.amount > 0 && "text-positive")}>
              {l.amount > 0 ? `+${fmt(l.amount, "eur")}` : out(-l.amount)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-auto grid grid-cols-3 gap-3 border-t bg-muted/50 px-4 py-3.5 text-xs @min-[480px]:px-5">
        {[
          ["Accounts", "4, by account number"],
          ["Overlaps", "9 lines counted once"],
          ["Transfers", "4 pairs linked"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ---------- Statements: reconciling, with the bookkeeper's checks ----------

type Rec = { id: string; day: string; name: string; amount: number }
const OPENING = 51240
/**
 * The bank's closing balance. It includes an account fee Kosha doesn't have yet, and Kosha has Tesco as
 * −34.21 where the receipt said −43.21: add the fee and the digits hint appears.
 */
const STATEMENT = 288791
const FEE: Rec = { id: "fee", day: "2026-10-31", name: "Account fee", amount: -500 }
const STATEMENT_DAY = "2026-10-31"
const ENTRIES: Rec[] = [
  { id: "salary", day: "2026-10-01", name: "Northwind Ltd", amount: 420000 },
  { id: "rent", day: "2026-10-01", name: "Rent", amount: -124000 },
  { id: "spotify", day: "2026-10-06", name: "Spotify", amount: -1099 },
  { id: "tesco", day: "2026-10-09", name: "Tesco", amount: -3421 },
  { id: "pizza", day: "2026-10-14", name: "Pizza Hut", amount: -2490 },
  { id: "netflix", day: "2026-10-17", name: "Netflix", amount: -1399 },
  { id: "octopus", day: "2026-10-22", name: "Octopus Energy", amount: -8640 },
  { id: "savings", day: "2026-10-28", name: "To Savings", amount: -40000 },
]
const signed = (cents: number) => (cents < 0 ? out(-cents) : fmt(cents, "eur"))
const shortDay = (day: string) => `${Number(day.slice(8))} Oct`

export function ReconcileDemo() {
  const hintsRef = useRef<HTMLDivElement>(null)
  const finishRef = useRef<HTMLButtonElement>(null)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [fixed, setFixed] = useState<Record<string, number>>({})
  const [fee, setFee] = useState(false)
  const [done, setDone] = useState(false)
  const entries = [...ENTRIES, ...(fee ? [FEE] : [])].map((e) => ({ ...e, amount: fixed[e.id] ?? e.amount }))
  const ticked = entries.filter((e) => !unticked.has(e.id))
  const left = entries.filter((e) => unticked.has(e.id))
  const cleared = OPENING + sum(ticked.map((e) => e.amount))
  const diff = STATEMENT - cleared
  const hints = differenceHints(diff, ticked, left, STATEMENT_DAY, signed).slice(0, 2)
  const pointed = new Set(hints.flatMap((h) => h.ids))

  const toggle = (id: string) =>
    setUnticked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  /** What a hint's button does: tick an entry it names, or take the amount the digits suggest. */
  const action = (ids: string[]) => {
    if (ids.length !== 1) return null
    const e = entries.find((x) => x.id === ids[0])!
    if (unticked.has(e.id)) return { label: `Tick ${e.name}`, run: () => toggle(e.id) }
    if (e.id === "tesco" && e.amount === -3421 && diff === -900)
      return { label: `Change to ${out(4321)}`, run: () => setFixed({ ...fixed, tesco: -4321 }) }
    return null
  }
  // The button a visitor pressed goes away, so focus moves to what comes next: the hints, then Finish.
  useEffect(() => {
    if (fee) hintsRef.current?.focus()
  }, [fee])
  useEffect(() => {
    if (fixed.tesco) finishRef.current?.focus()
  }, [fixed])

  const reset = () => {
    setUnticked(new Set())
    setFixed({})
    setFee(false)
    setDone(false)
  }

  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 @min-[480px]:px-5">
        <div>
          <p className="text-sm font-medium">Current account</p>
          <p className="text-xs text-muted-foreground">{done ? "Reconciled to 31 Oct" : "Statement to 31 Oct"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Statement balance</p>
          <p className="num mt-0.5 rounded-md border px-2.5 py-1 text-sm">{fmt(STATEMENT, "eur")}</p>
        </div>
      </div>

      <ul className="py-1" aria-label="Entries in October">
        {entries.map((e) => {
          const on = !unticked.has(e.id)
          return (
            <li key={e.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={done}
                onClick={() => toggle(e.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 px-4 text-left text-[13px] transition-colors hover:bg-muted/60 disabled:hover:bg-transparent @min-[480px]:px-5",
                  pointed.has(e.id) && !done && "bg-warning/10 hover:bg-warning/15"
                )}
              >
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                    on && "border-foreground bg-foreground text-background",
                    done && "border-positive bg-positive"
                  )}
                  aria-hidden="true"
                >
                  {on && <CheckIcon weight="bold" className="size-3" />}
                </span>
                <span className="num w-12 shrink-0 text-xs text-muted-foreground">{shortDay(e.day)}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span
                  key={e.amount}
                  data-flash={fixed[e.id] || e.id === "fee" ? "" : undefined}
                  className={cn("num rounded px-1", e.amount > 0 && "text-positive")}
                >
                  {signed(e.amount)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {!fee && (
        <div className="border-t px-4 py-3 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">On the statement, not in Kosha</p>
          <div className="mt-1.5 flex min-h-11 items-center gap-3 text-[13px]">
            <span className="w-[18px] shrink-0" />
            <span className="num w-12 shrink-0 text-xs text-muted-foreground">31 Oct</span>
            <span className="min-w-0 flex-1 truncate">Account fee</span>
            <span className="num">{out(500)}</span>
            <button type="button" onClick={() => setFee(true)} className={cn(mockButton, "h-8")}>
              Add it
            </button>
          </div>
        </div>
      )}

      {!done && diff !== 0 && (
        <div ref={hintsRef} tabIndex={-1} className="mx-3 mb-3 rounded-xl bg-muted p-3.5" aria-live="polite">
          <p className="text-xs font-medium">Finding the difference</p>
          <ul className="mt-2 flex flex-col gap-2">
            {hints.map((h) => {
              const a = action(h.ids)
              return (
                <li key={h.text} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] leading-snug">
                  <span className="min-w-0 flex-1 basis-60 text-pretty">{h.text}</span>
                  {a && (
                    <button type="button" onClick={a.run} className={mockButton}>
                      {a.label}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-auto grid grid-cols-3 gap-3 border-t px-4 py-3.5 text-xs @min-[480px]:px-5">
        <div className="min-w-0">
          <p className="text-muted-foreground">Statement</p>
          <p className="num mt-1 truncate text-sm">{fmt(STATEMENT, "eur")}</p>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground">Ticked in Kosha</p>
          <p className="num mt-1 truncate text-sm">
            <Rolling cents={cleared} currency="eur" />
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground">Difference</p>
          <p className={cn("num mt-1 truncate text-sm", diff ? "text-warning" : "text-positive")}>
            <Rolling cents={diff} currency="eur" />
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {done
            ? "Kosha warns before you change a reconciled entry."
            : diff
              ? "Tick what's on the statement."
              : "It adds up."}
        </p>
        {done ? (
          <button type="button" onClick={reset} className={mockButton}>
            Undo
          </button>
        ) : (
          <button
            ref={finishRef}
            type="button"
            disabled={diff !== 0}
            onClick={() => setDone(true)}
            className={mockPrimary}
          >
            Finish reconciling
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Statements: recurring payments, spotted ----------

const SPOTTED = [
  { id: "gym", name: "PureGym", every: "Every month", payments: 7, amount: 3499 },
  { id: "icloud", name: "iCloud+", every: "Every month", payments: 12, amount: 299 },
]

export function SpottedDemo() {
  const [made, setMade] = useState<Set<string>>(new Set())
  return (
    <div className={cn(appWindow, "h-full")}>
      <ul className="divide-y">
        {SPOTTED.map((s) => {
          const on = made.has(s.id)
          return (
            <li key={s.id} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 @min-[480px]:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{s.name}</span>
                <Meta>
                  {on ? (
                    `Recurring now, with its ${s.payments} past payments`
                  ) : (
                    <>
                      <span>{s.every}</span>
                      <span>{s.payments} payments</span>
                    </>
                  )}
                </Meta>
              </span>
              <span className="num text-sm">{out(s.amount)}</span>
              <button
                type="button"
                onClick={() =>
                  setMade((m) => {
                    const n = new Set(m)
                    if (on) n.delete(s.id)
                    else n.add(s.id)
                    return n
                  })
                }
                className={cn(on ? mockButton : mockPrimary, "@max-[420px]:w-full")}
              >
                {on ? "Undo" : "Make recurring"}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- Accounts: one net worth across currencies ----------

type DemoAccount = {
  name: string
  type: "bank" | "credit" | "investment"
  currency: string
  /** Bank: the balance. Credit: what is owed. Investment: money put in. */
  balance: number
  gain?: number
  limit?: number
}
const ACCOUNTS: { group: string; items: DemoAccount[] }[] = [
  {
    group: "Bank and cash",
    items: [
      { name: "Current account", type: "bank", currency: "eur", balance: 481240 },
      { name: "Savings in the UK", type: "bank", currency: "gbp", balance: 1265000 },
      { name: "Wise", type: "bank", currency: "usd", balance: 193015 },
    ],
  },
  {
    group: "Credit cards",
    items: [{ name: "Visa Card", type: "credit", currency: "eur", balance: 141230, limit: 600000 }],
  },
  {
    group: "Investments",
    items: [
      { name: "Index fund", type: "investment", currency: "eur", balance: 3800000, gain: 512500 },
      { name: "US shares", type: "investment", currency: "usd", balance: 2150000, gain: 318000 },
    ],
  },
]
const worth = (a: DemoAccount) => (a.type === "credit" ? -a.balance : a.balance + (a.gain ?? 0))
const DISPLAY = [
  { key: "eur", name: "euros" },
  { key: "usd", name: "US dollars" },
  { key: "gbp", name: "pounds" },
]

/**
 * Net worth as the chapter's big figure, with the display-currency switch beside it, over the accounts
 * list. The figure and every converted line follow one switch.
 */
export function NetWorthDemo() {
  const [currency, setCurrency] = useState("eur")
  const all = ACCOUNTS.flatMap((g) => g.items)
  const total = sum(all.map((a) => convert(worth(a), a.currency, currency, RATES)))
  const eurGbp = RATES.gbp / RATES.eur

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[15px] text-subtle-foreground">
            Net worth, in {DISPLAY.find((d) => d.key === currency)!.name}
          </p>
          <div className="cents-muted mt-2 font-display text-[clamp(3rem,7vw,6rem)] leading-[0.95] font-bold tracking-[-0.04em] tabular-nums">
            <Rolling cents={total} currency={currency} />
          </div>
        </div>
        <div
          role="group"
          aria-label="Show totals in"
          className="inline-flex rounded-xl border border-foreground/15 p-1"
        >
          {DISPLAY.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={currency === d.key}
              onClick={() => setCurrency(d.key)}
              className="h-10 min-w-14 rounded-lg px-3 text-sm font-medium text-subtle-foreground uppercase transition-colors hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background max-md:h-11"
            >
              {d.key}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(appWindow, "flex flex-1 flex-col")}>
        <div className="divide-y">
          {ACCOUNTS.map((g) => (
            <div key={g.group} className="px-4 py-3 @min-[480px]:px-5">
              <p className="text-xs text-muted-foreground">{g.group}</p>
              <ul className="mt-1">
                {g.items.map((a) => {
                  const local = worth(a)
                  const shown = convert(local, a.currency, currency, RATES)
                  return (
                    <li key={a.name} className="flex min-h-12 items-center gap-3 py-1.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{a.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.type === "credit"
                            ? `${Math.round((a.balance / a.limit!) * 100)}% of ${fmt(a.limit!, a.currency)} used`
                            : `${a.type === "bank" ? "Bank" : "Investment"}, ${a.currency.toUpperCase()}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right whitespace-nowrap">
                        <div className="num">{local < 0 ? out(-local, a.currency) : fmt(local, a.currency)}</div>
                        {a.gain ? (
                          <div className="num text-xs text-positive">
                            +{fmt(a.gain, a.currency)}, {Math.round((a.gain / a.balance) * 1000) / 10}%
                          </div>
                        ) : null}
                        {a.currency !== currency && (
                          <div className="num text-xs text-muted-foreground">
                            ≈ {shown < 0 && "−"}
                            <Rolling cents={Math.abs(shown)} currency={currency} />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="num mt-auto border-t px-4 py-3 text-xs text-muted-foreground @min-[480px]:px-5">
          €1 = £{eurGbp.toFixed(4)}, rates updated today
        </p>
      </div>
    </div>
  )
}

// The 12 Nov exchange through Wise: €502.55 left the account, €2.55 of it a fee, the rest arrived as pounds.
const SWAP = exchange(-50255, -255, 42175, 0.8478)

/** What an exchange through Wise cost against the market rate, worked out as the app does. */
export function ExchangeDemo() {
  return (
    <div className={cn(appWindow, "px-4 py-4 @min-[480px]:px-5")}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="truncate font-medium">Current account to Savings in the UK</span>
        <span className="shrink-0 text-xs text-muted-foreground">12 Nov, via Wise</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 text-xs @min-[520px]:grid-cols-6">
        {[
          ["Sent", fmt(50255, "eur")],
          ["Fee", fmt(255, "eur")],
          ["Received", fmt(42175, "gbp")],
          ["Rate", SWAP.rate.toFixed(4)],
          ["Market", SWAP.marketRate!.toFixed(4)],
          ["Cost", fmt(Math.round(SWAP.totalCost), "eur")],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className={cn(
                "num mt-1 truncate text-sm",
                k === "Market" && "text-muted-foreground",
                k === "Cost" && "text-warning"
              )}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Transfers: two linked rows each, one out and one in, and an exchange's fee as its own expense. */
const TRANSFERS: { day: string; rows: { account: string; text: string }[]; fee?: string }[] = [
  {
    day: "2 Nov",
    rows: [
      { account: "Current account", text: "−€1,180.00" },
      { account: "Visa Card", text: "+€1,180.00" },
    ],
  },
  {
    day: "28 Oct",
    rows: [
      { account: "Current account", text: "−€400.00" },
      { account: "Index fund", text: "+€400.00" },
    ],
  },
  {
    day: "12 Nov",
    rows: [
      { account: "Current account", text: "−€500.00" },
      { account: "Savings in the UK", text: "+£421.75" },
    ],
    fee: "−€2.55",
  },
]

export function TransferDemo() {
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      {TRANSFERS.map((t) => (
        <div key={t.day} className="border-b px-2 py-2">
          {t.rows.map((r, i) => (
            <div key={r.account} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {i === 0 ? (
                  <CategoryIcon icon="ph:arrows-left-right" className="size-4" />
                ) : (
                  <LinkSimpleIcon className="size-4 text-subtle-foreground" aria-label="Linked to the row above" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.account}</span>
                <Meta>
                  <span>Transfer</span>
                  <span>{t.day}</span>
                </Meta>
              </span>
              <span className={cn("num shrink-0", i === 1 && "text-positive")}>{r.text}</span>
            </div>
          ))}
          {t.fee && (
            <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <CategoryIcon icon="ph:receipt" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">Transfer fee</span>
                <Meta>
                  <span>Counts as spending</span>
                </Meta>
              </span>
              <span className="num shrink-0">{t.fee}</span>
            </div>
          )}
        </div>
      ))}
      <p className="mt-auto border-t bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        Paying off a card and moving savings stay out of income and spending. Only the fee counts.
      </p>
    </div>
  )
}

/** An event: everything added between its dates, totalled. */
export function TripDemo() {
  const parts = [
    { name: "Travel", icon: "ph:airplane-tilt", cents: 58000 },
    { name: "Dining", icon: "ph:fork-knife", cents: 12450 },
    { name: "Other", icon: "ph:shopping-bag", cents: 3810 },
  ]
  const total = sum(parts.map((p) => p.cents))
  return (
    <div className={cn(appWindow, "flex h-full flex-col px-4 py-4 @min-[480px]:px-5")}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">Lisbon</span>
        <span className="text-xs text-muted-foreground">12 to 16 Oct</span>
      </div>
      <p className="num mt-2 text-2xl tracking-[-0.03em]">{fmt(total, "eur")}</p>
      <p className="text-xs text-muted-foreground">23 entries</p>
      <ul className="mt-4 flex flex-col border-t text-[13px]">
        {[
          ["Hotel Lis", 30400],
          ["TAP Air Portugal", 21840],
          ["Comboios de Portugal", 3920],
          ["Time Out Market", 4620],
          ["Pastéis de Belém", 1180],
        ].map(([name, cents]) => (
          <li key={name} className="flex min-h-9 items-center justify-between gap-3 border-b">
            <span className="truncate">{name}</span>
            <span className="num shrink-0 text-xs text-muted-foreground">{out(cents as number)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {parts.map((p, i) => (
            <span
              key={p.name}
              className={cn("h-full", ["bg-chart-2", "bg-chart-3", "bg-chart-4"][i])}
              style={{ width: `${(p.cents / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-xs">
          {parts.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <CategoryIcon icon={p.icon} className="size-3.5" />
              <span className="flex-1">{p.name}</span>
              <span className="num">{fmt(p.cents, "eur")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------- AI: what it can see ----------

const SAMPLE_TX = {
  payee: "Pizza Hut",
  amount: -2490,
  currency: "eur",
  day: "2026-11-14",
  note: "Sam's birthday",
  account: "Visa Card",
}
const SHARES: { key: keyof AiShares; label: string }[] = [
  { key: "payee", label: "Payee names" },
  { key: "amount", label: "Amounts" },
  { key: "date", label: "Exact dates" },
  { key: "note", label: "Notes" },
  { key: "account", label: "Account names" },
]

export function AiSeesDemo() {
  // The app's defaults: payee names, amounts and dates on; notes and account names off.
  const [shares, setShares] = useState<AiShares>({
    payee: true,
    amount: true,
    date: true,
    note: false,
    account: false,
  })
  const sent = JSON.stringify(redactForAi(SAMPLE_TX, shares, "demo"), null, 2)
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="px-4 py-4 @min-[480px]:px-5">
        <p className="text-[13px] font-medium">What AI can see</p>
        <ul className="mt-2 divide-y">
          {SHARES.map((s) => (
            <li key={s.key}>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                {s.label}
                <Switch
                  checked={shares[s.key]}
                  onCheckedChange={(v) => setShares({ ...shares, [s.key]: v })}
                  aria-label={s.label}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-1 flex-col border-t bg-muted/50 px-4 py-4 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">Sent for a Pizza Hut payment</p>
        <pre
          tabIndex={0}
          aria-label="What the request contains"
          aria-live="polite"
          className="mt-2 flex-1 overflow-x-auto rounded-lg bg-card px-3.5 py-3 font-mono text-[12px] leading-relaxed"
        >
          {sent}
        </pre>
      </div>
    </div>
  )
}

// ---------- AI: the API and MCP server ----------

const REST = `curl https://getkosha.app/api/v1/transactions \\
  -H "Authorization: Bearer kosha_…" \\
  -H "Content-Type: application/json" \\
  -d '{"transactions":[{"accountId":"main",
       "payee":"Tesco","amount":-2350}]}'`
const REST_REPLY = `{ "transactions": [{
    "day": "2026-11-18", "payee": "Tesco",
    "amount": -2350, "currency": "eur",
    "categoryName": "Groceries", "status": "paid" }] }`
const MCP_URL = "https://getkosha.app/mcp"
const MCP_CALL = `search_transactions
{ "query": "tesco",
  "from": "2026-01-01", "to": "2026-11-18" }`
const MCP_REPLY = `{ "total": 31, "totals": [{ "currency": "eur",
    "spent": -133672, "received": 0 }] }`

export function ApiDemo() {
  const [tab, setTab] = useState<"mcp" | "rest">("mcp")
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast("Copied"),
      () => toast.error("Couldn't copy. Select the text instead.")
    )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-chalk/10 bg-chalk/[0.04] text-chalk">
      <div className="flex items-center justify-between gap-3 border-b border-chalk/10 px-4 py-3 sm:px-5">
        <div role="group" aria-label="Interface" className="inline-flex rounded-md bg-chalk/[0.06] p-0.5">
          {(
            [
              ["mcp", "MCP"],
              ["rest", "REST"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className="h-8 rounded-[6px] px-3 text-xs text-chalk/60 transition-colors hover:text-chalk aria-pressed:bg-chalk/12 aria-pressed:text-chalk max-md:h-11"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => copy(tab === "mcp" ? MCP_URL : REST)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-chalk/70 transition-colors hover:bg-chalk/10 hover:text-chalk max-md:h-11"
        >
          <CopyIcon className="size-3.5" aria-hidden="true" /> {tab === "mcp" ? "Copy connector URL" : "Copy request"}
        </button>
      </div>
      {tab === "mcp" ? (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Code label="Custom connector">{MCP_URL}</Code>
          <Code label="Tool call">{MCP_CALL}</Code>
          <Code label="Result">{MCP_REPLY}</Code>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Code label="Request">{REST}</Code>
          <Code label="Response">{REST_REPLY}</Code>
        </div>
      )}
    </div>
  )
}

function Code({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-chalk/55">{label}</p>
      <pre
        tabIndex={0}
        aria-label={label}
        className="mt-1.5 overflow-x-auto rounded-lg bg-ink-deep/60 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-chalk/90"
      >
        {children}
      </pre>
    </div>
  )
}
