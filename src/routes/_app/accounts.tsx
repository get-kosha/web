import { useId, useState, useSyncExternalStore } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { Area, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from "recharts"
import { CaretRightIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Reveal } from "@/components/motion"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GetStarted, useStarting } from "@/components/get-started"
import { PageHeader, PageSkeleton, segment, segmentButton, useGlobals, useMeta } from "@/components/shell"
import { BigMoney, CompositionBar, HatchPattern, WorthSplit } from "@/components/net-worth"
import { GainDialog } from "@/components/gain-dialog"
import { Pick } from "@/components/pick"
import {
  deleteAccount,
  deleteValuation,
  getAccountsOverview,
  listExchanges,
  listValuations,
  saveAccount,
  type AccountsOverview,
  type Exchange,
  type Wallet,
} from "@/lib/api"
import {
  intlLocale,
  accountWorth,
  convert,
  dayOf,
  exchange,
  fmt,
  fmtRate,
  parseAmount,
  type AccountType,
} from "@/lib/core"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/accounts")({
  loaderDeps: ({ search }) => ({ month: search.month, currency: search.currency }),
  loader: async ({ deps }) => {
    const [valuations, exchanges, overview] = await Promise.all([
      listValuations(),
      listExchanges(),
      getAccountsOverview({ data: deps }),
    ])
    return { valuations, exchanges, overview }
  },
  head: () => ({ meta: [{ title: m.accounts_head_title() }] }),
  pendingComponent: PageSkeleton,
  component: Accounts,
})

type Valuation = Awaited<ReturnType<typeof listValuations>>[number]

// Labels are message functions, called at render time so they follow the language.
const GROUPS: { types: AccountType[]; title: () => string }[] = [
  { types: ["bank", "cash"], title: m.accounts_group_bank_cash },
  { types: ["credit"], title: m.accounts_group_credit },
  { types: ["investment"], title: m.accounts_group_investment },
]
const typeOptions = () => [
  { value: "bank", label: m.accounts_type_bank_account() },
  { value: "cash", label: m.accounts_type_cash() },
  { value: "credit", label: m.accounts_type_credit() },
  { value: "investment", label: m.accounts_type_investment() },
]
const TYPE_LABEL: Record<AccountType, () => string> = {
  bank: m.accounts_type_bank,
  cash: m.accounts_type_cash,
  credit: m.accounts_type_credit,
  investment: m.accounts_type_investment,
}
const STALE_DAYS = 60

