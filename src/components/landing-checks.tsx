// The landing page's later chapters: statements and reconciling, accounts, and AI and the API. Like
// landing-demos.tsx, each mock runs the app's own pure code on invented data and never calls the server.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, CopyIcon, FileTextIcon, LinkSimpleIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { AiMark } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { Meta, RATES, Rolling, appWindow, mockButton, mockPrimary, out, sum } from "@/components/landing-demos"
import { Switch } from "@/components/ui/switch"
import { convert, exchange, fmt, intlLocale, redactForAi, type AiShares } from "@/lib/core"
import { differenceHints, payeeFor, starterCategory } from "@/lib/statement"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
// Names are message functions, called while rendering so each visit gets its own language.
const STARTERS: Record<string, { name: () => string; icon: string }> = {
  groceries: { name: m.landing_cat_groceries, icon: "ph:shopping-cart" },
  dining: { name: m.landing_cat_dining, icon: "ph:fork-knife" },
  bills: { name: m.landing_cat_bills, icon: "ph:lightning" },
  transit: { name: m.landing_cat_transit, icon: "ph:train" },
  entertainment: { name: m.landing_cat_entertainment, icon: "ph:film-slate" },
  salary: { name: m.landing_cat_salary, icon: "ph:briefcase" },
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
      <ul
        className="flex flex-wrap gap-1.5 border-b px-4 py-3 @min-[480px]:px-5"
        aria-label={m.landing_import_files_label()}
      >
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
              <span className="truncate text-xs text-muted-foreground">{l.category?.name()}</span>
            </span>
            <span className={cn("num text-[13px] @max-[559px]:hidden", l.amount > 0 && "text-positive")}>
              {l.amount > 0 ? `+${fmt(l.amount, "eur")}` : out(-l.amount)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-auto grid grid-cols-3 gap-3 border-t bg-muted/50 px-4 py-3.5 text-xs @min-[480px]:px-5">
        {[
          [m.landing_import_accounts(), m.landing_import_accounts_value()],
          [m.landing_import_overlaps(), m.landing_import_overlaps_value()],
          [m.landing_import_transfers(), m.landing_import_transfers_value()],
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
const fee = (): Rec => ({ id: "fee", day: "2026-10-31", name: m.landing_entry_account_fee(), amount: -500 })
const STATEMENT_DAY = "2026-10-31"
const entryList = (): Rec[] => [
  { id: "salary", day: "2026-10-01", name: "Northwind Ltd", amount: 420000 },
  { id: "rent", day: "2026-10-01", name: m.landing_entry_rent(), amount: -124000 },
  { id: "spotify", day: "2026-10-06", name: "Spotify", amount: -1099 },
  { id: "tesco", day: "2026-10-09", name: "Tesco", amount: -3421 },
  { id: "pizza", day: "2026-10-14", name: "Pizza Hut", amount: -2490 },
  { id: "netflix", day: "2026-10-17", name: "Netflix", amount: -1399 },
  { id: "octopus", day: "2026-10-22", name: "Octopus Energy", amount: -8640 },
  { id: "savings", day: "2026-10-28", name: m.landing_entry_to_savings(), amount: -40000 },
]
const signed = (cents: number) => (cents < 0 ? out(-cents) : fmt(cents, "eur"))
const dayFormat = (): Intl.DateTimeFormatOptions => ({ day: "numeric", month: "short", timeZone: "UTC" })
const noon = (day: string) => new Date(`${day}T12:00:00Z`)
const shortDay = (day: string) => noon(day).toLocaleDateString(intlLocale(), dayFormat())
/** A rate or price to four decimals, in the visitor's number format. */
const four = (n: number, currency?: string) =>
  n.toLocaleString(intlLocale(), {
    minimumFractionDigits: 4,
    ...(currency && { style: "currency", currency: currency.toUpperCase() }),
  })

export function ReconcileDemo() {
  const hintsRef = useRef<HTMLDivElement>(null)
  const finishRef = useRef<HTMLButtonElement>(null)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [fixed, setFixed] = useState<Record<string, number>>({})
  const [feeAdded, setFeeAdded] = useState(false)
  const [done, setDone] = useState(false)
  const entries = [...entryList(), ...(feeAdded ? [fee()] : [])].map((e) => ({ ...e, amount: fixed[e.id] ?? e.amount }))
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
    if (unticked.has(e.id)) return { label: m.landing_reconcile_tick({ name: e.name }), run: () => toggle(e.id) }
    if (e.id === "tesco" && e.amount === -3421 && diff === -900)
      return {
        label: m.landing_reconcile_change_to({ amount: out(4321) }),
        run: () => setFixed({ ...fixed, tesco: -4321 }),
      }
    return null
  }
  // The button a visitor pressed goes away, so focus moves to what comes next: the hints, then Finish.
  useEffect(() => {
    if (feeAdded) hintsRef.current?.focus()
  }, [feeAdded])
  useEffect(() => {
    if (fixed.tesco) finishRef.current?.focus()
  }, [fixed])

  const reset = () => {
    setUnticked(new Set())
    setFixed({})
    setFeeAdded(false)
    setDone(false)
  }

  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 @min-[480px]:px-5">
        <div>
          <p className="text-sm font-medium">{m.landing_account_current()}</p>
          <p className="text-xs text-muted-foreground">
            {done
              ? m.landing_reconcile_reconciled_to({ day: shortDay(STATEMENT_DAY) })
              : m.landing_reconcile_statement_to({ day: shortDay(STATEMENT_DAY) })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{m.landing_reconcile_statement_balance()}</p>
          <p className="num mt-0.5 rounded-md border px-2.5 py-1 text-sm">{fmt(STATEMENT, "eur")}</p>
        </div>
      </div>

      <ul className="py-1" aria-label={m.landing_reconcile_entries_label()}>
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

      {!feeAdded && (
        <div className="border-t px-4 py-3 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">{m.landing_reconcile_missing()}</p>
          <div className="mt-1.5 flex min-h-11 items-center gap-3 text-[13px]">
            <span className="w-[18px] shrink-0" />
            <span className="num w-12 shrink-0 text-xs text-muted-foreground">{shortDay(STATEMENT_DAY)}</span>
            <span className="min-w-0 flex-1 truncate">{m.landing_entry_account_fee()}</span>
            <span className="num">{out(500)}</span>
            <button type="button" onClick={() => setFeeAdded(true)} className={cn(mockButton, "h-8")}>
              {m.landing_reconcile_add_it()}
            </button>
          </div>
        </div>
      )}

      {!done && diff !== 0 && (
        <div ref={hintsRef} tabIndex={-1} className="mx-3 mb-3 rounded-xl bg-muted p-3.5" aria-live="polite">
          <p className="text-xs font-medium">{m.landing_reconcile_hints_title()}</p>
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
          <p className="text-muted-foreground">{m.landing_reconcile_statement()}</p>
          <p className="num mt-1 truncate text-sm">{fmt(STATEMENT, "eur")}</p>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground">{m.landing_reconcile_ticked()}</p>
          <p className="num mt-1 truncate text-sm">
            <Rolling cents={cleared} currency="eur" />
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground">{m.landing_reconcile_difference()}</p>
          <p className={cn("num mt-1 truncate text-sm", diff ? "text-warning" : "text-positive")}>
            <Rolling cents={diff} currency="eur" />
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {done
            ? m.landing_reconcile_done_note()
            : diff
              ? m.landing_reconcile_tick_note()
              : m.landing_reconcile_adds_up()}
        </p>
        {done ? (
          <button type="button" onClick={reset} className={mockButton}>
            {m.common_undo()}
          </button>
        ) : (
          <button
            ref={finishRef}
            type="button"
            disabled={diff !== 0}
            onClick={() => setDone(true)}
            className={mockPrimary}
          >
            {m.landing_reconcile_finish()}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Statements: recurring payments, spotted ----------

const SPOTTED = [
  { id: "gym", name: "PureGym", payments: 7, amount: 3499 },
  { id: "icloud", name: "iCloud+", payments: 12, amount: 299 },
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
                    m.landing_spotted_made({ count: s.payments })
                  ) : (
                    <>
                      <span>{m.landing_spotted_every_month()}</span>
                      <span>{m.landing_spotted_payments({ count: s.payments })}</span>
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
                {on ? m.common_undo() : m.landing_spotted_make()}
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
const accounts = (): { group: string; items: DemoAccount[] }[] => [
  {
    group: m.landing_networth_group_bank(),
    items: [
      { name: m.landing_account_current(), type: "bank", currency: "eur", balance: 481240 },
      { name: m.landing_account_savings_uk(), type: "bank", currency: "gbp", balance: 1265000 },
      { name: "Wise", type: "bank", currency: "usd", balance: 193015 },
    ],
  },
  {
    group: m.landing_networth_group_credit(),
    items: [{ name: m.landing_account_visa(), type: "credit", currency: "eur", balance: 141230, limit: 600000 }],
  },
  {
    group: m.landing_networth_group_investments(),
    items: [
      { name: m.landing_account_index_fund(), type: "investment", currency: "eur", balance: 3800000, gain: 512500 },
      { name: m.landing_account_us_shares(), type: "investment", currency: "usd", balance: 2150000, gain: 318000 },
    ],
  },
]
const worth = (a: DemoAccount) => (a.type === "credit" ? -a.balance : a.balance + (a.gain ?? 0))
const DISPLAY = [
  { key: "eur", title: m.landing_networth_in_eur },
  { key: "usd", title: m.landing_networth_in_usd },
  { key: "gbp", title: m.landing_networth_in_gbp },
]
const percent = (n: number) => n.toLocaleString(intlLocale(), { style: "percent", maximumFractionDigits: 1 })

/**
 * Net worth as the chapter's big figure, with the display-currency switch beside it, over the accounts
 * list. The figure and every converted line follow one switch.
 */
export function NetWorthDemo() {
  const [currency, setCurrency] = useState("eur")
  const groups = accounts()
  const all = groups.flatMap((g) => g.items)
  const total = sum(all.map((a) => convert(worth(a), a.currency, currency, RATES)))
  const eurGbp = RATES.gbp / RATES.eur

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[15px] text-subtle-foreground">{DISPLAY.find((d) => d.key === currency)!.title()}</p>
          <div className="cents-muted mt-2 font-display text-[clamp(3rem,7vw,6rem)] leading-[0.95] font-bold tracking-[-0.04em] tabular-nums">
            <Rolling cents={total} currency={currency} />
          </div>
        </div>
        <div
          role="group"
          aria-label={m.landing_networth_show_in()}
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
          {groups.map((g) => (
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
                            ? m.landing_networth_credit_used({
                                percent: percent(Math.round((a.balance / a.limit!) * 100) / 100),
                                limit: fmt(a.limit!, a.currency),
                              })
                            : (a.type === "bank" ? m.landing_networth_bank_meta : m.landing_networth_investment_meta)({
                                currency: a.currency.toUpperCase(),
                              })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right whitespace-nowrap">
                        <div className="num">{local < 0 ? out(-local, a.currency) : fmt(local, a.currency)}</div>
                        {a.gain ? (
                          <div className="num text-xs text-positive">
                            +{fmt(a.gain, a.currency)}, {percent(a.gain / a.balance)}
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
          {m.landing_networth_rates({
            rate: `${(1).toLocaleString(intlLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} = ${four(eurGbp, "gbp")}`,
          })}
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
        <span className="truncate font-medium">
          {m.landing_exchange_route({ from: m.landing_account_current(), to: m.landing_account_savings_uk() })}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {m.landing_exchange_when({ day: shortDay("2026-11-12") })}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 text-xs @min-[520px]:grid-cols-6">
        {[
          ["sent", m.landing_exchange_sent(), fmt(50255, "eur")],
          ["fee", m.landing_exchange_fee(), fmt(255, "eur")],
          ["received", m.landing_exchange_received(), fmt(42175, "gbp")],
          ["rate", m.landing_exchange_rate(), four(SWAP.rate)],
          ["market", m.landing_exchange_market(), four(SWAP.marketRate!)],
          ["cost", m.landing_exchange_cost(), fmt(Math.round(SWAP.totalCost), "eur")],
        ].map(([k, label, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              className={cn(
                "num mt-1 truncate text-sm",
                k === "market" && "text-muted-foreground",
                k === "cost" && "text-warning"
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
const transfers = (): { day: string; rows: { account: string; text: string }[]; fee?: string }[] => [
  {
    day: "2026-11-02",
    rows: [
      { account: m.landing_account_current(), text: out(118000) },
      { account: m.landing_account_visa(), text: `+${fmt(118000, "eur")}` },
    ],
  },
  {
    day: "2026-10-28",
    rows: [
      { account: m.landing_account_current(), text: out(40000) },
      { account: m.landing_account_index_fund(), text: `+${fmt(40000, "eur")}` },
    ],
  },
  {
    day: "2026-11-12",
    rows: [
      { account: m.landing_account_current(), text: out(50000) },
      { account: m.landing_account_savings_uk(), text: `+${fmt(42175, "gbp")}` },
    ],
    fee: out(255),
  },
]

export function TransferDemo() {
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      {transfers().map((t) => (
        <div key={t.day} className="border-b px-2 py-2">
          {t.rows.map((r, i) => (
            <div key={r.account} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {i === 0 ? (
                  <CategoryIcon icon="ph:arrows-left-right" className="size-4" />
                ) : (
                  <LinkSimpleIcon className="size-4 text-subtle-foreground" aria-label={m.landing_transfer_linked()} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.account}</span>
                <Meta>
                  <span>{m.landing_transfer_label()}</span>
                  <span>{shortDay(t.day)}</span>
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
                <span className="block truncate">{m.landing_transfer_fee()}</span>
                <Meta>
                  <span>{m.landing_transfer_fee_counts()}</span>
                </Meta>
              </span>
              <span className="num shrink-0">{t.fee}</span>
            </div>
          )}
        </div>
      ))}
      <p className="mt-auto border-t bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        {m.landing_transfer_note()}
      </p>
    </div>
  )
}

/** An event: everything added between its dates, totalled. */
export function TripDemo() {
  const parts = [
    { name: m.landing_cat_travel(), icon: "ph:airplane-tilt", cents: 58000 },
    { name: m.landing_cat_dining(), icon: "ph:fork-knife", cents: 12450 },
    { name: m.landing_cat_other(), icon: "ph:shopping-bag", cents: 3810 },
  ]
  const total = sum(parts.map((p) => p.cents))
  return (
    <div className={cn(appWindow, "flex h-full flex-col px-4 py-4 @min-[480px]:px-5")}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">{m.landing_trip_name()}</span>
        <span className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat(intlLocale(), dayFormat()).formatRange(noon("2026-10-12"), noon("2026-10-16"))}
        </span>
      </div>
      <p className="num mt-2 text-2xl tracking-[-0.03em]">{fmt(total, "eur")}</p>
      <p className="text-xs text-muted-foreground">{m.landing_trip_entries({ count: 23 })}</p>
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

const sampleTx = () => ({
  payee: "Pizza Hut",
  amount: -2490,
  currency: "eur",
  day: "2026-11-14",
  note: m.landing_ai_sample_note(),
  account: m.landing_account_visa(),
})
const SHARES: { key: keyof AiShares; label: () => string }[] = [
  { key: "payee", label: m.landing_ai_share_payee },
  { key: "amount", label: m.landing_ai_share_amount },
  { key: "date", label: m.landing_ai_share_date },
  { key: "note", label: m.landing_ai_share_note },
  { key: "account", label: m.landing_ai_share_account },
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
  const sent = JSON.stringify(redactForAi(sampleTx(), shares, "demo"), null, 2)
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="px-4 py-4 @min-[480px]:px-5">
        <p className="text-[13px] font-medium">{m.landing_ai_sees_heading()}</p>
        <ul className="mt-2 divide-y">
          {SHARES.map((s) => (
            <li key={s.key}>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                {s.label()}
                <Switch
                  checked={shares[s.key]}
                  onCheckedChange={(v) => setShares({ ...shares, [s.key]: v })}
                  aria-label={s.label()}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-1 flex-col border-t bg-muted/50 px-4 py-4 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">{m.landing_ai_sent_for({ payee: "Pizza Hut" })}</p>
        <pre
          tabIndex={0}
          aria-label={m.landing_ai_request_label()}
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
      () => toast(m.landing_api_copied()),
      () => toast.error(m.landing_api_copy_failed())
    )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-chalk/10 bg-chalk/[0.04] text-chalk">
      <div className="flex items-center justify-between gap-3 border-b border-chalk/10 px-4 py-3 sm:px-5">
        <div
          role="group"
          aria-label={m.landing_api_interface()}
          className="inline-flex rounded-md bg-chalk/[0.06] p-0.5"
        >
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
          <CopyIcon className="size-3.5" aria-hidden="true" />{" "}
          {tab === "mcp" ? m.landing_api_copy_url() : m.landing_api_copy_request()}
        </button>
      </div>
      {tab === "mcp" ? (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Code label={m.landing_api_custom_connector()}>{MCP_URL}</Code>
          <Code label={m.landing_api_tool_call()}>{MCP_CALL}</Code>
          <Code label={m.landing_api_result()}>{MCP_REPLY}</Code>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Code label={m.landing_api_request()}>{REST}</Code>
          <Code label={m.landing_api_response()}>{REST_REPLY}</Code>
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
