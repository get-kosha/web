import { getRouteApi } from "@tanstack/react-router"
import { Reveal, RollingMoney } from "@/components/motion"
import type { Wallet } from "@/lib/api"
import { fmt, netWorth, type Rates } from "@/lib/core"

/**
 * Investments and cash & bank in one bar, each as wide as its share of gross assets. The legend gives
 * each amount and share, plus a "Card balance" row when there are credit cards. It draws no card of
 * its own, so place it inside one.
 */
export function CompositionBar({ wallets, currency, rates }: { wallets: Wallet[]; currency: string; rates: Rates }) {
  const nw = netWorth(wallets, currency, rates)
  const gross = nw.investments + nw.cash
  const groups = [
    { label: "Investments", value: nw.investments, color: "bg-chart-2" },
    { label: "Cash & bank", value: nw.cash, color: "bg-chart-4" },
  ].filter((g) => g.value > 0)
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
            <span className={`size-2.5 rounded-[3px] ${g.color}`} aria-hidden="true" />
            <dt>
              {g.label} <span className="text-xs text-muted-foreground">{share(g.value)}%</span>
            </dt>
            <dd className="num text-right">{fmt(g.value, currency)}</dd>
          </div>
        ))}
        {cards && (
          <div className="contents">
            <span className="h-0.5 w-2.5 bg-muted-foreground" aria-hidden="true" />
            <dt>Card balance</dt>
            <dd className="num text-right text-subtle-foreground">{fmt(-nw.debt, currency)}</dd>
          </div>
        )}
      </dl>
    </div>
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
