// Live mockups of the app for the landing page. They run the app's own parsing and money code on
// invented data, so a visitor can try them without an account. Nothing here talks to the server.
// Every mock agrees on one "today": Wednesday 18 November 2026.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import NumberFlow from "@number-flow/react"
import {
  ArrowRightIcon,
  BackspaceIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CopyIcon,
  CreditCardIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/category-icon"
import { KoshaMark } from "@/components/kosha-mark"
import { segment, segmentButton } from "@/components/shell"
import { LOCALE, convert, fmt, pressKey, type Rates } from "@/lib/core"
import { parseQuickAdd } from "@/lib/quick-add"
import { cn } from "@/lib/utils"

// ---------- shared ----------

const spin = { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
const fade = { duration: 250, easing: "ease-out" }

const noSubscribe = () => () => {}
/** False on the server and during hydration, true once the page's script has taken over. */
const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  )

/**
 * Money whose digits roll to the new value, like the app's hero figures. NumberFlow draws nothing until
 * the page's script runs, so the server render and first paint show the same figure as plain text.
 */
function Rolling({ cents, currency, className }: { cents: number; currency: string; className?: string }) {
  if (!useHydrated()) return <span className={className}>{fmt(cents, currency)}</span>
  return (
    <NumberFlow
      className={className}
      value={cents / 100}
      locales={LOCALE}
      format={{ style: "currency", currency: currency.toUpperCase() }}
      transformTiming={spin}
      spinTiming={spin}
      opacityTiming={fade}
    />
  )
}

/** Whole units, as the app's pace line shows them ("€233 under your usual pace"). */
const whole = (cents: number, currency: string) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100)

/** True while the element is on screen. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen] as const
}

const REDUCE = "(prefers-reduced-motion: reduce)"
/** The visitor's reduced-motion setting. The server render assumes motion is fine. */
const useReducedMotion = () =>
  useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia(REDUCE)
      q.addEventListener("change", onChange)
      return () => q.removeEventListener("change", onChange)
    },
    () => window.matchMedia(REDUCE).matches,
    () => false
  )

/** A window of the app: a white card with a soft shadow that lifts it off a brand ground. */
const appWindow =
  "@container overflow-hidden rounded-2xl border bg-card text-foreground shadow-[0_30px_80px_-30px_rgb(15_82_78/0.45)] dark:border-white/10 dark:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]"
const card = "rounded-xl border bg-card"

// Units per 1 USD, as Kosha stores them.
const RATES: Rates = { usd: 1, eur: 0.92, gbp: 0.78 }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ---------- Overview: the month so far ----------

const RENT = 124000
type Month = {
  name: string
  short: string
  days: number
  /** Day of the month today, or null for a finished month. */
  today: number | null
  /** Spending per day, in euro cents, up to today. */
  spend: number[]
  incomeNote: string
  third: { label: string; value: number; note: string }
  where: { name: string; icon: string; spent: number; chip: string; tone?: "pos" | "warn" }[]
}
const INCOME = 510000

const MONTHS: Month[] = [
  {
    name: "October",
    short: "Oct",
    days: 31,
    today: null,
    spend: [
      RENT,
      3870,
      2140,
      8420,
      1690,
      5980,
      4260,
      2530,
      7910,
      2280,
      6040,
      58000,
      3140,
      4920,
      2870,
      9230,
      1540,
      5480,
      3210,
      6760,
      2390,
      5170,
      3650,
      9840,
      2060,
      6310,
      2710,
      4980,
      3420,
      7890,
      2580,
    ],
    incomeNote: "Salary · 1 Oct",
    third: { label: "Bills paid", value: 148230, note: "7 bills" },
    where: [
      { name: "Travel", icon: "ph:airplane-tilt", spent: 58000, chip: "new" },
      { name: "Rent", icon: "ph:house", spent: RENT, chip: "fixed" },
      { name: "Groceries", icon: "ph:shopping-cart", spent: 35260, chip: "+4%" },
      { name: "Dining", icon: "ph:fork-knife", spent: 13190, chip: "−6%", tone: "pos" },
    ],
  },
  {
    name: "November",
    short: "Nov",
    days: 30,
    today: 18,
    spend: [
      RENT,
      2870,
      6140,
      1930,
      9310,
      2290,
      3970,
      7420,
      2050,
      8660,
      3810,
      4790,
      8120,
      2560,
      5040,
      10380,
      4410,
      9870,
    ],
    incomeNote: "Salary · 1 Nov",
    third: { label: "Still to pay", value: 31480, note: "5 bills before 30 Nov" },
    where: [
      { name: "Rent", icon: "ph:house", spent: RENT, chip: "fixed" },
      { name: "Groceries", icon: "ph:shopping-cart", spent: 27480, chip: "−8%", tone: "pos" },
      { name: "Dining", icon: "ph:fork-knife", spent: 15840, chip: "+24%", tone: "warn" },
      { name: "Transit", icon: "ph:tram", spent: 4900, chip: "0%" },
    ],
  },
]

