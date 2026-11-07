// The frame and controls shared by /login, /forgot-password, /reset-password and /consent.
// The brand panel is the only place brand colours and Bricolage appear; the form side is the neutral interface.
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import {
  ArrowLeftIcon,
  BankIcon,
  CheckCircleIcon,
  CheckIcon,
  CoinsIcon,
  DeviceMobileIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeSimpleIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  WalletIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { cn } from "cn"
import { KoshaLogo, KoshaMark } from "@/components/kosha-mark"
import { LanguageSwitch } from "@/components/language-switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MIN_PASSWORD, fmt, intlLocale } from "@/lib/core"
import { m } from "@/paraglide/messages"

type Variant = "default" | "demo" | "create"

const HEADLINES: Record<Variant, () => string> = {
  default: m.auth_headline_default,
  demo: m.auth_headline_default,
  create: m.auth_headline_create,
}

/** Outline buttons on the auth pages sit on the card colour in both modes. */
export const optionClass = "bg-card hover:bg-muted dark:bg-card dark:hover:bg-muted"
/** Inline text links: foreground, underlined. */
export const linkClass = "text-foreground underline underline-offset-4 hover:decoration-2"

/**
 * The page frame. Desktop: the form column beside the brand panel (lg and up; md to lg centres the form alone).
 * Phones get one of two layouts: `band` puts the form on a sheet over a peacock band (sign in, create account),
 * `focused` is a plain page with a back button whose main action the page pins to the bottom.
 */
export function AuthShell({
  panel = "default",
  phone,
  top,
  back,
  className,
  children,
}: {
  panel?: Variant
  phone: "band" | "focused"
  /** The desktop top bar's right side, e.g. "New to Kosha?" and a switch button. */
  top?: ReactNode
  /** "Back to sign in": a path, or a handler when the previous step is on the same page. */
  back?: string | (() => void)
  className?: string
  children: ReactNode
}) {
  const band = phone === "band"
  const backProps = typeof back === "string" ? { render: <a href={back} />, nativeButton: false } : { onClick: back }
  return (
    <div
      className={cn(
        "flex min-h-svh flex-col bg-background md:flex-row md:gap-4 md:p-4",
        band && "max-md:bg-auth-panel"
      )}
    >
      {band && (
        <header
          className={cn(
            "relative flex flex-col overflow-hidden px-6 pt-14 text-paper md:hidden",
            panel === "create" ? "gap-6 pb-12" : "gap-7 pb-[50px]"
          )}
        >
          <span aria-hidden="true" className="absolute -top-[110px] -right-[90px] size-60 rounded-full bg-marigold" />
          {/* A full page load, so a signed-out visitor gets the landing page back. */}
          <a href="/" aria-label={m.auth_home()} className="relative self-start rounded-md">
            <KoshaLogo className="text-[26px] [--auth-mark:var(--color-paper)]" />
          </a>
          <p
            className={cn(
              "relative font-display font-extrabold tracking-[-0.035em] whitespace-pre-line",
              panel === "create" ? "text-[30px] leading-[30px]" : "text-[32px] leading-8"
            )}
          >
            {HEADLINES[panel]()}
          </p>
        </header>
      )}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col md:flex-[1_1_480px] md:px-6 md:pt-3 md:pb-4",
          band
            ? "-mt-6 rounded-t-3xl bg-background px-5 py-7 md:mt-0 md:rounded-none md:bg-transparent"
            : "px-5 pt-12 pb-7"
        )}
      >
        <div
          className={cn(
            "flex min-h-11 items-center gap-3 text-sm text-muted-foreground max-md:hidden",
            back ? "justify-start" : "justify-end"
          )}
        >
          {back ? (
            <Button
              variant="ghost"
              className="-ml-2 h-9 gap-2 px-2 text-[13px] font-normal text-subtle-foreground"
              {...backProps}
            >
              <ArrowLeftIcon /> {m.auth_back_to_sign_in()}
            </Button>
          ) : (
            top
          )}
        </div>
        {back && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.auth_back_to_sign_in()}
            className="-ml-2.5 size-11 rounded-xl text-subtle-foreground md:hidden [&_svg:not([class*='size-'])]:size-5"
            {...backProps}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <main className={cn("flex flex-1 flex-col md:items-center md:justify-center md:py-10", !band && "max-md:pt-7")}>
          <div
            className={cn(
              "flex w-full flex-1 flex-col md:max-w-[392px] md:flex-none",
              "motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-out motion-safe:fade-in",
              band ? "gap-[22px] md:gap-6" : "gap-[26px] md:gap-7",
              className
            )}
          >
            {children}
          </div>
        </main>
        <AuthFooter className="max-md:hidden" />
        {/* Phones have no footer, so the language picker sits alone under the page. */}
        <LanguageSwitch className="mt-4 -mb-2 self-center md:hidden" />
      </div>
      <AuthPanel variant={panel} />
    </div>
  )
}

