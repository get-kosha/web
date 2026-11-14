import { LoansCard } from "@/components/loans"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { ArrowClockwiseIcon, XIcon } from "@phosphor-icons/react/ssr"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import { GetStarted, useStarting } from "@/components/get-started"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { AiMark } from "@/components/ai"
import { CategoryIcon } from "@/components/category-icon"
import { BigMoney, CompositionBar, HatchPattern, WorthSplit } from "@/components/net-worth"
import { Reveal, RollingMoney } from "@/components/motion"
import { GainDialog } from "@/components/gain-dialog"
import { TransactionForm, TransactionSheet } from "@/components/transaction-form"
import { PageSkeleton, useGlobals, useMeta } from "@/components/shell"
import {
  getDashboard,
  getRecap,
  savePreferences,
  updateOccurrence,
  writeRecap,
  type Recap,
  type Upcoming,
  type Wallet,
} from "@/lib/api"
import { intlLocale, addDays, convert, dayOf, fmt, moneyLocale, netWorth, shiftMonth } from "@/lib/core"
import { cn } from "@/lib/utils"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_app/")({
  loaderDeps: ({ search }) => ({ month: search.month, currency: search.currency }),
  // A guest sees the landing page from the _app layout instead, so there is no dashboard to load.
  loader: async ({ deps, context }) => {
    if (context.guest) return null as unknown as Dash & { recap: RecapView | null }
    // The recap is extra: when it can't load, Overview still does.
    const [d, recap] = await Promise.all([
      getDashboard({ data: deps }),
      getRecap({ data: { month: deps.month } }).catch(() => null),
    ])
    return { ...d, recap }
  },
  pendingComponent: PageSkeleton,
  component: Overview,
})

type Dash = Awaited<ReturnType<typeof getDashboard>>
type RecapView = NonNullable<Awaited<ReturnType<typeof getRecap>>>

const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", timeZone: "UTC" })
const monthName = (m: string, style: "long" | "short" = "long") =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString(intlLocale(), { month: style, timeZone: "UTC" })
/** A share as a percentage in the app's language, signed unless `signDisplay` says otherwise. */
const pct = (v: number, digits = 0, signDisplay: "exceptZero" | "auto" = "exceptZero") =>
  new Intl.NumberFormat(intlLocale(), {
    style: "percent",
    signDisplay,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)
const num = ({ children }: { children?: ReactNode }) => <span className="num">{children}</span>
const STALE_DAYS = 60

function Overview() {
  const d = Route.useLoaderData()
  const meta = useMeta()
  const { current } = useGlobals()
  const starting = useStarting()
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const [paying, setPaying] = useState<{ card: Wallet; owed: number } | null>(null)
  const [gainFor, setGainFor] = useState<Wallet | null>(null)
  const p = d.primary
  const monthEnd = `${d.month}-${String(d.pace.daysInMonth).padStart(2, "0")}`
  // Upcoming is relative to today, so only the current month has anything still to pay.
  const dueThisMonth = d.month === current ? d.upcoming.filter((u) => u.day <= monthEnd) : []
  const outflow = (u: Upcoming) => (u.amount < 0 && !u.to_wallet_id ? -convert(u.amount, u.currency, p, meta.rates) : 0)
  const stillToPay = dueThisMonth.reduce((t, u) => t + outflow(u), 0)
  const bills = dueThisMonth.filter((u) => outflow(u) > 0).length

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 md:gap-5 md:px-8 md:pt-7">
      <h1 className="sr-only">{m.shell_nav_overview()}</h1>
      {starting && <GetStarted />}
      {d.recap && <RecapCard key={d.recap.month} view={d.recap} />}
      <div className="flex flex-wrap gap-5">
        <NetWorthCard d={d} />
        <PaceCard d={d} stillToPay={stillToPay} bills={bills} monthEnd={monthEnd} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MiniStat
          label={m.overview_saved()}
          value={<RollingMoney value={d.current.income - d.current.expense} currency={p} />}
          positive={d.current.income > d.current.expense}
        />
        <MiniStat label={m.overview_still_to_pay()} value={<RollingMoney value={stillToPay} currency={p} />} />
      </div>

      <div className="flex flex-col-reverse gap-3 md:flex-row md:flex-wrap md:gap-5">
        <WhereItWent d={d} />
        <div className="flex min-w-0 flex-col gap-3 md:flex-[1_1_340px] md:gap-5">
          <NeedsAttention d={d} today={today} onPay={setPaying} onGain={setGainFor} />
          <ComingUp d={d} today={today} items={d.upcoming} monthEnd={monthEnd} total={stillToPay} outflow={outflow} />
        </div>
      </div>

      <LoansCard loans={d.loans} />
      <LastTwelveMonths d={d} />

      <TransactionSheet
        open={!!paying}
        title={m.overview_pay_card({ name: paying?.card.name ?? "" })}
        onClose={() => setPaying(null)}
      >
        {paying && (
          <TransactionForm
            preset={{ transferTo: paying.card.id, amount: paying.owed }}
            onDone={() => setPaying(null)}
            onCancel={() => setPaying(null)}
          />
        )}
      </TransactionSheet>
      <GainDialog wallet={gainFor} onClose={() => setGainFor(null)} />
    </div>
  )
}

