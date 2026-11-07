// Live mockups of the app for the landing page. They run the app's own parsing and money code on
// invented data, so a visitor can try them without an account. Nothing here talks to the server.
// Every mock agrees on one "today": Wednesday 18 November 2026. This file holds the shared pieces, the
// hero and the "pocket" and "desk" chapters; landing-checks.tsx holds the rest.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import NumberFlow from "@number-flow/react"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BackspaceIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatTextIcon,
  CheckIcon,
  ClockIcon,
  CloudSlashIcon,
  CreditCardIcon,
  DeviceMobileIcon,
  KeyboardIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ReceiptIcon,
} from "@phosphor-icons/react/ssr"
import { AiMark } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { KoshaMark } from "@/components/kosha-mark"
import { segment, segmentButton } from "@/components/shell"
import { intlLocale, convert, fmt, inCurrency, pressKey, type Rates } from "@/lib/core"
import { parseQuickAdd } from "@/lib/quick-add"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
export function Rolling({ cents, currency, className }: { cents: number; currency: string; className?: string }) {
  if (!useHydrated()) return <span className={className}>{fmt(cents, currency)}</span>
  return (
    <NumberFlow
      className={className}
      value={cents / 100}
      locales={intlLocale()}
      format={{ style: "currency", currency: currency.toUpperCase() }}
      transformTiming={spin}
      spinTiming={spin}
      opacityTiming={fade}
    />
  )
}

/** Whole units, as the app's pace line shows them ("€233 under your usual pace"). */
const whole = (cents: number, currency: string) =>
  new Intl.NumberFormat(intlLocale(), {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100)

/** A percentage in the visitor's language, with a real minus sign and a plus when asked ("+4%", "−6 %"). */
const pct = (n: number, signed = false) =>
  `${signed ? (n > 0 ? "+" : n < 0 ? "−" : "") : ""}${new Intl.NumberFormat(intlLocale(), { style: "percent" }).format(Math.abs(n) / 100)}`

/** A day of 2026 in the visitor's language: "12 Oct" by default. `month` counts from 0, like Date. */
const date = (month: number, day: number, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(Date.UTC(2026, month, day)).toLocaleDateString(intlLocale(), { ...opts, timeZone: "UTC" })

/** Sample text is either a name that stays as it is (a shop) or a message to translate. */
type Text = string | (() => string)
const say = (t: Text) => (typeof t === "string" ? t : t())

/** Amounts inside a translated sentence keep the app's tabular figures. */
const num = { num: ({ children }: { children?: ReactNode }) => <span className="num">{children}</span> }

/** Sample categories, by id. Names are translated when shown. */
const CAT = {
  coffee: { name: m.demos_cat_coffee, icon: "ph:coffee" },
  dining: { name: m.demos_cat_dining, icon: "ph:fork-knife" },
  transit: { name: m.demos_cat_transit, icon: "ph:tram" },
  health: { name: m.demos_cat_health, icon: "ph:pill" },
  groceries: { name: m.demos_cat_groceries, icon: "ph:shopping-cart" },
  rent: { name: m.demos_cat_rent, icon: "ph:house" },
  travel: { name: m.demos_cat_travel, icon: "ph:airplane-tilt" },
  shopping: { name: m.demos_cat_shopping, icon: "ph:shopping-bag" },
  salary: { name: m.demos_cat_salary, icon: "ph:briefcase" },
  refund: { name: m.demos_cat_refund, icon: "ph:arrow-u-up-left" },
}
type Cat = keyof typeof CAT

const NAV = [m.demos_nav_overview, m.demos_nav_activity, m.demos_nav_recurring, m.demos_nav_accounts]

/** Money out with a real minus sign, as the app prints it. */
export const out = (cents: number, currency = "eur") => `−${fmt(cents, currency)}`

/** True while the element is on screen. */
function useInView<T extends Element>(threshold = 0.4) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
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
export const appWindow =
  "@container overflow-hidden rounded-2xl bg-card text-foreground shadow-window [--ring-on:var(--foreground)] dark:border dark:border-chalk/10 dark:shadow-none"
const card = "rounded-xl border bg-card"
/** A small control inside a mock: the app's quiet outline button. */
export const mockButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-card px-3 text-xs whitespace-nowrap transition-[background-color,scale] duration-150 ease-out hover:bg-muted motion-safe:active:scale-[0.97] max-md:h-11"
export const mockPrimary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-primary/85 disabled:opacity-40 motion-safe:active:scale-[0.97] max-md:h-11"

// Units per 1 USD, as Kosha stores them.
export const RATES: Rates = { usd: 1, eur: 0.92, gbp: 0.78, jpy: 152.4 }
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Two quiet facts side by side, where the app would join them with a middle dot. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("block truncate text-xs text-muted-foreground [&>span+span]:ml-2", className)}>{children}</span>
  )
}

// ---------- the month: shared by the hero, Overview and the recap ----------

const RENT = 124000
const INCOME = 510000
type Month = {
  /** 0 for January, like Date. */
  month: number
  days: number
  /** Day of the month today, or null for a finished month. */
  today: number | null
  /** Spending per day, in euro cents, up to today. */
  spend: number[]
  third: { label: () => string; value: number; note: () => string }
  /** `chip` is the change against usual in percent, or a word. */
  where: { cat: Cat; spent: number; chip: number | (() => string); tone?: "pos" | "warn" }[]
}

