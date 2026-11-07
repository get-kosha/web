import { getRouteApi } from "@tanstack/react-router"
import { Reveal, RollingMoney } from "@/components/motion"
import type { Wallet } from "@/lib/api"
import { fmt, netWorth, type Rates } from "@/lib/core"
import { cn } from "@/lib/utils"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { m } from "@/paraglide/messages"

/**
 * Cash & bank, money invested and unrealized gains in one bar, each as wide as its share of gross
 * assets. Gains are hatched. A loss gets its own row and no segment, since the invested segment already
 * shows what is left. The legend gives each amount and share, plus a "Card balance" row when there are
 * credit cards. It draws no card of its own, so place it inside one.
 */
export function CompositionBar({ wallets, currency, rates }: { wallets: Wallet[]; currency: string; rates: Rates }) {
  const nw = netWorth(wallets, currency, rates)
  const loss = Math.min(0, nw.gains)
  const groups = [
    { label: m.overview_worth_cash(), value: nw.cash, color: "bg-chart-4" },
    { label: m.overview_worth_invested(), value: nw.invested + loss, color: "bg-chart-2" },
    { label: m.overview_worth_gains(), value: Math.max(0, nw.gains), color: "hatch", signed: true },
  ].filter((g) => g.value > 0)
  const gross = groups.reduce((sum, g) => sum + g.value, 0)
  const share = (v: number) => (gross > 0 ? Math.round((v / gross) * 100) : 0)
  const cards = wallets.some((w) => w.type === "credit")

  return (
    <div className="flex flex-col gap-3.5">
      {gross > 0 && (
        <Reveal aria-hidden="true">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {groups.map((g) => (
              <div key={g.label} className={g.color} style={{ flex: g.value }} />
            ))}
          </div>
        </Reveal>
      )}
      <dl className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2.5 text-[13px]">
        {groups.map((g) => (
          <div key={g.label} className="contents">
            <span className={cn("size-2.5 rounded-[3px]", g.color)} aria-hidden="true" />
            <dt>
              {g.label} <span className="text-xs text-muted-foreground">{share(g.value)}%</span>
            </dt>
            <dd className={cn("num text-right", g.signed && "text-positive")}>
              {g.signed && "+"}
              {fmt(g.value, currency)}
            </dd>
          </div>
        ))}
        {loss < 0 && (
          <div className="contents">
            <span className="h-0.5 w-2.5 bg-destructive" aria-hidden="true" />
            <dt>{m.overview_worth_loss()}</dt>
            <dd className="num text-right text-destructive">{fmt(loss, currency)}</dd>
          </div>
        )}
        {cards && (
          <div className="contents">
            <span className="h-0.5 w-2.5 bg-muted-foreground" aria-hidden="true" />
            <dt>{m.overview_worth_card_balance()}</dt>
            <dd className="num text-right text-subtle-foreground">{fmt(-nw.debt, currency)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/**
 * Splits a net worth into what is owned (cash, money put into investments, less card debt) and the
 * investments' unrealized gain or loss. Renders nothing without a gain. `swatches` makes it the legend of
 * a two-layer chart (owned solid, gains hatched).
 */
export function WorthSplit({
  total,
  gains,
  currency,
  swatches,
}: {
  total: number
  gains: number
  currency: string
  swatches?: boolean
}) {
  if (!Math.round(gains)) return null
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {swatches && <span className="h-0.5 w-3 rounded-full bg-chart-2" aria-hidden="true" />}
        <ParaglideMessage
          message={m.overview_worth_owned}
          inputs={{ amount: fmt(total - gains, currency) }}
          markup={{ num: ({ children }) => <span className="num text-foreground">{children}</span> }}
        />
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatches && <span className="size-2.5 rounded-[3px] hatch" aria-hidden="true" />}
        <ParaglideMessage
          message={gains > 0 ? m.overview_worth_split_gains : m.overview_worth_split_loss}
          inputs={{ amount: `${gains > 0 ? "+" : ""}${fmt(gains, currency)}` }}
          markup={{
            num: ({ children }) => (
              <span className={cn("num", gains > 0 ? "text-positive" : "text-destructive")}>{children}</span>
            ),
          }}
        />
      </span>
    </p>
  )
}

/** SVG hatch for a chart's unrealized-gains layer. Put it inside the chart and fill with `url(#id)`. */
export function HatchPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--chart-2)" strokeWidth="1.5" />
      </pattern>
    </defs>
  )
}

/** The hero figure in Geist sans at 40px (32px on phones), with the cents muted. */
export function BigMoney({ value, currency, className }: { value: number; currency: string; className?: string }) {
  const round = getRouteApi("/_app").useLoaderData({ select: (m) => m.prefs.round_hero === "1" })
  return (
    <div
      className={`cents-muted text-[32px] leading-none font-semibold tracking-[-0.035em] tabular-nums min-[700px]:text-[40px] ${className ?? ""}`}
    >
      <RollingMoney value={value} currency={currency} round={round} />
    </div>
  )
}