/**
 * Monthly recap. In a month's first week it shows last month's, written on the first visit, until hidden.
 * For a past month on screen it offers to write one.
 */
function RecapCard({ view }: { view: RecapView }) {
  const router = useRouter()
  const [recap, setRecap] = useState<(Recap & { writtenDay: string }) | null>(view.recap)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const name = monthName(view.month)
  async function write() {
    setWriting(true)
    setError(null)
    try {
      setRecap(await writeRecap({ data: { month: view.month } }))
    } catch (e) {
      setError(e instanceof Error ? e.message : m.overview_recap_write_failed())
    } finally {
      setWriting(false)
    }
  }
  // Once per card, on mount: effects can run twice (React's strict mode), and each run would spend tokens.
  const started = useRef(false)
  /* oxlint-disable react/exhaustive-deps */
  useEffect(() => {
    if (started.current || !view.auto || view.recap) return
    started.current = true
    void write()
  }, [])
  /* oxlint-enable react/exhaustive-deps */
  async function hide() {
    setHidden(true)
    try {
      await savePreferences({ data: { ai_recap_hidden: view.month } })
      await router.invalidate()
    } catch (e) {
      setHidden(false)
      toast.error(e instanceof Error ? e.message : m.overview_recap_hide_failed())
    }
  }
  if (hidden) return null

  // A past month without a recap: one quiet line that offers it.
  if (!recap && !writing && !error && !view.auto)
    return (
      <Card className="flex-row items-center gap-3 px-6 py-3.5 max-md:px-4">
        <AiMark className="size-4" />
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{m.overview_recap_offer({ month: name })}</p>
        <Button variant="outline" size="sm" className="h-8 bg-card text-[13px] font-normal" onClick={write}>
          {m.overview_recap_write()}
        </Button>
      </Card>
    )

  const tone = { good: "bg-positive", bad: "bg-warning", neutral: "bg-muted-foreground/50" } as const
  return (
    <Card className="rise-in gap-3 px-6 max-md:px-[18px]" aria-busy={writing}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <AiMark /> {m.overview_recap_title({ month: name })}
        </h2>
        <div className="-my-1.5 -mr-2 flex items-center gap-0.5">
          {recap && !writing && (
            <span className="mr-1 text-xs text-muted-foreground max-sm:hidden">
              {m.overview_recap_written({ day: short(recap.writtenDay) })}
            </span>
          )}
          {recap && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground max-md:size-11"
              disabled={writing}
              onClick={write}
              aria-label={m.overview_recap_rewrite()}
              title={m.overview_recap_rewrite_hint()}
            >
              <ArrowClockwiseIcon className={cn(writing && "animate-spin")} />
            </Button>
          )}
          {view.auto && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground max-md:size-11"
              onClick={hide}
              aria-label={m.overview_recap_hide({ month: name })}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <p className="text-muted-foreground">{m.overview_recap_error({ error })}</p>
          <Button variant="outline" size="sm" className="h-8 bg-card font-normal" onClick={write}>
            {m.common_try_again()}
          </Button>
        </div>
      ) : writing && !recap ? (
        <div role="status" className="grid animate-pulse gap-2.5 py-1 motion-reduce:animate-none">
          <span className="sr-only">{m.overview_recap_writing({ month: name })}</span>
          <div className="h-5 w-2/3 rounded bg-muted" />
          <div className="h-3.5 w-full max-w-[64ch] rounded bg-muted" />
          <div className="h-3.5 w-5/6 max-w-[56ch] rounded bg-muted" />
        </div>
      ) : (
        recap && (
          <div className={cn("grid gap-2.5 transition-opacity duration-300", writing && "opacity-50")}>
            {recap.headline && (
              <p className="text-[17px] leading-snug font-medium tracking-[-0.01em] text-balance">{recap.headline}</p>
            )}
            {recap.summary && (
              <p className="max-w-[72ch] text-sm leading-relaxed text-subtle-foreground">{recap.summary}</p>
            )}
            {recap.points.length > 0 && (
              <ul className="mt-1 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
                {recap.points.map((pt, i) => (
                  <li key={i} className="flex items-baseline gap-2.5 text-[13px] text-subtle-foreground">
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 shrink-0 -translate-y-px rounded-full", tone[pt.tone])}
                    />
                    {pt.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
    </Card>
  )
}

const Head = ({ title, aside, children }: { title: string; aside?: ReactNode; children?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3">
    <div className="flex min-w-0 items-baseline gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children && <span className="truncate text-xs text-muted-foreground">{children}</span>}
    </div>
    {aside}
  </div>
)

const More = ({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & Omit<React.ComponentProps<typeof Link>, "className">) => (
  <Link
    {...props}
    className={cn("shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground", className)}
  >
    {children}
  </Link>
)

function NetWorthCard({ d }: { d: Dash }) {
  const meta = useMeta()
  const p = d.primary
  const nw = netWorth(meta.wallets, p, meta.rates, meta.loans)
  const line = d.series.filter((x) => x.month <= d.month).slice(-12)
  const at = (m: string) => d.series.find((x) => x.month === m)?.netWorth
  const thisMonth = at(d.month) === undefined ? null : at(d.month)! - (at(shiftMonth(d.month, -1)) ?? 0) // null means a future month
  const yearAgo = line.length > 1 ? line[0].netWorth : null
  const growth = yearAgo ? (line.at(-1)!.netWorth - yearAgo) / Math.abs(yearAgo) : null
  // What is owned, with unrealized gains stacked on top, so the line shows how much of it is market value.
  const points = line.map((x) => ({ month: x.month, owned: x.netWorth - x.gains, gains: x.gains }))
  const hasGains = points.some((x) => Math.round(x.gains))
  const hatch = useId()

  return (
    <Card className="min-w-0 flex-[1_1_360px] gap-5 px-6 max-md:hidden">
      <Head title={m.overview_net_worth()} aside={<More to="/accounts">{m.overview_accounts_link()}</More>} />
      <div>
        <BigMoney value={nw.total} currency={p} />
        <div className="mt-2.5">
          <WorthSplit total={nw.total} gains={nw.gains} currency={p} swatches={hasGains} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[13px]">
          {thisMonth !== null && (
            <span className={cn("font-medium", thisMonth >= 0 ? "text-positive" : "text-destructive")}>
              {m.overview_worth_this_month({ amount: `${thisMonth >= 0 ? "+" : ""}${fmt(thisMonth, p)}` })}
            </span>
          )}
          {growth !== null && (
            <span className="text-muted-foreground">{m.overview_worth_growth({ pct: pct(growth, 1) })}</span>
          )}
        </div>
      </div>
      {line.length > 1 && (
        <Reveal className="flex min-h-[120px] flex-1">
          <ChartContainer config={{}} className="aspect-auto h-[120px] min-h-[120px] w-full flex-1">
            <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
              <HatchPattern id={hatch} />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area
                dataKey="owned"
                stackId="worth"
                type="linear"
                stroke="var(--chart-2)"
                strokeWidth={2}
                fill="var(--chart-2)"
                fillOpacity={0.05}
                isAnimationActive={false}
              />
              {hasGains && (
                <Area
                  dataKey="gains"
                  stackId="worth"
                  type="linear"
                  stroke="var(--chart-3)"
                  strokeWidth={1}
                  fill={`url(#${hatch})`}
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ChartContainer>
        </Reveal>
      )}
      <CompositionBar loans={meta.loans} wallets={meta.wallets} currency={p} rates={meta.rates} />
    </Card>
  )
}

function PaceCard({
  d,
  stillToPay,
  bills,
  monthEnd,
}: {
  d: Dash
  stillToPay: number
  bills: number
  monthEnd: string
}) {
  const { current } = useGlobals()
  const future = d.month > current
  const p = d.primary
  const money = (v: number) => fmt(v, p)
  const { pace } = d
  const live = pace.today !== null
  const dayN = pace.today ?? pace.daysInMonth
  const spent = d.current.expense
  const usualBy = pace.usual?.[dayN - 1] ?? null
  const usualMonth = pace.usual?.[pace.daysInMonth - 1] ?? null
  const projected = live && usualBy !== null && usualMonth !== null ? spent + Math.max(0, usualMonth - usualBy) : null
  const diff = usualBy !== null ? usualBy - spent : null // positive means under the usual
  const saved = d.current.income - d.current.expense
  const name = monthName(d.month)

  const sentence = future ? (
    <span className="text-muted-foreground">{m.overview_pace_future()}</span>
  ) : diff === null ? (
    <span className="text-muted-foreground">{m.overview_pace_no_history()}</span>
  ) : diff >= 0 ? (
    <span className="font-medium text-positive">
      {(live ? m.overview_pace_under_pace : m.overview_pace_under_month)({ amount: money(diff) })}
    </span>
  ) : (
    <span className={cn("font-medium", -diff > 0.1 * (usualBy ?? 0) ? "text-warning" : "text-subtle-foreground")}>
      {(live ? m.overview_pace_over_pace : m.overview_pace_over_month)({ amount: money(-diff) })}
    </span>
  )

  return (
    <Card className="min-w-0 flex-[1.6_1_520px] gap-5 px-6 max-md:gap-3 max-md:px-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium max-md:text-xs max-md:font-normal max-md:text-muted-foreground">
          <span className="max-md:hidden">{live ? m.overview_pace_title_live({ month: name }) : name}</span>
          <span className="md:hidden">
            {live ? m.overview_pace_spent_so_far() : m.overview_pace_spent_in({ month: name })}
          </span>
        </h2>
        <span className="text-xs text-muted-foreground">
          {live
            ? m.overview_pace_day({ day: dayN, days: pace.daysInMonth })
            : m.overview_pace_days({ days: pace.daysInMonth })}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <BigMoney value={spent} currency={p} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
            {sentence}
            {usualBy !== null && !future && (
              <span className="text-muted-foreground max-md:hidden">
                <ParaglideMessage
                  message={live ? m.overview_pace_usual_by_today : m.overview_pace_usual_by_month_end}
                  inputs={{ amount: money(usualBy) }}
                  markup={{ num }}
                />
              </span>
            )}
          </div>
        </div>
        {pace.usual && (
          <div className="grid gap-1.5 text-xs text-muted-foreground max-md:hidden">
            <span className="flex items-center gap-2">
              <i className="h-0.5 w-4 bg-chart-2" />
              {m.overview_this_month()}
            </span>
            <span className="flex items-center gap-2">
              <i className="h-0 w-4 border-t-[1.5px] border-dashed border-muted-foreground" />
              <ParaglideMessage
                message={m.overview_pace_usual_month_legend}
                inputs={{ amount: money(usualMonth!) }}
                markup={{ num }}
              />
            </span>
          </div>
        )}
      </div>

      <PaceChart d={d} projected={projected} className="h-[190px] max-md:hidden" axes />
      <PaceChart d={d} projected={projected} className="h-[84px] md:hidden" />
      {pace.usual && (
        <div className="flex justify-between text-xs text-muted-foreground md:hidden">
          <span>
            <ParaglideMessage
              message={m.overview_pace_usual_month}
              inputs={{ amount: money(usualMonth!) }}
              markup={{ num }}
            />
          </span>
          {projected !== null && (
            <span>
              <ParaglideMessage
                message={m.overview_pace_projected}
                inputs={{ amount: money(projected) }}
                markup={{ num: ({ children }) => <span className="num text-foreground">{children}</span> }}
              />
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 border-t pt-5 max-md:hidden">
        <Stat
          label={m.overview_income()}
          value={<RollingMoney value={d.current.income} currency={p} />}
          sub={d.income ? `${d.income.name || m.overview_income()} · ${short(d.income.day)}` : m.overview_none_yet()}
        />
        <Stat
          label={live ? m.overview_saved_so_far() : m.overview_saved()}
          value={<RollingMoney value={saved} currency={p} />}
          positive={saved > 0}
          sub={
            d.current.income ? m.overview_pct_of_income({ pct: pct(saved / d.current.income, 0, "auto") }) : undefined
          }
        />
        <Stat
          label={m.overview_still_to_pay()}
          value={<RollingMoney value={stillToPay} currency={p} />}
          sub={bills ? m.overview_bills_before({ count: bills, day: short(monthEnd) }) : m.overview_nothing_left()}
        />
      </div>
    </Card>
  )
}

function PaceChart({
  d,
  projected,
  axes,
  className,
}: {
  d: Dash
  projected: number | null
  axes?: boolean
  className?: string
}) {
  const { pace } = d
  const p = d.primary
  const data = Array.from({ length: pace.daysInMonth }, (_, i) => ({
    day: i + 1,
    current: pace.current[i],
    usual: pace.usual?.[i],
  }))
  const t = pace.today
  const top = Math.max(pace.current.at(-1) ?? 0, pace.usual?.at(-1) ?? 0, projected ?? 0, 1)
  const ticks = [1, ...(t && t > 3 && t < pace.daysInMonth - 3 ? [t] : []), pace.daysInMonth]
  return (
    <Reveal className={className}>
      <ChartContainer config={{}} className="aspect-auto h-full w-full">
        <ComposedChart data={data} margin={{ top: axes ? 20 : 4, right: 0, bottom: 0, left: 0 }}>
          {axes && <CartesianGrid vertical={false} />}
          <XAxis
            dataKey="day"
            type="number"
            domain={[1, pace.daysInMonth]}
            ticks={ticks}
            hide={!axes}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval={0}
            tick={({ x, y, payload }: { x: number | string; y: number | string; payload: { value: number } }) => (
              <text
                x={x}
                y={Number(y) + 12}
                fontSize={11}
                fill="var(--muted-foreground)"
                textAnchor={payload.value === 1 ? "start" : payload.value === pace.daysInMonth ? "end" : "middle"}
              >
                {payload.value === t
                  ? m.overview_today()
                  : short(`${d.month}-${String(payload.value).padStart(2, "0")}`)}
              </text>
            )}
          />
          <YAxis
            orientation="right"
            hide={!axes}
            domain={[0, top * 1.05]}
            tickCount={3}
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => fmt(v, p, true)}
          />
          <Area
            dataKey="current"
            type="linear"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="var(--chart-2)"
            fillOpacity={0.06}
            isAnimationActive={false}
            connectNulls={false}
          />
          {pace.usual && (
            <Line
              dataKey="usual"
              type="linear"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 5"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {t && axes && (
            <ReferenceLine
              x={t}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
              label={
                projected !== null
                  ? {
                      value: m.overview_pace_projected_label({ amount: fmt(projected, p) }),
                      position: "insideTopLeft",
                      fill: "var(--muted-foreground)",
                      fontSize: 11,
                      dy: -18,
                    }
                  : undefined
              }
            />
          )}
          {t && pace.current.length > 0 && (
            <ReferenceDot
              x={t}
              y={pace.current[t - 1]}
              r={4}
              fill="var(--chart-2)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </Reveal>
  )
}

function Stat({ label, value, sub, positive }: { label: string; value: ReactNode; sub?: string; positive?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num mt-1.5 truncate text-lg", positive && "text-positive")}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

const MiniStat = ({ label, value, positive }: { label: string; value: ReactNode; positive?: boolean }) => (
  <Card className="gap-1 px-4 py-3.5">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn("num text-lg", positive && "text-positive")}>{value}</div>
  </Card>
)

type Cat = Dash["categories"][number]

function vsUsual(total: number, usual: number | null, fixed = false) {
  if (fixed) return { text: m.overview_chip_fixed(), tone: "" }
  // Show "new", not "+3766%", when the baseline is under a tenth of this month's spend.
  if (!usual || usual * 10 < total) return { text: m.overview_chip_new(), tone: "" }
  const r = (total - usual) / usual
  return { text: pct(r), tone: r > 0.2 ? "text-warning" : r < -0.05 ? "text-positive" : "" }
}

const Chip = ({ text, tone }: { text: string; tone: string }) => (
  <span
    className={cn(
      "num justify-self-end rounded-full bg-muted px-[7px] py-0.5 text-[11px] whitespace-nowrap text-subtle-foreground",
      tone
    )}
  >
    {text}
  </span>
)

/** Activity's period for the month on screen. The current month is Activity's default, so it stays unset. */
const activityPeriod = (d: Dash, current: string) => (d.month === current ? undefined : d.month)

function WhereItWent({ d }: { d: Dash }) {
  const meta = useMeta()
  const period = activityPeriod(d, useGlobals().current)
  const money = (v: number) => fmt(v, d.primary)
  const cat = (id: string) => meta.categories.find((c) => c.id === id)
  const top = d.categories.slice(0, 7)
  const rest = d.categories.slice(7)
  const max = d.categories[0]?.total ?? 1
  const others = rest.length
    ? {
        total: rest.reduce((t, c) => t + c.total, 0),
        usual: rest.every((c) => c.usualToDate === null) ? null : rest.reduce((t, c) => t + (c.usualToDate ?? 0), 0),
      }
    : null
  const byDay = d.pace.today ?? d.pace.daysInMonth

  const row = (c: Cat) => {
    const info = cat(c.id)
    return {
      key: c.id,
      name: info?.name ?? m.overview_unknown_category(),
      icon: info?.icon,
      total: c.total,
      chip: vsUsual(c.total, c.usualToDate, c.fixed),
    }
  }
  const rows = top.map(row)

  return (
    <Card className="min-w-0 gap-4 px-6 max-md:gap-1 max-md:px-4 md:flex-[1.6_1_520px] md:self-start">
      <Head
        title={m.overview_where_title()}
        aside={
          <Link
            to="/transactions"
            search={{ period }}
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground max-md:hidden"
          >
            {m.overview_all_activity()}
          </Link>
        }
      >
        <span className="max-md:hidden">{m.overview_where_vs_usual({ day: byDay })}</span>
      </Head>
      {rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">{m.overview_where_empty()}</p>}

      {/* Desktop: category | share | spent | vs usual */}
      {rows.length > 0 && (
        <Reveal kind="bars" className="-mx-3 max-md:hidden" role="table" aria-label={m.overview_where_table()}>
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_104px_76px] gap-4 px-3 pb-1 text-xs text-muted-foreground"
          >
            <span role="columnheader">{m.overview_col_category()}</span>
            <span role="columnheader">{m.overview_col_share()}</span>
            <span role="columnheader" className="text-right">
              {m.overview_col_spent()}
            </span>
            <span role="columnheader" className="text-right">
              {m.overview_col_vs_usual()}
            </span>
          </div>
          {rows.map((r, i) => (
            <Link
              key={r.key}
              role="row"
              to="/transactions"
              search={{ category: r.key, period }}
              className="grid min-h-11 grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_104px_76px] items-center gap-4 rounded-md px-3 text-[15px] transition-colors hover:bg-muted"
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <CategoryIcon icon={r.icon} />
                <span className="truncate">{r.name}</span>
              </span>
              <span role="cell" className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="bar-grow-x block h-full rounded-full bg-chart-2"
                  style={{ width: `${(r.total / max) * 100}%`, "--i": i } as React.CSSProperties}
                />
              </span>
              <span role="cell" className="num text-right">
                {money(r.total)}
              </span>
              <span role="cell" className="text-right">
                <Chip {...r.chip} />
              </span>
            </Link>
          ))}
          {others && (
            <Link
              role="row"
              to="/transactions"
              search={{ period }}
              className="grid min-h-11 grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_104px_76px] items-center gap-4 rounded-md px-3 text-[15px] text-subtle-foreground transition-colors hover:bg-muted"
            >
              <span role="cell" className="pl-7">
                {m.overview_others({ count: rest.length })}
              </span>
              <span role="cell" className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="bar-grow-x block h-full rounded-full bg-chart-4"
                  style={{ width: `${(others.total / max) * 100}%`, "--i": rows.length } as React.CSSProperties}
                />
              </span>
              <span role="cell" className="num text-right">
                {money(others.total)}
              </span>
              <span role="cell" className="text-right">
                <Chip {...vsUsual(others.total, others.usual)} />
              </span>
            </Link>
          )}
        </Reveal>
      )}

      {/* Phones show the top 4, with a bar under each row */}
      <Reveal kind="bars" className="md:hidden">
        {rows.slice(0, 4).map((r, i) => (
          <Link
            key={r.key}
            to="/transactions"
            search={{ category: r.key, period }}
            className="block py-2.5 text-[15px]"
          >
            <span className="grid grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <CategoryIcon icon={r.icon} />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="num">{money(r.total)}</span>
              <Chip {...r.chip} />
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="bar-grow-x block h-full rounded-full bg-chart-2"
                style={{ width: `${(r.total / max) * 100}%`, "--i": i } as React.CSSProperties}
              />
            </span>
          </Link>
        ))}
      </Reveal>
    </Card>
  )
}

type Attention = { key: string; tone: "warn" | "quiet"; title: string; sub: string; action: ReactNode }

function NeedsAttention({
  d,
  today,
  onPay,
  onGain,
}: {
  d: Dash
  today: string
  onPay: (x: { card: Wallet; owed: number }) => void
  onGain: (w: Wallet) => void
}) {
  const meta = useMeta()
  const router = useRouter()
  const period = activityPeriod(d, useGlobals().current)
  const [busy, setBusy] = useState<string | null>(null)
  const money = (v: number) => fmt(v, d.primary)
  const items: Attention[] = []

  for (const u of d.upcoming.filter((x) => x.day < today && x.subscription_id))
    items.push({
      key: u.key,
      tone: "warn",
      title: m.overview_att_due({ name: u.name, day: short(u.day) }),
      sub: m.overview_att_not_paid({ amount: fmt(u.to_wallet_id ? Math.abs(u.amount) : u.amount, u.currency) }),
      action: (
        <Button
          variant="outline"
          size="sm"
          disabled={busy === u.key}
          onClick={async () => {
            setBusy(u.key)
            try {
              await updateOccurrence({ data: { id: u.subscription_id!, dueDay: u.key.split("|")[1], action: "pay" } })
              await router.invalidate()
              toast.success(m.overview_att_marked_paid({ name: u.name }))
            } catch (e) {
              toast.error(e instanceof Error ? e.message : m.overview_att_mark_failed())
            } finally {
              setBusy(null)
            }
          }}
        >
          {m.overview_att_mark_paid()}
        </Button>
      ),
    })

  for (const card of meta.wallets.filter((w) => !w.archived && w.type === "credit")) {
    const owed = (card.credit_limit ?? 0) - card.balance
    if (owed > 0)
      items.push({
        key: card.id,
        tone: "warn",
        title: m.overview_att_card_owed({ name: card.name, amount: fmt(owed, card.currency) }),
        sub: m.overview_att_card_hint(),
        action: (
          <Button variant="outline" size="sm" onClick={() => onPay({ card, owed })}>
            {m.overview_att_pay()}
          </Button>
        ),
      })
  }

  for (const c of d.categories) {
    // Flag a category over 20% above its usual pace. Skip tiny baselines and overspends under 2% of the usual month so far.
    const usualSoFar = d.pace.usual?.[(d.pace.today ?? d.pace.daysInMonth) - 1] ?? 0
    if (
      c.fixed ||
      !c.usualToDate ||
      c.usualToDate * 10 < c.total ||
      c.total <= c.usualToDate * 1.2 ||
      c.total - c.usualToDate < usualSoFar * 0.02
    )
      continue
    const info = meta.categories.find((x) => x.id === c.id)
    items.push({
      key: c.id,
      tone: "warn",
      title: m.overview_att_category_above({
        name: info?.name ?? m.overview_att_a_category(),
        pct: pct(c.total / c.usualToDate - 1, 0, "auto"),
      }),
      sub: m.overview_att_category_sub({ spent: money(c.total), usual: money(c.usualToDate), count: c.count }),
      action: (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/transactions" search={{ category: c.id, period }} />}
        >
          {m.overview_att_review()}
        </Button>
      ),
    })
  }

  for (const w of meta.wallets.filter((x) => !x.archived && x.type === "investment")) {
    const age = w.gain_day ? Math.round((Date.parse(today) - Date.parse(w.gain_day)) / 86_400_000) : null
    if (age !== null && age <= STALE_DAYS) continue
    items.push({
      key: w.id,
      tone: "quiet",
      title:
        age === null
          ? m.overview_att_no_value({ name: w.name })
          : m.overview_att_value_age({ name: w.name, count: age }),
      sub: m.overview_att_understated(),
      action: (
        <Button variant="outline" size="sm" onClick={() => onGain(w)}>
          {m.overview_att_update()}
        </Button>
      ),
    })
  }

  if (!items.length) return null
  return (
    <Card className="gap-4 px-6 max-md:hidden">
      <Head title={m.overview_att_title()} />
      <div>
        {items.slice(0, 3).map((it) => (
          <div
            key={it.key}
            className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-3 border-t py-3 last:pb-0"
          >
            <span
              className={cn("mt-1.5 size-2 rounded-full", it.tone === "warn" ? "bg-warning" : "bg-muted-foreground")}
            />
            <div className="min-w-0">
              <div className="text-sm">{it.title}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{it.sub}</div>
            </div>
            {it.action}
          </div>
        ))}
      </div>
    </Card>
  )
}

/** What kind of upcoming payment a row is, for the small label beside its name. */
function kindLabel(u: Upcoming) {
  if (u.kind === "repetitive") return u.amount > 0 ? m.overview_kind_income() : m.overview_kind_bill()
  if (u.kind === "subscription") return m.overview_kind_subscription()
  if (u.kind === "transfer") return m.overview_kind_transfer()
  if (u.kind === "upcoming") return m.overview_kind_upcoming()
  return u.kind
}

function ComingUp({
  d,
  today,
  items,
  monthEnd,
  total: monthTotal,
  outflow,
}: {
  d: Dash
  today: string
  items: Upcoming[]
  monthEnd: string
  total: number
  outflow: (u: Upcoming) => number
}) {
  const meta = useMeta()
  // Settings › Recurring › "Coming up" picks month end or the next 30 days as the cutoff.
  const thirty = meta.prefs.upcoming_horizon === "30d"
  const end = d.month >= today.slice(0, 7) ? (thirty ? addDays(today, 30) : monthEnd) : `${today.slice(0, 7)}-31`
  const soon = items.filter((u) => u.day <= end)
  const total = thirty ? soon.reduce((t, u) => t + outflow(u), 0) : monthTotal
  const later = items.filter((u) => u.day > end)
  const name = (u: Upcoming) =>
    u.name || meta.categories.find((c) => c.id === u.category_id)?.name || m.overview_untitled()
  const amount = (u: Upcoming) => fmt(u.to_wallet_id ? Math.abs(u.amount) : u.amount, u.currency)
  if (!soon.length && !later.length) return null
  const then = later[0] && { day: short(later[0].day), name: name(later[0]), amount: amount(later[0]) }
  return (
    <Card className="gap-3 px-6 max-md:px-4 max-md:pb-1.5">
      <Head
        title={m.overview_coming_title()}
        aside={
          <>
            <span className="text-xs text-muted-foreground max-md:hidden">
              <ParaglideMessage
                message={m.overview_coming_total}
                inputs={{ amount: fmt(total, d.primary), day: short(end) }}
                markup={{ num: ({ children }) => <span className="num text-foreground">{children}</span> }}
              />
            </span>
            <More to="/subscriptions" className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 md:hidden">
              {m.overview_coming_all()}
            </More>
          </>
        }
      />
      <div>
        {soon.length === 0 && (
          <p className="border-t py-3 text-sm text-muted-foreground">{m.overview_coming_empty({ day: short(end) })}</p>
        )}
        {soon.map((u, i) => (
          <div
            key={u.key}
            className={cn(
              "grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 border-t py-2.5 text-sm",
              i >= 3 && "max-md:hidden"
            )}
          >
            <span
              className={cn("num text-xs whitespace-nowrap text-muted-foreground", u.day < today && "text-warning")}
            >
              {short(u.day)}
            </span>
            <span className="truncate">
              {name(u)} <span className="text-xs text-muted-foreground max-md:hidden">· {kindLabel(u)}</span>
            </span>
            <span className={cn("num", u.to_wallet_id && "text-muted-foreground")}>{amount(u)}</span>
          </div>
        ))}
        {later.length > 0 && (
          <Link
            to="/subscriptions"
            className="block border-t pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground max-md:hidden"
          >
            {later.length > 1 ? (
              <ParaglideMessage
                message={m.overview_coming_then_more}
                inputs={{ ...then, count: later.length - 1 }}
                markup={{ num }}
              />
            ) : (
              <ParaglideMessage message={m.overview_coming_then} inputs={then} markup={{ num }} />
            )}
          </Link>
        )}
      </div>
    </Card>
  )
}

function LastTwelveMonths({ d }: { d: Dash }) {
  const { current } = useGlobals()
  const months = d.series.filter((x) => x.month <= d.month).slice(-12)
  if (months.length < 2) return null
  const max = Math.max(...months.flatMap((x) => [x.income, x.expense]), 1)
  const income = months.reduce((t, x) => t + x.income, 0)
  const saved = months.reduce((t, x) => t + x.income - x.expense, 0)
  const savedNum = ({ children }: { children?: ReactNode }) => (
    <span className={cn("num", saved >= 0 ? "text-positive" : "text-warning")}>{children}</span>
  )
  const whole = (v: number) =>
    `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v / 100)).toLocaleString(moneyLocale(d.primary))}`

  return (
    <Card className="gap-6 px-6 max-md:hidden">
      <Head
        title={m.overview_last_months({ count: months.length })}
        aside={
          <span className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-chart-1" />
              {m.overview_in()}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-chart-2" />
              {m.overview_out()}
            </span>
          </span>
        }
      >
        {income > 0 ? (
          <ParaglideMessage
            message={m.overview_last_saved_pct}
            inputs={{ amount: fmt(saved, d.primary), pct: pct(saved / income, 0, "auto") }}
            markup={{ num: savedNum }}
          />
        ) : (
          <ParaglideMessage
            message={m.overview_last_saved}
            inputs={{ amount: fmt(saved, d.primary) }}
            markup={{ num: savedNum }}
          />
        )}
      </Head>
      <div className="overflow-x-auto">
        <Reveal
          kind="bars"
          className="grid min-w-[640px] gap-1"
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {months.map((x, i) => {
            const live = x.month === current
            const spike = d.spike?.month === x.month ? d.spike : null
            const net = x.income - x.expense
            return (
              <div
                key={x.month}
                className="flex min-w-0 flex-col items-center gap-1.5"
                aria-label={m.overview_last_bar({
                  month: monthName(x.month),
                  income: fmt(x.income, d.primary),
                  expense: fmt(x.expense, d.primary),
                })}
                role="img"
              >
                <div className="relative flex h-44 w-full items-end justify-center gap-[3px] pt-6">
                  <span
                    className="bar-grow w-[38%] max-w-4 rounded-t-[3px] bg-chart-1"
                    style={{ height: `${(x.income / max) * 100}%`, "--i": i } as React.CSSProperties}
                  />
                  <span className="relative flex h-full w-[38%] max-w-4 items-end">
                    <span
                      className={cn("bar-grow w-full rounded-t-[3px]", live ? "bg-chart-2/40" : "bg-chart-2")}
                      style={{ height: `${(x.expense / max) * 100}%`, "--i": i } as React.CSSProperties}
                    />
                    {spike && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                        style={{ bottom: `calc(${(x.expense / max) * 100}% + 6px)` }}
                      >
                        {spike.name || m.overview_largest()} {fmt(spike.amount, d.primary, true)}
                      </span>
                    )}
                  </span>
                </div>
                <span className={cn("text-xs text-muted-foreground", live && "font-semibold text-foreground")}>
                  {monthName(x.month, "short")}
                </span>
                <span className={cn("num text-xs text-subtle-foreground", !live && net < 0 && "text-warning")}>
                  {live ? m.overview_so_far() : whole(net)}
                </span>
              </div>
            )
          })}
        </Reveal>
      </div>
    </Card>
  )
}
