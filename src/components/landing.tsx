// The page a signed-out visitor sees at /. The _app layout renders it in place of the app.
// It tells one story: add each payment in your pocket in seconds, then make sense of it at your desk.
import type { ReactNode } from "react"
import { CheckIcon, GithubLogoIcon, SparkleIcon } from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { KoshaLogo } from "@/components/kosha-mark"
import { LanguageSwitch } from "@/components/language-switch"
import {
  AiSeesDemo,
  ApiDemo,
  ExchangeDemo,
  ImportDemo,
  NetWorthDemo,
  ReconcileDemo,
  SpottedDemo,
  TransferDemo,
  TripDemo,
} from "@/components/landing-checks"
import {
  AskDemo,
  AttentionDemo,
  HeroDemo,
  OfflineDemo,
  OverviewDemo,
  QuickAddDemo,
  ReceiptDemo,
  RecapDemo,
  RecurringDemo,
  SentenceDemo,
  WEEK_STATS,
  WeekDemo,
} from "@/components/landing-demos"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const SOURCE = "https://github.com/amruthpillai/kosha"
const SIGN_UP = "/login?mode=up"
// Opens /login with the shared demo account filled in.
const DEMO_SIGN_IN = "/login?demo=1"
const API_DOCS = "/api/v1/docs"

// Focus rings come from one rule in styles.css; each ground below says which ink they draw in.
const button =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium whitespace-nowrap transition-[translate,scale,background-color,border-color] duration-150 ease-out motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.97] max-sm:w-full"
// On paper the main action is ink; in dark mode the paper ground turns to deep peacock, so it inverts.
const solid = "bg-ink text-paper hover:bg-ink/85 dark:bg-paper dark:text-ink dark:hover:bg-paper/85"
const outline = "border border-current/25 hover:border-current/60"
const textLink =
  "rounded-sm underline decoration-current/35 underline-offset-4 transition-colors hover:decoration-current"
const display = "min-w-0 font-display font-bold tracking-[-0.035em] text-balance wrap-break-word"
const h2 = cn(display, "text-[clamp(2.5rem,5.4vw,4.75rem)] leading-[0.94]")
// Paper in light mode; in dark mode a near-black tinted with peacock, so the brand still carries the page.
const paper = "bg-paper dark:bg-peacock-night"
/** The marigold coin from the mark. It comes back at each turn of the story. */
const coin = "pointer-events-none absolute -z-10 rounded-full bg-marigold max-lg:hidden"

/** Each ground's quieter text, tinted from the ground rather than grey. */
type Tone = "paper" | "peacock" | "marigold" | "ink"
const quiet: Record<Tone, string> = {
  paper: "text-subtle-foreground",
  peacock: "text-paper/80",
  marigold: "text-ink/75",
  ink: "text-chalk/70",
}

function Section({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("relative isolate px-4 py-20 sm:px-8 md:px-12 lg:py-28", className)}
    >
      <div className="mx-auto w-full max-w-[1280px]">{children}</div>
    </section>
  )
}

/** A chapter's heading, set large on the left, with its one-paragraph lead beside it. */
function ChapterHead({ id, title, lead, tone }: { id: string; title: ReactNode; lead: ReactNode; tone: Tone }) {
  return (
    <div className="grid gap-x-12 gap-y-5 lg:grid-cols-12 lg:items-end">
      <h2 id={`${id}-title`} className={cn(h2, "lg:col-span-7")}>
        {title}
      </h2>
      <p className={cn("max-w-[34rem] text-[17px] leading-relaxed text-pretty lg:col-span-5 lg:pb-1.5", quiet[tone])}>
        {lead}
      </p>
    </div>
  )
}

/** Marks a part of the story that needs AI turned on with the visitor's own key. */
function NeedsAi() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 font-sans text-xs font-medium tracking-normal">
      <SparkleIcon weight="fill" className="size-3" aria-hidden="true" /> {m.landing_ai_badge()}
    </span>
  )
}

