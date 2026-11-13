import { useState } from "react"
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { CaretLeftIcon, CaretRightIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { z } from "zod"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/date-time"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategoryIcon } from "@/components/category-icon"
import { PageHeader, PageSkeleton, useGlobals, useMeta } from "@/components/shell"
import { SubscriptionForm } from "@/components/subscription-form"
import { TransactionForm, TransactionSheet } from "@/components/transaction-form"
import { ScheduleDocuments } from "@/components/attachments"
import {
  deleteSubscription,
  dismissRecurring,
  linkPayments,
  listSubscriptions,
  recentIncome,
  recurringSuggestions,
  saveSubscription,
  updateOccurrence,
  type SubscriptionView,
  type Tx,
} from "@/lib/api"
import {
  intlLocale,
  addDays,
  convert,
  dayOf,
  fmt,
  isNeutral,
  nextOccurrence,
  parseAmount,
  type Instance,
  type Unit,
} from "@/lib/core"
import { Reveal, RollingMoney } from "@/components/motion"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/subscriptions")({
  validateSearch: z.object({ id: z.coerce.string().optional() }),
  loader: async () => {
    // Spotting is extra: when it fails, Recurring still loads.
    const [subs, income, spotted] = await Promise.all([
      listSubscriptions(),
      recentIncome(),
      recurringSuggestions().catch(() => []),
    ])
    return { subs, income, spotted }
  },
  head: () => ({ meta: [{ title: m.subs_head_title() }] }),
  pendingComponent: PageSkeleton,
  component: Subscriptions,
})

const fmtDay = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { ...o, timeZone: "UTC" })
const short = (day: string) => fmtDay(day, { day: "numeric", month: "short" })
const long = (day: string) => fmtDay(day, { day: "numeric", month: "short", year: "numeric" })
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
/** "today", "tomorrow", "in 3 days", "3 days ago", in the active language. */
const relative = (day: string, today: string) =>
  new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" }).format(daysBetween(today, day), "day")
const EVERY = { day: m.subs_every_day, week: m.subs_every_week, month: m.subs_every_month, year: m.subs_every_year }
const INTERVAL = {
  day: m.subs_interval_day,
  week: m.subs_interval_week,
  month: m.subs_interval_month,
  year: m.subs_interval_year,
}
/** An interval as a phrase: "every month", "every 3 months". */
const every = (n: number, unit: Unit) => EVERY[unit]({ count: n })
/** An interval under the "Every" column: "month", "3 months". */
const interval = (n: number, unit: Unit) => INTERVAL[unit]({ count: n })
/** Next date in the list: "1 Dec", or "Oct '27" when it's most of a year away. */
const nextLabel = (day: string, today: string) =>
  day > addDays(today, 300) ? `${fmtDay(day, { month: "short" })} '${day.slice(2, 4)}` : short(day)

type Group = "Bills" | "Subscriptions" | "Income" | "Transfers"
const groupOf = (x: SubscriptionView): Group =>
  x.to_wallet_id ? "Transfers" : x.amount > 0 ? "Income" : x.kind === "repetitive" ? "Bills" : "Subscriptions"
// Message functions per group, called at render time so they follow the language.
const GROUP_TEXT: Record<Group, { title: () => string; kind: () => string; endThis: () => string; end: () => string }> =
  {
    Bills: {
      title: m.subs_group_bills,
      kind: m.subs_kind_bill,
      endThis: m.subs_end_this_bill,
      end: m.subs_end_bill,
    },
    Subscriptions: {
      title: m.subs_group_subscriptions,
      kind: m.subs_kind_subscription,
      endThis: m.subs_end_this_subscription,
      end: m.subs_end_subscription,
    },
    Income: {
      title: m.subs_group_income,
      kind: m.subs_kind_income,
      endThis: m.subs_end_this_income,
      end: m.subs_end_income,
    },
    Transfers: {
      title: m.subs_group_transfers,
      kind: m.subs_kind_transfer,
      endThis: m.subs_end_this_transfer,
      end: m.subs_end_transfer,
    },
  }
const num = ({ children }: { children?: React.ReactNode }) => <span className="num">{children}</span>
const isOpen = (i: Instance) => i.status !== "paid" && i.status !== "skipped"
const COLS = "grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] gap-4 md:grid-cols-[minmax(0,1fr)_5.75rem_5.5rem_6rem_5.75rem]"

