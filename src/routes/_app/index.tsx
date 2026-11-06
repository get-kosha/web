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
import { LOCALE, addDays, convert, dayOf, fmt, netWorth, shiftMonth } from "@/lib/core"
import { cn } from "@/lib/utils"

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
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" })
const monthName = (m: string, style: "long" | "short" = "long") =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString(LOCALE, { month: style, timeZone: "UTC" })
const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`
const STALE_DAYS = 60

function Overview() {
  const d = Route.useLoaderData()
  const meta = useMeta()
  const { current } = useGlobals()
  const starting = useStarting()
  const today = dayOf(Date.now() / 1000, meta.tz)
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
      <h1 className="sr-only">Overview</h1>
      {starting && <GetStarted />}
      {d.recap && <RecapCard key={d.recap.month} view={d.recap} />}
      <div className="flex flex-wrap gap-5">
        <NetWorthCard d={d} />
        <PaceCard d={d} stillToPay={stillToPay} bills={bills} monthEnd={monthEnd} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MiniStat
          label="Saved"
          value={<RollingMoney value={d.current.income - d.current.expense} currency={p} />}
          positive={d.current.income > d.current.expense}
        />
        <MiniStat label="Still to pay" value={<RollingMoney value={stillToPay} currency={p} />} />
      </div>

      <div className="flex flex-col-reverse gap-3 md:flex-row md:flex-wrap md:gap-5">
        <WhereItWent d={d} />
        <div className="flex min-w-0 flex-col gap-3 md:flex-[1_1_340px] md:gap-5">
          <NeedsAttention d={d} today={today} onPay={setPaying} onGain={setGainFor} />
          <ComingUp d={d} today={today} items={d.upcoming} monthEnd={monthEnd} total={stillToPay} outflow={outflow} />
        </div>
      </div>

      <LastTwelveMonths d={d} />

      <TransactionSheet open={!!paying} title={`Pay ${paying?.card.name ?? ""}`} onClose={() => setPaying(null)}>
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
      setError(e instanceof Error ? e.message : "Couldn't write it")
    } finally {
      setWriting(false)
    }
  }
  // Once per card: effects can run twice (React's strict mode), and each run would spend tokens.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !view.auto || view.recap) return
    started.current = true
    void write()
  }, [])
  async function hide() {
    setHidden(true)
    try {
      await savePreferences({ data: { ai_recap_hidden: view.month } })
      await router.invalidate()
    } catch (e) {
      setHidden(false)
      toast.error(e instanceof Error ? e.message : "Couldn't hide it")
    }
  }
  if (hidden) return null

  // A past month without a recap: one quiet line that offers it.
  if (!recap && !writing && !error && !view.auto)
    return (
      <Card className="flex-row items-center gap-3 px-6 py-3.5 max-md:px-4">
        <AiMark className="size-4" />
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">How {name} went, in a few lines.</p>
        <Button variant="outline" size="sm" className="h-8 bg-card text-[13px] font-normal" onClick={write}>
          Write a recap
        </Button>
      </Card>
    )

  const tone = { good: "bg-positive", bad: "bg-warning", neutral: "bg-muted-foreground/50" } as const
  return (
    <Card className="rise-in gap-3 px-6 max-md:px-[18px]" aria-busy={writing}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <AiMark /> {name} in brief
        </h2>
        <div className="-my-1.5 -mr-2 flex items-center gap-0.5">
          {recap && !writing && (
            <span className="mr-1 text-xs text-muted-foreground max-sm:hidden">Written {short(recap.writtenDay)}</span>
          )}
          {recap && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground max-md:size-11"
              disabled={writing}
              onClick={write}
              aria-label="Write it again"
              title="Write it again with the latest entries"
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
              aria-label={`Hide the ${name} recap`}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <p className="text-muted-foreground">Couldn't write the recap. {error}</p>
          <Button variant="outline" size="sm" className="h-8 bg-card font-normal" onClick={write}>
            Try again
          </Button>
        </div>
      ) : writing && !recap ? (
        <div role="status" className="grid animate-pulse gap-2.5 py-1 motion-reduce:animate-none">
          <span className="sr-only">Writing the {name} recap</span>
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
  const nw = netWorth(meta.wallets, p, meta.rates)
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
      <Head title="Net worth" aside={<More to="/accounts">Accounts →</More>} />
      <div>
        <BigMoney value={nw.total} currency={p} />
        <div className="mt-2.5">
          <WorthSplit total={nw.total} gains={nw.gains} currency={p} swatches={hasGains} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[13px]">
          {thisMonth !== null && (
            <span className={cn("font-medium", thisMonth >= 0 ? "text-positive" : "text-destructive")}>
              {thisMonth >= 0 ? "+" : ""}
              {fmt(thisMonth, p)} this month
            </span>
          )}
          {growth !== null && (
            <span className="text-muted-foreground">
              {growth > 0 ? "+" : ""}
              {(growth * 100).toFixed(1)}% in 12 months
            </span>
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
      <CompositionBar wallets={meta.wallets} currency={p} rates={meta.rates} />
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
    <span className="text-muted-foreground">This month hasn't started yet</span>
  ) : diff === null ? (
    <span className="text-muted-foreground">Not enough history yet</span>
  ) : diff >= 0 ? (
    <span className="font-medium text-positive">
      {money(diff)} under your usual {live ? "pace" : "month"}
    </span>
  ) : (
    <span className={cn("font-medium", -diff > 0.1 * (usualBy ?? 0) ? "text-warning" : "text-subtle-foreground")}>
      {money(-diff)} over your usual {live ? "pace" : "month"}
    </span>
  )

  return (
    <Card className="min-w-0 flex-[1.6_1_520px] gap-5 px-6 max-md:gap-3 max-md:px-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium max-md:text-xs max-md:font-normal max-md:text-muted-foreground">
          <span className="max-md:hidden">{live ? `${name} so far` : name}</span>
          <span className="md:hidden">{live ? "Spent so far" : `Spent in ${name}`}</span>
        </h2>
        <span className="text-xs text-muted-foreground">
          {live ? `Day ${dayN} of ${pace.daysInMonth}` : `${pace.daysInMonth} days`}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <BigMoney value={spent} currency={p} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
            {sentence}
            {usualBy !== null && !future && (
              <span className="text-muted-foreground max-md:hidden">
                usual by {live ? "today" : "month end"} <span className="num">{money(usualBy)}</span>
              </span>
            )}
          </div>
        </div>
        {pace.usual && (
          <div className="grid gap-1.5 text-xs text-muted-foreground max-md:hidden">
            <span className="flex items-center gap-2">
              <i className="h-0.5 w-4 bg-chart-2" />
              This month
            </span>
            <span className="flex items-center gap-2">
              <i className="h-0 w-4 border-t-[1.5px] border-dashed border-muted-foreground" />
              Usual month · <span className="num">{money(usualMonth!)}</span>
            </span>
          </div>
        )}
      </div>

      <PaceChart d={d} projected={projected} className="h-[190px] max-md:hidden" axes />
      <PaceChart d={d} projected={projected} className="h-[84px] md:hidden" />
      {pace.usual && (
        <div className="flex justify-between text-xs text-muted-foreground md:hidden">
          <span>
            Usual month <span className="num">{money(usualMonth!)}</span>
          </span>
          {projected !== null && (
            <span>
              Projected <span className="num text-foreground">{money(projected)}</span>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 border-t pt-5 max-md:hidden">
        <Stat
          label="Income"
          value={<RollingMoney value={d.current.income} currency={p} />}
          sub={d.income ? `${d.income.name || "Income"} · ${short(d.income.day)}` : "None yet"}
        />
        <Stat
          label={live ? "Saved so far" : "Saved"}
          value={<RollingMoney value={saved} currency={p} />}
          positive={saved > 0}
          sub={d.current.income ? `${Math.round((saved / d.current.income) * 100)}% of income` : undefined}
        />
        <Stat
          label="Still to pay"
          value={<RollingMoney value={stillToPay} currency={p} />}
          sub={
            bills ? `${bills} ${bills === 1 ? "bill" : "bills"} before ${short(monthEnd)}` : "Nothing left this month"
          }
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
                {payload.value === t ? "Today" : `${payload.value} ${monthName(d.month, "short")}`}
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
                      value: `Projected ${fmt(projected, p)}`,
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
  if (fixed) return { text: "fixed", tone: "" }
  // Show "new", not "+3766%", when the baseline is under a tenth of this month's spend.
  if (!usual || usual * 10 < total) return { text: "new", tone: "" }
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

function WhereItWent({ d }: { d: Dash }) {
  const meta = useMeta()
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
      name: info?.name ?? "Unknown",
      icon: info?.icon,
      total: c.total,
      chip: vsUsual(c.total, c.usualToDate, c.fixed),
    }
  }
  const rows = top.map(row)

  return (
    <Card className="min-w-0 gap-4 px-6 max-md:gap-1 max-md:px-4 md:flex-[1.6_1_520px] md:self-start">
      <Head
        title="Where it went"
        aside={
          <More to="/transactions" className="max-md:hidden">
            All activity →
          </More>
        }
      >
        <span className="max-md:hidden">vs your usual by day {byDay}</span>
      </Head>
      {rows.length === 0 && (
        <p className="py-6 text-sm text-muted-foreground">No spending this month. Expenses you add show up here.</p>
      )}

      {/* Desktop: category | share | spent | vs usual */}
      {rows.length > 0 && (
        <Reveal kind="bars" className="-mx-3 max-md:hidden" role="table" aria-label="Spending by category">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_104px_76px] gap-4 px-3 pb-1 text-xs text-muted-foreground"
          >
            <span role="columnheader">Category</span>
            <span role="columnheader">Share of spending</span>
            <span role="columnheader" className="text-right">
              Spent
            </span>
            <span role="columnheader" className="text-right">
              vs usual
            </span>
          </div>
          {rows.map((r, i) => (
            <Link
              key={r.key}
              role="row"
              to="/transactions"
              search={(s) => ({ ...s, category: r.key })}
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
              className="grid min-h-11 grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_104px_76px] items-center gap-4 rounded-md px-3 text-[15px] text-subtle-foreground transition-colors hover:bg-muted"
            >
              <span role="cell" className="pl-7">
                {rest.length} others
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
            search={(s) => ({ ...s, category: r.key })}
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
  const [busy, setBusy] = useState<string | null>(null)
  const money = (v: number) => fmt(v, d.primary)
  const items: Attention[] = []

  for (const u of d.upcoming.filter((x) => x.day < today && x.subscription_id))
    items.push({
      key: u.key,
      tone: "warn",
      title: `${u.name} was due ${short(u.day)}`,
      sub: `${fmt(u.to_wallet_id ? Math.abs(u.amount) : u.amount, u.currency)} · not marked paid`,
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
              toast.success(`${u.name} marked paid`)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't mark it paid")
            } finally {
              setBusy(null)
            }
          }}
        >
          Mark paid
        </Button>
      ),
    })

  for (const card of meta.wallets.filter((w) => !w.archived && w.type === "credit")) {
    const owed = (card.credit_limit ?? 0) - card.balance
    if (owed > 0)
      items.push({
        key: card.id,
        tone: "warn",
        title: `${card.name}: ${fmt(owed, card.currency)} owed`,
        sub: "Pay it off from a bank account",
        action: (
          <Button variant="outline" size="sm" onClick={() => onPay({ card, owed })}>
            Pay
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
      title: `${info?.name ?? "A category"} is ${Math.round((c.total / c.usualToDate - 1) * 100)}% above usual`,
      sub: `${money(c.total)} vs ${money(c.usualToDate)} by now · ${c.count} ${c.count === 1 ? "payment" : "payments"}`,
      action: (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/transactions" search={(s) => ({ ...s, category: c.id })} />}
        >
          Review
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
      title: age === null ? `${w.name} has no value yet` : `${w.name} value is ${age} days old`,
      sub: "Net worth may be understated",
      action: (
        <Button variant="outline" size="sm" onClick={() => onGain(w)}>
          Update
        </Button>
      ),
    })
  }

  if (!items.length) return null
  return (
    <Card className="gap-4 px-6 max-md:hidden">
      <Head title="Needs attention" />
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
  const name = (u: Upcoming) => u.name || meta.categories.find((c) => c.id === u.category_id)?.name || "Untitled"
  const amount = (u: Upcoming) => fmt(u.to_wallet_id ? Math.abs(u.amount) : u.amount, u.currency)
  if (!soon.length && !later.length) return null
  return (
    <Card className="gap-3 px-6 max-md:px-4 max-md:pb-1.5">
      <Head
        title="Coming up"
        aside={
          <>
            <span className="text-xs text-muted-foreground max-md:hidden">
              <span className="num text-foreground">{fmt(total, d.primary)}</span> before {short(end)}
            </span>
            <More to="/subscriptions" className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 md:hidden">
              All
            </More>
          </>
        }
      />
      <div>
        {soon.length === 0 && (
          <p className="border-t py-3 text-sm text-muted-foreground">Nothing else due before {short(end)}.</p>
        )}
        {soon.map((u, i) => (
          <div
            key={u.key}
            className={cn(
              "grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-3 border-t py-2.5 text-sm",
              i >= 3 && "max-md:hidden"
            )}
          >
            <span className={cn("num text-xs text-muted-foreground", u.day < today && "text-warning")}>
              {short(u.day)}
            </span>
            <span className="truncate">
              {name(u)} <span className="text-xs text-muted-foreground max-md:hidden">· {u.kind}</span>
            </span>
            <span className={cn("num", u.to_wallet_id && "text-muted-foreground")}>{amount(u)}</span>
          </div>
        ))}
        {later.length > 0 && (
          <Link
            to="/subscriptions"
            className="block border-t pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground max-md:hidden"
          >
            Then {short(later[0].day)}: {name(later[0])} <span className="num">{amount(later[0])}</span>
            {later.length > 1 && ` and ${later.length - 1} more`} →
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
  const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1)
  const income = months.reduce((t, m) => t + m.income, 0)
  const saved = months.reduce((t, m) => t + m.income - m.expense, 0)
  const whole = (v: number) =>
    `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v / 100)).toLocaleString(LOCALE)}`

  return (
    <Card className="gap-6 px-6 max-md:hidden">
      <Head
        title={`Last ${months.length} months`}
        aside={
          <span className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-chart-1" />
              In
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-chart-2" />
              Out
            </span>
          </span>
        }
      >
        Saved <span className={cn("num", saved >= 0 ? "text-positive" : "text-warning")}>{fmt(saved, d.primary)}</span>
        {income > 0 && ` · ${Math.round((saved / income) * 100)}% of income`}
      </Head>
      <div className="overflow-x-auto">
        <Reveal
          kind="bars"
          className="grid min-w-[640px] gap-1"
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {months.map((m, i) => {
            const live = m.month === current
            const spike = d.spike?.month === m.month ? d.spike : null
            const net = m.income - m.expense
            return (
              <div
                key={m.month}
                className="flex min-w-0 flex-col items-center gap-1.5"
                aria-label={`${monthName(m.month)}: in ${fmt(m.income, d.primary)}, out ${fmt(m.expense, d.primary)}`}
                role="img"
              >
                <div className="relative flex h-44 w-full items-end justify-center gap-[3px] pt-6">
                  <span
                    className="bar-grow w-[38%] max-w-4 rounded-t-[3px] bg-chart-1"
                    style={{ height: `${(m.income / max) * 100}%`, "--i": i } as React.CSSProperties}
                  />
                  <span className="relative flex h-full w-[38%] max-w-4 items-end">
                    <span
                      className={cn("bar-grow w-full rounded-t-[3px]", live ? "bg-chart-2/40" : "bg-chart-2")}
                      style={{ height: `${(m.expense / max) * 100}%`, "--i": i } as React.CSSProperties}
                    />
                    {spike && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                        style={{ bottom: `calc(${(m.expense / max) * 100}% + 6px)` }}
                      >
                        {spike.name || "Largest"} {fmt(spike.amount, d.primary, true)}
                      </span>
                    )}
                  </span>
                </div>
                <span className={cn("text-xs text-muted-foreground", live && "font-semibold text-foreground")}>
                  {monthName(m.month, "short")}
                </span>
                <span className={cn("num text-xs text-subtle-foreground", !live && net < 0 && "text-warning")}>
                  {live ? "so far" : whole(net)}
                </span>
              </div>
            )
          })}
        </Reveal>
      </div>
    </Card>
  )
}