/** One part of a chapter: a short title and line on the ground, then the app doing it. */
function Cell({
  title,
  body,
  tone,
  ai,
  className,
  children,
}: {
  title: string
  body: ReactNode
  tone: Tone
  ai?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div>
        <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
          {title}
          {ai && <NeedsAi />}
        </h3>
        <p className={cn("mt-1.5 max-w-[48ch] text-[15px] leading-relaxed text-pretty", quiet[tone])}>{body}</p>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

const grid = "grid gap-x-6 gap-y-12 lg:grid-cols-12"

/** `demo`: this deployment has the demo account, so the page offers a link to it. */
export function Landing({ demo }: { demo: boolean }) {
  return (
    // data-landing and data-demo also tell the router, on the client, that this visitor is signed out (guestVisit in api.ts).
    <div data-landing="" data-demo={demo ? "1" : "0"} className="overflow-x-clip font-sans antialiased">
      <Hero demo={demo} />
      <main>
        <Section id="pocket" className="bg-peacock text-paper [--ring-on:var(--color-paper)]">
          <ChapterHead
            id="pocket"
            tone="peacock"
            title={m.landing_pocket_title({ seconds: WEEK_STATS.seconds })}
            lead={m.landing_pocket_lead({ count: WEEK_STATS.entries })}
          />
          <div className="relative mt-14 lg:mt-20">
            <div aria-hidden="true" className={cn(coin, "-bottom-12 -left-28 size-64")} />
            <WeekDemo />
          </div>

          <div className={cn(grid, "mt-16 lg:mt-24")}>
            <Cell
              tone="peacock"
              className="lg:col-span-7"
              title={m.landing_quick_add_title()}
              body={m.landing_quick_add_body()}
            >
              <QuickAddDemo />
            </Cell>
            <Cell
              tone="peacock"
              ai
              className="lg:col-span-5"
              title={m.landing_sentence_title()}
              body={m.landing_sentence_body()}
            >
              <SentenceDemo />
            </Cell>
            <Cell
              tone="peacock"
              className="lg:col-span-5"
              title={m.landing_offline_title()}
              body={m.landing_offline_body()}
            >
              <OfflineDemo />
            </Cell>
            <Cell
              tone="peacock"
              ai
              className="lg:col-span-7"
              title={m.landing_receipt_title()}
              body={m.landing_receipt_body()}
            >
              <ReceiptDemo />
            </Cell>
          </div>
        </Section>

        <Section id="desk" className={paper}>
          <div className={grid}>
            <div className="lg:col-span-7">
              <h2 id="desk-title" className={cn(h2, "max-w-[16ch]")}>
                {m.landing_desk_title()}
              </h2>
              <p className={cn("mt-6 max-w-[36rem] text-[17px] leading-relaxed text-pretty", quiet.paper)}>
                {m.landing_desk_lead()}
              </p>
            </div>
            <Cell
              tone="paper"
              ai
              className="lg:col-span-5"
              title={m.landing_recap_title()}
              body={m.landing_recap_body()}
            >
              <RecapDemo />
            </Cell>
          </div>
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <Cell
              tone="paper"
              className="lg:col-span-8"
              title={m.landing_overview_title()}
              body={m.landing_overview_body()}
            >
              <OverviewDemo />
            </Cell>
            <Cell tone="paper" ai className="lg:col-span-4" title={m.landing_ask_title()} body={m.landing_ask_body()}>
              <AskDemo />
            </Cell>
            <Cell
              tone="paper"
              className="lg:col-span-8"
              title={m.landing_recurring_title()}
              body={m.landing_recurring_body()}
            >
              <RecurringDemo />
            </Cell>
            <Cell
              tone="paper"
              className="lg:col-span-4"
              title={m.landing_attention_title()}
              body={m.landing_attention_body()}
            >
              <AttentionDemo />
            </Cell>
          </div>
        </Section>

        <Section id="statements" className="bg-marigold text-ink [--ring-on:var(--color-ink)]">
          <ChapterHead
            id="statements"
            tone="marigold"
            title={m.landing_statements_title()}
            lead={m.landing_statements_lead()}
          />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <div className="flex flex-col gap-12 lg:col-span-5">
              <Cell tone="marigold" title={m.landing_import_title()} body={m.landing_import_body()}>
                <ImportDemo />
              </Cell>
              <Cell tone="marigold" title={m.landing_spotted_title()} body={m.landing_spotted_body()}>
                <SpottedDemo />
              </Cell>
            </div>
            {/* The reconciliation stays in view while the import and spotted payments scroll past it. */}
            <div className="lg:sticky lg:top-8 lg:col-span-7 lg:self-start">
              <Cell tone="marigold" title={m.landing_reconcile_title()} body={m.landing_reconcile_body()}>
                <ReconcileDemo />
              </Cell>
            </div>
          </div>
        </Section>

        <Section id="accounts" className={paper}>
          <ChapterHead id="accounts" tone="paper" title={m.landing_accounts_title()} lead={m.landing_accounts_lead()} />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <div className="lg:col-span-6">
              <NetWorthDemo />
            </div>
            <div className="flex flex-col gap-12 lg:col-span-6">
              <Cell tone="paper" title={m.landing_exchange_title()} body={m.landing_exchange_body()}>
                <ExchangeDemo />
              </Cell>
              <div className="grid flex-1 gap-x-6 gap-y-12 sm:grid-cols-2">
                <Cell tone="paper" title={m.landing_trip_title()} body={m.landing_trip_body()}>
                  <TripDemo />
                </Cell>
                <Cell tone="paper" title={m.landing_transfer_title()} body={m.landing_transfer_body()}>
                  <TransferDemo />
                </Cell>
              </div>
            </div>
          </div>
        </Section>

        <Section id="ai" className="bg-ink text-chalk [--ring-on:var(--color-chalk)] dark:bg-ink-deep">
          <ChapterHead id="ai" tone="ink" title={m.landing_ai_title()} lead={m.landing_ai_lead()} />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <Cell
              tone="ink"
              className="lg:col-span-6"
              title={m.landing_ai_sees_title()}
              body={m.landing_ai_sees_body()}
            >
              <AiSeesDemo />
            </Cell>
            <Cell
              tone="ink"
              className="lg:col-span-6"
              title={m.landing_api_title()}
              body={
                <>
                  {m.landing_api_body()}{" "}
                  <a href={API_DOCS} className={cn(textLink, "text-chalk")}>
                    {m.landing_api_link()}
                  </a>
                </>
              }
            >
              <ApiDemo />
            </Cell>
          </div>
        </Section>
      </main>
      <Closing demo={demo} />
    </div>
  )
}

const navLink =
  "inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-subtle-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"

function Hero({ demo }: { demo: boolean }) {
  return (
    <header className={cn("relative isolate overflow-hidden px-4 sm:px-8 md:px-12", paper)}>
      <div className="mx-auto w-full max-w-[1280px]">
        <nav aria-label={m.landing_nav_label()} className="flex h-[76px] items-center gap-1">
          <a
            href="/"
            aria-label={m.landing_home_label()}
            className="mr-auto inline-flex h-11 items-center rounded-md transition-opacity hover:opacity-75"
          >
            <KoshaLogo className="text-[26px] text-foreground" />
          </a>
          <a href={SOURCE} className={navLink}>
            <GithubLogoIcon className="size-5" aria-hidden="true" />
            <span className="max-sm:sr-only">GitHub</span>
          </a>
          <LanguageSwitch
            short
            className="h-11 rounded-lg px-2 text-sm text-subtle-foreground hover:bg-foreground/5 sm:px-3"
          />
          <a href="/login" className={navLink}>
            {m.landing_sign_in()}
          </a>
          <a href={SIGN_UP} className={cn(button, solid, "ml-1 h-11 px-4 text-sm max-sm:hidden")}>
            {m.landing_create_account()}
          </a>
        </nav>

        <div className="pt-6 pb-16 lg:pt-4 lg:pb-14">
          <h1 className={cn(display, "text-[clamp(2.5rem,5.6vw,5rem)] leading-[0.92] tracking-[-0.04em]")}>
            <ParaglideMessage
              message={m.landing_hero_title}
              inputs={{}}
              markup={{
                first: ({ children }) => <span className="block">{children}</span>,
                second: ({ children }) => <span className="block">{children}</span>,
              }}
            />
          </h1>

          <div className="mt-8 grid gap-x-12 gap-y-8 lg:mt-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <p className="max-w-[34rem] text-lg leading-relaxed text-pretty text-subtle-foreground">
                {m.landing_hero_lead()}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {m.landing_hero_licence()}
                {demo && (
                  <>
                    {" "}
                    <a href={DEMO_SIGN_IN} className={cn(textLink, "whitespace-nowrap")}>
                      {m.landing_try_demo()}
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-6 lg:justify-self-end">
              <a href={SIGN_UP} className={cn(button, solid)}>
                {m.landing_create_account()}
              </a>
              <a href={SOURCE} className={cn(button, outline)}>
                <GithubLogoIcon className="size-[18px]" aria-hidden="true" /> {m.landing_view_on_github()}
              </a>
            </div>
          </div>

          <div className="relative mt-14 lg:mt-16">
            <div aria-hidden="true" className={cn(coin, "top-24 -right-56 size-[600px]")} />
            <HeroDemo />
          </div>
        </div>
      </div>
    </header>
  )
}

const DEPLOY = `npx wrangler d1 create kosha
# put the database_id and BETTER_AUTH_URL in wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put AI_KEY_SECRET
# photos and attachments use R2; without it, remove r2_buckets
npx wrangler r2 bucket create kosha-avatars
npx wrangler r2 bucket create kosha-attachments
npm run deploy`

/** What comes with an account at getkosha.app, each line true of the app today. */
const FACTS = [
  m.landing_fact_passkeys,
  m.landing_fact_offline,
  m.landing_fact_import,
  m.landing_fact_export,
  m.landing_fact_ai,
  m.landing_fact_currency,
]

const footerLink = "inline-flex min-h-11 items-center rounded-sm hover:text-paper"

function Closing({ demo }: { demo: boolean }) {
  return (
    <footer className="relative isolate overflow-hidden bg-peacock px-4 pt-20 pb-6 text-paper [--ring-on:var(--color-paper)] sm:px-8 md:px-12 lg:pt-28">
      <div aria-hidden="true" className={cn(coin, "top-16 -right-40 size-[440px]")} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col">
        <h2
          className={cn(display, "max-w-[14ch] text-[clamp(2.75rem,6.6vw,5.5rem)] leading-[0.92] tracking-[-0.04em]")}
        >
          {m.landing_closing_title()}
        </h2>
        <p className={cn("mt-6 max-w-[36rem] text-lg leading-relaxed text-pretty", quiet.peacock)}>
          {m.landing_closing_lead()}
        </p>

        <div className="mt-14 grid gap-x-12 gap-y-12 lg:mt-16 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl bg-paper p-6 text-ink [--ring-on:var(--color-ink)] sm:p-8">
            <h3 className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">
              {m.landing_hosted_title()}
            </h3>
            <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-pretty text-ink/75">
              {m.landing_hosted_body()}
            </p>
            <ul className="mt-6 grid gap-x-6 sm:grid-cols-2">
              {FACTS.map((f) => (
                <li key={f()} className="flex min-h-11 items-center gap-2.5 border-t border-ink/10 text-[15px]">
                  <CheckIcon weight="bold" className="size-4 shrink-0 text-peacock" aria-hidden="true" />
                  {f()}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
              <a href={SIGN_UP} className={cn(button, "bg-ink text-paper hover:bg-ink/85")}>
                {m.landing_create_account()}
              </a>
              {demo && (
                <a href={DEMO_SIGN_IN} className={cn(textLink, "text-sm")}>
                  {m.landing_try_demo()}
                </a>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col lg:py-8">
            <h3 className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">
              {m.landing_self_host_title()}
            </h3>
            <p className={cn("mt-2 max-w-[44ch] text-[15px] leading-relaxed text-pretty", quiet.peacock)}>
              {m.landing_self_host_body()}
            </p>
            <pre
              tabIndex={0}
              aria-label={m.landing_self_host_commands_label()}
              className="mt-5 overflow-x-auto rounded-xl bg-peacock-night/70 px-5 py-4 font-mono text-[13px] leading-[1.9] text-paper/95"
            >
              {DEPLOY}
            </pre>
            <div className="mt-auto pt-6">
              <a href={SOURCE} className={cn(button, "border border-paper/40 hover:border-paper")}>
                <GithubLogoIcon className="size-[18px]" aria-hidden="true" /> {m.landing_view_on_github()}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-20 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-paper/15 pt-4 text-sm text-paper/80 lg:mt-28">
          {/* The mark's paper body is its dark-ground variant. */}
          <span className="dark mr-auto basis-full py-2 sm:basis-auto">
            <KoshaLogo className="text-xl text-paper" />
          </span>
          <a href={SOURCE} className={footerLink}>
            GitHub
          </a>
          <a href={API_DOCS} className={footerLink}>
            {m.landing_footer_api()}
          </a>
          <a href="/privacy" className={footerLink}>
            {m.landing_footer_privacy()}
          </a>
          <a href="/terms" className={footerLink}>
            {m.landing_footer_terms()}
          </a>
          <a href="/login" className={footerLink}>
            {m.landing_sign_in()}
          </a>
          <a href={`${SOURCE}/blob/main/LICENSE`} className={cn(footerLink, "basis-full sm:basis-auto")}>
            {m.landing_footer_licence()}
          </a>
        </div>
      </div>
    </footer>
  )
}