const long = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", timeZone: "UTC" })
const monthShort = (m: string, year = false) =>
  new Date(`${m.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString(intlLocale(), {
    month: "short",
    year: year ? "2-digit" : undefined,
    timeZone: "UTC",
  })
const signed = (v: number, cur: string) => `${v > 0 ? "+" : ""}${fmt(v, cur)}`
/** A ratio as a percentage in the active language, e.g. 0.032 → "3.2%" or "3,2 %". */
const percent = (ratio: number, digits = 0, sign = false) =>
  new Intl.NumberFormat(intlLocale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? "always" : "auto",
  }).format(ratio)
const pct = (part: number, whole: number) => (whole ? percent(part / whole, 1, true) : "")
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
/** What an account is worth in lists. A card shows what's owed. */
const shownWorth = (w: Wallet) =>
  w.type === "credit" ? -Math.max(0, (w.credit_limit ?? 0) - w.balance) : accountWorth(w)

// Account colours in the net worth chart, in a fixed order.
const SERIES = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6"]

/** Each open account's colour slot, in the order this page lists them. Past six, accounts share "Other". */
function colourSlots(wallets: Wallet[]) {
  const order = GROUPS.flatMap((g) => wallets.filter((w) => !w.archived && g.types.includes(w.type)))
  return new Map(order.slice(0, SERIES.length).map((w, i) => [w.id, i]))
}

const wideQuery = "(min-width: 1024px)"
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(wideQuery)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => matchMedia(wideQuery).matches,
    () => false
  )
}

function Accounts() {
  const meta = useMeta()
  const { valuations, exchanges, overview } = Route.useLoaderData()
  const cur = useGlobals().currency
  const wide = useWide()
  const [editing, setEditing] = useState<Wallet | "new" | null>(null)
  const [fixing, setFixing] = useState<Wallet | null>(null)
  const [gainFor, setGainFor] = useState<Wallet | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const starting = useStarting()

  const open = meta.wallets.filter((w) => !w.archived)
  const archived = meta.wallets.filter((w) => w.archived)
  const slots = colourSlots(meta.wallets)
  const currencies = [...new Set(open.map((w) => w.currency.toUpperCase()))]
  // Wide screens always show a panel (the first account until you pick one); narrow ones open it as a dialog.
  const selected = meta.wallets.find((w) => w.id === picked) ?? (wide ? open[0] : undefined)
  const detail = selected && (
    <AccountDetail
      w={selected}
      overview={overview}
      onEdit={() => setEditing(selected)}
      onFix={() => setFixing(selected)}
      onGain={() => setGainFor(selected)}
    />
  )

  return (
    <div className="pb-8">
      <PageHeader
        title={m.accounts_title()}
        sub={
          open.length ? (
            <>
              <ParaglideMessage
                message={m.accounts_count}
                inputs={{ count: open.length }}
                markup={{ num: ({ children }) => <span className="num">{children}</span> }}
              />{" "}
              · {new Intl.ListFormat(intlLocale()).format(currencies)}
            </>
          ) : undefined
        }
      >
        <Button
          variant="outline"
          size="lg"
          className="gap-2 bg-card px-3 text-[13px] font-normal"
          onClick={() => setEditing("new")}
        >
          <PlusIcon /> {m.accounts_new()}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-5 px-4 md:px-8">
        {starting && <GetStarted />}
        <Hero overview={overview} />

        {meta.wallets.length > 0 && (
          <div className="flex flex-wrap items-start gap-5">
            <Card className="min-w-0 flex-[999_1_560px] gap-0 py-0">
              {GROUPS.map((g) => {
                const list = open.filter((w) => g.types.includes(w.type))
                if (!list.length) return null
                const total = list.reduce((t, w) => t + convert(shownWorth(w), w.currency, cur, meta.rates), 0)
                return (
                  <section key={g.types[0]} aria-label={g.title()} className="border-t first:border-t-0">
                    <div className="flex items-baseline justify-between px-4 pt-4 pb-1.5 md:px-5">
                      <h2 className="text-[13px] font-medium">{g.title()}</h2>
                      <span className="num text-xs text-muted-foreground">{fmt(total, cur)}</span>
                    </div>
                    {list.map((w) => (
                      <AccountRow
                        key={w.id}
                        w={w}
                        slot={slots.get(w.id)}
                        display={cur}
                        overview={overview}
                        selected={w.id === selected?.id}
                        onSelect={() => setPicked(w.id)}
                      />
                    ))}
                  </section>
                )
              })}
              {archived.length > 0 && (
                <section aria-label={m.accounts_archived_label()} className="border-t">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 md:px-3">
                    <Button
                      variant="ghost"
                      aria-expanded={showArchived}
                      onClick={() => setShowArchived((v) => !v)}
                      className="h-9 gap-2 px-2 font-normal"
                    >
                      <CaretRightIcon
                        className={cn("transition-transform duration-150 ease-out", showArchived && "rotate-90")}
                      />{" "}
                      {m.accounts_archived_count({ count: archived.length })}
                    </Button>
                    <span className="px-2 text-xs text-muted-foreground">{m.accounts_archived_hint()}</span>
                  </div>
                  {showArchived &&
                    archived.map((w) => (
                      <AccountRow
                        key={w.id}
                        w={w}
                        display={cur}
                        overview={overview}
                        selected={w.id === selected?.id}
                        onSelect={() => setPicked(w.id)}
                      />
                    ))}
                </section>
              )}
            </Card>

            {wide && selected && (
              <Card
                aria-label={m.accounts_details_label({ name: selected.name })}
                className="sticky top-5 max-w-[400px] min-w-0 flex-[1_1_320px] gap-0 px-5 py-5"
              >
                {detail}
              </Card>
            )}
          </div>
        )}

        {exchanges.length > 0 && <Exchanges list={exchanges} display={cur} />}
      </div>

      <Dialog open={!wide && !!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">{selected?.name}</DialogTitle>
          {!wide && detail}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? m.accounts_new() : m.accounts_edit_title({ name: editing?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <AccountForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? undefined : editing}
              valuations={editing === "new" ? [] : valuations.filter((v) => v.wallet_id === editing.id)}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!fixing} onOpenChange={(o) => !o && setFixing(null)}>
        <DialogContent className="sm:max-w-sm">
          {fixing && <FixBalanceForm key={fixing.id} w={fixing} onDone={() => setFixing(null)} />}
        </DialogContent>
      </Dialog>

      <GainDialog wallet={gainFor} onClose={() => setGainFor(null)} />
    </div>
  )
}

// ---------- net worth hero ----------

const RANGES = [
  ["1Y", 13, m.accounts_range_1y],
  ["2Y", 25, m.accounts_range_2y],
  ["All", Infinity, m.accounts_range_all],
] as const

function Hero({ overview }: { overview: AccountsOverview }) {
  const meta = useMeta()
  const cur = overview.currency
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("2Y")
  const all = overview.series
  const points = all.slice(-RANGES.find((r) => r[0] === range)![1])
  const now = all.at(-1)?.netWorth ?? 0
  const nowGains = all.at(-1)?.gains ?? 0
  const yearAgo = all.length > 1 ? all[Math.max(0, all.length - 13)].netWorth : null
  const change = yearAgo === null ? null : now - yearAgo
  const others = [...new Set(meta.wallets.filter((w) => !w.archived && w.currency !== cur).map((w) => w.currency))]
  const age = daysBetween(dayOf(overview.ratesUpdated, meta.tz), overview.today)
  const updated = !overview.ratesUpdated
    ? null
    : age <= 0
      ? m.accounts_rates_updated_today()
      : age === 1
        ? m.accounts_rates_updated_yesterday()
        : m.accounts_rates_updated_on({ date: long(dayOf(overview.ratesUpdated, meta.tz)) })

  return (
    <Card aria-labelledby="nw-h" className="flex-row flex-wrap gap-x-10 gap-y-6 px-6 max-md:px-4">
      <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="nw-h" className="text-xs text-muted-foreground">
              {m.accounts_net_worth()}
            </h2>
            <BigMoney value={now} currency={cur} className="mt-2" />
            <div className="mt-2.5">
              <WorthSplit total={now} gains={nowGains} currency={cur} />
            </div>
            {change !== null && (
              <p className="mt-1.5 text-[13px]">
                <span className={cn("font-medium", change >= 0 ? "text-positive" : "text-destructive")}>
                  {signed(change, cur)} ({pct(change, yearAgo! || 1)})
                </span>{" "}
                <span className="text-muted-foreground">
                  {m.accounts_change_period({ count: Math.min(12, all.length - 1) })}
                </span>
              </p>
            )}
          </div>
          {all.length > 13 && (
            <div role="group" aria-label={m.accounts_range_label()} className={segment}>
              {RANGES.map(([r, , label]) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === range}
                  onClick={() => setRange(r)}
                  className={segmentButton}
                >
                  {label()}
                </button>
              ))}
            </div>
          )}
        </div>
        {points.length > 1 ? (
          <Reveal>
            <WorthChart points={points} currency={cur} />
          </Reveal>
        ) : (
          <p className="py-10 text-sm text-muted-foreground">{m.accounts_worth_empty()}</p>
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col justify-center gap-3.5">
        <CompositionBar wallets={meta.wallets} currency={cur} rates={meta.rates} />
        {others.length > 0 && (
          <p className="num border-t pt-3 text-xs text-muted-foreground">
            {others
              .map((c) =>
                m.accounts_rate_shown({
                  currency: c.toUpperCase(),
                  rate: fmt(convert(100, cur, c, meta.rates), c),
                  base: fmt(100, cur).replace(/\.00$/, ""),
                })
              )
              .join(" · ")}
            {updated && ` · ${updated}`}
          </p>
        )}
      </div>
    </Card>
  )
}

/**
 * Net worth over time, stacked by account in each account's colour, with all unrealized gains hatched on
 * top and the net worth itself as a line. Card debt stacks below zero, so the line is the total, not the
 * top of the stack.
 */
function WorthChart({ points, currency }: { points: AccountsOverview["series"]; currency: string }) {
  const meta = useMeta()
  const hatch = useId()
  const slots = colourSlots(meta.wallets)
  const rows = points.map((p) => {
    const row: Record<string, number | string> = { month: p.month, netWorth: p.netWorth, gains: p.gains }
    for (const [id, v] of Object.entries(p.byAccount)) {
      const slot = slots.get(id)
      const key = slot === undefined ? "other" : `a${slot}`
      row[key] = (Number(row[key]) || 0) + v
    }
    return row
  })
  const names = new Map([...slots].map(([id, i]) => [`a${i}`, meta.wallets.find((w) => w.id === id)?.name ?? ""]))
  const keys = [...SERIES.map((_, i) => `a${i}`), "other"].filter((k) => rows.some((r) => Math.round(Number(r[k]))))
  const hasGains = rows.some((r) => Math.round(Number(r.gains)))
  // Card debt stacks below zero. When it is a sliver, start the axis at zero instead of mirroring the scale
  // below it; the line and the tooltip still give the true total.
  const below = Math.min(...rows.map((r) => keys.reduce((sum, k) => sum + Math.min(0, Number(r[k]) || 0), 0)))
  const above = Math.max(...rows.map((r) => Number(r.netWorth) - below))
  const sliver = -below < above * 0.05
  const config: ChartConfig = Object.fromEntries([
    ...keys.map((k) => [
      k,
      {
        label: names.get(k) ?? m.accounts_chart_other(),
        color: k === "other" ? "var(--chart-3)" : `var(${SERIES[+k.slice(1)]})`,
      },
    ]),
    ["gains", { label: m.accounts_chart_gains(), color: "var(--chart-2)" }],
    ["netWorth", { label: m.accounts_net_worth(), color: "var(--chart-2)" }],
  ])

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="aspect-auto h-44 w-full md:h-48">
        <ComposedChart data={rows} stackOffset="sign" margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <HatchPattern id={hatch} />
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={(m) => monthShort(m, true)}
            minTickGap={40}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => fmt(v, currency, true)}
            domain={[sliver ? 0 : "auto", "auto"]}
            allowDataOverflow={sliver}
            tickCount={3}
          />
          <ChartTooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="grid min-w-48 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                  <div className="flex justify-between gap-4 font-medium">
                    <span>{monthShort(String(label), true)}</span>
                    <span className="num">{fmt(Number(payload[0].payload.netWorth), currency)}</span>
                  </div>
                  {payload
                    .filter((item) => item.dataKey !== "netWorth" && Math.round(Number(item.value)))
                    .reverse()
                    .map((item) => {
                      const key = String(item.dataKey)
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn("size-2.5 shrink-0 rounded-[2px]", key === "gains" && "hatch")}
                            style={key === "gains" ? undefined : { background: config[key]?.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{config[key]?.label}</span>
                          <span className="num">{fmt(Number(item.value), currency)}</span>
                        </div>
                      )
                    })}
                </div>
              ) : null
            }
          />
          {keys.map((k) => (
            <Area
              key={k}
              dataKey={k}
              stackId="worth"
              type="monotone"
              stroke="var(--card)"
              strokeWidth={1}
              fill={`var(--color-${k})`}
              fillOpacity={0.8}
              isAnimationActive={false}
            />
          ))}
          {hasGains && (
            <Area
              dataKey="gains"
              stackId="worth"
              type="monotone"
              stroke="var(--chart-3)"
              strokeWidth={1}
              fill={`url(#${hatch})`}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="netWorth"
            type="monotone"
            stroke="var(--color-netWorth)"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <ul
        aria-label={m.accounts_chart_key()}
        className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
      >
        {keys.map((k) => (
          <li key={k} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: config[k].color }}
              aria-hidden="true"
            />
            <span className="truncate">{config[k].label}</span>
          </li>
        ))}
        {hasGains && (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-[3px] hatch" aria-hidden="true" />
            {m.accounts_chart_gains()}
          </li>
        )}
        <li className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-chart-2" aria-hidden="true" />
          {m.accounts_net_worth()}
        </li>
      </ul>
    </div>
  )
}

