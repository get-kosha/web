import { useState } from "react"
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { PageHeader, useGlobals, useMeta } from "@/components/shell"
import { SubscriptionForm } from "@/components/subscription-form"
import { TransactionForm, TransactionSheet } from "@/components/transaction-form"
import {
  deleteSubscription,
  listSubscriptions,
  recentIncome,
  saveSubscription,
  updateOccurrence,
  type SubscriptionView,
  type Tx,
} from "@/lib/api"
import {
  LOCALE,
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
    const [subs, income] = await Promise.all([listSubscriptions(), recentIncome()])
    return { subs, income }
  },
  head: () => ({ meta: [{ title: "Recurring · Kosha" }] }),
  component: Subscriptions,
})

const fmtDay = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, { ...o, timeZone: "UTC" })
const short = (day: string) => fmtDay(day, { day: "numeric", month: "short" })
const long = (day: string) => fmtDay(day, { day: "numeric", month: "short", year: "numeric" })
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
function relative(day: string, today: string) {
  const d = daysBetween(today, day)
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d > 0 ? `in ${d} days` : `${-d} days ago`
}
/** "month", "3 months", "year". */
const every = (n: number, unit: Unit) => (n === 1 ? unit : `${n} ${unit}s`)
/** Next date in the list: "1 Dec", or "Oct '27" when it's most of a year away. */
const nextLabel = (day: string, today: string) =>
  day > addDays(today, 300) ? `${fmtDay(day, { month: "short" })} '${day.slice(2, 4)}` : short(day)

type Group = "Bills" | "Subscriptions" | "Transfers"
const groupOf = (x: SubscriptionView): Group =>
  x.to_wallet_id ? "Transfers" : x.kind === "repetitive" ? "Bills" : "Subscriptions"
const KIND_LABEL: Record<Group, string> = { Bills: "Bill", Subscriptions: "Subscription", Transfers: "Transfer" }
const isOpen = (i: Instance) => i.status !== "paid" && i.status !== "skipped"
const COLS = "grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] gap-4 md:grid-cols-[minmax(0,1fr)_5.75rem_5.5rem_6rem_5.75rem]"

