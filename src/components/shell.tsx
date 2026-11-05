import { useEffect, useState, type ReactNode } from "react"
import { Link, getRouteApi, useLocation } from "@tanstack/react-router"
import {
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  CreditCardIcon,
  GearSixIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SignOutIcon,
  TagIcon,
} from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMarkHydrated } from "@/components/motion"
import { SearchPalette } from "@/components/search-palette"
import { QuickAdd } from "@/components/quick-add"
import { authClient } from "@/lib/auth-client"
import { LOCALE, monthOf, shiftMonth } from "@/lib/core"
import { syncPreferences } from "@/lib/theme"
import { cn } from "@/lib/utils"
import type { Meta } from "@/lib/api"

const app = getRouteApi("/_app")
export const useMeta = () => app.useLoaderData()

/** The app-wide month and display currency, with defaults filled in. */
export function useGlobals() {
  const meta = useMeta()
  const s = app.useSearch()
  const current = monthOf(Date.now() / 1000, meta.tz)
  return {
    month: s.month ?? current,
    current,
    currency: s.currency && meta.rates[s.currency] ? s.currency : meta.primary,
  }
}

const nav = [
  { to: "/", label: "Overview", icon: ChartBarIcon },
  { to: "/transactions", label: "Activity", icon: ListIcon },
  { to: "/subscriptions", label: "Recurring", icon: RepeatIcon },
  { to: "/accounts", label: "Accounts", icon: CreditCardIcon },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const [adding, setAdding] = useState(false)
  const [addText, setAddText] = useState("")
  const [searching, setSearching] = useState(false)
  useMarkHydrated()
  const { prefs } = useMeta()
  useEffect(() => syncPreferences(prefs), [prefs])
  const add = (text = "") => {
    setAddText(text)
    setAdding(true)
  }
  // /add is a full-screen entry pad on phone: no top header or tab bar around it.
  const bare = useLocation({ select: (l) => l.pathname === "/add" })

  // ⌘K / Ctrl+K opens search from anywhere (and closes it again).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return
      e.preventDefault()
      setAdding(false)
      setSearching((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex min-h-svh flex-col">
      <header className="hidden flex-wrap items-center gap-x-5 gap-y-3 border-b bg-card px-8 py-3 md:flex">
        <Link to="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
          <Logo /> Kosha
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-0.5">
          {nav.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper />
          <CurrencySwitch />
          <Button
            variant="outline"
            size="lg"
            className="gap-2 bg-card px-3 text-[13px] font-normal"
            onClick={() => setSearching(true)}
            aria-label="Search (⌘K)"
          >
            <MagnifyingGlassIcon /> Search
            <kbd className="rounded-sm border px-1.5 font-mono text-[11px] text-muted-foreground">⌘K</kbd>
          </Button>
          <Button size="lg" className="gap-2 px-3 text-[13px] font-normal" onClick={() => add()}>
            <PlusIcon /> Add
          </Button>
          <AccountMenu />
        </div>
      </header>

      <header
        className={cn(
          "flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden",
          bare && "hidden"
        )}
      >
        <MonthStepper />
        <div className="flex-1" />
        <CurrencySwitch />
        <AccountMenu />
      </header>

      <main
        className={cn(
          "mx-auto w-full min-w-0 flex-1",
          prefs.layout === "boxed" && "max-w-[1240px]",
          "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-14",
          bare && "max-md:pb-0"
        )}
      >
        {children}
      </main>

      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
          bare && "hidden"
        )}
      >
        {nav.slice(0, 2).map((item) => (
          <Tab key={item.to} {...item} />
        ))}
        <Link
          to="/add"
          aria-label="Add transaction"
          className="mx-auto flex size-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-[scale,opacity] duration-150 ease-out motion-safe:active:scale-[0.94]"
        >
          <PlusIcon className="size-6" />
        </Link>
        {nav.slice(2).map((item) => (
          <Tab key={item.to} {...item} />
        ))}
      </nav>

      <SearchPalette open={searching} onOpenChange={setSearching} onAdd={add} />
      <QuickAdd open={adding} onOpenChange={setAdding} initial={addText} />
    </div>
  )
}

