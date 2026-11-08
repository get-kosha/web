import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Link, getRouteApi, useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import {
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  CreditCardIcon,
  EyeIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RepeatIcon,
  SparkleIcon,
} from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { AccountMenu, ShortcutsDialog } from "@/components/account-menu"
import { KoshaLogo } from "@/components/kosha-mark"
import { useMarkHydrated } from "@/components/motion"
import { SearchPalette } from "@/components/search-palette"
import { QuickAdd } from "@/components/quick-add"
import { PwaPrompts } from "@/components/pwa-prompts"
import { DEMO, intlLocale, monthOf, shiftMonth } from "@/lib/core"
import { signOutTo } from "@/lib/auth-client"
import { syncPreferences } from "@/lib/theme"
import { cn } from "@/lib/utils"
import type { Meta } from "@/lib/api"
import { m } from "@/paraglide/messages"

const app = getRouteApi("/_app")

/** Between the main pages, the content crossfades and rises a little while the header stays still. */
const pageTransition = {
  types: () => (document.documentElement.dataset.motion === "off" ? false : ["page"]),
}

const ShortcutsContext = createContext<() => void>(() => {})
/** Opens the keyboard shortcuts dialog, which the shell renders. */
export const useShortcuts = () => useContext(ShortcutsContext)

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
export const useMeta = () => app.useLoaderData()

/** Overview and Accounts' month, the current month and the app-wide display currency, with defaults filled in. */
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

