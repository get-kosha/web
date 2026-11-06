// The page a signed-out visitor sees at /. The _app layout renders it in place of the app.
import type { ReactNode } from "react"
import { ArrowRightIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr"
import { KoshaLogo } from "@/components/kosha-mark"
import {
  AccountsDemo,
  ApiDemo,
  ArrowLink,
  OverviewDemo,
  PhoneDemo,
  QuickAddDemo,
  RecurringDemo,
} from "@/components/landing-demos"
import { cn } from "@/lib/utils"

const SOURCE = "https://github.com/amruthpillai/kosha"
const SIGN_UP = "/login?mode=up"
// Opens /login with the shared demo account filled in.
const DEMO_SIGN_IN = "/login?demo=1"
const API_DOCS = "/api/v1/docs"

const button =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium whitespace-nowrap transition-[translate,scale,background-color,border-color] duration-150 ease-out motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.97] max-sm:w-full"
const solid = "bg-foreground text-background hover:bg-foreground/85"
const outline = "border border-current/20 hover:border-current/45"
const onBrand = "bg-marigold text-[#111113] hover:bg-[#f7b648]"
const h2 = "font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[0.98] font-bold tracking-[-0.035em] text-balance"
const lead = "mt-5 max-w-[34rem] text-[17px] leading-relaxed text-pretty"
// Paper in light mode; in dark mode a near-black tinted with peacock, so the brand still carries the page.
const paper = "bg-paper dark:bg-[#0c1716]"
const split = "grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:gap-16"

function Section({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("px-4 py-20 sm:px-8 md:px-12 lg:py-28", className)}>
      <div className="mx-auto w-full max-w-[1240px]">{children}</div>
    </section>
  )
}