const MONTHS: Month[] = [
  {
    month: 9,
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
    third: { label: m.demos_bills_paid, value: 148230, note: () => m.demos_bills_count({ count: 7 }) },
    where: [
      { cat: "travel", spent: 58000, chip: m.demos_chip_new },
      { cat: "rent", spent: RENT, chip: m.demos_chip_fixed },
      { cat: "groceries", spent: 35260, chip: 4 },
      { cat: "dining", spent: 13190, chip: -6, tone: "pos" },
      { cat: "shopping", spent: 8840, chip: 11, tone: "warn" },
      { cat: "coffee", spent: 4120, chip: -3, tone: "pos" },
    ],
  },
  {
    month: 10,
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
    third: {
      label: m.demos_still_to_pay,
      value: 16198,
      note: () => m.demos_bills_before({ count: 3, date: date(10, 30) }),
    },
    where: [
      { cat: "rent", spent: RENT, chip: m.demos_chip_fixed },
      { cat: "groceries", spent: 27480, chip: -8, tone: "pos" },
      { cat: "dining", spent: 15840, chip: 24, tone: "warn" },
      { cat: "transit", spent: 4900, chip: 0 },
      { cat: "shopping", spent: 6210, chip: 3 },
      { cat: "coffee", spent: 3860, chip: -12, tone: "pos" },
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

/** This month against the usual one: the area so far, the dashed usual line and today's dot. */
function PaceChart({
  mo,
  spend,
  className,
  money = (cents) => whole(cents, "eur"),
}: {
  mo: Month
  spend: number[]
  className?: string
  /** Formats the projection, so it follows the display currency. */
  money?: (cents: number) => string
}) {
  const spent = sum(spend)
  const lastDay = mo.today ?? mo.days
  const usualMonth = usualBy(mo.days)
  const projected = mo.today ? spent + (usualMonth - usualBy(lastDay)) : spent
  const max = Math.max(usualMonth, projected, spent) * 1.06
  const line = path(cumulative(spend), mo.days, max)
  const area = `${line} L${(((lastDay - 1) / (mo.days - 1)) * 100).toFixed(2)} 40 L0 40 Z`
  const x = (day: number) => `${((day - 1) / (mo.days - 1)) * 100}%`
  const y = (v: number) => `${(1 - (v / max) * 0.9) * 100}%`
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      <div className="absolute inset-x-0 border-t border-border" style={{ top: y(usualMonth / 2) }} />
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={area} className="fill-muted transition-[d] duration-700 ease-out motion-reduce:transition-none" />
        <path
          d={path(
            Array.from({ length: mo.days }, (_, i) => usualBy(i + 1)),
            mo.days,
            max
          )}
          vectorEffect="non-scaling-stroke"
          className="fill-none stroke-muted-foreground transition-[d] duration-700 ease-out [stroke-dasharray:4_4] motion-reduce:transition-none"
          strokeWidth={1.25}
        />
        <path
          d={line}
          vectorEffect="non-scaling-stroke"
          className="fill-none stroke-chart-2 transition-[d] duration-700 ease-out motion-reduce:transition-none"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      {mo.today && (
        <>
          <div
            className="absolute inset-y-0 border-l border-dotted border-muted-foreground"
            style={{ left: x(mo.today) }}
          >
            <span className="absolute -top-1 left-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
              {m.demos_projected({ amount: money(projected) })}
            </span>
          </div>
          <span
            className="absolute size-2 -translate-1/2 rounded-full bg-foreground ring-2 ring-card"
            style={{ left: x(mo.today), top: y(spent) }}
          />
        </>
      )}
    </div>
  )
}

// ---------- Hero: added on the phone, seen on the desk ----------

const NOVEMBER = MONTHS[1]
/** November up to yesterday; today's entries come from the list below. */
const BEFORE_TODAY = NOVEMBER.spend.slice(0, -1)
const iconOf = (category: Cat) => CAT[category].icon
/** The phone shows the four that fit across its screen. */
const PHONE_CATEGORIES: Cat[] = ["coffee", "dining", "transit", "health"]
/** What the phone offers next: a payee from history with its usual amount and category. */
const HERO_PAYEES: { payee: string; category: Cat; amount: string; usual: number }[] = [
  { payee: "Pret A Manger", category: "dining", amount: "8.95", usual: 780 },
  { payee: "Boots", category: "health", amount: "12.40", usual: 965 },
  { payee: "Uber", category: "transit", amount: "14.60", usual: 1460 },
  { payee: "Starbucks", category: "coffee", amount: "3.95", usual: 420 },
]
type HeroRow = { id: string; payee: Text; category: Cat; cents: number; time: Text; fresh?: boolean }
// Today's spending so far, 9870 cents, as November's last day says. Newest first.
const HERO_TODAY: HeroRow[] = [
  { id: "trainline", payee: "Trainline", category: "transit", cents: 5750, time: "12:10" },
  { id: "lidl", payee: "Lidl", category: "groceries", cents: 2860, time: "08:35" },
  { id: "bus", payee: m.demos_payee_bus, category: "transit", cents: 840, time: "08:20" },
  { id: "nero", payee: "Café Nero", category: "coffee", cents: 420, time: "08:10" },
]
// Yesterday's 4410 cents.
const HERO_YESTERDAY: HeroRow[] = [
  { id: "waitrose", payee: "Waitrose", category: "groceries", cents: 3175, time: "18:40" },
  { id: "boots-y", payee: "Boots", category: "health", cents: 1235, time: "13:05" },
]
/** Rows the Today list has room for; older ones still count towards the totals. */
const TODAY_ROWS = 5
const HERO_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"]

type Flight = { row: HeroRow; from: { x: number; y: number }; to: { x: number; y: number } }
const onScreen = (r: DOMRect) => r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight

function HeroRows({ rows }: { rows: HeroRow[] }) {
  return rows.map((r) => (
    <li
      key={r.id}
      data-flash={r.fresh ? "" : undefined}
      className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-[13px]"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <CategoryIcon icon={iconOf(r.category)} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{say(r.payee)}</span>
        <Meta>
          <span>{CAT[r.category].name()}</span>
          <span>{say(r.time)}</span>
        </Meta>
      </span>
      <span className="num shrink-0">{out(r.cents)}</span>
    </li>
  ))
}

export function HeroDemo() {
  const reduced = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const [listRef, listInView] = useInView<HTMLUListElement>(0.6)
  const [addRef, addInView] = useInView<HTMLButtonElement>(1)
  const ghostRef = useRef<HTMLDivElement>(null)
  const played = useRef(false)
  const [rows, setRows] = useState(HERO_TODAY)
  const [turn, setTurn] = useState(0)
  const preset = HERO_PAYEES[turn % HERO_PAYEES.length]
  const [amount, setAmount] = useState(preset.amount)
  const [category, setCategory] = useState(preset.category)
  const [flight, setFlight] = useState<Flight | null>(null)
  const cents = Math.round(parseFloat(amount || "0") * 100)

  const today = sum(rows.map((r) => r.cents))
  const spend = [...BEFORE_TODAY, today]
  const spent = sum(spend)
  const gap = usualBy(NOVEMBER.today!) - spent

  // Every entry stays in the totals; only the list's view is capped.
  const land = (row: HeroRow) => {
    setRows((rs) => [{ ...row, fresh: true }, ...rs.map((r) => ({ ...r, fresh: false }))])
    setFlight(null)
  }

  const add = () => {
    if (!cents || flight) return
    const row = { id: `${turn}-${preset.payee}`, payee: preset.payee, category, cents, time: m.demos_now }
    const next = HERO_PAYEES[(turn + 1) % HERO_PAYEES.length]
    setTurn(turn + 1)
    setAmount(next.amount)
    setCategory(next.category)
    const stage = stageRef.current?.getBoundingClientRect()
    const from = addRef.current?.getBoundingClientRect()
    const to = listRef.current?.getBoundingClientRect()
    // The entry only flies when both ends are on screen; otherwise, and under reduced motion, it just appears.
    if (reduced || !stage || !from || !to || !onScreen(from) || !onScreen(to)) return land(row)
    setFlight({
      row,
      from: { x: from.left - stage.left + from.width / 2, y: from.top - stage.top + from.height / 2 },
      to: { x: to.left - stage.left + to.width / 2, y: to.top - stage.top + 22 },
    })
  }

  // The added entry travels from the phone's button into the desk's list, then lands there.
  useEffect(() => {
    const el = ghostRef.current
    if (!flight || !el) return
    const dx = flight.to.x - flight.from.x
    const dy = flight.to.y - flight.from.y
    const at = (x: number, y: number, s: number) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s})`
    const a = el.animate(
      [
        { transform: at(0, 0, 0.7), opacity: 0 },
        { transform: at(0, -12, 1), opacity: 1, offset: 0.14 },
        { transform: at(dx * 0.55, Math.min(dy, 0) - 70, 1), opacity: 1, offset: 0.55 },
        { transform: at(dx, dy, 1), opacity: 1, offset: 0.92 },
        { transform: at(dx, dy, 0.96), opacity: 0 },
      ],
      { duration: 820, easing: "cubic-bezier(0.45, 0, 0.25, 1)" }
    )
    a.onfinish = () => land(flight.row)
    return () => a.cancel()
  }, [flight])

  // Once, shortly after both the phone's button and the desk's list are in view, the phone adds the first
  // entry by itself, so the flight is always seen.
  useEffect(() => {
    if (reduced || !listInView || !addInView || played.current) return
    const t = setTimeout(() => {
      played.current = true
      stageRef.current?.querySelector<HTMLButtonElement>("[data-add]")?.click()
    }, 1800)
    return () => clearTimeout(t)
  }, [listInView, addInView, reduced])

  const touch = () => {
    played.current = true
  }

  return (
    // The outer box is the size container; the stage inside it is where the flight is measured.
    <div className="@container/stage">
      <div
        ref={stageRef}
        onPointerDown={touch}
        onKeyDown={touch}
        className="relative flex items-center @max-[579px]/stage:flex-col @max-[579px]/stage:items-stretch"
      >
        {/* The phone: the amount first, the usual payee and category already picked */}
        <div className="relative z-10 w-[236px] shrink-0 rounded-[40px] bg-ink p-2 shadow-device [--ring-on:var(--foreground)] @max-[579px]/stage:mx-auto dark:ring-1 dark:ring-chalk/10">
          <div className="flex h-[432px] flex-col gap-2 overflow-hidden rounded-[32px] bg-background px-3 pt-4 pb-3 text-foreground">
            <span className="mx-auto rounded-full bg-muted px-3 py-1 text-[11px] font-medium">
              {m.demos_hero_expense()}
            </span>
            <output
              aria-live="polite"
              aria-label={m.demos_amount()}
              className="num block text-center text-[32px] leading-none font-medium tracking-[-0.03em]"
            >
              {amount ? `−€${amount}` : <span className="text-muted-foreground">€0</span>}
            </output>
            <div className="flex justify-center gap-1.5 text-[11px]" aria-hidden="true">
              <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5">
                <CreditCardIcon className="size-3 text-subtle-foreground" /> {m.demos_wallet_visa()}
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5">
                <CalendarBlankIcon className="size-3 text-subtle-foreground" /> {m.demos_today()}
              </span>
            </div>
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px]">
              <span className="truncate">{preset.payee}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {m.demos_usually({ amount: fmt(preset.usual, "eur") })}
              </span>
            </div>
            <div role="group" aria-label={m.demos_category()} className="grid grid-cols-4 gap-0.5">
              {PHONE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className="flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-muted-foreground transition-colors hover:bg-muted aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:ring-[1.5px] aria-pressed:ring-foreground aria-pressed:ring-inset"
                >
                  <CategoryIcon icon={CAT[c].icon} className="size-[18px] in-aria-pressed:text-foreground" />
                  <span className="w-full truncate text-center">{CAT[c].name()}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label={m.demos_hero_keypad()} className="grid grid-cols-3">
              {HERO_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k === "del" ? m.demos_hero_delete_digit() : k === "." ? m.demos_hero_decimal_point() : k}
                  onClick={() => setAmount((a) => pressKey(a, k))}
                  className="num flex h-[34px] items-center justify-center rounded-xl text-lg transition-[background-color,scale] duration-100 ease-out hover:bg-muted active:bg-muted motion-safe:active:scale-[0.94]"
                >
                  {k === "del" ? <BackspaceIcon className="size-[18px]" aria-hidden="true" /> : k}
                </button>
              ))}
            </div>
            <button
              ref={addRef}
              data-add=""
              type="button"
              onClick={add}
              disabled={!cents}
              className="mt-auto h-11 shrink-0 rounded-[12px] bg-primary text-sm font-medium text-primary-foreground transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-primary/85 disabled:opacity-40 motion-safe:active:scale-[0.98]"
            >
              {cents ? m.demos_hero_add({ amount: fmt(cents, "eur") }) : m.demos_hero_enter_amount()}
            </button>
          </div>
        </div>

        {/* The desk: the same entries a moment later, on Activity, with the month beside them */}
        <div className={cn(appWindow, "-ml-8 min-w-0 flex-1 @max-[579px]/stage:mt-4 @max-[579px]/stage:ml-0")}>
          <div
            className="flex items-center gap-1.5 border-b py-2.5 pr-3 pl-3 @min-[580px]/stage:pl-12"
            aria-hidden="true"
          >
            <KoshaMark className="mr-1 h-5" />
            {NAV.map((t, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[13px]",
                  i === 1 ? "bg-muted font-medium" : "text-muted-foreground @max-[719px]:hidden"
                )}
              >
                {t()}
              </span>
            ))}
            <span className="ml-auto text-xs font-medium">{date(10, 1, { month: "long", year: "numeric" })}</span>
            <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">EUR</span>
          </div>
          <div className="grid items-start gap-3 bg-background py-3 pr-3 pl-3 @min-[580px]/stage:pl-12 @min-[720px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className={cn(card, "p-2")}>
              <div className="flex items-baseline justify-between px-2 pt-2 pb-1 text-[13px]">
                <span className="font-medium">{m.demos_today()}</span>
                <span className="num text-xs text-muted-foreground">{out(today)}</span>
              </div>
              <ul ref={listRef} className="h-[220px] overflow-hidden" aria-live="polite">
                <HeroRows rows={rows.slice(0, TODAY_ROWS)} />
              </ul>
              <div className="@max-[719px]:hidden">
                <div className="mt-1 flex items-baseline justify-between border-t px-2 pt-3 pb-1 text-[13px]">
                  <span className="font-medium">{m.demos_yesterday()}</span>
                  <span className="num text-xs text-muted-foreground">
                    {out(sum(HERO_YESTERDAY.map((r) => r.cents)))}
                  </span>
                </div>
                <ul>
                  <HeroRows rows={HERO_YESTERDAY} />
                </ul>
              </div>
            </div>
            <div className={cn(card, "p-4 @max-[719px]:order-first")}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-medium">{m.demos_month_so_far({ month: date(10, 1, { month: "long" }) })}</span>
                <span className="text-xs text-muted-foreground">{m.demos_day_of({ day: 18, days: 30 })}</span>
              </div>
              <div className="cents-muted mt-3 text-[30px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
                <Rolling cents={spent} currency="eur" />
              </div>
              <p className={cn("mt-2 text-xs", gap >= 0 ? "text-positive" : "text-warning")}>
                {(gap >= 0 ? m.demos_under_pace : m.demos_over_pace)({ amount: whole(Math.abs(gap), "eur") })}
              </p>
              <PaceChart mo={NOVEMBER} spend={spend} className="mt-6 h-28 @max-[719px]:hidden" />
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-xs @max-[719px]:hidden">
                <div>
                  <dt className="text-muted-foreground">{m.demos_still_to_pay()}</dt>
                  <dd className="num mt-1 text-sm">{fmt(NOVEMBER.third.value, "eur")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{m.demos_hero_entries_today()}</dt>
                  <dd className="num mt-1 text-sm">{rows.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {flight && (
          <div
            ref={ghostRef}
            aria-hidden="true"
            style={{ left: flight.from.x, top: flight.from.y }}
            className="pointer-events-none absolute z-30 inline-flex items-center gap-2 rounded-full bg-ink py-2 pr-3.5 pl-2.5 text-[13px] whitespace-nowrap text-chalk opacity-0 shadow-chip"
          >
            <CategoryIcon icon={iconOf(flight.row.category)} className="size-4 text-marigold" />
            {say(flight.row.payee)}
            <span className="num">{out(flight.row.cents)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Pocket: one line becomes a transaction ----------

const QA_WALLETS: { id: string; name: Text }[] = [
  { id: "visa", name: m.demos_wallet_visa },
  { id: "current", name: m.demos_wallet_current },
  { id: "cash", name: m.demos_wallet_cash },
  { id: "wise", name: "Wise" },
]
const QA_CATEGORIES: Cat[] = ["dining", "groceries", "transit", "coffee", "salary", "travel"]
/** Past payees: what the app learns from your history. */
const HISTORY: { title: Text; category: Cat; wallet: string; avg: number }[] = [
  { title: "Tesco", category: "groceries", wallet: "current", avg: 4312 },
  { title: "Pizza Hut", category: "dining", wallet: "visa", avg: 2490 },
  { title: "Uber", category: "transit", wallet: "visa", avg: 1460 },
  { title: "Starbucks", category: "coffee", wallet: "current", avg: 520 },
  { title: m.demos_payee_salary, category: "salary", wallet: "current", avg: 420000 },
]
// The first one rests on screen when motion is off, so it leaves two values for the history to guess. Each
// language's examples use its own category and account names, so the parser reads them the same way.
const EXAMPLES = [m.demos_qa_example_1, m.demos_qa_example_2, m.demos_qa_example_3, m.demos_qa_example_4]

const findPayees = <T extends { title: string }>(history: T[], payee: string) => {
  const q = payee.trim().toLowerCase().split(/\s+/)[0]
  if (!q || q.length < 2) return []
  return history.filter((h) =>
    h.title
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(q))
  )
}

/** An amount as a person types it in their language ("12.50", "12,50"), which the parser reads either way. */
const typedAmount = (cents: number) =>
  new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, useGrouping: false }).format(cents / 100)

export function QuickAddDemo() {
  const [ref, inView] = useInView<HTMLDivElement>()
  // The demo types EXAMPLES once through while it is on screen, then rests. Typing in the box takes over.
  // Under reduced motion it never plays: the box shows the first example, ready to edit.
  const reduced = useReducedMotion()
  const [wantPlay, setPlaying] = useState(true)
  const playing = wantPlay && !reduced
  const [step, setStep] = useState(() => ({ ex: 0, len: EXAMPLES[0]().length }))
  const [typed, setTyped] = useState<string | null>(null)
  const [added, setAdded] = useState<{ amount: string; payee: string | null } | null>(null)
  const text = typed ?? EXAMPLES[step.ex]().slice(0, step.len)
  // Values flash once when an example is complete, not on every keystroke of the demo.
  const midDemo = typed === null && step.len < EXAMPLES[step.ex]().length

  useEffect(() => {
    if (!playing || !inView || typed !== null) return
    const full = EXAMPLES[step.ex]()
    const t =
      step.len < full.length
        ? setTimeout(() => setStep({ ...step, len: step.len + 1 }), 55)
        : setTimeout(() => {
            if (step.ex === EXAMPLES.length - 1) setPlaying(false)
            else setStep({ ex: step.ex + 1, len: 0 })
          }, 1900)
    return () => clearTimeout(t)
  }, [playing, inView, typed, step])

  const wallets = QA_WALLETS.map((w) => ({ id: w.id, name: say(w.name) }))
  const categories = QA_CATEGORIES.map((id) => ({ id, name: CAT[id].name(), icon: CAT[id].icon }))
  const history = HISTORY.map((h) => ({ ...h, title: say(h.title) }))
  const categoryOf = (id: string | null | undefined) => categories.find((c) => c.id === id)
  const walletOf = (id: string | null | undefined) => wallets.find((w) => w.id === id)
  const p = parseQuickAdd(text, wallets, categories)
  const matches = findPayees(history, p.payee)
  const known = matches.length === 1 ? matches[0] : null
  const income = p.income || known?.category === "salary"
  const category = categoryOf(p.categoryId) ?? categoryOf(known?.category)
  const wallet = walletOf(p.walletId) ?? walletOf(known?.wallet)
  const amount = p.amount ? `${income ? "+" : "−"}${fmt(p.amount, "eur")}` : null
  const payee = known?.title ?? (p.payee || null)
  // Nothing is saved here, so the result shows inside the demo rather than as an app-wide toast.
  const add = () => {
    if (!p.amount) return
    setAdded({ amount: amount!, payee })
    setTyped("")
  }

  // On a narrow window the boxes wrap two a row: amount and date, then the payee, then category and account.
  const fields: { label: string; value: string | null; guess: boolean; icon?: string; order: string }[] = [
    { label: m.demos_amount(), value: amount, guess: false, order: "@max-[599px]:order-1" },
    {
      label: m.demos_payee(),
      value: payee,
      guess: !!known && known.title.toLowerCase() !== p.payee.toLowerCase(),
      order: "@max-[599px]:order-2 @max-[599px]:col-span-2",
    },
    {
      label: m.demos_category(),
      value: category?.name ?? null,
      guess: !p.categoryId,
      icon: category?.icon,
      order: "@max-[599px]:order-3",
    },
    { label: m.demos_account(), value: wallet?.name ?? null, guess: !p.walletId, order: "@max-[599px]:order-3" },
    {
      label: m.demos_date(),
      value: p.date === "yesterday" ? m.demos_yesterday() : m.demos_today(),
      guess: !p.date,
      order: "@max-[599px]:order-1",
    },
  ]

  return (
    <div ref={ref} className={cn(appWindow, "flex h-full flex-col")}>
      {/* Keyboard focus shows as an ink line under the row; the input itself draws no outline. */}
      <div className="flex items-center gap-3 border-b px-4 py-2 has-[input:focus-visible]:shadow-[inset_0_-2px_0_var(--foreground)] @min-[480px]:px-5">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
          <PlusIcon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{m.demos_qa_label()}</span>
          <input
            value={text}
            onChange={(e) => {
              setTyped(e.target.value)
              setAdded(null)
            }}
            onFocus={() => setTyped(text)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={m.demos_qa_placeholder()}
            spellCheck={false}
            autoComplete="off"
            className="num min-w-0 flex-1 bg-transparent text-base outline-none! placeholder:text-muted-foreground @min-[480px]:text-lg"
          />
        </label>
        {typed === null && !reduced && (
          <button
            type="button"
            onClick={() => (playing ? setPlaying(false) : (setStep({ ex: 0, len: 0 }), setPlaying(true)))}
            aria-label={playing ? m.demos_qa_pause() : m.demos_qa_play()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:size-11"
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </button>
        )}
      </div>

      <div className="px-4 py-4 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">{m.demos_qa_will_add()}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 @min-[600px]:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto]">
          {fields.map((f, i) => (
            <div key={i} className={cn("min-w-0 rounded-lg border px-3 py-2.5", f.order)}>
              <div className="text-[11px] text-muted-foreground">{f.label}</div>
              <div
                key={midDemo ? "typing" : (f.value ?? "none")}
                data-flash={f.value && !midDemo ? "" : undefined}
                className={cn(
                  "-mx-1 mt-1 flex items-center gap-1.5 rounded px-1 text-sm whitespace-nowrap",
                  !f.value || f.guess ? "text-muted-foreground" : "text-foreground",
                  i === 0 && "num"
                )}
              >
                {f.icon && <CategoryIcon icon={f.icon} className="size-4" />}
                <span className="truncate">{f.value ?? m.demos_qa_none_yet()}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {added ? (
              <span className="text-positive">
                {added.payee
                  ? m.demos_qa_added({ amount: added.amount, payee: added.payee })
                  : m.demos_qa_added_no_payee({ amount: added.amount })}
              </span>
            ) : (
              m.demos_qa_guesses()
            )}
          </p>
          <button type="button" onClick={add} disabled={!p.amount} className={cn(mockPrimary, "h-10 px-4 text-sm")}>
            {income ? m.demos_qa_add_income() : m.demos_qa_add_expense()}
            <kbd className="rounded border border-primary-foreground/30 px-1 font-mono text-[11px]">↵</kbd>
          </button>
        </div>
      </div>

      <div className="mt-auto border-t px-4 py-3 @min-[480px]:px-5">
        <p className="text-xs text-muted-foreground">{m.demos_qa_payees()}</p>
        <ul className="mt-1">
          {[...matches, ...history.filter((h) => !matches.includes(h))].slice(0, 3).map((h) => (
            <li key={h.title}>
              <button
                type="button"
                onClick={() => setTyped(`${p.amount ? typedAmount(p.amount) + " " : ""}${h.title.toLowerCase()}`)}
                className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="truncate">{h.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground @max-[479px]:hidden">
                  <CategoryIcon icon={categoryOf(h.category)?.icon} className="size-3.5" />
                  {categoryOf(h.category)?.name}, {walletOf(h.wallet)?.name}
                </span>
                <span className="num ml-auto shrink-0 text-xs text-muted-foreground">
                  {m.demos_usually({ amount: fmt(h.avg, "eur") })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------- Pocket: a sentence becomes a transaction (AI) ----------

type Read = { label: string; value: string; icon?: string; wide?: boolean }
// What natural-language add returns for each sentence. Today is Wednesday 18 November.
const lastFriday = () => date(10, 13, { weekday: "short", day: "numeric", month: "short" })
const sentences = (): { text: string; read: Read[] }[] => [
  {
    text: m.demos_sentence_1(),
    read: [
      { label: m.demos_amount(), value: out(1850) },
      { label: m.demos_date(), value: lastFriday() },
      { label: m.demos_payee(), value: "Nando's" },
      { label: m.demos_category(), value: CAT.dining.name(), icon: CAT.dining.icon },
      { label: m.demos_note(), value: m.demos_sentence_1_note(), wide: true },
    ],
  },
  {
    text: m.demos_sentence_2(),
    read: [
      { label: m.demos_amount(), value: out(1100) },
      { label: m.demos_date(), value: lastFriday() },
      { label: m.demos_payee(), value: m.demos_payee_taxi() },
      { label: m.demos_category(), value: CAT.transit.name(), icon: "ph:taxi" },
      { label: m.demos_note(), value: m.demos_sentence_2_note(), wide: true },
    ],
  },
  {
    text: m.demos_sentence_3(),
    read: [
      { label: m.demos_amount(), value: `+${fmt(4000, "eur")}` },
      { label: m.demos_date(), value: m.demos_today() },
      { label: m.demos_payee(), value: "Leo" },
      { label: m.demos_category(), value: CAT.refund.name(), icon: CAT.refund.icon },
      { label: m.demos_note(), value: m.demos_sentence_3_note(), wide: true },
    ],
  },
]

export function SentenceDemo() {
  const reduced = useReducedMotion()
  const options = sentences()
  const [pick, setPick] = useState(0)
  const [len, setLen] = useState(options[0].text.length)
  const s = options[pick]
  const reading = len < s.text.length

  useEffect(() => {
    if (len >= s.text.length) return
    const t = setTimeout(() => setLen((l) => l + 1), 28)
    return () => clearTimeout(t)
  }, [len, s.text.length])

  const choose = (i: number) => {
    setPick(i)
    setLen(reduced ? options[i].text.length : 0)
  }

  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="flex min-h-14 items-center gap-3 border-b px-4 py-3 @min-[480px]:px-5">
        <AiMark className="size-4" />
        <p className="min-w-0 flex-1 text-[15px]">
          <span className="sr-only">{s.text}</span>
          <span aria-hidden="true">{s.text.slice(0, len)}</span>
          {reading && <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] bg-foreground" />}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 py-4 @min-[480px]:px-5">
        {s.read.map((f, i) => (
          <div key={i} className={cn("min-w-0 rounded-lg border px-3 py-2.5", f.wide && "col-span-2")}>
            <div className="text-[11px] text-muted-foreground">{f.label}</div>
            <div
              key={`${pick}-${reading}`}
              data-flash={reading ? undefined : ""}
              className={cn(
                "-mx-1 mt-1 flex items-center gap-1.5 rounded px-1 text-sm",
                reading ? "text-muted-foreground" : "text-foreground",
                i === 0 && "num"
              )}
            >
              {reading ? (
                m.demos_sentence_reading()
              ) : (
                <>
                  {f.icon && <CategoryIcon icon={f.icon} className="size-4" />}
                  <span className="truncate">{f.value}</span>
                  <AiMark className="ml-auto size-3" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div
        className="mt-auto flex flex-wrap gap-1.5 border-t px-4 py-3 @min-[480px]:px-5"
        role="group"
        aria-label={m.demos_sentence_try()}
      >
        {options.map((x, i) => (
          <button
            key={x.text}
            type="button"
            aria-pressed={pick === i}
            onClick={() => choose(i)}
            className="min-h-8 rounded-full border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground max-md:min-h-11"
          >
            {x.text}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Pocket: a receipt photo becomes a transaction (AI) ----------

// A receipt in pounds, read into a euro account: converted at today's rate, as receipt scanning does.
const RECEIPT_LINES = [
  ["Black daal", "9.50"],
  ["Chicken ruby", "15.90"],
  ["House chai x2", "9.00"],
  ["Service", "4.00"],
]
const RECEIPT_PAID = { amount: 3840, currency: "gbp", note: "" }
/** The bill in euros, as receipt scanning converts it. */
const RECEIPT_CENTS = Math.round(convert(RECEIPT_PAID.amount, RECEIPT_PAID.currency, "eur", RATES))

export function ReceiptDemo() {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>(0.5)
  const [scans, setScans] = useState(0)
  const scanned = useRef(false)
  // One pass of the scan line the first time the receipt shows; the values are there all along.
  useEffect(() => {
    if (!inView || reduced || scanned.current) return
    scanned.current = true
    setScans(1)
  }, [inView, reduced])

  const receipt = inCurrency(RECEIPT_PAID, "eur", RATES)
  const fields: Read[] = [
    { label: m.demos_payee(), value: "Dishoom" },
    { label: m.demos_amount(), value: out(receipt.amount ?? 0) },
    {
      label: m.demos_date(),
      value: new Date(Date.UTC(2026, 10, 14, 20, 15)).toLocaleString(intlLocale(), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }),
    },
    { label: m.demos_category(), value: CAT.dining.name(), icon: CAT.dining.icon },
    { label: m.demos_note(), value: receipt.note },
  ]

  return (
    <div ref={ref} className={cn(appWindow, "h-full")}>
      <div className="grid h-full gap-4 p-4 @min-[480px]:p-5 @min-[500px]:grid-cols-[200px_minmax(0,1fr)]">
        {/* The photo: a restaurant bill in pounds */}
        <div className="relative self-start overflow-hidden rounded-md bg-chalk px-4 py-4 font-mono text-[11px] leading-[1.75] text-ink shadow-paper ring-1 ring-ink/5 @max-[499px]:mx-auto @max-[499px]:w-[220px]">
          <p className="text-center text-[12px] font-semibold">DISHOOM</p>
          <p className="text-center text-ink/60">Covent Garden, London</p>
          <p className="mt-2 text-ink/60">14/11/2026 20:15</p>
          <div className="mt-2 border-t border-dashed border-ink/25 pt-2">
            {RECEIPT_LINES.map(([item, price]) => (
              <p key={item} className="flex justify-between gap-3">
                <span>{item}</span>
                <span>{price}</span>
              </p>
            ))}
          </div>
          <p className="mt-2 flex justify-between border-t border-dashed border-ink/25 pt-2 font-semibold">
            <span>TOTAL</span>
            <span>£38.40</span>
          </p>
          <p className="mt-1 text-ink/60">VISA ****4417</p>
          {scans > 0 && (
            <span
              key={scans}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-10 animate-[kosha-scan_1.4s_ease-in-out_both] bg-linear-to-b from-transparent via-positive/25 to-positive/60"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {fields.map((f, i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2">
              <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{f.label}</span>
              <span
                key={scans}
                data-flash={scans ? "" : undefined}
                className={cn("-mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-sm", i === 1 && "num")}
              >
                {f.icon && <CategoryIcon icon={f.icon} className="size-4" />}
                <span className="truncate">{f.value}</span>
              </span>
              <AiMark className="size-3" />
            </div>
          ))}
          {!reduced && (
            <button
              type="button"
              onClick={() => setScans((n) => n + 1)}
              className={cn(mockButton, "mt-auto self-start")}
            >
              {m.demos_receipt_again()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Pocket: entries added offline wait on the phone ----------

const QUEUED: { payee: Text; category: Cat; cents: number; time: string }[] = [
  { payee: "Gail's Bakery", category: "coffee", cents: 320, time: "07:52" },
  { payee: m.demos_payee_bus_fare, category: "transit", cents: 240, time: "08:05" },
  { payee: m.demos_payee_market_stall, category: "groceries", cents: 650, time: "08:20" },
]

export function OfflineDemo() {
  const [online, setOnline] = useState(false)
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-3.5 @min-[480px]:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card shadow-xs ring-1 ring-border">
          <KoshaMark className="h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{m.demos_offline_install_title()}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{m.demos_offline_install_body()}</p>
        </div>
      </div>
      <div className="flex items-start gap-3 border-b px-4 py-4 @min-[480px]:px-5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            online ? "bg-brand-soft text-positive" : "bg-muted text-subtle-foreground"
          )}
        >
          {online ? (
            <CheckIcon className="size-[18px]" aria-hidden="true" />
          ) : (
            <CloudSlashIcon className="size-[18px]" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-sm font-medium">{online ? m.demos_offline_back_online() : m.common_offline_title()}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {online ? m.demos_offline_synced_body() : m.demos_offline_waiting_body()}
          </p>
        </div>
      </div>
      <ul className="px-2 py-2">
        {QUEUED.map((q) => (
          <li key={q.time} className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-[13px] @min-[480px]:px-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CategoryIcon icon={iconOf(q.category)} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{say(q.payee)}</span>
              <Meta>
                <span>{CAT[q.category].name()}</span>
                <span>{q.time}</span>
              </Meta>
            </span>
            <span className="num shrink-0">{out(q.cents)}</span>
            <span
              className="w-5 shrink-0"
              role="img"
              aria-label={online ? m.demos_offline_synced() : m.demos_offline_waiting()}
            >
              {online ? (
                <CheckIcon className="size-4 text-positive" />
              ) : (
                <ClockIcon className="size-4 text-muted-foreground" />
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t px-4 py-3 @min-[480px]:px-5">
        <button type="button" onClick={() => setOnline(!online)} className={mockButton}>
          {online ? m.demos_offline_go_offline() : m.demos_offline_reconnect()}
        </button>
      </div>
    </div>
  )
}

// ---------- Desk: the month so far ----------

export function OverviewDemo() {
  const [index, setIndex] = useState(1)
  const [currency, setCurrency] = useState("eur")
  const mo = MONTHS[index]
  // The data is in euros; the switch converts it like the app's display currency does.
  const c = (cents: number) => convert(cents, "eur", currency, RATES)
  const spent = sum(mo.spend)
  const usualMonth = usualBy(mo.days)
  const lastDay = mo.today ?? mo.days
  const usualToDay = usualBy(lastDay)
  const gap = usualToDay - spent
  const maxWhere = Math.max(...mo.where.map((w) => w.spent))
  const name = date(mo.month, 1, { month: "long" })

  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      {/* The app's top bar, trimmed to what fits */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5 @min-[480px]:px-4">
        <span className="flex items-center gap-2 pr-1 text-sm font-semibold" aria-hidden="true">
          <KoshaMark className="h-5" /> <span className="@max-[520px]:hidden">Kosha</span>
        </span>
        <span
          aria-hidden="true"
          className="hidden h-8 items-center rounded-md bg-muted px-2.5 text-[13px] font-medium @min-[600px]:inline-flex"
        >
          {NAV[0]()}
        </span>
        {NAV.slice(1).map((t, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="hidden px-2 text-[13px] text-muted-foreground @min-[860px]:inline"
          >
            {t()}
          </span>
        ))}
        <div className={cn(segment, "ml-auto")}>
          <button
            type="button"
            aria-label={m.demos_overview_previous_month()}
            aria-disabled={index === 0}
            onClick={() => setIndex(0)}
            className={cn(segmentButton, "aria-disabled:opacity-35")}
          >
            <CaretLeftIcon className="size-3.5" />
          </button>
          <span className="w-[100px] text-center text-xs font-medium" aria-live="polite">
            {date(mo.month, 1, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            aria-label={m.demos_overview_next_month()}
            aria-disabled={index === MONTHS.length - 1}
            onClick={() => setIndex(1)}
            className={cn(segmentButton, "aria-disabled:opacity-35")}
          >
            <CaretRightIcon className="size-3.5" />
          </button>
        </div>
        <div role="group" aria-label={m.demos_overview_display_currency()} className={segment}>
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

      <div className="grid flex-1 gap-3 bg-background p-3 @min-[480px]:p-4 @min-[640px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Month pace */}
        <div className={cn(card, "flex flex-col p-4 @min-[480px]:p-5")}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-medium">{mo.today ? m.demos_month_so_far({ month: name }) : name}</span>
            <span className="text-xs text-muted-foreground">
              {mo.today ? m.demos_day_of({ day: mo.today, days: mo.days }) : m.demos_days({ count: mo.days })}
            </span>
          </div>
          <div className="cents-muted mt-3 text-[32px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
            <Rolling cents={c(spent)} currency={currency} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-2.5 text-xs">
            <span className={gap >= 0 ? "text-positive" : "text-warning"}>
              {(mo.today
                ? gap >= 0
                  ? m.demos_under_pace
                  : m.demos_over_pace
                : gap >= 0
                  ? m.demos_under_month
                  : m.demos_over_month)({ amount: whole(c(Math.abs(gap)), currency) })}
            </span>
            {mo.today && (
              <span className="text-muted-foreground">
                {m.demos_overview_usual_by_today({ amount: whole(c(usualToDay), currency) })}
              </span>
            )}
          </p>
          <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-chart-2" /> {m.demos_overview_this_month()}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-muted-foreground" />{" "}
              {m.demos_overview_usual_month({ amount: whole(c(usualMonth), currency) })}
            </span>
          </div>

          <PaceChart
            mo={mo}
            spend={mo.spend}
            money={(cents) => whole(c(cents), currency)}
            className="mt-4 min-h-36 flex-1 @min-[480px]:min-h-44"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{date(mo.month, 1)}</span>
            {mo.today && <span>{m.demos_today()}</span>}
            <span>{date(mo.month, mo.days)}</span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-xs">
            {[
              {
                label: m.demos_overview_income(),
                value: INCOME,
                note: m.demos_income_note({ date: date(mo.month, 1) }),
              },
              {
                label: mo.today ? m.demos_overview_saved_so_far() : m.demos_overview_saved(),
                value: INCOME - spent,
                note: m.demos_overview_of_income({ pct: pct(Math.round(((INCOME - spent) / INCOME) * 100)) }),
                pos: true,
              },
              { label: mo.third.label(), value: mo.third.value, note: mo.third.note() },
            ].map((s, i) => (
              <div key={i} className="min-w-0">
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
            <span className="font-medium">{m.demos_overview_where()}</span>
            <span className="text-xs text-muted-foreground">{m.demos_overview_vs_usual()}</span>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {mo.where.map((w) => (
              <li key={w.cat} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={CAT[w.cat].icon} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{CAT[w.cat].name()}</span>
                  <span className="num">{fmt(c(w.spent), currency)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full origin-left rounded-full bg-chart-2 transition-transform duration-700 ease-out motion-reduce:transition-none"
                      style={{ transform: `scaleX(${w.spent / maxWhere})` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "num w-11 rounded-full bg-muted py-px text-center text-[11px]",
                      w.tone === "pos" && "text-positive",
                      w.tone === "warn" && "text-warning",
                      !w.tone && "text-muted-foreground"
                    )}
                  >
                    {typeof w.chip === "number" ? pct(w.chip, true) : w.chip()}
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

// ---------- Desk: last month's recap (AI) ----------

const OCTOBER = MONTHS[0]
const octSpent = sum(OCTOBER.spend)
const octOver = octSpent - usualBy(OCTOBER.days)

export function RecapDemo() {
  const month = date(OCTOBER.month, 1, { month: "long" })
  return (
    <div className={cn(appWindow, "flex h-full flex-col p-4 @min-[480px]:p-5")}>
      <div className="flex items-center gap-2 text-[13px]">
        <AiMark className="size-4" />
        <span className="font-medium">{m.demos_recap_title({ month })}</span>
        <span className="ml-auto text-xs text-muted-foreground">{m.demos_recap_written({ date: date(10, 2) })}</span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-pretty">
        <ParaglideMessage
          message={octOver > 0 ? m.demos_recap_more : m.demos_recap_less}
          inputs={{
            spent: fmt(octSpent, "eur"),
            diff: whole(Math.abs(octOver), "eur"),
            travel: fmt(58000, "eur"),
            month,
            under: whole(Math.abs(octOver - 58000), "eur"),
          }}
          markup={num}
        />
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-pretty text-subtle-foreground">
        {m.demos_recap_kept({ pct: pct(Math.round(((INCOME - octSpent) / INCOME) * 100)) })}
      </p>
    </div>
  )
}

// ---------- Desk: Ask Kosha (AI) ----------

type Source = { payee: string; day: string; cents: number }
const questions = (): { q: string; a: ReactNode; from: Source[]; followUp: { q: string; a: ReactNode } }[] => [
  {
    q: m.demos_ask_q1(),
    a: (
      <ParaglideMessage
        message={m.demos_ask_a1}
        inputs={{ total: fmt(74260, "eur"), travel: fmt(52240, "eur"), dining: fmt(12450, "eur") }}
        markup={num}
      />
    ),
    from: [
      { payee: "Hotel Lis", day: date(9, 12), cents: 30400 },
      { payee: "TAP Air Portugal", day: date(9, 12), cents: 21840 },
      { payee: "Time Out Market", day: date(9, 14), cents: 4620 },
    ],
    followUp: {
      q: m.demos_ask_q1_follow(),
      a: <ParaglideMessage message={m.demos_ask_a1_follow} inputs={{ amount: fmt(52420, "eur") }} markup={num} />,
    },
  },
  {
    q: m.demos_ask_q2(),
    a: <ParaglideMessage message={m.demos_ask_a2} inputs={{ amount: fmt(15840, "eur") }} markup={num} />,
    from: [
      { payee: "Dishoom", day: date(10, 14), cents: RECEIPT_CENTS },
      { payee: "Nando's", day: date(10, 13), cents: 1850 },
      { payee: "Pizza Hut", day: date(10, 12), cents: 2490 },
    ],
    followUp: {
      q: m.demos_ask_q2_follow(),
      a: <ParaglideMessage message={m.demos_ask_a2_follow} inputs={{ amount: fmt(12774, "eur") }} markup={num} />,
    },
  },
  {
    q: m.demos_ask_q3(),
    a: (
      <ParaglideMessage
        message={m.demos_ask_a3}
        inputs={{ amount: fmt(2498, "eur"), committed: fmt(133197, "eur") }}
        markup={num}
      />
    ),
    from: [
      { payee: "Netflix", day: date(11, 5), cents: 1399 },
      { payee: "Spotify", day: date(10, 24), cents: 1099 },
    ],
    followUp: {
      q: m.demos_ask_q3_follow(),
      a: (
        <ParaglideMessage
          message={m.demos_ask_a3_follow}
          inputs={{ amount: fmt(1099, "eur"), date: date(10, 24, { day: "numeric", month: "long" }) }}
          markup={num}
        />
      ),
    },
  },
]

export function AskDemo() {
  const [pick, setPick] = useState(0)
  const all = questions()
  const x = all[pick]
  return (
    <div className={cn(appWindow, "flex h-full flex-col")}>
      <div className="flex flex-col gap-3 p-4 @min-[480px]:p-5" aria-live="polite">
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm">{x.q}</p>
        <div key={pick} className="flex gap-2.5">
          <AiMark className="mt-1 size-4" />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-pretty">{x.a}</p>
            <ul className="mt-3 rounded-lg border" aria-label={m.demos_ask_sources()}>
              {x.from.map((f) => (
                <li
                  key={f.payee}
                  className="flex min-h-10 items-center gap-3 border-b px-3 text-[13px] last:border-b-0"
                >
                  <span className="num w-12 shrink-0 text-xs text-muted-foreground">{f.day}</span>
                  <span className="min-w-0 flex-1 truncate">{f.payee}</span>
                  <span className="num shrink-0 text-xs">{out(f.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-1 ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm">
          {x.followUp.q}
        </p>
        <div className="flex gap-2.5">
          <AiMark className="mt-1 size-4" />
          <p className="text-sm leading-relaxed text-pretty">{x.followUp.a}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1.5 border-t p-3" role="group" aria-label={m.demos_ask_pick()}>
        {all.map((y, i) => (
          <button
            key={y.q}
            type="button"
            aria-pressed={i === pick}
            onClick={() => setPick(i)}
            className="flex min-h-10 items-center justify-between gap-2 rounded-lg border px-3 text-left text-[13px] transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted max-md:min-h-11"
          >
            {y.q}
            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Desk: bills and subscriptions, the next 30 days ----------

type Due = {
  id: string
  name: Text
  kind: () => string
  /** Months between payments. */
  months: 1 | 3
  day: number
  amount: number
  transfer?: boolean
}
// Days are counted from today, 18 November.
const DUE: Due[] = [
  { id: "phone", name: m.demos_payee_phone_bill, kind: m.demos_recurring_bill, months: 1, day: 2, amount: 2499 },
  { id: "spotify", name: "Spotify", kind: m.demos_recurring_subscription, months: 1, day: 6, amount: 1099 },
  {
    id: "insurance",
    name: m.demos_payee_car_insurance,
    kind: m.demos_recurring_bill,
    months: 3,
    day: 9,
    amount: 12600,
  },
  { id: "rent", name: m.demos_cat_rent, kind: m.demos_recurring_bill, months: 1, day: 13, amount: 124000 },
  {
    id: "savings",
    name: m.demos_recurring_savings,
    kind: m.demos_recurring_transfer,
    months: 1,
    day: 13,
    amount: 40000,
    transfer: true,
  },
  { id: "netflix", name: "Netflix", kind: m.demos_recurring_subscription, months: 1, day: 17, amount: 1399 },
]
const dayLabel = (offset: number) => date(10, 18 + offset)
const perMonth = (d: Due) => d.amount / d.months

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
    <div className={cn(appWindow, "h-full")}>
      <div className="grid grid-cols-2 divide-x border-b">
        <div className="px-4 py-4 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">{m.demos_recurring_committed()}</p>
          <p className="num mt-1.5 text-xl">{fmt(sum(bills.map(perMonth)), "eur")}</p>
        </div>
        <div className="px-4 py-4 @min-[480px]:px-5">
          <p className="text-xs text-muted-foreground">{m.demos_recurring_moved_to_savings()}</p>
          <p className="num mt-1.5 text-xl text-muted-foreground">{fmt(40000, "eur")}</p>
        </div>
      </div>

      <div className="border-b px-4 pt-4 pb-3 @min-[480px]:px-5" aria-hidden="true">
        <p className="text-xs text-muted-foreground">{m.demos_recurring_next_30()}</p>
        <div className="mt-3 flex h-20 items-end gap-[3px]">
          {Array.from({ length: 30 }, (_, i) => {
            const items = open.filter((d) => d.day === i)
            const spent = sum(items.filter((d) => !d.transfer).map((d) => d.amount))
            const moved = items.some((d) => d.transfer)
            const lit = items.some((d) => d.id === selected)
            return (
              <div
                key={i}
                className={cn("relative flex h-full flex-1 flex-col justify-end", i === 13 && "ml-1 border-l pl-1")}
              >
                {spent > 0 && (
                  <div
                    className={cn(
                      "w-full origin-bottom rounded-[3px] transition-colors duration-300 ease-out",
                      lit ? "bg-positive" : "bg-chart-2"
                    )}
                    // Square-root scale, so small bills still read next to the rent.
                    style={{ height: `${Math.max(12, Math.sqrt(spent / maxDay) * 92)}%` }}
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
                {!spent && !moved && <div className="h-1 w-full rounded-full bg-muted" />}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{m.demos_today()}</span>
          <span>{dayLabel(13)}</span>
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
                  <span className={cn("block truncate", d.transfer && "text-subtle-foreground")}>{say(d.name)}</span>
                  <Meta>
                    {state[d.id] === "paid" ? (
                      d.transfer ? (
                        m.demos_recurring_moved_today()
                      ) : (
                        m.demos_recurring_paid_today()
                      )
                    ) : state[d.id] === "skipped" ? (
                      m.demos_recurring_skipped()
                    ) : (
                      <>
                        <span>{d.kind()}</span>
                        <span>
                          {d.months === 3 ? m.demos_recurring_every_3_months() : m.demos_recurring_every_month()}
                        </span>
                      </>
                    )}
                  </Meta>
                </span>
                <span
                  className={cn(
                    "num shrink-0",
                    d.transfer && "text-muted-foreground",
                    state[d.id] && "line-through opacity-50"
                  )}
                >
                  {d.transfer ? fmt(d.amount, "eur") : out(d.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {/* The selected item's next payment, as in the app's detail panel */}
        <div className="m-3 flex flex-col rounded-xl bg-muted p-4 @min-[560px]:ml-0">
          <p className="text-xs text-muted-foreground">{m.demos_recurring_next_payment()}</p>
          <p className="mt-1 font-medium">{sel.transfer ? m.demos_recurring_to_fund() : say(sel.name)}</p>
          <p className="num text-sm text-subtle-foreground">{dayLabel(sel.day)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done === "paid"
              ? sel.transfer
                ? m.demos_recurring_done_moved()
                : m.demos_recurring_done_paid()
              : done === "skipped"
                ? m.demos_recurring_done_skipped()
                : m.demos_recurring_in_days({ days: sel.day })}
          </p>
          <div className="mt-auto flex gap-2 pt-4">
            {done ? (
              <button type="button" onClick={() => set(null)} className={mockButton}>
                {m.common_undo()}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => set("paid")} className={mockPrimary}>
                  {sel.transfer ? m.demos_recurring_move_now() : m.demos_recurring_mark_paid()}
                </button>
                <button type="button" onClick={() => set("skipped")} className={mockButton}>
                  {m.demos_recurring_skip()}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Pocket: a week of entries, and how each one got there ----------

type How = "phone" | "line" | "sentence" | "receipt" | "auto"
const HOW: { key: How; label: () => string; Icon: typeof DeviceMobileIcon }[] = [
  { key: "phone", label: m.demos_week_phone, Icon: DeviceMobileIcon },
  { key: "line", label: m.demos_week_line, Icon: KeyboardIcon },
  { key: "sentence", label: m.demos_week_sentence, Icon: ChatTextIcon },
  { key: "receipt", label: m.demos_week_receipt, Icon: ReceiptIcon },
  { key: "auto", label: m.demos_week_auto, Icon: ArrowsClockwiseIcon },
]
/** Days of November. */
const WEEK: { day: number; items: { payee: Text; cents: number; how: How }[] }[] = [
  {
    day: 9,
    items: [
      { payee: "Café Nero", cents: 450, how: "phone" },
      { payee: "Tesco", cents: 4312, how: "line" },
      { payee: m.demos_payee_bus, cents: 240, how: "phone" },
    ],
  },
  {
    day: 10,
    items: [
      { payee: "Pret A Manger", cents: 895, how: "phone" },
      { payee: m.demos_payee_council_tax, cents: 12800, how: "auto" },
    ],
  },
  {
    day: 11,
    items: [
      { payee: "Café Nero", cents: 420, how: "phone" },
      { payee: "Boots", cents: 965, how: "phone" },
    ],
  },
  {
    day: 12,
    items: [
      { payee: "Pizza Hut", cents: 2490, how: "line" },
      { payee: "Uber", cents: 1460, how: "phone" },
    ],
  },
  {
    day: 13,
    items: [
      { payee: "Nando's", cents: 1850, how: "sentence" },
      { payee: m.demos_payee_taxi, cents: 1100, how: "sentence" },
    ],
  },
  {
    day: 14,
    items: [
      { payee: "Dishoom", cents: RECEIPT_CENTS, how: "receipt" },
      { payee: "Waitrose", cents: 3175, how: "line" },
    ],
  },
  {
    day: 15,
    items: [
      { payee: "Gail's Bakery", cents: 320, how: "phone" },
      { payee: "Odeon", cents: 1350, how: "line" },
    ],
  },
]
const weekItems = WEEK.flatMap((d) => d.items)
const byHand = weekItems.filter((i) => i.how !== "auto").length
/** The week in numbers, for the habit line above the strip: about five seconds an entry added by hand. */
export const WEEK_STATS = { entries: weekItems.length, byHand, seconds: byHand * 5 }

export function WeekDemo() {
  const [only, setOnly] = useState<How | null>(null)
  return (
    <div className={cn(appWindow, "flex flex-col")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3.5 @min-[480px]:px-5">
        <p className="text-sm font-medium">{m.demos_week_title()}</p>
        <div role="group" aria-label={m.demos_week_filter()} className="flex flex-wrap gap-1.5">
          {HOW.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={only === key}
              onClick={() => setOnly(only === key ? null : key)}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background max-md:min-h-11"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label()}
            </button>
          ))}
        </div>
      </div>
      {/* Seven columns when there is room; otherwise one row per day. */}
      <ol className="grid divide-y @min-[880px]:grid-cols-7 @min-[880px]:divide-x @min-[880px]:divide-y-0">
        {WEEK.map((d) => (
          <li
            key={d.day}
            className="flex gap-3 px-4 py-3 @min-[480px]:px-5 @min-[880px]:flex-col @min-[880px]:gap-0 @min-[880px]:px-3"
          >
            <p className="w-14 shrink-0 pt-2 text-xs text-muted-foreground @min-[880px]:w-auto @min-[880px]:pt-0">
              {date(10, d.day, { weekday: "short", day: "numeric" })}
            </p>
            <ul className="flex min-w-0 flex-1 flex-col gap-0.5 @min-[880px]:mt-2">
              {d.items.map((i) => {
                const method = HOW.find((h) => h.key === i.how)!
                return (
                  <li
                    key={say(i.payee)}
                    className={cn(
                      "flex min-h-9 items-center gap-2 rounded-md px-1.5 text-[13px] transition-opacity duration-200 @min-[880px]:items-start @min-[880px]:py-1.5",
                      only && only !== i.how && "opacity-25"
                    )}
                  >
                    <method.Icon
                      className="size-3.5 shrink-0 text-subtle-foreground @min-[880px]:mt-0.5"
                      role="img"
                      aria-label={method.label()}
                    />
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 @min-[880px]:flex-col @min-[880px]:gap-0">
                      <span className="truncate">{say(i.payee)}</span>
                      <span className="num shrink-0 text-xs text-muted-foreground">{fmt(i.cents, "eur")}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="num shrink-0 pt-2 text-xs @min-[880px]:mt-auto @min-[880px]:border-t @min-[880px]:pt-2">
              {fmt(sum(d.items.map((i) => i.cents)), "eur")}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------- Desk: what needs attention ----------

const attention = () => [
  {
    id: "card",
    warn: true,
    title: m.demos_attention_card_title({ amount: fmt(141230, "eur") }),
    sub: m.demos_attention_card_sub(),
    action: m.demos_attention_card_action(),
    done: m.demos_attention_card_done(),
  },
  {
    id: "dining",
    warn: true,
    title: m.demos_attention_dining_title(),
    sub: m.demos_attention_dining_sub({ spent: fmt(15840, "eur"), usual: fmt(12774, "eur") }),
    action: m.demos_attention_dining_action(),
    done: m.demos_attention_dining_done(),
  },
  {
    id: "octopus",
    warn: true,
    title: m.demos_attention_bill_title({ date: date(10, 15) }),
    sub: m.demos_attention_bill_sub({ amount: fmt(8800, "eur") }),
    action: m.demos_attention_bill_action(),
    done: m.demos_attention_bill_done(),
  },
  {
    id: "fund",
    warn: false,
    title: m.demos_attention_fund_title(),
    sub: m.demos_attention_fund_sub(),
    action: m.demos_attention_fund_action(),
    done: m.demos_attention_fund_done(),
  },
]

export function AttentionDemo() {
  const [done, setDone] = useState<Set<string>>(new Set())
  return (
    <div className={cn(appWindow, "px-4 pt-4 pb-1 @min-[480px]:px-5")}>
      <p className="text-[13px] font-medium">{m.demos_attention_title()}</p>
      <ul className="mt-3">
        {attention().map((a) => {
          const on = done.has(a.id)
          return (
            <li key={a.id} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-3 border-t py-3.5">
              <span
                className={cn(
                  "mt-1.5 size-2 rounded-full transition-colors",
                  on ? "bg-positive" : a.warn ? "bg-warning" : "bg-muted-foreground"
                )}
              />
              <div className="min-w-0" aria-live="polite">
                <p className={cn("text-sm", on && "text-muted-foreground line-through")}>{a.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{on ? a.done : a.sub}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDone((s) => {
                    const n = new Set(s)
                    if (on) n.delete(a.id)
                    else n.add(a.id)
                    return n
                  })
                }
                className={cn(mockButton, "h-8")}
              >
                {on ? m.common_undo() : a.action}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="border-t py-3.5 text-xs text-muted-foreground">{m.demos_attention_rest()}</p>
    </div>
  )
}