function Tab({ to, label, icon: Icon }: (typeof nav)[number]) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
    >
      <Icon className="size-5" /> {label}
    </Link>
  )
}

const Logo = () => (
  <span aria-hidden="true" className="inline-flex size-[22px] items-center justify-center rounded-[6px] bg-foreground">
    <span className="size-2 rounded-[2px] bg-card" />
  </span>
)

export const monthLabel = (m: string, year = true) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString(LOCALE, {
    month: "long",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })

/** Bordered segmented control (month stepper, currency, filters). Buttons use aria-pressed. */
export const segment = "inline-flex h-9 items-center rounded-md border bg-card p-0.5 max-md:h-auto"
export const segmentButton =
  "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-[6px] px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground max-md:h-11 max-md:min-w-11"

/** ‹ November 2026 › — drives the app-wide month. Links, so hovering an arrow preloads that month. */
function MonthStepper() {
  const { month, current } = useGlobals()
  const to = (by: number) => {
    const m = shiftMonth(month, by)
    return m === current ? undefined : m
  }
  return (
    <div className={cn(segment, "max-md:-ml-3 max-md:border-0 max-md:bg-transparent max-md:p-0")}>
      <Link to="." search={(p) => ({ ...p, month: to(-1) })} aria-label="Previous month" className={segmentButton}>
        <CaretLeftIcon className="size-4" />
      </Link>
      <span
        className="min-w-[108px] px-1.5 text-center text-[13px] font-medium max-md:min-w-0 max-md:text-base"
        aria-live="polite"
      >
        <span className="md:hidden">{monthLabel(month, month.slice(0, 4) !== current.slice(0, 4))}</span>
        <span className="max-md:hidden">{monthLabel(month, true)}</span>
      </span>
      <Link to="." search={(p) => ({ ...p, month: to(1) })} aria-label="Next month" className={segmentButton}>
        <CaretRightIcon className="size-4" />
      </Link>
    </div>
  )
}

/** Currencies the header switch cycles through: the default plus active account currencies, in the saved order. */
export function currencyOptions({ primary, wallets, order }: Pick<Meta, "primary" | "wallets" | "order">) {
  const used = new Set([primary, ...wallets.filter((w) => !w.archived).map((w) => w.currency)])
  return [...order.filter((c) => used.has(c)), ...[...used].filter((c) => !order.includes(c))]
}

/** Shows the display currency; clicking moves to the next one. Hidden for single-currency users. */
function CurrencySwitch() {
  const meta = useMeta()
  const { currency } = useGlobals()
  const options = currencyOptions(meta)
  if (options.length < 2) return null
  const next = options[(options.indexOf(currency) + 1) % options.length]
  return (
    <Link
      to="."
      search={(p) => ({ ...p, currency: next === meta.primary ? undefined : next })}
      aria-label={`Display currency ${currency.toUpperCase()}, switch to ${next.toUpperCase()}`}
      title={`Switch to ${next.toUpperCase()}`}
      className={cn(
        segment,
        "min-w-[52px] justify-center px-2.5 text-xs font-medium uppercase transition-colors hover:bg-muted max-md:min-h-11"
      )}
    >
      {currency}
    </Link>
  )
}

function AccountMenu() {
  const meta = useMeta()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account and settings"
        className="inline-flex size-9 items-center justify-center rounded-full border bg-muted text-xs font-semibold uppercase transition-colors hover:bg-selected aria-expanded:bg-selected max-md:size-11"
      >
        {meta.user.name.trim()[0] ?? meta.user.email[0]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-1.5 py-1 text-xs text-muted-foreground">
          <div className="truncate font-medium text-foreground">{meta.user.name}</div>
          <div className="truncate">{meta.user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/account" />}>
          <ShieldCheckIcon /> Account &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/categories" />}>
          <TagIcon /> Categories
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings" />}>
          <GearSixIcon /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut()
            window.location.assign("/login")
          }}
        >
          <SignOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-5 md:px-8 md:pt-7">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  )
}