// ---------- account list ----------

function AccountRow({
  w,
  slot,
  display,
  overview,
  selected,
  onSelect,
}: {
  w: Wallet
  /** Its colour in the net worth chart, if it has its own. */
  slot?: number
  display: string
  overview: AccountsOverview
  selected: boolean
  onSelect: () => void
}) {
  const meta = useMeta()
  const worth = shownWorth(w)
  const data = overview.accounts[w.id]
  const foreign = w.currency !== display
  const owed = -worth
  const age = w.gain_day ? daysBetween(w.gain_day, overview.today) : null
  const stale = w.type === "investment" && (age === null || age > STALE_DAYS)

  const sub = stale ? (
    <span className="text-warning">{age === null ? m.accounts_no_value() : m.accounts_value_age({ days: age })}</span>
  ) : (
    `${TYPE_LABEL[w.type]()} · ${w.currency.toUpperCase()}`
  )
  const amountSub =
    w.type === "credit" && w.credit_limit ? (
      m.accounts_available({ amount: fmt(w.balance, w.currency) })
    ) : w.type === "investment" && w.gain_day && w.gain !== null ? (
      <span className={w.gain >= 0 ? "text-positive" : "text-destructive"}>
        {signed(w.gain, w.currency)} · {pct(w.gain, w.balance).replace("+", "")}
      </span>
    ) : foreign ? (
      `≈ ${fmt(convert(accountWorth(w), w.currency, display, meta.rates), display)}`
    ) : data?.lastEntry ? (
      m.accounts_last_entry({ date: short(data.lastEntry) })
    ) : null

  // Months after the last valuation are a guess, so draw them dashed.
  const gainMonth = w.gain_day?.slice(0, 7)
  const dashFrom =
    stale && gainMonth
      ? Math.max(
          0,
          overview.last6.findLastIndex((m) => m <= gainMonth)
        )
      : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-row
      className={cn(
        "grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_112px_minmax(8rem,auto)] md:px-5",
        selected && "bg-selected hover:bg-selected",
        w.archived && "text-muted-foreground"
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {slot !== undefined && (
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: `var(${SERIES[slot]})` }}
              aria-hidden="true"
            />
          )}
          <span className="truncate text-[15px]">{w.name}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className="hidden sm:block" aria-hidden="true">
        {w.type === "credit" ? (
          w.credit_limit ? (
            <span className="flex flex-col gap-1.5">
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-chart-2"
                  style={{ width: `${Math.min(100, (owed / w.credit_limit) * 100)}%` }}
                />
              </span>
              <span className="num text-[11px] text-muted-foreground">
                {m.accounts_credit_used({
                  percent: percent(owed / w.credit_limit),
                  limit: fmt(w.credit_limit, w.currency).replace(/\.00$/, ""),
                })}
              </span>
            </span>
          ) : null
        ) : data ? (
          <Spark
            values={data.months}
            dashFrom={dashFrom}
            tone={w.type === "investment" && !stale && (w.gain ?? 0) >= 0 ? "positive" : "ink"}
          />
        ) : null}
      </span>
      <span className="num text-right">
        <span className={cn("block text-[15px]", worth < 0 && w.type !== "credit" && "text-destructive")}>
          {fmt(worth, w.currency)}
        </span>
        {amountSub && <span className="block text-xs text-muted-foreground">{amountSub}</span>}
      </span>
    </button>
  )
}