/** The usual month: rent on the 1st, then an even pace. */
const usualBy = (day: number) => RENT + 5900 * day
const cumulative = (xs: number[]) => xs.map((_, i) => sum(xs.slice(0, i + 1)))

// Every path has 31 points, so the browser can morph one month's lines into the other's.
const POINTS = 31
function path(values: number[], days: number, max: number) {
  return Array.from({ length: POINTS }, (_, i) => {
    const d = Math.min(i, values.length - 1)
    const x = (d / (days - 1)) * 100
    const y = 40 - (values[d] / max) * 36
    return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(" ")
}

export function OverviewDemo() {
  const [index, setIndex] = useState(1)
  const [currency, setCurrency] = useState("eur")
  const m = MONTHS[index]
  // The data is in euros; the switch converts it like the app's display currency does.
  const c = (cents: number) => convert(cents, "eur", currency, RATES)
  const spent = sum(m.spend)
  const usualMonth = usualBy(m.days)
  const lastDay = m.today ?? m.days
  const usualToDay = usualBy(lastDay)
  const projected = m.today ? spent + (usualMonth - usualToDay) : spent
  const max = Math.max(usualMonth, projected, spent) * 1.06
  const line = path(cumulative(m.spend), m.days, max)
  const area = `${line} L${(((lastDay - 1) / (m.days - 1)) * 100).toFixed(2)} 40 L0 40 Z`
  const gap = usualToDay - spent
  const x = (day: number) => `${((day - 1) / (m.days - 1)) * 100}%`
  const y = (v: number) => `${(1 - (v / max) * 0.9) * 100}%`
  const maxWhere = Math.max(...m.where.map((w) => w.spent))

  return (
    <div className={appWindow}>
      {/* The app's top bar, trimmed to what fits */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5 @min-[480px]:px-4">
        <span className="flex items-center gap-2 pr-1 text-sm font-semibold" aria-hidden="true">
          <KoshaMark className="h-5" /> <span className="@max-[520px]:hidden">Kosha</span>
        </span>
        <span
          aria-hidden="true"
          className="hidden h-8 items-center rounded-md bg-muted px-2.5 text-[13px] font-medium @min-[600px]:inline-flex"
        >
          Overview
        </span>
        {["Activity", "Recurring", "Accounts"].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="hidden px-2 text-[13px] text-muted-foreground @min-[860px]:inline"
          >
            {t}
          </span>
        ))}
        <div className={cn(segment, "ml-auto")}>
          <button
            type="button"
            aria-label="Previous month"
            disabled={index === 0}
            onClick={() => setIndex(0)}
            className={cn(segmentButton, "disabled:opacity-35")}
          >
            <CaretLeftIcon className="size-3.5" />
          </button>
          <span className="w-[100px] text-center text-xs font-medium" aria-live="polite">
            {m.name} 2026
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={index === MONTHS.length - 1}
            onClick={() => setIndex(1)}
            className={cn(segmentButton, "disabled:opacity-35")}
          >
            <CaretRightIcon className="size-3.5" />
          </button>
        </div>
        <div role="group" aria-label="Display currency" className={segment}>
          {["eur", "usd"].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={currency === k}
              onClick={() => setCurrency(k)}
              className={cn(segmentButton, "uppercase")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 bg-background p-3 @min-[480px]:p-4 @min-[640px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Month pace */}
        <div className={cn(card, "p-4 @min-[480px]:p-5")}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium">{m.today ? `${m.name} so far` : m.name}</span>
            <span className="text-xs text-muted-foreground">
              {m.today ? `Day ${m.today} of ${m.days}` : `${m.days} days`}
            </span>
          </div>
          <div className="cents-muted mt-3 text-[32px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
            <Rolling cents={c(spent)} currency={currency} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-2.5 text-xs">
            <span className={gap >= 0 ? "text-positive" : "text-warning"}>
              {whole(c(Math.abs(gap)), currency)} {gap >= 0 ? "under" : "over"} your usual {m.today ? "pace" : "month"}
            </span>
            {m.today && <span className="text-muted-foreground">usual by today {whole(c(usualToDay), currency)}</span>}
          </p>
          <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-chart-2" /> This month
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-muted-foreground" /> Usual month ·{" "}
              {whole(c(usualMonth), currency)}
            </span>
          </div>

          <div className="relative mt-4 h-32 @min-[480px]:h-36" aria-hidden="true">
            <div className="absolute inset-x-0 border-t border-border" style={{ top: y(usualMonth / 2) }} />
            <svg
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <path d={area} className="fill-muted transition-[d] duration-700 ease-out" />
              <path
                d={path(
                  Array.from({ length: m.days }, (_, i) => usualBy(i + 1)),
                  m.days,
                  max
                )}
                vectorEffect="non-scaling-stroke"
                className="fill-none stroke-muted-foreground transition-[d] duration-700 ease-out [stroke-dasharray:4_4]"
                strokeWidth={1.25}
              />
              <path
                d={line}
                vectorEffect="non-scaling-stroke"
                className="fill-none stroke-chart-2 transition-[d] duration-700 ease-out"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </svg>
            {m.today && (
              <>
                <div
                  className="absolute inset-y-0 border-l border-dotted border-muted-foreground"
                  style={{ left: x(m.today) }}
                >
                  <span className="absolute -top-1 left-1.5 text-[10px] whitespace-nowrap text-muted-foreground">
                    Projected {whole(c(projected), currency)}
                  </span>
                </div>
                <span
                  className="absolute size-2 -translate-1/2 rounded-full bg-foreground ring-2 ring-card"
                  style={{ left: x(m.today), top: y(spent) }}
                />
              </>
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>1 {m.short}</span>
            {m.today && <span>Today</span>}
            <span>
              {m.days} {m.short}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-xs">
            {[
              { label: "Income", value: INCOME, note: m.incomeNote },
              {
                label: m.today ? "Saved so far" : "Saved",
                value: INCOME - spent,
                note: `${Math.round(((INCOME - spent) / INCOME) * 100)}% of income`,
                pos: true,
              },
              m.third,
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className={cn("num mt-1 truncate text-sm @min-[480px]:text-[15px]", "pos" in s && "text-positive")}>
                  <Rolling cents={c(s.value)} currency={currency} />
                </dd>
                <dd className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.note}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Where it went */}
        <div className={cn(card, "p-4 @max-[639px]:hidden @min-[480px]:p-5")}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium">Where it went</span>
            <span className="text-xs text-muted-foreground">vs usual</span>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {m.where.map((w) => (
              <li key={w.name} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={w.icon} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span className="num">{fmt(c(w.spent), currency)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-2 transition-[width] duration-700 ease-out"
                      style={{ width: `${(w.spent / maxWhere) * 100}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "num w-11 rounded-full bg-muted py-px text-center text-[10px]",
                      w.tone === "pos" && "text-positive",
                      w.tone === "warn" && "text-warning",
                      !w.tone && "text-muted-foreground"
                    )}
                  >
                    {w.chip}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ---------- Quick add: one line becomes a transaction ----------

const QA_WALLETS = [
  { id: "visa", name: "Visa Card" },
  { id: "current", name: "Current account" },
  { id: "cash", name: "Cash" },
  { id: "wise", name: "Wise" },
]
const QA_CATEGORIES = [
  { id: "dining", name: "Dining", icon: "ph:fork-knife" },
  { id: "groceries", name: "Groceries", icon: "ph:shopping-cart" },
  { id: "transit", name: "Transit", icon: "ph:tram" },
  { id: "coffee", name: "Coffee", icon: "ph:coffee" },
  { id: "salary", name: "Salary", icon: "ph:briefcase" },
  { id: "travel", name: "Travel", icon: "ph:airplane-tilt" },
]
/** Past payees: what the app learns from your history. */
const HISTORY = [
  { title: "Tesco", category: "groceries", wallet: "current", avg: 4312 },
  { title: "Pizza Hut", category: "dining", wallet: "visa", avg: 2490 },
  { title: "Uber", category: "transit", wallet: "visa", avg: 1460 },
  { title: "Starbucks", category: "coffee", wallet: "current", avg: 520 },
  { title: "Salary", category: "salary", wallet: "current", avg: 420000 },
]
// The first one rests on screen when motion is off, so it leaves two values for the history to guess.
const EXAMPLES = ["12.50 tesco yesterday", "24.90 pizza hut dining visa", "+4200 salary current", "14.60 uber #work"]

const findPayees = (payee: string) => {
  const q = payee.trim().toLowerCase().split(/\s+/)[0]
  if (!q || q.length < 2) return []
  return HISTORY.filter((h) =>
    h.title
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(q))
  )
}
const categoryOf = (id: string | null | undefined) => QA_CATEGORIES.find((c) => c.id === id)
const walletOf = (id: string | null | undefined) => QA_WALLETS.find((w) => w.id === id)

export function QuickAddDemo() {
  const [ref, inView] = useInView<HTMLDivElement>()
  // The demo types EXAMPLES once through while it is on screen, then rests. Typing in the box takes over.
  // Under reduced motion it never plays: the box shows the first example, ready to edit.
  const reduced = useReducedMotion()
  const [wantPlay, setPlaying] = useState(true)
  const playing = wantPlay && !reduced
  const [step, setStep] = useState({ ex: 0, len: EXAMPLES[0].length })
  const [typed, setTyped] = useState<string | null>(null)
  const text = typed ?? EXAMPLES[step.ex].slice(0, step.len)
  // Values flash once when an example is complete, not on every keystroke of the demo.
  const midDemo = typed === null && step.len < EXAMPLES[step.ex].length

  useEffect(() => {
    if (!playing || !inView || typed !== null) return
    const full = EXAMPLES[step.ex]
    const t =
      step.len < full.length
        ? setTimeout(() => setStep({ ...step, len: step.len + 1 }), 55)
        : setTimeout(() => {
            if (step.ex === EXAMPLES.length - 1) setPlaying(false)
            else setStep({ ex: step.ex + 1, len: 0 })
          }, 1900)
    return () => clearTimeout(t)
  }, [playing, inView, typed, step])

  const p = parseQuickAdd(text, QA_WALLETS, QA_CATEGORIES)
  const matches = findPayees(p.payee)
  const known = matches.length === 1 ? matches[0] : null
  const income = p.income || known?.category === "salary"
  const category = categoryOf(p.categoryId) ?? categoryOf(known?.category)
  const wallet = walletOf(p.walletId) ?? walletOf(known?.wallet)
  const amount = p.amount ? `${income ? "+" : "−"}${fmt(p.amount, "eur")}` : null
  const payee = known?.title ?? (p.payee || null)
  const add = () => {
    if (!p.amount) return
    toast(`Added ${amount} · ${payee ?? "No payee"}`, {
      action: { label: "Undo", onClick: () => toast("Removed") },
    })
    setTyped("")
  }

  // On a narrow window the boxes wrap two a row: amount and date, then the payee, then category and account.
  const fields: { label: string; value: string | null; guess: boolean; icon?: string; order: string }[] = [
    { label: "Amount", value: amount, guess: false, order: "@max-[599px]:order-1" },
    {
      label: "Payee",
      value: payee,
      guess: !!known && known.title.toLowerCase() !== p.payee.toLowerCase(),
      order: "@max-[599px]:order-2 @max-[599px]:col-span-2",
    },
    {
      label: "Category",
      value: category?.name ?? null,
      guess: !p.categoryId,
      icon: category?.icon,
      order: "@max-[599px]:order-3",
    },
    { label: "Account", value: wallet?.name ?? null, guess: !p.walletId, order: "@max-[599px]:order-3" },
    {
      label: "Date",
      value: p.date === "yesterday" ? "Yesterday" : "Today",
      guess: !p.date,
      order: "@max-[599px]:order-1",
    },
  ]

  return (
    <div ref={ref} className={appWindow}>
      {/* Keyboard focus shows as an ink line under the row; the input itself draws no outline. */}
      <div className="flex items-center gap-3 border-b px-4 py-2 transition-shadow has-[input:focus-visible]:shadow-[inset_0_-2px_0_var(--foreground)] @min-[480px]:px-5">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
          <PlusIcon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Describe a transaction</span>
          <input
            value={text}
            onChange={(e) => setTyped(e.target.value)}
            onFocus={() => setTyped(text)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Try 12.50 tesco yesterday"
            spellCheck={false}
            autoComplete="off"
            className="num min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground @min-[480px]:text-lg"
          />
        </label>
        {typed === null && !reduced && (
          <button
            type="button"
            onClick={() => (playing ? setPlaying(false) : (setStep({ ex: 0, len: 0 }), setPlaying(true)))}
            aria-label={playing ? "Pause the typing demo" : "Play the typing demo"}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:size-11"
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </button>
        )}
      </div>

      <div className="px-4 py-4 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">Will add</p>
        <div className="mt-2 grid grid-cols-2 gap-2 @min-[600px]:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto]">
          {fields.map((f) => (
            <div key={f.label} className={cn("min-w-0 rounded-lg border px-3 py-2.5", f.order)}>
              <div className="text-[11px] text-muted-foreground">{f.label}</div>
              <div
                key={midDemo ? "typing" : (f.value ?? "none")}
                data-flash={f.value && !midDemo ? "" : undefined}
                className={cn(
                  "-mx-1 mt-1 flex items-center gap-1.5 rounded px-1 text-sm whitespace-nowrap",
                  !f.value ? "text-muted-foreground" : f.guess ? "text-subtle-foreground" : "text-foreground",
                  f.label === "Amount" && "num"
                )}
              >
                {f.icon && <CategoryIcon icon={f.icon} className="size-4" />}
                <span className="truncate">{f.value ?? "None yet"}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Grey values are guesses from your history.</p>
          <button
            type="button"
            onClick={add}
            disabled={!p.amount}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 ease-out hover:bg-primary/85 disabled:opacity-40 motion-safe:active:scale-[0.97] max-md:h-11"
          >
            Add {income ? "income" : "expense"}
            <kbd className="rounded border border-primary-foreground/30 px-1 font-mono text-[10px]">↵</kbd>
          </button>
        </div>
      </div>

      <div className="border-t px-4 py-3 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">Payees</p>
        <ul className="mt-1 min-h-[88px]">
          {(matches.length ? matches : HISTORY).slice(0, 2).map((h) => (
            <li key={h.title}>
              <button
                type="button"
                onClick={() => setTyped(`${p.amount ? (p.amount / 100).toFixed(2) + " " : ""}${h.title.toLowerCase()}`)}
                className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="truncate">{h.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground @max-[479px]:hidden">
                  <CategoryIcon icon={categoryOf(h.category)?.icon} className="size-3.5" />
                  {categoryOf(h.category)?.name} · {walletOf(h.wallet)?.name}
                </span>
                <span className="num ml-auto shrink-0 text-xs text-muted-foreground">usually {fmt(h.avg, "eur")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
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
    group: "Bank & cash",
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
const DISPLAY = ["eur", "usd", "gbp"]

export function AccountsDemo() {
  const [currency, setCurrency] = useState("eur")
  const all = ACCOUNTS.flatMap((g) => g.items)
  const total = sum(all.map((a) => convert(worth(a), a.currency, currency, RATES)))
  const eurGbp = RATES.gbp / RATES.eur

  return (
    <div className="flex flex-col gap-3">
      <div className={appWindow}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 @min-[480px]:px-5">
          <div>
            <p className="text-[13px] font-medium">Net worth</p>
            <div className="cents-muted mt-2 text-[30px] leading-none font-semibold tracking-[-0.035em] tabular-nums @min-[480px]:text-[34px]">
              <Rolling cents={total} currency={currency} />
            </div>
          </div>
          <div role="group" aria-label="Show totals in" className={segment}>
            {DISPLAY.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={currency === k}
                onClick={() => setCurrency(k)}
                className={cn(segmentButton, "px-2.5 uppercase")}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {ACCOUNTS.map((g) => (
            <div key={g.group} className="px-4 py-3 @min-[480px]:px-5">
              <p className="text-xs text-muted-foreground">{g.group}</p>
              <ul className="mt-1">
                {g.items.map((a) => (
                  <li key={a.name} className="flex min-h-12 items-center gap-3 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.type === "credit"
                          ? `${Math.round((a.balance / a.limit!) * 100)}% of ${fmt(a.limit!, a.currency)} used`
                          : `${a.type === "bank" ? "Bank" : "Investment"} · ${a.currency.toUpperCase()}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right whitespace-nowrap">
                      <div className="num">{fmt(worth(a), a.currency)}</div>
                      {a.gain ? (
                        <div className="num text-xs text-positive">
                          +{fmt(a.gain, a.currency)} · {Math.round((a.gain / a.balance) * 1000) / 10}%
                        </div>
                      ) : (
                        a.currency !== currency && (
                          <div className="num text-xs text-muted-foreground">
                            ≈ <Rolling cents={convert(worth(a), a.currency, currency, RATES)} currency={currency} />
                          </div>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="num border-t px-4 py-3 text-xs text-muted-foreground @min-[480px]:px-5">
          €1 = £{eurGbp.toFixed(4)} · rates updated today
        </p>
      </div>

      <div className={cn(appWindow, "px-4 py-4 @min-[480px]:px-5")}>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="font-medium">Currency exchange</span>
          <span className="text-xs text-muted-foreground">12 Nov · via Wise</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs @min-[480px]:grid-cols-5">
          {[
            ["Sent", "€500.00"],
            ["Received", "£421.75"],
            ["Rate", "0.8435"],
            ["Market", "0.8478"],
            ["Cost", "€2.55"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={cn("num mt-1 text-sm", k === "Market" && "text-muted-foreground")}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ---------- Phone: amount first ----------

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"]
const PHONE_CATEGORIES = {
  expense: [
    ["Dining", "ph:fork-knife"],
    ["Groceries", "ph:shopping-cart"],
    ["Transit", "ph:tram"],
    ["Coffee", "ph:coffee"],
    ["Rent", "ph:house"],
    ["Health", "ph:pill"],
    ["Shopping", "ph:shopping-bag"],
    ["Travel", "ph:airplane-tilt"],
    ["Gifts", "ph:gift"],
    ["Utilities", "ph:lightning"],
    ["Internet", "ph:globe-simple"],
    ["Games", "ph:game-controller"],
    ["Clothes", "ph:t-shirt"],
    ["Baby", "ph:baby"],
    ["Insurance", "ph:shield-check"],
  ],
  income: [
    ["Salary", "ph:briefcase"],
    ["Freelance", "ph:laptop"],
    ["Refund", "ph:arrow-u-up-left"],
    ["Interest", "ph:piggy-bank"],
  ],
} as const
const PHONE_PAYEE = { expense: { name: "Pizza Hut", usual: "€25" }, income: { name: "Salary", usual: "€4,200" } }

export function PhoneDemo() {
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [amount, setAmount] = useState("24.90")
  const [category, setCategory] = useState("Dining")
  const cents = Math.round(parseFloat(amount || "0") * 100)
  const sign = kind === "expense" ? "−" : "+"
  const payee = PHONE_PAYEE[kind]
  const add = () => {
    toast(`Added ${sign}${fmt(cents, "eur")} · ${payee.name}`, {
      action: { label: "Undo", onClick: () => toast("Removed") },
    })
    setAmount("")
  }

  return (
    <div className="mx-auto w-full max-w-[344px] rounded-[46px] bg-[#111113] p-2.5 shadow-[0_40px_90px_-30px_rgb(17_17_19/0.55)] dark:ring-1 dark:ring-white/10">
      <div className="flex h-[700px] flex-col gap-3 overflow-hidden rounded-[37px] bg-background px-3.5 pt-5 pb-4 text-foreground">
        <div role="group" aria-label="Type" className={cn(segment, "mx-auto bg-muted")}>
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k)
                setCategory(PHONE_CATEGORIES[k][0][0])
              }}
              className={cn(segmentButton, "px-4 text-[13px] capitalize aria-pressed:bg-card")}
            >
              {k}
            </button>
          ))}
        </div>
        <output
          aria-live="polite"
          aria-label="Amount"
          className="num block text-center text-[40px] leading-none font-medium tracking-[-0.03em]"
        >
          {amount ? `${sign}€${amount}` : <span className="text-muted-foreground">€0</span>}
        </output>
        <div className="flex justify-center gap-2 text-xs" aria-hidden="true">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3">
            <CreditCardIcon className="size-3.5 text-subtle-foreground" />{" "}
            {kind === "expense" ? "Visa Card" : "Current account"}
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3">
            <CalendarBlankIcon className="size-3.5 text-subtle-foreground" /> Today
          </span>
        </div>
        <div
          className="flex h-11 shrink-0 items-center justify-between rounded-xl border bg-card px-3.5 text-sm"
          aria-hidden="true"
        >
          {payee.name}
          <span className="num text-xs text-muted-foreground">usually {payee.usual}</span>
        </div>
        <div className="flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
          <span>Category</span>
          <span>{PHONE_CATEGORIES[kind][0][0]} is usual here</span>
        </div>
        <div className="relative min-h-0 flex-1">
          <div
            role="group"
            aria-label="Category"
            className="grid h-full [scrollbar-width:none] grid-cols-5 content-start gap-0.5 overflow-y-auto pb-6"
          >
            {PHONE_CATEGORIES[kind].map(([name, icon]) => (
              <button
                key={name}
                type="button"
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
                className="flex h-[58px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:ring-[1.5px] aria-pressed:ring-foreground aria-pressed:ring-inset"
              >
                <CategoryIcon icon={icon} className="size-5 in-aria-pressed:text-foreground" />
                <span className="w-full truncate text-center">{name}</span>
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-background" />
        </div>
        <div role="group" aria-label="Keypad" className="grid grid-cols-3">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k === "del" ? "Delete digit" : k === "." ? "Decimal point" : k}
              onClick={() => setAmount((a) => pressKey(a, k))}
              className="num flex h-11 items-center justify-center rounded-xl text-xl transition-[background-color,scale] duration-100 ease-out hover:bg-muted active:bg-muted motion-safe:active:scale-[0.94]"
            >
              {k === "del" ? <BackspaceIcon className="size-5" /> : k}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!cents}
          className="h-12 shrink-0 rounded-[14px] bg-primary text-[15px] font-medium text-primary-foreground transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-primary/85 disabled:opacity-40 motion-safe:active:scale-[0.98]"
        >
          {cents ? `Add ${kind} · ${fmt(cents, "eur")}` : "Enter an amount"}
        </button>
      </div>
    </div>
  )
}

// ---------- Recurring: the next 30 days ----------

type Due = { id: string; name: string; kind: string; every: string; day: number; amount: number; transfer?: boolean }
// Days are counted from today, 18 November.
const DUE: Due[] = [
  { id: "phone", name: "Phone bill", kind: "Bill", every: "every month", day: 2, amount: 2499 },
  { id: "spotify", name: "Spotify", kind: "Subscription", every: "every month", day: 6, amount: 1099 },
  { id: "insurance", name: "Car insurance", kind: "Bill", every: "every 3 months", day: 9, amount: 12600 },
  { id: "rent", name: "Rent", kind: "Bill", every: "every month", day: 13, amount: 124000 },
  {
    id: "savings",
    name: "Current account → Index fund",
    kind: "Transfer",
    every: "every month",
    day: 13,
    amount: 40000,
    transfer: true,
  },
  { id: "netflix", name: "Netflix", kind: "Subscription", every: "every month", day: 17, amount: 1399 },
]
const dayLabel = (offset: number) =>
  new Date(Date.UTC(2026, 10, 18 + offset)).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const perMonth = (d: Due) => (d.every === "every 3 months" ? d.amount / 3 : d.amount)

export function RecurringDemo() {
  const [state, setState] = useState<Record<string, "paid" | "skipped">>({})
  const [selected, setSelected] = useState("rent")
  const open = DUE.filter((d) => !state[d.id])
  const bills = DUE.filter((d) => !d.transfer)
  const maxDay = Math.max(...bills.map((d) => d.amount))
  const sel = DUE.find((d) => d.id === selected)!
  const done = state[sel.id]
  const set = (s: "paid" | "skipped" | null) =>
    setState((cur) => {
      const next = { ...cur }
      if (s) next[sel.id] = s
      else delete next[sel.id]
      return next
    })

  return (
    <div className={appWindow}>
      <div className="grid grid-cols-2 divide-x border-b">
        <div className="px-4 py-4 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">Committed per month</p>
          <p className="num mt-1.5 text-xl">{fmt(sum(bills.map(perMonth)), "eur")}</p>
        </div>
        <div className="px-4 py-4 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">Moved to savings</p>
          <p className="num mt-1.5 text-xl text-muted-foreground">{fmt(40000, "eur")}</p>
        </div>
      </div>

      <div className="border-b px-4 pt-4 pb-3 @min-[480px]:px-5" aria-hidden="true">
        <p className="text-xs text-muted-foreground">Next 30 days</p>
        <div className="mt-3 flex h-24 items-end gap-[3px]">
          {Array.from({ length: 30 }, (_, i) => {
            const items = open.filter((d) => d.day === i)
            const out = sum(items.filter((d) => !d.transfer).map((d) => d.amount))
            const moved = items.some((d) => d.transfer)
            const lit = items.some((d) => d.id === selected)
            return (
              <div
                key={i}
                className={cn("relative flex h-full flex-1 flex-col justify-end", i === 13 && "ml-1 border-l pl-1")}
              >
                {i === 13 && out > 0 && (
                  <span className="absolute -top-0.5 left-1.5 text-[10px] whitespace-nowrap text-muted-foreground">
                    Rent + savings
                  </span>
                )}
                {out > 0 && (
                  <div
                    className={cn(
                      "w-full rounded-[3px] transition-[background-color,height] duration-300 ease-out",
                      lit ? "bg-positive" : "bg-chart-2"
                    )}
                    // Square-root scale, so small bills still read next to the rent.
                    style={{ height: `${Math.max(12, Math.sqrt(out / maxDay) * 78)}%` }}
                  />
                )}
                {moved && (
                  <div
                    className={cn(
                      "mt-0.5 h-3 w-full rounded-[3px] border border-dashed",
                      lit ? "border-positive" : "border-muted-foreground"
                    )}
                  />
                )}
                {!out && !moved && <div className="h-1 w-full rounded-full bg-muted" />}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">Today</span>
          <span>1 Dec</span>
          <span>{dayLabel(29)}</span>
        </div>
      </div>

      <div className="grid @min-[560px]:grid-cols-[minmax(0,1fr)_224px]">
        <ul className="py-1">
          {DUE.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                aria-pressed={selected === d.id}
                onClick={() => setSelected(d.id)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 aria-pressed:bg-selected @min-[480px]:px-5"
              >
                <span className="num w-11 shrink-0 text-xs text-muted-foreground">{dayLabel(d.day)}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", d.transfer && "text-subtle-foreground")}>{d.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {state[d.id] === "paid"
                      ? "Paid today"
                      : state[d.id] === "skipped"
                        ? "Skipped this time"
                        : `${d.kind} · ${d.every}`}
                  </span>
                </span>
                <span
                  className={cn(
                    "num shrink-0",
                    d.transfer && "text-muted-foreground",
                    state[d.id] && "line-through opacity-50"
                  )}
                >
                  {d.transfer ? fmt(d.amount, "eur") : `−${fmt(d.amount, "eur")}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {/* The selected item's next payment, as in the app's detail panel */}
        <div className="m-3 flex flex-col rounded-xl bg-muted p-4 @min-[560px]:ml-0">
          <p className="text-xs text-muted-foreground">Next payment</p>
          <p className="mt-1 font-medium">
            {sel.name.split(" → ")[0]} · {dayLabel(sel.day)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {done === "paid"
              ? "Marked paid today"
              : done === "skipped"
                ? "Skipped. The schedule carries on."
                : `In ${sel.day} days. Recorded automatically on the day.`}
          </p>
          <div className="mt-auto flex gap-2 pt-4 whitespace-nowrap">
            {done ? (
              <button
                type="button"
                onClick={() => set(null)}
                className="h-9 rounded-md border bg-card px-3 text-xs transition-colors hover:bg-background max-md:h-11"
              >
                Undo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => set("paid")}
                  className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85 max-md:h-11"
                >
                  {sel.transfer ? "Move now" : "Mark paid now"}
                </button>
                <button
                  type="button"
                  onClick={() => set("skipped")}
                  className="h-9 rounded-md border bg-card px-3 text-xs transition-colors hover:bg-background max-md:h-11"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- API and MCP ----------

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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-[#f3f3f4]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div role="group" aria-label="Interface" className="inline-flex rounded-md bg-white/[0.06] p-0.5">
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
              className="h-8 rounded-[6px] px-3 text-xs text-white/60 transition-colors hover:text-white aria-pressed:bg-white/12 aria-pressed:text-white max-md:h-11"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => copy(tab === "mcp" ? MCP_URL : REST)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white max-md:h-11"
        >
          <CopyIcon className="size-3.5" /> {tab === "mcp" ? "Copy connector URL" : "Copy request"}
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
      <p className="text-xs text-white/55">{label}</p>
      <pre
        tabIndex={0}
        aria-label={label}
        className="mt-1.5 overflow-x-auto rounded-lg bg-black/35 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-white/90"
      >
        {children}
      </pre>
    </div>
  )
}

/** A link with an underline that draws in and an arrow that slides on hover. */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("group inline-flex min-h-11 items-center gap-1.5 font-medium", className)}>
      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_1px]">
        {children}
      </span>
      <ArrowRightIcon className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
    </a>
  )
}