function Subscriptions() {
  const { subs, income, spotted } = Route.useLoaderData()
  const s = Route.useSearch()
  const meta = useMeta()
  const navigate = useNavigate({ from: Route.fullPath })
  const [creating, setCreating] = useState(false)
  const [adopting, setAdopting] = useState<Guess | null>(null)
  const router = useRouter()
  const [showEnded, setShowEnded] = useState(false)
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const cur = useGlobals().currency
  const money = (v: number) => fmt(v, cur)
  const toCur = (v: number, from: string) => convert(v, from, cur, meta.rates)
  const walletName = (id: string | null) => meta.wallets.find((w) => w.id === id)?.name ?? ""

  const perMonth = (x: SubscriptionView) => Math.abs(toCur(x.monthly, x.currency))
  const active = subs.filter((x) => !x.ended).sort((a, b) => perMonth(b) - perMonth(a))
  const ended = subs.filter((x) => x.ended).sort((a, b) => (b.end_day ?? "").localeCompare(a.end_day ?? ""))
  const groups = (["Bills", "Subscriptions", "Income", "Transfers"] as const)
    .map((g) => ({ g, rows: active.filter((x) => groupOf(x) === g) }))
    .filter((x) => x.rows.length)
  const selected = subs.find((x) => x.id === s.id)
  const shown = selected ?? active[0]

  // Committed counts scheduled money going out. That means bills and subscriptions, not transfers between your accounts.
  const costs = active.filter((x) => x.amount < 0 && !x.to_wallet_id && !isNeutral(x.category_id))
  const bills = costs.filter((x) => groupOf(x) === "Bills").reduce((t, x) => t + perMonth(x), 0)
  const subsCost = costs.filter((x) => groupOf(x) === "Subscriptions").reduce((t, x) => t + perMonth(x), 0)
  const committed = bills + subsCost
  const moved = active.filter((x) => x.to_wallet_id).reduce((t, x) => t + perMonth(x), 0)
  const yearIncome = income.reduce((t, r) => t + toCur(r.total, r.currency), 0)
  const week = addDays(today, 7)
  const dueSoon = costs.flatMap((x) => x.instances.filter((i) => isOpen(i) && i.day < week).map((i) => ({ x, i })))
  const dueSoonTotal = dueSoon.reduce((t, d) => t + Math.abs(toCur(d.i.amount, d.x.currency)), 0)
  const transfersActive = active.filter((x) => x.to_wallet_id).length

  return (
    <div className="pb-8">
      <div className={cn(selected && "max-lg:hidden")}>
        <PageHeader
          title={m.subs_title()}
          sub={
            <>
              <ParaglideMessage
                message={m.subs_count_active}
                inputs={{ count: active.length - transfersActive }}
                markup={{ num }}
              />{" "}
              ·{" "}
              <ParaglideMessage message={m.subs_count_transfers} inputs={{ count: transfersActive }} markup={{ num }} />{" "}
              · <ParaglideMessage message={m.subs_count_ended} inputs={{ count: ended.length }} markup={{ num }} />
            </>
          }
        >
          <Button
            variant="outline"
            size="lg"
            className="gap-2 bg-card px-3 text-[13px] font-normal"
            onClick={() => setCreating(true)}
          >
            <PlusIcon /> {m.subs_new_button()}
          </Button>
        </PageHeader>
      </div>

      <div className="grid gap-5 px-4 md:px-8">
        <div className={cn("grid gap-5", selected && "max-lg:hidden")}>
          <Card className="grid grid-cols-2 gap-px bg-border py-0 lg:grid-cols-4">
            <Total
              label={m.subs_committed()}
              value={<RollingMoney value={committed} currency={cur} />}
              hint={m.subs_committed_hint({ bills: money(bills), subscriptions: money(subsCost) })}
            />
            <Total
              label={m.subs_per_year()}
              value={<RollingMoney value={committed * 12} currency={cur} />}
              hint={
                yearIncome > 0
                  ? m.subs_share_of_income({
                      percent: new Intl.NumberFormat(intlLocale(), { style: "percent" }).format(
                        (committed * 12) / yearIncome
                      ),
                    })
                  : m.subs_no_income()
              }
            />
            <Total
              label={m.subs_due_soon()}
              value={<RollingMoney value={dueSoonTotal} currency={cur} />}
              hint={dueSoon.length ? [...new Set(dueSoon.map((d) => d.x.name))].join(", ") : m.subs_nothing_due()}
            />
            <Total
              label={m.subs_moved_to_savings()}
              value={<RollingMoney value={moved} currency={cur} />}
              hint={m.subs_moved_hint()}
              muted
            />
          </Card>

          <Strip subs={active} today={today} toCur={toCur} money={money} />
          {spotted.length > 0 && <Spotted list={spotted} today={today} onAdd={setAdopting} />}
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <Card
            className={cn("min-w-0 flex-[999_1_560px] gap-0 py-1", selected && "max-lg:hidden")}
            aria-label={m.subs_list_label()}
          >
            {groups.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <p>{m.subs_empty()}</p>
                <Button variant="outline" className="mt-3" onClick={() => setCreating(true)}>
                  <PlusIcon /> {m.subs_new_button()}
                </Button>
              </div>
            )}
            {groups.map(({ g, rows }, n) => {
              const total = rows.reduce((t, x) => t + perMonth(x), 0)
              return (
                <section key={g} aria-label={GROUP_TEXT[g].title()} className={cn(n > 0 && "border-t")}>
                  <div className={cn(COLS, "items-baseline px-4 pt-4 pb-1.5 text-xs text-muted-foreground")}>
                    <h2 className="text-[13px] font-medium text-foreground">{GROUP_TEXT[g].title()}</h2>
                    {n === 0 ? (
                      <>
                        <span className="max-md:hidden">{m.subs_column_every()}</span>
                        <span>{m.subs_column_next()}</span>
                        <span className="text-right max-md:hidden">{m.subs_column_amount()}</span>
                        <span className="text-right">{m.subs_column_per_month()}</span>
                      </>
                    ) : (
                      <span className="num col-span-2 text-right md:col-span-4">
                        {g === "Transfers" ? m.subs_not_counted() : money(total)}
                      </span>
                    )}
                  </div>
                  {rows.map((x) => (
                    <Row
                      key={x.id}
                      x={x}
                      today={today}
                      perMonth={money(perMonth(x))}
                      selected={x.id === s.id}
                      fallback={!selected && x.id === shown?.id}
                      walletName={walletName}
                    />
                  ))}
                </section>
              )
            })}
            <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
              {ended.length > 0 ? (
                <Button
                  variant="ghost"
                  aria-expanded={showEnded}
                  onClick={() => setShowEnded((v) => !v)}
                  className="-ml-2 gap-1.5 font-normal"
                >
                  <CaretRightIcon
                    className={cn(
                      "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
                      showEnded && "rotate-90"
                    )}
                  />{" "}
                  {m.subs_ended_count({ count: ended.length })}
                </Button>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">{m.subs_sorted_hint()}</span>
            </div>
            {showEnded && (
              <div className="border-t pb-1 motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-out motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
                {ended.map((x) => (
                  <Row key={x.id} x={x} today={today} perMonth="—" selected={x.id === s.id} walletName={walletName} />
                ))}
              </div>
            )}
          </Card>

          {shown && (
            <Card
              className={cn("min-w-0 flex-[1_1_360px] gap-0 p-5 lg:max-w-[400px]", !selected && "max-lg:hidden")}
              aria-label={m.subs_details_label({ name: shown.name })}
            >
              <Detail key={shown.id} sub={shown} today={today} displayCurrency={cur} />
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!adopting} onOpenChange={(o) => !o && setAdopting(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m.subs_adopt_title({ name: adopting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{m.subs_adopt_description({ count: adopting?.count ?? 0 })}</DialogDescription>
          </DialogHeader>
          {adopting && (
            <SubscriptionForm
              preset={adopting}
              onDone={async (id) => {
                const ids = adopting.ids
                setAdopting(null)
                await linkPayments({ data: { id, ids } }).catch(() => {})
                await router.invalidate()
                navigate({ search: (p) => ({ ...p, id }) })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m.subs_new_title()}</DialogTitle>
          </DialogHeader>
          <SubscriptionForm
            onDone={(id) => {
              setCreating(false)
              navigate({ search: (p) => ({ ...p, id }) })
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Guess = Awaited<ReturnType<typeof recurringSuggestions>>[number]

/** Regular payments Kosha spotted that aren't set up as recurring yet. */
function Spotted({ list, today, onAdd }: { list: Guess[]; today: string; onAdd: (g: Guess) => void }) {
  const meta = useMeta()
  const router = useRouter()
  const [hidden, setHidden] = useState<string[]>([])
  const shown = list.filter((g) => !hidden.includes(g.name))
  if (!shown.length) return null
  async function dismiss(g: Guess) {
    setHidden((h) => [...h, g.name])
    try {
      await dismissRecurring({ data: { payee: g.name } })
      await router.invalidate()
    } catch (e) {
      setHidden((h) => h.filter((n) => n !== g.name))
      toast.error(e instanceof Error ? e.message : m.subs_hide_failed())
    }
  }
  return (
    <section aria-labelledby="spotted-h">
      <div className="mx-1 mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="spotted-h" className="text-[13px] font-medium">
          {m.subs_spotted_title()}
        </h2>
        <span className="text-xs text-muted-foreground">{m.subs_spotted_hint()}</span>
      </div>
      <Card className="gap-0 py-0">
        {shown.map((g) => {
          const c = meta.categories.find((x) => x.id === g.categoryId)
          const cur = meta.wallets.find((w) => w.id === g.walletId)?.currency ?? meta.primary
          return (
            <div
              key={g.name}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 first:border-t-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <CategoryIcon icon={c?.icon} className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="num">
                      {g.variable
                        ? m.subs_about_amount({ amount: fmt(Math.abs(g.amount), cur) })
                        : fmt(Math.abs(g.amount), cur)}
                    </span>{" "}
                    {every(g.every, g.unit)} · {m.subs_spotted_paid({ count: g.count, day: short(g.lastDay) })} ·{" "}
                    {m.subs_spotted_next({ day: nextLabel(g.nextDay, today) })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="bg-card max-md:h-11" onClick={() => onAdd(g)}>
                  <PlusIcon /> {m.subs_make_recurring()}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground max-md:size-11"
                  aria-label={m.subs_dismiss_label({ name: g.name })}
                  title={m.subs_not_recurring()}
                  onClick={() => dismiss(g)}
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          )
        })}
      </Card>
    </section>
  )
}

function Total({
  label,
  value,
  hint,
  muted,
}: {
  label: string
  value: React.ReactNode
  hint: string
  muted?: boolean
}) {
  return (
    <div className="min-w-0 bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num mt-1.5 truncate text-2xl font-medium max-sm:text-lg", muted && "text-subtle-foreground")}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

function Row({
  x,
  today,
  perMonth,
  selected,
  fallback,
  walletName,
}: {
  x: SubscriptionView
  today: string
  perMonth: string
  selected: boolean
  fallback?: boolean
  walletName: (id: string | null) => string
}) {
  const meta = useMeta()
  const c = meta.categories.find((k) => k.id === x.category_id)
  const transfer = !!x.to_wallet_id
  const sub = [transfer ? null : walletName(x.wallet_id), x.variable ? m.subs_varies_asks() : x.note]
    .filter(Boolean)
    .join(" · ")
  return (
    <Link
      to="/subscriptions"
      search={(p) => ({ ...p, id: x.id })}
      aria-current={selected ? "true" : undefined}
      data-row
      className={cn(
        COLS,
        "min-h-12 items-center px-4 py-1.5 text-sm hover:bg-muted",
        selected && "bg-selected hover:bg-selected",
        fallback && "lg:bg-selected",
        (transfer || x.ended) && "text-subtle-foreground"
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <CategoryIcon icon={c?.icon} />
        <span className="min-w-0">
          <span className="block truncate">
            {transfer ? `${walletName(x.wallet_id)} → ${walletName(x.to_wallet_id)}` : x.name}
          </span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
      </span>
      <span className="text-[13px] text-subtle-foreground max-md:hidden">{interval(x.every, x.unit)}</span>
      <span className={cn("num text-[13px] text-subtle-foreground", x.next?.status === "overdue" && "text-warning")}>
        {x.ended ? m.subs_ended_on_short({ date: short(x.end_day!) }) : x.next ? nextLabel(x.next.day, today) : "—"}
      </span>
      <span className={cn("num text-right max-md:hidden", x.amount > 0 && !transfer && "text-positive")}>
        {x.variable ? "~" : ""}
        {fmt(transfer ? Math.abs(x.amount) : x.amount, x.currency)}
      </span>
      <span className="num text-right">{perMonth}</span>
    </Link>
  )
}

/** The next 30 days: one column per day, bar height by outflow, transfers as a dashed outline. */
function Strip({
  subs,
  today,
  toCur,
  money,
}: {
  subs: SubscriptionView[]
  today: string
  toCur: (v: number, from: string) => number
  money: (v: number) => string
}) {
  const meta = useMeta()
  // ponytail: uses each schedule's next 6 instances, so a daily item only fills its first week.
  const days = Array.from({ length: 30 }, (_, n) => {
    const day = addDays(today, n)
    let out = 0,
      moved = 0
    const names: string[] = []
    for (const x of subs)
      for (const i of x.instances)
        if (i.day === day && isOpen(i) && i.amount < 0) {
          const v = Math.abs(toCur(i.amount, x.currency))
          if (x.to_wallet_id) moved += v
          else if (!isNeutral(x.category_id)) out += v
          else continue
          names.push(x.to_wallet_id ? (meta.wallets.find((w) => w.id === x.to_wallet_id)?.name ?? x.name) : x.name)
        }
    return { day, out, moved, names }
  })
  const max = Math.max(1, ...days.map((d) => Math.max(d.out, d.moved)))
  const top = new Set(
    [...days]
      .filter((d) => d.out + d.moved > 0)
      .sort((a, b) => b.out + b.moved - (a.out + a.moved))
      .slice(0, 2)
      .map((d) => d.day)
  )
  const busy = days.filter((d) => d.names.length)
  const and = new Intl.ListFormat(intlLocale(), { type: "conjunction" })
  const label = busy.length
    ? m.subs_strip_label({
        list: busy.map((d) => `${short(d.day)} ${and.format(d.names)} ${money(d.out + d.moved)}`).join("; "),
      })
    : m.subs_strip_empty()

  return (
    <Card size="sm" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5">
        <h2 className="text-sm font-medium">{m.subs_strip_title()}</h2>
        <div className="flex gap-4 text-xs text-subtle-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-chart-2" />
            {m.subs_strip_bills()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] border-[1.5px] border-dashed border-muted-foreground" />
            {m.subs_group_transfers()}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto px-5 pb-1">
        <Reveal
          kind="bars"
          role="img"
          aria-label={label}
          className="grid min-w-[640px] grid-cols-[repeat(30,minmax(18px,1fr))] gap-1 pt-5"
        >
          {days.map((d, i) => {
            const first = d.day.endsWith("-01")
            return (
              <div
                key={d.day}
                className={cn("flex min-w-0 flex-col items-center gap-1.5", first && "-ml-0.5 border-l pl-0.5")}
              >
                <div className="relative flex h-22 w-full items-end justify-center">
                  {top.has(d.day) && (
                    <span
                      className="absolute bottom-[calc(var(--h)+4px)] left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-subtle-foreground"
                      style={{ "--h": `${(Math.max(d.out, d.moved) / max) * 100}%` } as React.CSSProperties}
                    >
                      {d.names.slice(0, 2).join(" + ")}
                    </span>
                  )}
                  {d.out > 0 && (
                    <span
                      className="bar-grow min-h-1 w-[70%] max-w-[18px] rounded-t-[3px] bg-chart-2"
                      style={{ height: `${(d.out / max) * 100}%`, "--i": i } as React.CSSProperties}
                    />
                  )}
                  {d.moved > 0 && (
                    <span
                      className="bar-grow absolute bottom-0 w-[70%] max-w-[18px] rounded-t-[3px] border-[1.5px] border-b-0 border-dashed border-muted-foreground"
                      style={{ height: `${(d.moved / max) * 100}%`, "--i": i } as React.CSSProperties}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "num text-[11px] leading-tight text-muted-foreground",
                    d.day === today && "font-semibold text-foreground"
                  )}
                >
                  {Number(d.day.slice(8))}
                  {first && <span className="block">{fmtDay(d.day, { month: "short" })}</span>}
                </span>
              </div>
            )
          })}
        </Reveal>
      </div>
    </Card>
  )
}

function Detail({ sub, today, displayCurrency }: { sub: SubscriptionView; today: string; displayCurrency: string }) {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<"end" | "delete" | null>(null)
  const [instance, setInstance] = useState<{ i: Instance; pay: boolean } | null>(null)
  const [payment, setPayment] = useState<Tx | null>(null)
  // Bumped when a payment's sheet closes, so Documents picks up files attached there.
  const [docsVersion, setDocsVersion] = useState(0)
  const c = meta.categories.find((k) => k.id === sub.category_id)
  const wallet = meta.wallets.find((w) => w.id === sub.wallet_id)
  const toWallet = meta.wallets.find((w) => w.id === sub.to_wallet_id)
  const isTransfer = !!toWallet
  const text = GROUP_TEXT[groupOf(sub)]
  const signed = (v: number) => fmt(isTransfer ? Math.abs(v) : v, sub.currency)
  const paidTotal = sub.history.reduce((t, h) => t + h.amount, 0)
  const since = sub.history.at(-1)?.day ?? sub.start_day
  const next = sub.next
  const walletName = (id: string) => meta.wallets.find((w) => w.id === id)?.name

  async function act(i: Instance, action: "skip" | "pay" | "reset", ok: string) {
    try {
      await updateOccurrence({ data: { id: sub.id, dueDay: i.due_day, action } })
      await router.invalidate()
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.subs_update_payment_failed())
    }
  }

  async function setEnd(end: string | null) {
    // Resuming keeps the old schedule from today on and doesn't back-fill the gap.
    const nextDay = end
      ? sub.start_day
      : sub.start_day >= today
        ? sub.start_day
        : nextOccurrence({ ...sub, end_day: null }, today)!
    try {
      await saveSubscription({
        data: {
          id: sub.id,
          name: sub.name,
          walletId: sub.wallet_id,
          categoryId: sub.category_id,
          amount: sub.amount,
          note: sub.note,
          every: sub.every,
          unit: sub.unit,
          nextDay,
          endDay: end,
          autoPay: !!sub.auto_pay,
          kind: sub.kind === "repetitive" ? "repetitive" : "subscription",
          toWalletId: sub.to_wallet_id,
          toAmount: sub.to_amount,
          variable: !!sub.variable,
        },
      })
      await router.invalidate()
      setConfirm(null)
      toast.success(end ? m.subs_ended_toast({ name: sub.name }) : m.subs_resumed_toast({ name: sub.name }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.subs_update_schedule_failed())
    }
  }

  function closePayment() {
    setPayment(null)
    setDocsVersion((v) => v + 1)
  }

  async function remove() {
    try {
      await deleteSubscription({ data: { id: sub.id } })
      setConfirm(null)
      await navigate({ search: (p) => ({ ...p, id: undefined }) })
      await router.invalidate()
      toast.success(m.subs_deleted())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.subs_delete_failed())
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div className="min-w-0">
        <Link
          to="/subscriptions"
          search={(p) => ({ ...p, id: undefined })}
          className="mb-3 -ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground lg:hidden"
        >
          <CaretLeftIcon className="size-4" /> {m.subs_title()}
        </Link>
        <p className="text-xs text-muted-foreground">
          {m.subs_detail_meta({
            kind: text.kind(),
            every: every(sub.every, sub.unit),
            date: fmtDay(since, { month: "short", year: "numeric" }),
          })}
        </p>
        <h2 className="mt-2 flex items-start gap-2.5 text-lg leading-snug font-semibold tracking-[-0.02em] text-balance">
          <CategoryIcon icon={c?.icon} className="mt-[3px] size-5" />
          {isTransfer ? (
            <span className="min-w-0 break-words">
              {wallet?.name} <span className="text-muted-foreground">→</span> {toWallet.name}
            </span>
          ) : (
            <span className="min-w-0 break-words">{sub.name}</span>
          )}
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("num text-2xl font-medium", sub.amount > 0 && !isTransfer && "text-positive")}>
            {sub.variable ? "~" : ""}
            {signed(sub.amount)}
          </span>
          <span className="text-xs text-muted-foreground">
            {sub.variable ? m.subs_varies() : every(sub.every, sub.unit)}
            {!isTransfer && wallet ? ` · ${wallet.name}` : ""}
          </span>
        </p>
        {sub.note && <p className="mt-1.5 text-xs break-words text-muted-foreground">{sub.note}</p>}
      </div>

      {sub.ended ? (
        <div className="rounded-xl bg-muted p-4 text-sm">
          <p className="font-medium">{m.subs_ended_on({ date: long(sub.end_day!) })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{m.subs_ended_hint()}</p>
        </div>
      ) : next ? (
        <div className="rounded-xl bg-muted p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              {m.subs_next_on({ date: fmtDay(next.day, { weekday: "short", day: "numeric", month: "short" }) })}
            </span>
            <span className={cn("text-xs text-muted-foreground", next.status === "overdue" && "text-warning")}>
              {relative(next.day, today)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sub.variable ? m.subs_will_ask() : sub.auto_pay ? m.subs_auto_recorded() : m.subs_mark_when_out()}
            {next.edited && ` · ${m.subs_changed_once()}`}
            {sub.end_day && ` · ${m.subs_ends_on({ date: long(sub.end_day) })}`}
          </p>
          {/* The primary action takes the full width. The rest share one row, so nothing overflows a narrow panel. */}
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {sub.variable ? (
              <Button size="lg" className="col-span-2" onClick={() => setInstance({ i: next, pay: true })}>
                {m.subs_enter_amount_button()}
              </Button>
            ) : (
              <Button size="lg" className="col-span-2" onClick={() => act(next, "pay", m.subs_marked_paid())}>
                {isTransfer ? m.subs_mark_done_now() : m.subs_mark_paid_now()}
              </Button>
            )}
            {!sub.variable && (
              <Button
                size="lg"
                variant="outline"
                className="bg-card"
                onClick={() => setInstance({ i: next, pay: false })}
              >
                {m.subs_change_amount()}
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className={cn("bg-card", sub.variable && "col-span-2")}
              onClick={() => act(next, "skip", m.subs_skipped())}
            >
              {m.subs_skip_this()}
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{m.subs_no_more_scheduled()}</p>
      )}

      <dl className="grid gap-2 text-sm">
        <Mini label={isTransfer ? m.subs_moved_so_far() : m.subs_paid_so_far()} value={signed(paidTotal)} />
        <Mini label={m.subs_payments()} value={String(sub.history.length)} />
        <Mini
          label={m.subs_per_year()}
          value={fmt(Math.abs(convert(sub.monthly * 12, sub.currency, displayCurrency, meta.rates)), displayCurrency)}
        />
      </dl>

      <section>
        <h3 className="mb-1.5 text-[13px] font-medium">{m.subs_history()}</h3>
        {sub.history.length === 0 && (
          <p className="border-t py-3 text-sm text-muted-foreground">{m.subs_no_payments()}</p>
        )}
        <div className={cn(sub.history.length > 0 && "border-b")}>
          {sub.history.slice(0, 5).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setPayment(h as Tx)}
              className="grid min-h-10 w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t px-1 text-left text-[13px] transition-colors hover:bg-muted"
            >
              <span className="num text-xs text-muted-foreground">{short(h.day)}</span>
              {/* The account only shows when a payment came from somewhere other than usual. */}
              <span className="truncate text-subtle-foreground">
                {[h.wallet_id !== sub.wallet_id && walletName(h.wallet_id), h.note && h.note !== sub.note && h.note]
                  .filter(Boolean)
                  .join(" · ") || (isTransfer ? m.subs_moved() : m.subs_paid())}
              </span>
              <span className="num whitespace-nowrap">{signed(h.amount)}</span>
            </button>
          ))}
        </div>
        {sub.history.length > 5 && (
          <Link
            to="/transactions"
            search={{ q: sub.name }}
            className="mt-2.5 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            {m.subs_all_payments({ count: sub.history.length })}
          </Link>
        )}
      </section>

      {!isTransfer && <ScheduleDocuments subscriptionId={sub.id} name={sub.name} version={docsVersion} />}

      <div className="-mx-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="lg" onClick={() => setEditing(true)}>
          {m.common_edit()}
        </Button>
        {sub.ended ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="lg" onClick={() => setEnd(null)}>
              {m.subs_resume()}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm("delete")}
            >
              {m.common_delete()}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="lg"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirm("end")}
          >
            {text.endThis()}
          </Button>
        )}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete" ? m.subs_delete_title({ name: sub.name }) : m.subs_end_title({ name: sub.name })}
            </DialogTitle>
            <DialogDescription>
              {confirm === "delete" ? m.subs_delete_description() : m.subs_end_description()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{m.common_cancel()}</DialogClose>
            <Button variant="destructive" onClick={() => (confirm === "delete" ? remove() : setEnd(today))}>
              {confirm === "delete" ? m.common_delete() : text.end()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m.subs_edit_title({ name: sub.name })}</DialogTitle>
          </DialogHeader>
          <SubscriptionForm initial={sub} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!instance} onOpenChange={(o) => !o && setInstance(null)}>
        <DialogContent>
          {instance && (
            <InstanceForm sub={sub} instance={instance.i} pay={instance.pay} onDone={() => setInstance(null)} />
          )}
        </DialogContent>
      </Dialog>

      <TransactionSheet
        open={!!payment}
        title={isTransfer ? m.subs_edit_transfer() : m.subs_edit_payment()}
        onClose={closePayment}
      >
        {payment && (
          <TransactionForm key={payment.id} initial={payment} onDone={closePayment} onCancel={closePayment} />
        )}
      </TransactionSheet>
    </div>
  )
}

/** One label and value row. The value never wraps or clips, so the label truncates instead. */
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="num whitespace-nowrap">{value}</dd>
    </div>
  )
}

/** Edit one upcoming payment: amount, date or note. The schedule is untouched. */
function InstanceForm({
  sub,
  instance,
  pay,
  onDone,
}: {
  sub: SubscriptionView
  instance: Instance
  pay: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const meta = useMeta()
  const toWallet = meta.wallets.find((w) => w.id === sub.to_wallet_id)
  const crossCurrency = !!toWallet && toWallet.currency !== sub.currency
  const [received, setReceived] = useState("")
  // A variable amount starts empty so it can't be saved as the estimate by accident.
  const [amount, setAmount] = useState(
    pay && sub.variable && !instance.edited ? "" : (Math.abs(instance.amount) / 100).toFixed(2)
  )
  const [day, setDay] = useState(instance.day)
  const [note, setNote] = useState(instance.note)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseAmount(amount)
    if (!cents) return toast.error(m.subs_enter_amount())
    try {
      await updateOccurrence({
        data: {
          id: sub.id,
          dueDay: instance.due_day,
          action: pay ? "pay" : "edit",
          amount: Math.abs(cents) * Math.sign(sub.amount),
          day,
          note,
          received: crossCurrency ? (parseAmount(received) ?? undefined) : undefined,
        },
      })
      await router.invalidate()
      toast.success(pay ? m.subs_recorded() : m.subs_payment_updated())
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.subs_save_payment_failed())
    }
  }

  async function reset() {
    await updateOccurrence({ data: { id: sub.id, dueDay: instance.due_day, action: "reset" } })
    await router.invalidate()
    onDone()
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {sub.name} · {long(instance.due_day)}
        </DialogTitle>
        <DialogDescription>
          {pay
            ? toWallet
              ? m.subs_pay_transfer_description()
              : m.subs_pay_description()
            : m.subs_edit_once_description()}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="i-amount">
            {m.subs_amount()} <span className="text-muted-foreground uppercase">({sub.currency})</span>
          </Label>
          <Input
            id="i-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="num"
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="i-day">{m.subs_date()}</Label>
          <DatePicker id="i-day" value={day} onChange={setDay} />
        </div>
      </div>
      {crossCurrency && (
        <div className="grid gap-1.5">
          <Label htmlFor="i-received">
            {m.subs_received_in({ name: toWallet.name })}{" "}
            <span className="text-muted-foreground uppercase">({toWallet.currency})</span>
          </Label>
          <Input
            id="i-received"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="decimal"
            className="num"
          />
          <p className="text-xs text-muted-foreground">{m.subs_leave_empty_rate()}</p>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="i-note">
          {m.subs_note()} <span className="text-muted-foreground">{m.accounts_optional()}</span>
        </Label>
        <Input id="i-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        {instance.edited && (
          <Button type="button" variant="ghost" onClick={reset}>
            {m.subs_reset_regular()}
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {pay ? m.subs_record() : m.subs_save_this_payment()}
        </Button>
      </div>
    </form>
  )
}