export function AuthFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className
      )}
    >
      <span>getkosha.app</span>
      <div className="flex items-center gap-4">
        <LanguageSwitch className="text-xs md:h-auto" />
        <nav aria-label={m.auth_footer_legal()} className="flex gap-4">
          <a href="/privacy" className="hover:text-foreground">
            {m.auth_footer_privacy()}
          </a>
          <a href="/terms" className="hover:text-foreground">
            {m.auth_footer_terms()}
          </a>
        </nav>
      </div>
    </footer>
  )
}

/**
 * The mark (or an icon tile), the title and one line under it. `focus` moves focus to the title when it mounts,
 * for steps that replace the one before. `band` pages hide the mark on phones, where the band shows the logo.
 */
export function AuthHeader({
  title,
  children,
  icon,
  home,
  band,
  focus,
}: {
  title: string
  children?: ReactNode
  icon?: ReactNode
  /** Link the mark to the landing page. */
  home?: boolean
  band?: boolean
  focus?: boolean
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  const mark = <KoshaMark className="h-11 max-md:h-10" />
  return (
    <div className="flex flex-col gap-[22px] max-md:gap-5">
      {icon ??
        (home ? (
          <a href="/" aria-label={m.auth_home()} className={cn("self-start rounded-md", band && "max-md:hidden")}>
            {mark}
          </a>
        ) : (
          <span className={cn("self-start", band && "max-md:hidden")}>{mark}</span>
        ))}
      <div className={cn("flex flex-col gap-1.5", icon && "gap-2")}>
        <h1
          ref={ref}
          tabIndex={-1}
          className={cn(
            "text-[30px] leading-9 font-semibold tracking-[-0.025em] outline-none max-md:tracking-[-0.02em]",
            band ? "max-md:text-2xl max-md:leading-[30px]" : "max-md:text-[26px] max-md:leading-8"
          )}
        >
          {title}
        </h1>
        {children && (
          <p
            className={cn(
              "text-[15px] leading-[22px] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground",
              band && "max-md:text-sm max-md:leading-5"
            )}
          >
            {children}
          </p>
        )}
      </div>
    </div>
  )
}

/** A 56px icon tile in place of the mark: the envelope with a check, or the expired clock. */
export function IconTile({ children, badge }: { children: ReactNode; badge?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-14 items-center justify-center self-start rounded-2xl border bg-card [&_svg]:size-6"
    >
      {children}
      {badge && (
        <span className="absolute -top-[5px] -right-[5px] flex size-5 items-center justify-center rounded-full border-2 border-background bg-positive text-background [&_svg]:size-2.5">
          <CheckIcon weight="bold" />
        </span>
      )}
    </span>
  )
}

/**
 * A labelled text field. Errors and hints are linked with aria-describedby. `type="password"` adds the show
 * toggle; `meter` adds the length meter (pass `value`); `locked` is the demo's read-only look.
 */
export function AuthField({
  id,
  label,
  aside,
  error,
  hint,
  meter,
  locked,
  type,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "id" | "variant"> & {
  id: string
  label: string
  aside?: ReactNode
  error?: string
  hint?: ReactNode
  meter?: boolean
  locked?: boolean
}) {
  const [shown, setShown] = useState(false)
  const password = type === "password"
  const length = String(props.value ?? "").length
  const described = [error && `${id}-error`, (hint || meter) && `${id}-hint`].filter(Boolean).join(" ") || undefined
  return (
    <div className="flex flex-col gap-2 max-md:gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] leading-[18px] font-medium text-subtle-foreground">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative flex">
        <Input
          id={id}
          variant="auth"
          type={password && shown ? "text" : type}
          readOnly={locked || props.readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={cn(
            password && "pr-[50px] max-md:pr-[52px]",
            password && shown && "font-mono tracking-[-0.01em]",
            locked && "bg-muted pr-11 text-subtle-foreground dark:bg-muted",
            className
          )}
          {...props}
        />
        {password && !locked && (
          <button
            type="button"
            aria-label={shown ? m.auth_password_hide() : m.auth_password_show()}
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
            className="absolute top-1 right-1 flex size-[38px] items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:text-subtle-foreground max-md:top-px max-md:right-px max-md:size-11 max-md:rounded-[10px]"
          >
            {shown ? (
              <EyeSlashIcon className="size-[18px] max-md:size-5" />
            ) : (
              <EyeIcon className="size-[18px] max-md:size-5" />
            )}
          </button>
        )}
        {locked && (
          <LockSimpleIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
        )}
      </div>
      {meter && <PasswordMeter id={`${id}-hint`} length={length} />}
      {hint && !meter && (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
      {error && <AuthError id={`${id}-error`}>{error}</AuthError>}
    </div>
  )
}

/** Ten segments, one per character up to the minimum. The segments are decoration; the line under them is read. */
function PasswordMeter({ id, length }: { id: string; length: number }) {
  const done = length >= MIN_PASSWORD
  const left = MIN_PASSWORD - length
  return (
    <>
      <div aria-hidden="true" className="mt-0.5 grid grid-cols-10 gap-1">
        {Array.from({ length: MIN_PASSWORD }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 rounded-full", done ? "bg-positive" : i < length ? "bg-chart-2" : "bg-border")}
          />
        ))}
      </div>
      <div id={id} className="flex justify-between gap-3 text-xs">
        {done ? (
          <span className="flex items-center gap-1.5 text-positive">
            <CheckIcon className="size-3.5" /> {m.auth_meter_enough()}
          </span>
        ) : (
          <span className="text-muted-foreground">{m.auth_meter_left({ count: left })}</span>
        )}
        <span className="text-muted-foreground">{m.auth_meter_min({ min: MIN_PASSWORD })}</span>
      </div>
    </>
  )
}

/** An error line: under a field, or above the primary button for form-level errors. */
export function AuthError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-0.5 flex gap-2 text-[13px] leading-[18px] text-destructive">
      <WarningIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** A success notice, such as "Password changed". */
export function AuthNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-[14px] border bg-card px-3.5 py-3">
      <CheckCircleIcon aria-hidden="true" className="size-5 shrink-0 text-positive" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">{children}</span>
      </span>
    </div>
  )
}

export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

// ---------- the brand panel ----------

// The panel's cards are a fixed illustration, not the visitor's data. Figures go through fmt so they read like the app.
const minus = (cents: number, currency = "eur") => `−${fmt(cents, currency)}`
const whole = (cents: number) =>
  new Intl.NumberFormat(intlLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
/** "20 Nov" in the visitor's language. */
const day = (d: number) => new Date(2026, 10, d).toLocaleDateString(intlLocale(), { day: "numeric", month: "short" })

/** A hero figure in Geist with the cents muted, as on the Overview. */
function Hero({ cents }: { cents: number }) {
  const text = fmt(cents, "eur")
  // The decimal separator is "." in English and "," in German.
  const dot = text.lastIndexOf((0.5).toLocaleString(intlLocale()).charAt(1))
  return (
    <div className="mt-2 text-[40px] leading-10 font-semibold tracking-[-0.035em] tabular-nums">
      {text.slice(0, dot)}
      <span className="text-muted-foreground">{text.slice(dot)}</span>
    </div>
  )
}

const card = "rounded-2xl bg-card text-foreground shadow-[0_24px_48px_rgb(4_30_28/0.32)]"

const SUBLINES: Record<Variant, () => string> = {
  default: m.auth_subline_default,
  demo: m.auth_subline_demo,
  create: m.auth_subline_create,
}

const FACTS = [
  { icon: GlobeSimpleIcon, text: m.auth_fact_currency },
  { icon: DeviceMobileIcon, text: m.auth_fact_install },
  { icon: ShieldCheckIcon, text: m.auth_fact_security },
]

function AuthPanel({ variant }: { variant: Variant }) {
  return (
    <aside
      aria-label={m.auth_panel_about()}
      className="relative flex min-h-[600px] min-w-0 flex-[1.15_1_560px] flex-col justify-between gap-10 overflow-hidden rounded-[24px] bg-auth-panel px-14 pt-14 pb-11 text-paper max-lg:hidden"
    >
      <span aria-hidden="true" className="absolute -top-[200px] -right-[120px] size-[400px] rounded-full bg-marigold" />
      <div className="relative flex max-w-[440px] flex-col gap-[18px]">
        <p className="font-display text-[52px] leading-[52px] font-extrabold tracking-[-0.035em] whitespace-pre-line">
          {HEADLINES[variant]()}
        </p>
        <p className="max-w-[400px] text-[17px] leading-[26px] text-[#D7EBE7]">{SUBLINES[variant]()}</p>
      </div>
      {variant === "create" ? <AccountsCard /> : variant === "demo" ? <SpendingCard /> : <NetWorthCard />}
      {variant === "create" ? (
        <ol className="relative grid grid-cols-3 gap-5 text-[13px] leading-[19px] text-[#D7EBE7]">
          {[m.auth_step_accounts(), m.auth_step_log(), m.auth_step_see()].map((step, i) => (
            <li key={step} className="flex flex-col gap-2.5">
              <span className="flex size-[26px] items-center justify-center rounded-full border border-[#74BDB3] font-mono text-xs text-paper">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <ul
          className={cn(
            "relative flex flex-wrap gap-x-7 gap-y-3 text-[13px] leading-[18px] text-[#D7EBE7]",
            variant === "demo" && "justify-end"
          )}
        >
          {FACTS.slice(0, variant === "demo" ? 2 : 3).map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-center gap-2">
              <Icon aria-hidden="true" className="size-4 text-[#74BDB3]" />
              {text()}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function NetWorthCard() {
  const rows = [
    { code: "EUR", share: 58, cents: 1439351 },
    { code: "INR", share: 31, cents: 769308, approx: true },
    { code: "USD", share: 11, cents: 272981, approx: true },
  ]
  return (
    <div aria-hidden="true" className="relative mr-2 ml-auto w-full max-w-[420px]">
      <div className={cn(card, "px-5 pt-5 pb-2.5")}>
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>{m.auth_panel_net_worth()}</span>
          <span>{m.auth_panel_in_currency({ currency: "EUR" })}</span>
        </div>
        <Hero cents={2481640} />
        <div className="mt-2 text-[13px] leading-[18px] font-medium text-positive">
          {m.auth_panel_since({ amount: whole(276400) })}
        </div>
        <div className="mt-3.5 flex flex-col">
          {rows.map((r) => (
            <div key={r.code} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2.5">
              <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-chart-2" style={{ width: `${r.share}%` }} />
              </span>
              <span className="num text-sm">
                {r.approx && "≈ "}
                {fmt(r.cents, "eur")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-7 -left-12 flex items-center gap-4 rounded-xl bg-primary px-4 py-3 text-sm whitespace-nowrap text-primary-foreground shadow-[0_16px_32px_rgb(4_30_28/0.35)]">
        <span>
          <ParaglideMessage
            message={m.auth_panel_added}
            inputs={{ amount: minus(2957), payee: "Dosaking" }}
            markup={{ num: ({ children }) => <span className="num">{children}</span> }}
          />
        </span>
        <span className="underline underline-offset-[3px]">{m.common_undo()}</span>
      </div>
    </div>
  )
}

function SpendingCard() {
  const upcoming = [
    { day: day(20), name: "O2", cents: 5200 },
    { day: day(24), name: "Spotify", cents: 1099 },
  ]
  return (
    <div aria-hidden="true" className="relative mr-2 ml-auto w-full max-w-[420px]">
      <div className={cn(card, "px-5 pt-[18px] pb-3.5")}>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{m.auth_panel_spent()}</span>
          <span>{m.auth_panel_day({ day: 18, days: 30 })}</span>
        </div>
        <Hero cents={143600} />
        <div className="mt-2 text-[13px] leading-[18px] font-medium text-positive">
          {m.auth_panel_under_pace({ amount: whole(23300) })}
        </div>
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="mt-3 block h-[88px] w-full">
          <path
            d="M0,180 L0,144 L41.4,139.2 L82.8,131.4 L124.1,125.3 L165.5,119.1 L206.9,113.4 L248.3,106 L289.7,96 L331,84.6 L351.7,80.6 L351.7,180 Z"
            className="fill-foreground/6"
          />
          <polyline
            points="0,144 82.8,125.3 165.5,106.6 248.3,87.9 331,69.1 413.8,50.4 496.6,31.7 600,8.3"
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth="1.5"
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points="0,144 41.4,139.2 82.8,131.4 124.1,125.3 165.5,119.1 206.9,113.4 248.3,106 289.7,96 331,84.6 351.7,80.6"
            fill="none"
            className="stroke-foreground"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-2.5 flex justify-between text-xs text-muted-foreground">
          <span>
            {m.auth_panel_usual_month()} <span className="font-mono">{whole(248000)}</span>
          </span>
          <span>
            {m.auth_panel_projected()} <span className="font-mono text-foreground">{whole(224700)}</span>
          </span>
        </div>
      </div>
      <div className={cn(card, "absolute -bottom-11 -left-14 w-[236px] rounded-[14px] px-3.5 pt-2.5 pb-0.5")}>
        <div className="mb-1 text-[13px] leading-[18px] font-medium">{m.auth_panel_coming_up()}</div>
        {upcoming.map((u) => (
          <div
            key={u.name}
            className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-2 border-t py-[7px] text-[13px]"
          >
            <span className="font-mono text-[11px] text-muted-foreground">{u.day}</span>
            <span>{u.name}</span>
            <span className="num">{minus(u.cents)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountsCard() {
  const accounts = [
    { icon: BankIcon, name: "N26 Main", note: m.auth_panel_checking(), cents: 421806, currency: "eur" },
    {
      icon: BankIcon,
      name: "HDFC Savings",
      note: m.auth_panel_savings(),
      cents: 31240000,
      currency: "inr",
      eur: 333404,
    },
    {
      icon: WalletIcon,
      name: "Amex Gold",
      note: m.auth_panel_credit_card(),
      cents: -61230,
      currency: "usd",
      eur: -57118,
    },
    { icon: CoinsIcon, name: m.auth_panel_cash(), note: m.auth_panel_wallet(), cents: 14000, currency: "eur" },
  ]
  const money = (cents: number, currency: string) => (cents < 0 ? minus(-cents, currency) : fmt(cents, currency))
  return (
    <div aria-hidden="true" className={cn(card, "relative mr-2 ml-auto w-full max-w-[440px] px-5 pt-3.5 pb-1")}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{m.auth_panel_accounts()}</span>
        <span className="text-xs text-muted-foreground">{m.auth_panel_currencies({ count: 3 })}</span>
      </div>
      {accounts.map((a) => (
        <div key={a.name} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-subtle-foreground">
            <a.icon className="size-4" />
          </span>
          <span className="text-sm">
            {a.name}
            <span className="block text-xs text-muted-foreground">{a.note}</span>
          </span>
          <span className="num text-right text-sm">
            {money(a.cents, a.currency)}
            {a.eur !== undefined && (
              <>
                {" "}
                <span className="text-[11px] text-muted-foreground">{a.currency.toUpperCase()}</span>
                <span className="block text-xs text-muted-foreground">≈ {money(a.eur, "eur")}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