// Labels are message functions, called when rendering, so each request gets its own language.
const nav = [
  { to: "/", label: m.shell_nav_overview, icon: ChartBarIcon },
  { to: "/transactions", label: m.shell_nav_activity, icon: ListIcon },
  { to: "/subscriptions", label: m.shell_nav_recurring, icon: RepeatIcon },
  { to: "/accounts", label: m.shell_nav_accounts, icon: CreditCardIcon },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const [adding, setAdding] = useState(false)
  const [addText, setAddText] = useState("")
  const [searching, setSearching] = useState(false)
  useMarkHydrated()
  const { prefs, user: prefsUser, ai } = useMeta()
  useEffect(() => syncPreferences(prefs), [prefs])
  // Once the page settles, load the other main pages in the background, so the first tap on a tab is
  // instant. Visiting a page later shows this data and refreshes it behind the scenes.
  const router = useRouter()
  const { month, currency } = app.useSearch()
  useEffect(() => {
    const t = setTimeout(() => nav.forEach(({ to }) => void router.preloadRoute({ to }).catch(() => {})), 1500)
    return () => clearTimeout(t)
  }, [router, month, currency])
  const add = (text = "") => {
    setAddText(text)
    setAdding(true)
  }
  // Settings, Ask, Reconcile, Import and Welcome aren't about a currency, so the header drops that switch.
  // The three with a button at the bottom also keep the install card away. Only Overview and Accounts show
  // a month; Activity picks its own dates.
  const settings = useLocation({ select: (l) => l.pathname.startsWith("/settings") })
  const monthly = useLocation({ select: (l) => l.pathname === "/" || l.pathname === "/accounts" })
  const reconciling = useLocation({
    select: (l) => l.pathname === "/reconcile" || l.pathname === "/import" || l.pathname === "/welcome",
  })
  const chat = useLocation({ select: (l) => l.pathname === "/ask" })
  const asking = chat || reconciling
  // /add, Ask and Settings are full-screen on phones, with no top header or tab bar around them.
  const bare = useLocation({ select: (l) => l.pathname === "/add" }) || settings || asking

  const navigate = useNavigate()
  const [shortcuts, setShortcuts] = useState(false)
  // ⌘K / Ctrl+K opens search from anywhere (and closes it again). ⌘, opens Settings and ? lists the
  // shortcuts, but neither works while you're typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setAdding(false)
        setSearching((v) => !v)
        return
      }
      if (isTyping(e.target)) return
      if (mod && e.key === ",") {
        e.preventDefault()
        void navigate({ to: "/settings" })
      } else if (e.key === "?" && !mod && !e.altKey) {
        e.preventDefault()
        setShortcuts((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <ShortcutsContext value={() => setShortcuts(true)}>
      {/* Ask fits the window exactly, so only its messages scroll and the header and question box stay put. */}
      <div className={cn("flex flex-col", chat ? "h-dvh" : "min-h-svh")}>
        {prefsUser.id === DEMO.id && <DemoBanner />}
        <header className="hidden flex-wrap items-center gap-x-5 gap-y-3 border-b bg-card px-8 py-3 md:flex">
          <Link to="/">
            <KoshaLogo className="text-xl" />
          </Link>
          <nav aria-label={m.shell_nav_main()} className="flex flex-wrap gap-0.5">
            {[...nav, ...(ai.ask ? [{ to: "/ask", label: m.shell_nav_ask } as const] : [])].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                viewTransition={pageTransition}
                activeOptions={{ exact: to === "/" }}
                className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
              >
                {label()}
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            {monthly && <MonthStepper />}
            {!settings && !asking && <CurrencySwitch />}
            <Button
              variant="outline"
              size="lg"
              className="gap-2 bg-card px-3 text-[13px] font-normal"
              onClick={() => setSearching(true)}
              aria-label={m.shell_search_label()}
            >
              <MagnifyingGlassIcon /> {m.common_search()}
              <kbd className="rounded-sm border px-1.5 font-mono text-[11px] text-muted-foreground">⌘K</kbd>
            </Button>
            <Button size="lg" className="gap-2 px-3 text-[13px] font-normal" onClick={() => add()}>
              <PlusIcon /> {m.common_add()}
            </Button>
            <AccountMenu user={prefsUser} onShortcuts={() => setShortcuts(true)} />
          </div>
        </header>

        <header
          className={cn(
            "flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden",
            bare && "hidden"
          )}
        >
          {monthly && <MonthStepper />}
          <div className="flex-1" />
          <CurrencySwitch />
          {ai.ask && (
            <Link
              to="/ask"
              aria-label={m.shell_ask_kosha()}
              className="inline-flex size-11 items-center justify-center rounded-md text-subtle-foreground transition-colors active:bg-muted"
            >
              <SparkleIcon className="size-5" />
            </Link>
          )}
          <AccountMenu user={prefsUser} onShortcuts={() => setShortcuts(true)} />
        </header>

        <main
          data-page
          className={cn(
            "mx-auto w-full min-w-0 flex-1",
            prefs.layout === "boxed" && "max-w-[1240px]",
            "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-14",
            // A bare page fills what is left under the demo banner, so /add can pin its keypad to the bottom.
            bare && "max-md:flex max-md:flex-col max-md:pb-0",
            chat && "flex min-h-0 flex-col pb-0 md:pb-0"
          )}
        >
          {children}
        </main>

        <nav
          aria-label={m.shell_nav_main()}
          data-tabbar
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
            aria-label={m.shell_add_transaction()}
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
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
        <PwaPrompts uid={prefsUser.id} bare={bare} away={reconciling} />
      </div>
    </ShortcutsContext>
  )
}

/**
 * Shown on every page of the shared demo account. The server refuses its changes (start.ts), and this
 * says so up front, with the way out: sign out and create your own account.
 */
function DemoBanner() {
  const [leaving, setLeaving] = useState(false)
  const leave = async () => {
    setLeaving(true)
    await signOutTo("/login?mode=up")
  }
  return (
    <div
      role="status"
      className="flex items-center gap-3 bg-foreground px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[13px] text-background md:px-8"
    >
      <EyeIcon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{m.shell_demo_title()}</span>{" "}
        <span className="opacity-80 max-sm:hidden">{m.shell_demo_body()}</span>
        <span className="opacity-80 sm:hidden">{m.shell_demo_body_short()}</span>
      </p>
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="inline-flex h-8 shrink-0 items-center rounded-md bg-background px-3 text-xs font-medium text-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 disabled:opacity-60 motion-safe:active:scale-[0.97] max-md:h-11"
      >
        <span className="max-sm:hidden">{m.shell_demo_create()}</span>
        <span className="sm:hidden">{m.shell_demo_sign_up()}</span>
      </button>
    </div>
  )
}

function Tab({ to, label, icon: Icon }: (typeof nav)[number]) {
  return (
    <Link
      to={to}
      viewTransition={pageTransition}
      activeOptions={{ exact: to === "/" }}
      className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
    >
      <Icon className="size-5" /> {label()}
    </Link>
  )
}

export const monthLabel = (m: string, year = true) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString(intlLocale(), {
    month: "long",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })

/** Makes the Dialog popup a bottom sheet on phones, pinned to the bottom edge and sliding up on the drawer curve. */
export const bottomSheet =
  "top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-none ease-drawer data-open:duration-300 data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:data-open:slide-in-from-bottom-0 md:data-closed:slide-out-to-bottom-0"

/** Bordered segmented control (month stepper, currency, filters). Buttons use aria-pressed. */
export const segment = "inline-flex h-9 items-center rounded-md border bg-card p-0.5 max-md:h-auto"
export const segmentButton =
  "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-[6px] px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground max-md:h-11 max-md:min-w-11"

/** The ‹ November 2026 › stepper sets Overview's and Accounts' month. Its arrows are links, so hovering one preloads it. */
function MonthStepper() {
  const { month, current } = useGlobals()
  const to = (by: number) => {
    const m = shiftMonth(month, by)
    return m === current ? undefined : m
  }
  return (
    <div className={cn(segment, "max-md:-ml-3 max-md:border-0 max-md:bg-transparent max-md:p-0")}>
      <Link
        to="."
        search={(p) => ({ ...p, month: to(-1) })}
        aria-label={m.shell_previous_month()}
        className={segmentButton}
      >
        <CaretLeftIcon className="size-4" />
      </Link>
      <span
        className="min-w-[108px] px-1.5 text-center text-[13px] font-medium max-md:min-w-0 max-md:text-base"
        aria-live="polite"
      >
        <span className="md:hidden">{monthLabel(month, month.slice(0, 4) !== current.slice(0, 4))}</span>
        <span className="max-md:hidden">{monthLabel(month, true)}</span>
      </span>
      <Link to="." search={(p) => ({ ...p, month: to(1) })} aria-label={m.shell_next_month()} className={segmentButton}>
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

/** Shows the display currency; clicking moves to the next one. It renders nothing for single-currency users. */
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
      aria-label={m.shell_currency_label({ currency: currency.toUpperCase(), next: next.toUpperCase() })}
      title={m.shell_currency_switch_to({ next: next.toUpperCase() })}
      className={cn(
        segment,
        "min-w-[52px] justify-center px-2.5 text-xs font-medium uppercase transition-colors hover:bg-muted max-md:min-h-11"
      )}
    >
      {currency}
    </Link>
  )
}

/** What a main page shows while its data loads for the first time. Later visits show the cached page at once. */
export function PageSkeleton() {
  return (
    <div role="status" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">{m.common_loading()}</span>
      <div className="px-4 pt-5 pb-5 md:px-8 md:pt-7">
        <div className="h-7 w-36 rounded-md bg-muted" />
        <div className="mt-2 h-4 w-56 max-w-full rounded bg-muted" />
      </div>
      <div className="grid gap-3 px-4 md:px-8">
        <div className="h-40 rounded-xl bg-card" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-card" />
        ))}
      </div>
    </div>
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