/** 6-month sparkline. The part after `dashFrom` is dashed (a value that hasn't been updated). */
function Spark({ values, dashFrom, tone }: { values: number[]; dashFrom?: number; tone: "ink" | "positive" }) {
  const min = Math.min(...values),
    max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map(
    (v, i) => `${(i / (values.length - 1)) * 112},${max === min ? 14 : 25 - ((v - min) / span) * 22}`
  )
  const cut = dashFrom ?? pts.length - 1
  const stroke = tone === "positive" ? "var(--positive)" : "var(--chart-2)"
  return (
    <Reveal className="w-28">
      <svg viewBox="0 0 112 28" preserveAspectRatio="none" className="block h-7 w-28 overflow-visible">
        <polyline
          points={pts.slice(0, cut + 1).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {cut < pts.length - 1 && (
          <polyline
            points={pts.slice(cut).join(" ")}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </Reveal>
  )
}

// ---------- detail panel ----------

function AccountDetail({
  w,
  overview,
  onEdit,
  onFix,
  onGain,
}: {
  w: Wallet
  overview: AccountsOverview
  onEdit: () => void
  onFix: () => void
  onGain: () => void
}) {
  const meta = useMeta()
  const router = useRouter()
  const data = overview.accounts[w.id]
  const lineConfig = { worth: { label: m.accounts_balance(), color: "var(--chart-2)" } } satisfies ChartConfig
  const name = (id: string | null) => meta.wallets.find((x) => x.id === id)?.name ?? m.accounts_another_account()
  const recent = overview.recent.filter((r) => r.wallet_id === w.id)
  const line = (data?.days ?? []).map((worth, i) => ({ day: overview.days[i], worth }))
  const monthTicks = overview.days.filter((d) => d.endsWith("-01"))
  const month = monthShort(overview.month)
  const age = w.gain_day ? daysBetween(w.gain_day, overview.today) : null

  async function toggleArchive() {
    try {
      await saveAccount({
        data: {
          id: w.id,
          name: w.name,
          type: w.type,
          currency: w.currency,
          creditLimit: w.credit_limit,
          archived: !w.archived,
          balance: null,
        },
      })
      await router.invalidate()
      toast.success(
        w.archived ? m.accounts_restored_toast({ name: w.name }) : m.accounts_archived_toast({ name: w.name })
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.accounts_save_failed())
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs text-muted-foreground">
          {TYPE_LABEL[w.type]()} · {w.currency.toUpperCase()}
          {w.archived ? ` · ${m.accounts_archived()}` : ""}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">{w.name}</h2>
          <span className="num shrink-0 text-xl font-medium">{fmt(shownWorth(w), w.currency)}</span>
        </div>
      </div>

      {line.some((p) => p.worth !== line[0].worth) && (
        <ChartContainer config={lineConfig} className="aspect-auto h-28 w-full">
          <LineChart data={line} margin={{ left: 4, right: 4, top: 6, bottom: 0 }}>
            <XAxis
              dataKey="day"
              ticks={monthTicks}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => monthShort(d)}
              interval={0}
              fontSize={11}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(d) => short(String(d))}
                  formatter={(v) => fmt(Number(v), w.currency)}
                />
              }
            />
            <Line
              dataKey="worth"
              type="linear"
              stroke="var(--color-worth)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}

      {data && w.type !== "investment" && (
        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="text-xs text-muted-foreground">{m.accounts_in_month({ month })}</dt>
            <dd className={cn("num mt-0.5 text-sm", data.in > 0 && "text-positive")}>{signed(data.in, w.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{m.accounts_out_month({ month })}</dt>
            <dd className="num mt-0.5 text-sm">{fmt(data.out, w.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{m.accounts_moved()}</dt>
            <dd className="num mt-0.5 text-sm text-subtle-foreground">{fmt(data.moved, w.currency)}</dd>
          </div>
        </dl>
      )}

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">{m.accounts_recent()}</h3>
          {w.tx_count > 0 && (
            <Link
              to="/transactions"
              search={{ wallet: w.id }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {m.accounts_all_count({ n: w.tx_count.toLocaleString(intlLocale()) })}
            </Link>
          )}
        </div>
        {recent.length === 0 && <p className="py-2 text-sm text-muted-foreground">{m.accounts_no_transactions()}</p>}
        {recent.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t py-2.5 text-sm",
              r.transfer_id && "text-subtle-foreground"
            )}
          >
            <span className="num text-xs text-muted-foreground">{short(r.day)}</span>
            <span className="truncate">
              {r.transfer_id
                ? `${r.amount < 0 ? "→" : "←"} ${name(r.counter_wallet_id)}`
                : r.name || m.accounts_untitled()}
            </span>
            <span className={cn("num", !r.transfer_id && r.amount > 0 && "text-positive")}>
              {r.transfer_id ? fmt(Math.abs(r.amount), w.currency) : fmt(r.amount, w.currency)}
            </span>
          </div>
        ))}
      </div>

      {w.type === "investment" ? (
        <div className="rounded-xl bg-muted px-4 py-3.5">
          <div className="text-[13px] font-medium">
            {age === null
              ? m.accounts_no_value()
              : age > STALE_DAYS
                ? m.accounts_value_age({ days: age })
                : m.accounts_value_as_of({ date: long(w.gain_day!) })}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{m.accounts_update_value_hint()}</p>
          <Button
            variant={age === null || age > STALE_DAYS ? "default" : "outline"}
            size="sm"
            className={cn("mt-2.5", age !== null && age <= STALE_DAYS && "bg-card")}
            onClick={onGain}
          >
            {m.accounts_update_gains()}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-muted px-4 py-3.5">
          <div className="text-[13px] font-medium">
            {w.reconciled_day ? m.accounts_reconciled_to({ date: long(w.reconciled_day) }) : m.accounts_match_bank()}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{m.accounts_reconcile_hint()}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link
              to="/reconcile"
              search={{ account: w.id }}
              className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-[13px] transition-colors hover:bg-muted max-md:h-11"
            >
              {m.accounts_reconcile()}
            </Link>
            <Button variant="ghost" size="sm" className="max-md:h-11" onClick={onFix}>
              {m.accounts_fix_balance()}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="ghost" onClick={onEdit}>
          {m.accounts_edit_account()}
        </Button>
        <Button variant="ghost" onClick={toggleArchive}>
          {w.archived ? m.accounts_unarchive() : m.accounts_archive()}
        </Button>
      </div>
    </div>
  )
}

/** When the bank shows a different balance, book the difference as a balance correction. */
function FixBalanceForm({ w, onDone }: { w: Wallet; onDone: () => void }) {
  const router = useRouter()
  const credit = w.type === "credit"
  const shown = credit ? (w.credit_limit ?? 0) - w.balance : w.balance
  const [value, setValue] = useState((shown / 100).toFixed(2))
  const entered = parseAmount(value)
  const target = entered === null ? null : credit ? (w.credit_limit ?? 0) - Math.abs(entered) : entered
  const correction = target === null ? 0 : target - w.balance

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (target === null) return toast.error(m.accounts_enter_balance())
    try {
      await saveAccount({
        data: {
          id: w.id,
          name: w.name,
          type: w.type,
          currency: w.currency,
          creditLimit: w.credit_limit,
          archived: !!w.archived,
          balance: target,
        },
      })
      await router.invalidate()
      toast.success(
        correction ? m.accounts_corrected_by({ amount: signed(correction, w.currency) }) : m.accounts_balance_matches()
      )
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.accounts_save_failed())
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{m.accounts_fix_title({ name: w.name })}</DialogTitle>
        <DialogDescription>
          {credit ? m.accounts_fix_credit_description() : m.accounts_fix_description()}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="fix-balance">
          {credit ? m.accounts_currently_owed() : m.accounts_balance()}{" "}
          <span className="text-muted-foreground uppercase">({w.currency})</span>
        </Label>
        <Input
          id="fix-balance"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className="num"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <p className="num text-xs text-muted-foreground">
          {correction
            ? m.accounts_fix_adds_correction({ amount: signed(correction, w.currency) })
            : m.accounts_no_correction()}
        </p>
      </div>
      <Button type="submit">{m.common_save()}</Button>
    </form>
  )
}

// ---------- edit dialog ----------

function AccountForm({
  initial,
  valuations,
  onDone,
}: {
  initial?: Wallet
  valuations: Valuation[]
  onDone: () => void
}) {
  const meta = useMeta()
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? "")
  const [type, setType] = useState<AccountType>(initial?.type ?? "bank")
  const [currency, setCurrency] = useState(initial?.currency ?? meta.primary)
  const [limit, setLimit] = useState(initial?.credit_limit ? (initial.credit_limit / 100).toFixed(2) : "")
  // For a card, people know what they owe, but the account tracks what's left (limit minus owed).
  const [balance, setBalance] = useState(() => {
    if (!initial) return ""
    const shown = initial.type === "credit" ? (initial.credit_limit ?? 0) - initial.balance : initial.balance
    return (shown / 100).toFixed(2)
  })
  const [archived, setArchived] = useState(!!initial?.archived)
  const [confirming, setConfirming] = useState(false)
  const currencies = [...new Set([meta.primary, ...meta.wallets.map((w) => w.currency), "eur", "inr", "usd", "gbp"])]
  const locked = !!initial?.tx_count
  const limitCents = type === "credit" ? parseAmount(limit) : null
  const entered = parseAmount(balance)
  const target = type === "credit" ? (limitCents ?? 0) - Math.abs(entered ?? 0) : (entered ?? 0)
  const correction = initial && entered !== null ? target - initial.balance : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (type === "credit" && !limitCents) return toast.error(m.accounts_enter_credit_limit())
    try {
      // An empty field leaves an existing account's balance alone.
      await saveAccount({
        data: {
          id: initial?.id,
          name,
          type,
          currency,
          creditLimit: limitCents,
          archived,
          balance: initial && entered === null ? null : target,
        },
      })
      await router.invalidate()
      toast.success(initial ? m.accounts_updated() : m.accounts_added())
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.accounts_save_failed())
    }
  }

  async function remove() {
    if (!initial) return
    try {
      await deleteAccount({ data: { id: initial.id } })
      await router.invalidate()
      setConfirming(false)
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.accounts_delete_failed())
    }
  }

  async function removeValuation(id: string) {
    await deleteValuation({ data: { id } })
    await router.invalidate()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="acc-name">{m.accounts_name()}</Label>
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>{m.accounts_type()}</Label>
          <Pick
            value={type}
            onChange={(v) => v && setType(v as AccountType)}
            placeholder={m.accounts_type()}
            options={typeOptions()}
            className="w-full"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{m.accounts_currency()}</Label>
          {locked ? (
            <div className="flex h-8 items-center text-sm text-muted-foreground uppercase">{currency}</div>
          ) : (
            <Pick
              value={currency}
              onChange={(v) => v && setCurrency(v)}
              placeholder={m.accounts_currency()}
              options={currencies.map((c) => ({ value: c, label: c.toUpperCase() }))}
              className="w-full"
            />
          )}
        </div>
      </div>

      {type === "credit" && (
        <div className="grid gap-1.5">
          <Label htmlFor="acc-limit">
            {m.accounts_credit_limit()} <span className="text-muted-foreground uppercase">({currency})</span>
          </Label>
          <Input
            id="acc-limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            className="num"
          />
          <p className="text-xs text-muted-foreground">{m.accounts_credit_hint()}</p>
        </div>
      )}
      {type === "investment" && <p className="text-xs text-muted-foreground">{m.accounts_investment_hint()}</p>}

      <div className="grid gap-1.5">
        <Label htmlFor="acc-balance">
          {type === "credit"
            ? m.accounts_currently_owed()
            : type === "investment"
              ? m.accounts_invested_so_far()
              : m.accounts_current_balance()}{" "}
          {!initial && <span className="text-muted-foreground">{m.accounts_optional()}</span>}
        </Label>
        <Input
          id="acc-balance"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          inputMode="decimal"
          className="num"
          onFocus={(e) => e.target.select()}
        />
        {initial && (
          <p className="num text-xs text-muted-foreground">
            {correction
              ? m.accounts_save_adds_correction({ amount: signed(correction, currency) })
              : m.accounts_correct_hint()}
          </p>
        )}
      </div>

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          <span>
            <ParaglideMessage
              message={m.accounts_archived_checkbox}
              markup={{ muted: ({ children }) => <span className="text-muted-foreground">{children}</span> }}
            />
          </span>
        </label>
      )}

      {valuations.length > 0 && (
        <div className="grid gap-1.5">
          <Label>{m.accounts_gains_history()}</Label>
          <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
            {valuations.map((v) => (
              <div key={v.id} className="num flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{long(v.day)}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{v.note}</span>
                <span className={cn(v.gain >= 0 ? "text-positive" : "text-destructive")}>
                  {signed(v.gain, currency)}{" "}
                  <span className="text-xs text-muted-foreground">{pct(v.gain, v.invested)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeValuation(v.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={m.accounts_delete_valuation({ date: long(v.day) })}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {initial && !initial.tx_count && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
            {m.common_delete()}
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {initial ? m.common_save() : m.accounts_add_account()}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{m.accounts_delete_title({ name: initial?.name ?? "" })}</DialogTitle>
            <DialogDescription>{m.accounts_delete_description()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="button" variant="destructive" onClick={remove}>
              {m.accounts_delete_account()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

// ---------- currency exchange ----------

/** Currency exchanges with the provider's rate, the market rate that day, and what the difference plus fees cost. */
function Exchanges({ list, display }: { list: Exchange[]; display: string }) {
  const meta = useMeta()
  const years = [...new Set(list.map((x) => x.day.slice(0, 4)))]
  const [year, setYear] = useState(years[0])
  const name = (id: string) => meta.wallets.find((w) => w.id === id)?.name
  const rows = list
    .filter((x) => x.day.startsWith(year))
    .map((x) => ({ x, fx: exchange(x.converted + x.fee, x.fee, x.received, x.market_rate) }))
  const conv = (v: number, c: string) => convert(v, c, display, meta.rates)
  const sent = rows.reduce((t, r) => t + conv(r.x.converted + r.x.fee, r.x.from_currency), 0)
  const cost = rows.reduce((t, r) => t + conv(r.fx.totalCost, r.x.from_currency), 0)

  return (
    <Card aria-labelledby="fx-h" className="gap-4 px-5 max-md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 id="fx-h" className="text-sm font-medium">
            {m.accounts_fx_title()}
          </h2>
          <p className="text-xs text-muted-foreground">
            <ParaglideMessage
              message={m.accounts_fx_sent}
              inputs={{ count: rows.length, sent: fmt(sent, display) }}
              markup={{ num: ({ children }) => <span className="num text-foreground">{children}</span> }}
            />{" "}
            ·{" "}
            <ParaglideMessage
              message={m.accounts_fx_cost}
              inputs={{ cost: fmt(cost, display) }}
              markup={{ num: ({ children }) => <span className="num text-foreground">{children}</span> }}
            />
            {sent ? ` (${percent(cost / sent, 2)})` : ""}
          </p>
        </div>
        {years.length > 1 && (
          <div role="group" aria-label={m.accounts_fx_year()} className={segment}>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                onClick={() => setYear(y)}
                className={segmentButton}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="-mx-5 overflow-x-auto px-5 max-md:-mx-4 max-md:px-4">
        <table className="num w-full min-w-[640px] text-[13px]">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
              <th>{m.accounts_fx_date()}</th>
              <th>{m.accounts_fx_route()}</th>
              <th className="text-right">{m.accounts_fx_sent_column()}</th>
              <th className="text-right">{m.accounts_fx_rate()}</th>
              <th className="text-right">{m.accounts_fx_market()}</th>
              <th className="text-right">{m.accounts_fx_received()}</th>
              <th className="text-right">{m.accounts_fx_cost_column()}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ x, fx }) => (
              <tr key={x.id} className="[&>td]:px-3 [&>td]:py-2.5 [&>td]:whitespace-nowrap">
                <td>{short(x.day)}</td>
                <td className="font-sans">
                  {name(x.from_wallet)} → {name(x.to_wallet)}
                  {x.provider && <span className="text-xs text-muted-foreground"> · {x.provider}</span>}
                </td>
                <td className="text-right">{fmt(x.converted + x.fee, x.from_currency)}</td>
                <td className="text-right">{fmtRate(fx.rate)}</td>
                <td className="text-right text-muted-foreground">{x.market_rate ? fmtRate(x.market_rate) : "—"}</td>
                <td className="text-right">{fmt(x.received, x.to_currency)}</td>
                <td className={cn("text-right", fx.totalCost < -0.5 && "text-positive")}>
                  {x.market_rate || x.fee
                    ? `${fmt(fx.totalCost, x.from_currency)} · ${percent(fx.costPct / 100, 2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{m.accounts_fx_footer()}</p>
    </Card>
  )
}