function Subscriptions() {
  const { subs, income } = Route.useLoaderData()
  const s = Route.useSearch()
  const meta = useMeta()
  const navigate = useNavigate({ from: Route.fullPath })
  const [creating, setCreating] = useState(false)
  const [showEnded, setShowEnded] = useState(false)
  const today = dayOf(Date.now() / 1000, meta.tz)
  const cur = useGlobals().currency
  const money = (v: number) => fmt(v, cur)
  const toCur = (v: number, from: string) => convert(v, from, cur, meta.rates)
  const walletName = (id: string | null) => meta.wallets.find((w) => w.id === id)?.name ?? ""

  const perMonth = (x: SubscriptionView) => Math.abs(toCur(x.monthly, x.currency))
  const active = subs.filter((x) => !x.ended).sort((a, b) => perMonth(b) - perMonth(a))
  const ended = subs.filter((x) => x.ended).sort((a, b) => (b.end_day ?? "").localeCompare(a.end_day ?? ""))
  const groups = (["Bills", "Subscriptions", "Transfers"] as const)
    .map((g) => ({ g, rows: active.filter((x) => groupOf(x) === g) }))
    .filter((x) => x.rows.length)
  const selected = subs.find((x) => x.id === s.id)
  const shown = selected ?? active[0]

  // Money going out on a schedule: bills and subscriptions count, transfers between your accounts don't.
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
          title="Recurring"
          sub={
            <span className="num">
              {active.length - transfersActive} active · {transfersActive} transfer{transfersActive === 1 ? "" : "s"} ·{" "}
              {ended.length} ended
            </span>
          }
        >
          <Button
            variant="outline"
            size="lg"
            className="gap-2 bg-card px-3 text-[13px] font-normal"
            onClick={() => setCreating(true)}
          >
            <PlusIcon /> New recurring
          </Button>
        </PageHeader>
      </div>

      <div className="grid gap-5 px-4 md:px-8">
        <div className={cn("grid gap-5", selected && "max-lg:hidden")}>
          <Card className="grid grid-cols-2 gap-px bg-border py-0 lg:grid-cols-4">
            <Total
              label="Committed per month"
              value={<RollingMoney value={committed} currency={cur} />}
              hint={`Bills ${money(bills)} · subscriptions ${money(subsCost)}`}
            />
            <Total
              label="Per year"
              value={<RollingMoney value={committed * 12} currency={cur} />}
              hint={
                yearIncome > 0
                  ? `${Math.round(((committed * 12) / yearIncome) * 100)}% of income`
                  : "No income in the last year"
              }
            />
            <Total
              label="Due in the next 7 days"
              value={<RollingMoney value={dueSoonTotal} currency={cur} />}
              hint={dueSoon.length ? [...new Set(dueSoon.map((d) => d.x.name))].join(", ") : "Nothing due"}
            />
            <Total
              label="Moved to savings"
              value={<RollingMoney value={moved} currency={cur} />}
              hint="per month · not counted"
              muted
            />
          </Card>

          <Strip subs={active} today={today} toCur={toCur} money={money} />
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <Card
            className={cn("min-w-0 flex-[999_1_560px] gap-0 py-1", selected && "max-lg:hidden")}
            aria-label="Recurring payments"
          >
            {groups.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Nothing recurring yet.</p>
            )}
            {groups.map(({ g, rows }, n) => {
              const total = rows.filter((x) => x.amount < 0).reduce((t, x) => t + perMonth(x), 0)
              return (
                <section key={g} aria-label={g} className={cn(n > 0 && "border-t")}>
                  <div className={cn(COLS, "items-baseline px-4 pt-4 pb-1.5 text-xs text-muted-foreground")}>
                    <h2 className="text-[13px] font-medium text-foreground">{g}</h2>
                    {n === 0 ? (
                      <>
                        <span className="max-md:hidden">Every</span>
                        <span>Next</span>
                        <span className="text-right max-md:hidden">Amount</span>
                        <span className="text-right">Per month</span>
                      </>
                    ) : (
                      <span className="num col-span-2 text-right md:col-span-4">
                        {g === "Transfers" ? "not counted" : money(total)}
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
                  Ended ({ended.length})
                </Button>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">Sorted by cost per month</span>
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
              aria-label={`${shown.name} details`}
            >
              <Detail key={shown.id} sub={shown} today={today} displayCurrency={cur} />
            </Card>
          )}
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New recurring</DialogTitle>
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
  const sub = [transfer ? null : walletName(x.wallet_id), x.variable ? "varies, asks each time" : x.note]
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
      <span className="text-[13px] text-subtle-foreground max-md:hidden">{every(x.every, x.unit)}</span>
      <span className={cn("num text-[13px] text-subtle-foreground", x.next?.status === "overdue" && "text-warning")}>
        {x.ended ? `ended ${short(x.end_day!)}` : x.next ? nextLabel(x.next.day, today) : "—"}
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
  const m = useMeta()
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
          names.push(x.to_wallet_id ? (m.wallets.find((w) => w.id === x.to_wallet_id)?.name ?? x.name) : x.name)
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
  const label = busy.length
    ? `Payments in the next 30 days: ${busy.map((d) => `${short(d.day)} ${d.names.join(" and ")} ${money(d.out + d.moved)}`).join("; ")}`
    : "No payments in the next 30 days"

  return (
    <Card size="sm" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5">
        <h2 className="text-sm font-medium">Next 30 days</h2>
        <div className="flex gap-4 text-xs text-subtle-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-chart-2" />
            Bills &amp; subscriptions
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] border-[1.5px] border-dashed border-muted-foreground" />
            Transfers
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
  const c = meta.categories.find((k) => k.id === sub.category_id)
  const wallet = meta.wallets.find((w) => w.id === sub.wallet_id)
  const toWallet = meta.wallets.find((w) => w.id === sub.to_wallet_id)
  const isTransfer = !!toWallet
  const kind = KIND_LABEL[groupOf(sub)]
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
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }

  async function setEnd(end: string | null) {
    // Resuming continues the old rhythm from today on, without back-filling the gap.
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
      toast.success(end ? `${sub.name} ended` : `${sub.name} resumed`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }

  async function remove() {
    try {
      await deleteSubscription({ data: { id: sub.id } })
      setConfirm(null)
      await navigate({ search: (p) => ({ ...p, id: undefined }) })
      await router.invalidate()
      toast.success("Deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
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
          <CaretLeftIcon className="size-4" /> Recurring
        </Link>
        <p className="text-xs text-muted-foreground">
          {kind} · every {every(sub.every, sub.unit)} · since {fmtDay(since, { month: "short", year: "numeric" })}
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
            {sub.variable ? "varies" : `every ${every(sub.every, sub.unit)}`}
            {!isTransfer && wallet ? ` · ${wallet.name}` : ""}
          </span>
        </p>
        {sub.note && <p className="mt-1.5 text-xs break-words text-muted-foreground">{sub.note}</p>}
      </div>

      {sub.ended ? (
        <div className="rounded-xl bg-muted p-4 text-sm">
          <p className="font-medium">Ended {long(sub.end_day!)}</p>
          <p className="mt-1 text-xs text-muted-foreground">No more payments. Past payments stay in Activity.</p>
        </div>
      ) : next ? (
        <div className="rounded-xl bg-muted p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              Next: {fmtDay(next.day, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className={cn("text-xs text-muted-foreground", next.status === "overdue" && "text-warning")}>
              {relative(next.day, today)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sub.variable
              ? "Kosha will ask for the amount"
              : sub.auto_pay
                ? "Recorded automatically on the day"
                : "Mark it paid when it goes out"}
            {next.edited && " · changed for this payment only"}
            {sub.end_day && ` · ends ${long(sub.end_day)}`}
          </p>
          {/* Primary action full width; the rest share one row underneath, so nothing runs off a narrow panel. */}
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {sub.variable ? (
              <Button size="lg" className="col-span-2" onClick={() => setInstance({ i: next, pay: true })}>
                Enter amount
              </Button>
            ) : (
              <Button size="lg" className="col-span-2" onClick={() => act(next, "pay", "Marked as paid")}>
                {isTransfer ? "Mark done now" : "Mark paid now"}
              </Button>
            )}
            {!sub.variable && (
              <Button
                size="lg"
                variant="outline"
                className="bg-card"
                onClick={() => setInstance({ i: next, pay: false })}
              >
                Change amount
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className={cn("bg-card", sub.variable && "col-span-2")}
              onClick={() => act(next, "skip", "Skipped")}
            >
              Skip this one
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No more payments scheduled.</p>
      )}

      <dl className="grid gap-2 text-sm">
        <Mini label={isTransfer ? "Moved so far" : "Paid so far"} value={signed(paidTotal)} />
        <Mini label="Payments" value={String(sub.history.length)} />
        <Mini
          label="Per year"
          value={fmt(Math.abs(convert(sub.monthly * 12, sub.currency, displayCurrency, meta.rates)), displayCurrency)}
        />
      </dl>

      <section>
        <h3 className="mb-1.5 text-[13px] font-medium">History</h3>
        {sub.history.length === 0 && <p className="border-t py-3 text-sm text-muted-foreground">No payments yet.</p>}
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
                  .join(" · ") || (isTransfer ? "Moved" : "Paid")}
              </span>
              <span className="num whitespace-nowrap">{signed(h.amount)}</span>
            </button>
          ))}
        </div>
        {sub.history.length > 5 && (
          <Link
            to="/transactions"
            search={(p) => ({ ...p, q: sub.name })}
            className="mt-2.5 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            All {sub.history.length} payments →
          </Link>
        )}
      </section>

      <div className="-mx-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="lg" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {sub.ended ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="lg" onClick={() => setEnd(null)}>
              Resume
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm("delete")}
            >
              Delete
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="lg"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirm("end")}
          >
            End this {kind.toLowerCase()}
          </Button>
        )}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? `Delete ${sub.name}?` : `End ${sub.name}?`}</DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "The schedule is removed. Past payments stay in Activity as ordinary transactions."
                : "No payments after today. Past payments stay in Activity, and you can resume it later."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={() => (confirm === "delete" ? remove() : setEnd(today))}>
              {confirm === "delete" ? "Delete" : `End ${kind.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {sub.name}</DialogTitle>
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
        title={isTransfer ? "Edit transfer" : "Edit payment"}
        onClose={() => setPayment(null)}
      >
        {payment && (
          <TransactionForm
            key={payment.id}
            initial={payment}
            onDone={() => setPayment(null)}
            onCancel={() => setPayment(null)}
          />
        )}
      </TransactionSheet>
    </div>
  )
}

/** One label / value row; the value never wraps or clips, the label gives way. */
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
    if (!cents) return toast.error("Enter an amount")
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
      toast.success(pay ? "Recorded" : "Payment updated")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
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
            ? `Enter what was ${toWallet ? "transferred" : "paid"} this time.`
            : "Only this payment changes. Other payments keep the regular amount and date."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="i-amount">
            Amount <span className="text-muted-foreground uppercase">({sub.currency})</span>
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
          <Label htmlFor="i-day">Date</Label>
          <Input id="i-day" type="date" value={day} onChange={(e) => setDay(e.target.value || instance.due_day)} />
        </div>
      </div>
      {crossCurrency && (
        <div className="grid gap-1.5">
          <Label htmlFor="i-received">
            Received in {toWallet.name} <span className="text-muted-foreground uppercase">({toWallet.currency})</span>
          </Label>
          <Input
            id="i-received"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="decimal"
            className="num"
          />
          <p className="text-xs text-muted-foreground">Leave empty to use the exchange rate.</p>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="i-note">
          Note <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="i-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        {instance.edited && (
          <Button type="button" variant="ghost" onClick={reset}>
            Reset to regular
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {pay ? "Record" : "Save this payment"}
        </Button>
      </div>
    </form>
  )
}