/** `demo`: this deployment has the demo account, so the page offers it ahead of signing up. */
export function Landing({ demo }: { demo: boolean }) {
  return (
    // data-landing and data-demo also tell the router, on the client, that this visitor is signed out (guestVisit in api.ts).
    <div data-landing="" data-demo={demo ? "1" : "0"} className="font-sans antialiased">
      <Hero demo={demo} />
      <main>
        <Section id="quick-add" className="bg-peacock text-paper">
          <div className={cn(split, "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
            <div className="lg:pt-8">
              <h2 id="quick-add-title" className={h2}>
                Add a payment in one line
              </h2>
              <p className={cn(lead, "text-paper/80")}>
                Type it the way you would say it. Kosha reads the amount, date and account, and guesses the category
                from what you entered before.
              </p>
            </div>
            <QuickAddDemo />
          </div>
        </Section>

        <Section id="currencies" className={paper}>
          <div className={cn(split, "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
            <div className="lg:order-2 lg:pt-8">
              <h2 id="currencies-title" className={h2}>
                One net worth across currencies
              </h2>
              <p className={cn(lead, "text-subtle-foreground")}>
                Each account keeps its own currency, and totals convert at rates refreshed every day. Credit cards count
                what you owe. Exchanges show what the provider&apos;s rate cost you.
              </p>
            </div>
            <AccountsDemo />
          </div>
        </Section>

        <Section id="phone" className="bg-marigold text-[#111113]">
          <div className={cn(split, "lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]")}>
            <div className="lg:pt-8">
              <h2 id="phone-title" className={h2}>
                Quick entry on your phone
              </h2>
              <p className={cn(lead, "text-[#111113]/80")}>
                Install Kosha from your phone&apos;s browser, on iPhone or Android. It opens straight to a new entry,
                with the amount first and your usual category at the front.
              </p>
            </div>
            <PhoneDemo />
          </div>
        </Section>

        <Section id="recurring" className={paper}>
          <div className={cn(split, "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
            <div className="lg:order-2 lg:pt-8">
              <h2 id="recurring-title" className={h2}>
                Bills and subscriptions on a schedule
              </h2>
              <p className={cn(lead, "text-subtle-foreground")}>
                Set a schedule once. Kosha records each payment on the day it falls due, and you can skip or change one
                payment without touching the rest.
              </p>
            </div>
            <RecurringDemo />
          </div>
        </Section>

        <Section id="api" className="bg-[#111113] text-[#f3f3f4] dark:bg-[#050506]">
          <div className={cn(split, "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
            <div className="lg:pt-8">
              <h2 id="api-title" className={h2}>
                An API and MCP server for your data
              </h2>
              <p className={cn(lead, "text-white/75")}>
                Everything you can do in the app is also a REST endpoint and a tool for Claude, ChatGPT and Cursor.
              </p>
              <ArrowLink href={API_DOCS} className="mt-6 text-[15px] text-marigold">
                Read the API reference
              </ArrowLink>
            </div>
            <ApiDemo />
          </div>
        </Section>
      </main>
      <Closing demo={demo} />
    </div>
  )
}

function Hero({ demo }: { demo: boolean }) {
  return (
    <header className={cn("relative isolate overflow-hidden px-4 sm:px-8 md:px-12", paper)}>
      {/* The coin from the mark, sat behind the app window. */}
      <div
        aria-hidden="true"
        className="absolute top-[132px] right-[-220px] -z-10 size-[620px] rounded-full bg-marigold max-lg:top-auto max-lg:right-[-180px] max-lg:bottom-[-140px] max-lg:size-[440px]"
      />
      <div className="mx-auto flex min-h-svh w-full max-w-[1240px] flex-col">
        <nav aria-label="Main" className="flex h-[76px] items-center gap-1">
          <a href="/" aria-label="Kosha home" className="mr-auto inline-flex h-11 items-center rounded-md">
            <KoshaLogo className="text-[26px] text-[#111113] dark:text-paper" />
          </a>
          <a
            href={SOURCE}
            aria-label="View the source code"
            className="inline-flex size-11 items-center justify-center rounded-lg text-subtle-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <GithubLogoIcon className="size-5" />
          </a>
          <a
            href="/login"
            className="inline-flex h-11 items-center rounded-lg px-3 text-sm text-subtle-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Sign in
          </a>
          <a href={demo ? DEMO_SIGN_IN : SIGN_UP} className={cn(button, solid, "ml-1 h-10 px-4 text-sm max-sm:hidden")}>
            {demo ? "Try the demo" : "Create an account"}
          </a>
        </nav>

        <div className="grid flex-1 items-center gap-10 pt-6 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14 lg:pt-0 lg:pb-16">
          <div className="max-w-[560px]">
            <h1 className="font-display text-[clamp(2.6rem,5vw,4.25rem)] leading-[0.96] font-bold tracking-[-0.04em] text-balance text-[#111113] dark:text-paper">
              Personal finance tracker for every account and currency
            </h1>
            <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-pretty text-subtle-foreground">
              Kosha keeps bank accounts, cash, cards and investments in one place, converted at daily rates. Log
              spending on your phone and see how the month is going on your desktop. Free and open source, MIT licensed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {demo ? (
                <>
                  <a href={DEMO_SIGN_IN} className={cn(button, solid)}>
                    Try the demo <ArrowRightIcon className="size-[18px]" />
                  </a>
                  <a href={SIGN_UP} className={cn(button, outline)}>
                    Create an account
                  </a>
                </>
              ) : (
                <>
                  <a href={SIGN_UP} className={cn(button, solid)}>
                    Create an account
                  </a>
                  <a href={SOURCE} className={cn(button, outline)}>
                    <GithubLogoIcon className="size-[18px]" /> View the source code
                  </a>
                </>
              )}
            </div>
            {demo && (
              <p className="mt-4 text-sm text-muted-foreground">
                The demo is a shared account with 14 months of sample data. You can look around, but not change it.
              </p>
            )}
          </div>
          <OverviewDemo />
        </div>
      </div>
    </header>
  )
}

const DEPLOY = `npx wrangler d1 create kosha
# put the database_id and BETTER_AUTH_URL in wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put AI_KEY_SECRET
npm run deploy`

const footerLink = "inline-flex min-h-11 items-center hover:text-paper"

function Closing({ demo }: { demo: boolean }) {
  return (
    <footer className="bg-peacock px-4 pt-20 pb-6 text-paper sm:px-8 md:px-12 lg:pt-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col">
        <div className={cn(split, "lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]")}>
          <div>
            <h2 className={h2}>Free and open source</h2>
            <p className={cn(lead, "text-paper/80")}>
              Kosha is MIT licensed and runs on one Cloudflare Worker with a D1 database. Use it here, or deploy your
              own copy. The README has every step.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={demo ? DEMO_SIGN_IN : SIGN_UP} className={cn(button, onBrand)}>
                {demo ? "Try the demo" : "Create an account"}
              </a>
              <a href={demo ? SIGN_UP : SOURCE} className={cn(button, outline)}>
                {demo ? (
                  "Create an account"
                ) : (
                  <>
                    <GithubLogoIcon className="size-[18px]" /> View the source code
                  </>
                )}
              </a>
            </div>
          </div>
          <div>
            <p className="text-sm text-paper/75">Deploy your own</p>
            <pre
              tabIndex={0}
              aria-label="Commands to deploy your own copy"
              className="mt-2 overflow-x-auto rounded-2xl bg-black/25 px-5 py-4 font-mono text-[13px] leading-[1.9] text-paper/95"
            >
              {DEPLOY}
            </pre>
          </div>
        </div>

        <div className="mt-20 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-paper/15 pt-4 text-sm text-paper/80 lg:mt-28">
          {/* The mark's paper body is its dark-ground variant. */}
          <span className="dark mr-auto basis-full py-2 sm:basis-auto">
            <KoshaLogo className="text-xl text-paper" />
          </span>
          <a href={SOURCE} className={footerLink}>
            View the source code
          </a>
          <a href={API_DOCS} className={footerLink}>
            Read the API reference
          </a>
          <a href="/login" className={footerLink}>
            Sign in
          </a>
          <span className="basis-full py-2 text-paper/80 sm:basis-auto">© 2026 Kosha · MIT licence</span>
        </div>
      </div>
    </footer>
  )
}
