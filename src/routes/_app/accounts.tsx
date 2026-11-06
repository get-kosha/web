import { useState, useSyncExternalStore } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { CaretRightIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
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
import { PageHeader, segment, segmentButton, useGlobals, useMeta } from "@/components/shell"
import { BigMoney, CompositionBar } from "@/components/net-worth"
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
import { LOCALE, accountWorth, convert, dayOf, exchange, fmt, fmtRate, parseAmount, type AccountType } from "@/lib/core"
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
  head: () => ({ meta: [{ title: "Accounts · Kosha" }] }),
  component: Accounts,
})

type Valuation = Awaited<ReturnType<typeof listValuations>>[number]

const GROUPS: { types: AccountType[]; title: string }[] = [
  { types: ["bank", "cash"], title: "Bank & cash" },
  { types: ["credit"], title: "Credit cards" },
  { types: ["investment"], title: "Investments" },
]
const TYPE_OPTIONS = [
  { value: "bank", label: "Bank account" },
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Investment" },
]
const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  credit: "Credit card",
  investment: "Investment",
}
const STALE_DAYS = 60

const long = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" })
const monthShort = (m: string, year = false) =>
  new Date(`${m.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString(LOCALE, {
    month: "short",
    year: year ? "2-digit" : undefined,
    timeZone: "UTC",
  })
const signed = (v: number, cur: string) => `${v > 0 ? "+" : ""}${fmt(v, cur)}`
const pct = (part: number, whole: number) =>
  whole ? `${part >= 0 ? "+" : ""}${((part / whole) * 100).toFixed(1)}%` : ""
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
/** What an account is worth in lists. A card shows what's owed. */
const shownWorth = (w: Wallet) =>
  w.type === "credit" ? -Math.max(0, (w.credit_limit ?? 0) - w.balance) : accountWorth(w)

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

  const open = meta.wallets.filter((w) => !w.archived)
  const archived = meta.wallets.filter((w) => w.archived)
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
        title="Accounts"
        sub={
          open.length ? (
            <>
              <span className="num">{open.length}</span> account{open.length === 1 ? "" : "s"} ·{" "}
              {new Intl.ListFormat(LOCALE).format(currencies)}
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
          <PlusIcon /> New account
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-5 px-4 md:px-8">
        <Hero overview={overview} />

        {meta.wallets.length > 0 && (
          <div className="flex flex-wrap items-start gap-5">
            <Card className="min-w-0 flex-[999_1_560px] gap-0 py-0">
              {GROUPS.map((g) => {
                const list = open.filter((w) => g.types.includes(w.type))
                if (!list.length) return null
                const total = list.reduce((t, w) => t + convert(shownWorth(w), w.currency, cur, meta.rates), 0)
                return (
                  <section key={g.title} aria-label={g.title} className="border-t first:border-t-0">
                    <div className="flex items-baseline justify-between px-4 pt-4 pb-1.5 md:px-5">
                      <h2 className="text-[13px] font-medium">{g.title}</h2>
                      <span className="num text-xs text-muted-foreground">{fmt(total, cur)}</span>
                    </div>
                    {list.map((w) => (
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
                )
              })}
              {archived.length > 0 && (
                <section aria-label="Archived accounts" className="border-t">
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
                      Archived ({archived.length})
                    </Button>
                    <span className="px-2 text-xs text-muted-foreground">
                      Archived accounts still count in net worth
                    </span>
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
                aria-label={`${selected.name} details`}
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
            <DialogTitle>{editing === "new" ? "New account" : `Edit ${editing?.name}`}</DialogTitle>
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

const worthConfig = { netWorth: { label: "Net worth", color: "var(--chart-2)" } } satisfies ChartConfig
const RANGES = [
  ["1Y", 13],
  ["2Y", 25],
  ["All", Infinity],
] as const

function Hero({ overview }: { overview: AccountsOverview }) {
  const meta = useMeta()
  const cur = overview.currency
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("2Y")
  const all = overview.series
  const points = all.slice(-RANGES.find((r) => r[0] === range)![1])
  const now = all.at(-1)?.netWorth ?? 0
  const yearAgo = all.length > 1 ? all[Math.max(0, all.length - 13)].netWorth : null
  const change = yearAgo === null ? null : now - yearAgo
  const others = [...new Set(meta.wallets.filter((w) => !w.archived && w.currency !== cur).map((w) => w.currency))]
  const age = daysBetween(dayOf(overview.ratesUpdated, meta.tz), overview.today)
  const updated = !overview.ratesUpdated
    ? null
    : age <= 0
      ? "updated today"
      : age === 1
        ? "updated yesterday"
        : `updated ${long(dayOf(overview.ratesUpdated, meta.tz))}`

  return (
    <Card aria-labelledby="nw-h" className="flex-row flex-wrap gap-x-10 gap-y-6 px-6 max-md:px-4">
      <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="nw-h" className="text-xs text-muted-foreground">
              Net worth
            </h2>
            <BigMoney value={now} currency={cur} className="mt-2" />
            {change !== null && (
              <p className="mt-2 text-[13px]">
                <span className={cn("font-medium", change >= 0 ? "text-positive" : "text-destructive")}>
                  {signed(change, cur)} ({pct(change, yearAgo! || 1)})
                </span>{" "}
                <span className="text-muted-foreground">in {Math.min(12, all.length - 1)} months</span>
              </p>
            )}
          </div>
          {all.length > 13 && (
            <div role="group" aria-label="Range" className={segment}>
              {RANGES.map(([r]) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === range}
                  onClick={() => setRange(r)}
                  className={segmentButton}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
        {points.length > 1 ? (
          <Reveal>
            <ChartContainer config={worthConfig} className="aspect-auto h-44 w-full md:h-48">
              <AreaChart data={points} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
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
                  tickFormatter={(v) => fmt(v, cur, true)}
                  domain={["auto", "auto"]}
                  tickCount={3}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(m) => monthShort(String(m), true)}
                      formatter={(v) => fmt(Number(v), cur)}
                    />
                  }
                />
                <Area
                  dataKey="netWorth"
                  type="monotone"
                  stroke="var(--color-netWorth)"
                  strokeWidth={1.75}
                  fill="var(--color-netWorth)"
                  fillOpacity={0.06}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </Reveal>
        ) : (
          <p className="py-10 text-sm text-muted-foreground">
            Your net worth line starts after your first month of activity.
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col justify-center gap-3.5">
        <CompositionBar wallets={meta.wallets} currency={cur} rates={meta.rates} />
        {others.length > 0 && (
          <p className="num border-t pt-3 text-xs text-muted-foreground">
            {others
              .map(
                (c) =>
                  `${c.toUpperCase()} shown at ${fmt(convert(100, cur, c, meta.rates), c)} = ${fmt(100, cur).replace(/\.00$/, "")}`
              )
              .join(" · ")}
            {updated && ` · ${updated}`}
          </p>
        )}
      </div>
    </Card>
  )
}

// ---------- account list ----------

function AccountRow({
  w,
  display,
  overview,
  selected,
  onSelect,
}: {
  w: Wallet
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
    <span className="text-warning">{age === null ? "No value recorded yet" : `Value is ${age} days old`}</span>
  ) : (
    `${TYPE_LABEL[w.type]} · ${w.currency.toUpperCase()}`
  )
  const amountSub =
    w.type === "credit" && w.credit_limit ? (
      `${fmt(w.balance, w.currency)} available`
    ) : w.type === "investment" && w.gain_day && w.gain !== null ? (
      <span className={w.gain >= 0 ? "text-positive" : "text-destructive"}>
        {signed(w.gain, w.currency)} · {pct(w.gain, w.balance).replace("+", "")}
      </span>
    ) : foreign ? (
      `≈ ${fmt(convert(accountWorth(w), w.currency, display, meta.rates), display)}`
    ) : data?.lastEntry ? (
      `last entry ${short(data.lastEntry)}`
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
        <span className="block truncate text-[15px]">{w.name}</span>
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
                {Math.round((owed / w.credit_limit) * 100)}% of {fmt(w.credit_limit, w.currency).replace(/\.00$/, "")}
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

const lineConfig = { worth: { label: "Balance", color: "var(--chart-2)" } } satisfies ChartConfig

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
  const name = (id: string | null) => meta.wallets.find((x) => x.id === id)?.name ?? "another account"
  const recent = overview.recent.filter((r) => r.wallet_id === w.id)
  const line = (data?.days ?? []).map((worth, i) => ({ day: overview.days[i], worth }))
  const monthTicks = overview.days.filter((d) => d.endsWith("-01"))
  const m = monthShort(overview.month)
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
      toast.success(w.archived ? `${w.name} restored` : `${w.name} archived`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs text-muted-foreground">
          {TYPE_LABEL[w.type]} · {w.currency.toUpperCase()}
          {w.archived ? " · Archived" : ""}
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
            <dt className="text-xs text-muted-foreground">In · {m}</dt>
            <dd className={cn("num mt-0.5 text-sm", data.in > 0 && "text-positive")}>{signed(data.in, w.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Out · {m}</dt>
            <dd className="num mt-0.5 text-sm">{fmt(data.out, w.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Moved</dt>
            <dd className="num mt-0.5 text-sm text-subtle-foreground">{fmt(data.moved, w.currency)}</dd>
          </div>
        </dl>
      )}

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">Recent</h3>
          {w.tx_count > 0 && (
            <Link
              to="/transactions"
              search={{ wallet: w.id }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              All {w.tx_count.toLocaleString(LOCALE)} →
            </Link>
          )}
        </div>
        {recent.length === 0 && <p className="py-2 text-sm text-muted-foreground">No transactions yet.</p>}
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
              {r.transfer_id ? `${r.amount < 0 ? "→" : "←"} ${name(r.counter_wallet_id)}` : r.name || "Untitled"}
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
              ? "No value recorded yet"
              : age > STALE_DAYS
                ? `Value is ${age} days old`
                : `Value as of ${long(w.gain_day!)}`}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Enter today's value from your broker to keep net worth current.
          </p>
          <Button
            variant={age === null || age > STALE_DAYS ? "default" : "outline"}
            size="sm"
            className={cn("mt-2.5", age !== null && age <= STALE_DAYS && "bg-card")}
            onClick={onGain}
          >
            Update gains
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-muted px-4 py-3.5">
          <div className="text-[13px] font-medium">Does this match your bank?</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Enter the balance your bank shows and Kosha adds a correction.
          </p>
          <Button variant="outline" size="sm" className="mt-2.5 bg-card" onClick={onFix}>
            Fix balance
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="ghost" onClick={onEdit}>
          Edit account
        </Button>
        <Button variant="ghost" onClick={toggleArchive}>
          {w.archived ? "Unarchive" : "Archive"}
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
    if (target === null) return toast.error("Enter the balance")
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
      toast.success(correction ? `Corrected by ${signed(correction, w.currency)}` : "Balance already matches")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Fix {w.name}</DialogTitle>
        <DialogDescription>
          {credit ? "Enter what your card statement says you owe." : "Enter the balance your bank shows."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="fix-balance">
          {credit ? "Currently owed" : "Balance"}{" "}
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
          {correction ? `Adds a balance correction of ${signed(correction, w.currency)}.` : "No correction needed."}
        </p>
      </div>
      <Button type="submit">Save</Button>
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
    if (type === "credit" && !limitCents) return toast.error("Enter the credit limit")
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
      toast.success(initial ? "Account updated" : "Account added")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
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
      toast.error(err instanceof Error ? err.message : "Couldn't delete")
    }
  }

  async function removeValuation(id: string) {
    await deleteValuation({ data: { id } })
    await router.invalidate()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="acc-name">Name</Label>
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Pick
            value={type}
            onChange={(v) => v && setType(v as AccountType)}
            placeholder="Type"
            options={TYPE_OPTIONS}
            className="w-full"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Currency</Label>
          {locked ? (
            <div className="flex h-8 items-center text-sm text-muted-foreground uppercase">{currency}</div>
          ) : (
            <Pick
              value={currency}
              onChange={(v) => v && setCurrency(v)}
              placeholder="Currency"
              options={currencies.map((c) => ({ value: c, label: c.toUpperCase() }))}
              className="w-full"
            />
          )}
        </div>
      </div>

      {type === "credit" && (
        <div className="grid gap-1.5">
          <Label htmlFor="acc-limit">
            Credit limit <span className="text-muted-foreground uppercase">({currency})</span>
          </Label>
          <Input
            id="acc-limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            className="num"
          />
          <p className="text-xs text-muted-foreground">
            The balance of this account is what's left to spend. Net worth counts the difference as debt.
          </p>
        </div>
      )}
      {type === "investment" && (
        <p className="text-xs text-muted-foreground">
          The balance is the money you put in. Use "Update gains" from time to time to add market gains to your net
          worth.
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="acc-balance">
          {type === "credit" ? "Currently owed" : type === "investment" ? "Invested so far" : "Current balance"}{" "}
          {!initial && <span className="text-muted-foreground">(optional)</span>}
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
              ? `Saving adds a balance correction of ${signed(correction, currency)}.`
              : "Enter the balance your bank shows to correct it."}
          </p>
        )}
      </div>

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Archived <span className="text-muted-foreground">(hidden from quick entry, still counted in net worth)</span>
        </label>
      )}

      {valuations.length > 0 && (
        <div className="grid gap-1.5">
          <Label>Gains history</Label>
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
                  aria-label={`Delete entry from ${long(v.day)}`}
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
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {initial ? "Save" : "Add account"}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {initial?.name}?</DialogTitle>
            <DialogDescription>
              This account has no transactions. Deleting it also deletes its gains history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove}>
              Delete account
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
            Currency exchange
          </h2>
          <p className="text-xs text-muted-foreground">
            Sent <span className="num text-foreground">{fmt(sent, display)}</span> in {rows.length} transfer
            {rows.length === 1 ? "" : "s"} · cost vs market{" "}
            <span className="num text-foreground">{fmt(cost, display)}</span>
            {sent ? ` (${((cost / sent) * 100).toFixed(2)}%)` : ""}
          </p>
        </div>
        {years.length > 1 && (
          <div role="group" aria-label="Year" className={segment}>
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
              <th>Date</th>
              <th>Route</th>
              <th className="text-right">Sent</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Market</th>
              <th className="text-right">Received</th>
              <th className="text-right">Cost</th>
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
                  {x.market_rate || x.fee ? `${fmt(fx.totalCost, x.from_currency)} · ${fx.costPct.toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Cost is the fee plus what the provider's rate lost against the market rate that day. Negative means you beat the
        market. Edit a transfer from Activity to add its fee or provider.
      </p>
    </Card>
  )
}
