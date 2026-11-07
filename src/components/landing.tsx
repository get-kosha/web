// The page a signed-out visitor sees at /. The _app layout renders it in place of the app.
// It tells one story: add each payment in your pocket in seconds, then make sense of it at your desk.
import type { ReactNode } from "react"
import { CheckIcon, GithubLogoIcon, SparkleIcon } from "@phosphor-icons/react/ssr"
import { KoshaLogo } from "@/components/kosha-mark"
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
      <SparkleIcon weight="fill" className="size-3" aria-hidden="true" /> AI
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
            title={`Last week took ${WEEK_STATS.seconds} seconds`}
            lead={`${WEEK_STATS.entries} payments, each written down as it happened, most in about five seconds. You notice what you spend while it's fresh, and the month's totals are right with nothing to piece together later.`}
          />
          <div className="relative mt-14 lg:mt-20">
            <div aria-hidden="true" className={cn(coin, "-bottom-12 -left-28 size-64")} />
            <WeekDemo />
          </div>

          <div className={cn(grid, "mt-16 lg:mt-24")}>
            <Cell
              tone="peacock"
              className="lg:col-span-7"
              title="Type it in one line"
              body="Kosha reads the amount, date and account, and guesses the rest from what you entered before."
            >
              <QuickAddDemo />
            </Cell>
            <Cell
              tone="peacock"
              ai
              className="lg:col-span-5"
              title="Or describe it"
              body="Write it the way you'd say it, and AI fills in the amount, date, payee, category and note."
            >
              <SentenceDemo />
            </Cell>
            <Cell
              tone="peacock"
              className="lg:col-span-5"
              title="Add it offline"
              body="Install Kosha from your phone's browser. New entries you add without a signal sync when you're back online."
            >
              <OfflineDemo />
            </Cell>
            <Cell
              tone="peacock"
              ai
              className="lg:col-span-7"
              title="Snap the receipt"
              body="Kosha reads the payee, amount, date and time, and converts a receipt in another currency at today's rate."
            >
              <ReceiptDemo />
            </Cell>
          </div>
        </Section>

        <Section id="desk" className={paper}>
          <div className={grid}>
            <div className="lg:col-span-7">
              <h2 id="desk-title" className={cn(h2, "max-w-[16ch]")}>
                See the month while it's happening
              </h2>
              <p className={cn("mt-6 max-w-[36rem] text-[17px] leading-relaxed text-pretty", quiet.paper)}>
                Kosha compares each day with your average for the six months before, so by the 10th you know whether
                you're on track.
              </p>
            </div>
            <Cell
              tone="paper"
              ai
              className="lg:col-span-5"
              title="Read a note on last month"
              body="In the first week of each month, Kosha writes what changed and why."
            >
              <RecapDemo />
            </Cell>
          </div>
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <Cell
              tone="paper"
              className="lg:col-span-8"
              title="Compare it with a usual month"
              body="Kosha plots spending so far against your usual pace and projects where the month will end. Switch the month or the currency."
            >
              <OverviewDemo />
            </Cell>
            <Cell
              tone="paper"
              ai
              className="lg:col-span-4"
              title="Ask about your money"
              body="Answers come from your own entries, with links to the ones behind them."
            >
              <AskDemo />
            </Cell>
            <Cell
              tone="paper"
              className="lg:col-span-8"
              title="See what's still to pay"
              body="Set a schedule once. Kosha records a fixed amount on the day it's due and asks you when the amount varies. Skip or change any one payment."
            >
              <RecurringDemo />
            </Cell>
            <Cell
              tone="paper"
              className="lg:col-span-4"
              title="Clear what needs attention"
              body="Kosha flags a card to pay off, a bill not marked paid, a category above its usual and a value that's out of date."
            >
              <AttentionDemo />
            </Cell>
          </div>
        </Section>

        <Section id="statements" className="bg-marigold text-ink [--ring-on:var(--color-ink)]">
          <ChapterHead
            id="statements"
            tone="marigold"
            title="Once a month, check it against the bank"
            lead="Import a year of statements to start, and Kosha knows your usual month from day one. Each month after, it ticks off what matches and lists what's missing."
          />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <div className="flex flex-col gap-12 lg:col-span-5">
              <Cell
                tone="marigold"
                title="Import every statement at once"
                body="Kosha reads CSV, OFX and QFX files, and PDFs when AI is on. Bank text turns into payees you recognise."
              >
                <ImportDemo />
              </Cell>
              <Cell
                tone="marigold"
                title="Spot the bills you haven't set up"
                body="Kosha spots payees you pay on a steady rhythm. Make one recurring, and its past payments are filed under it."
              >
                <SpottedDemo />
              </Cell>
            </div>
            {/* The reconciliation stays in view while the import and spotted payments scroll past it. */}
            <div className="lg:sticky lg:top-8 lg:col-span-7 lg:self-start">
              <Cell
                tone="marigold"
                title="Find out why it doesn't add up"
                body="When the difference isn't zero, Kosha runs a bookkeeper's checks, like swapped digits, a wrong sign or a duplicate. Try fixing this one."
              >
                <ReconcileDemo />
              </Cell>
            </div>
          </div>
        </Section>

        <Section id="accounts" className={paper}>
          <ChapterHead
            id="accounts"
            tone="paper"
            title="Every account in one net worth"
            lead="Kosha adds up bank accounts, cash, cards and investments, each in its own currency, at daily exchange rates. Cards count what you owe, and investments count what you put in plus their latest gain."
          />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <div className="lg:col-span-6">
              <NetWorthDemo />
            </div>
            <div className="flex flex-col gap-12 lg:col-span-6">
              <Cell
                tone="paper"
                title="See what an exchange cost"
                body="Kosha adds the fee to what the provider's rate lost against the market rate that day."
              >
                <ExchangeDemo />
              </Cell>
              <div className="grid flex-1 gap-x-6 gap-y-12 sm:grid-cols-2">
                <Cell
                  tone="paper"
                  title="See what a trip cost"
                  body="Create an event with the trip's dates, and new entries in that range join it."
                >
                  <TripDemo />
                </Cell>
                <Cell tone="paper" title="Move money" body="Transfers between your accounts never count as spending.">
                  <TransferDemo />
                </Cell>
              </div>
            </div>
          </div>
        </Section>

        <Section id="ai" className="bg-ink text-chalk [--ring-on:var(--color-chalk)] dark:bg-ink-deep">
          <ChapterHead
            id="ai"
            tone="ink"
            title="AI with your own key"
            lead="Every AI feature is optional and runs on your provider: Anthropic, OpenAI, Gemini, OpenRouter, Ollama or any OpenAI-compatible endpoint. Turn on only what you want."
          />
          <div className={cn(grid, "mt-14 lg:mt-20")}>
            <Cell
              tone="ink"
              className="lg:col-span-6"
              title="Choose what AI can see"
              body="Switch payee names off and Kosha sends a code instead, then puts the real name back in the reply."
            >
              <AiSeesDemo />
            </Cell>
            <Cell
              tone="ink"
              className="lg:col-span-6"
              title="Use it from Claude, ChatGPT or Cursor"
              body={
                <>
                  Accounts, entries, recurring payments and statements are also MCP tools and REST endpoints.{" "}
                  <a href={API_DOCS} className={cn(textLink, "text-chalk")}>
                    Read the API reference
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
        <nav aria-label="Main" className="flex h-[76px] items-center gap-1">
          <a
            href="/"
            aria-label="Kosha home"
            className="mr-auto inline-flex h-11 items-center rounded-md transition-opacity hover:opacity-75"
          >
            <KoshaLogo className="text-[26px] text-foreground" />
          </a>
          <a href={SOURCE} className={navLink}>
            <GithubLogoIcon className="size-5" aria-hidden="true" />
            <span className="max-sm:sr-only">GitHub</span>
          </a>
          <a href="/login" className={navLink}>
            Sign in
          </a>
          <a href={SIGN_UP} className={cn(button, solid, "ml-1 h-11 px-4 text-sm max-sm:hidden")}>
            Create an account
          </a>
        </nav>

        <div className="pt-6 pb-16 lg:pt-4 lg:pb-14">
          <h1 className={cn(display, "text-[clamp(2.5rem,5.6vw,5rem)] leading-[0.92] tracking-[-0.04em]")}>
            <span className="block">Personal finance,</span>
            <span className="block">a few seconds at a time</span>
          </h1>

          <div className="mt-8 grid gap-x-12 gap-y-8 lg:mt-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <p className="max-w-[34rem] text-lg leading-relaxed text-pretty text-subtle-foreground">
                Add each payment on your phone as you pay. At your desk, see how the month is going and check it against
                your bank.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Free and open source, MIT licensed.
                {demo && (
                  <>
                    {" "}
                    <a href={DEMO_SIGN_IN} className={cn(textLink, "whitespace-nowrap")}>
                      Try the demo account
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-6 lg:justify-self-end">
              <a href={SIGN_UP} className={cn(button, solid)}>
                Create an account
              </a>
              <a href={SOURCE} className={cn(button, outline)}>
                <GithubLogoIcon className="size-[18px]" aria-hidden="true" /> View on GitHub
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
  "Passkeys and two-factor codes",
  "Add entries offline on your phone",
  "Import CSV, OFX and QFX files",
  "Export to CSV or JSON, any time",
  "AI only with your own key",
  "Any currency, at daily rates",
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
          Start with the next thing you buy
        </h2>
        <p className={cn("mt-6 max-w-[36rem] text-lg leading-relaxed text-pretty", quiet.peacock)}>
          Kosha is free and open source under the MIT licence. Use it here, or run your own copy on Cloudflare.
        </p>

        <div className="mt-14 grid gap-x-12 gap-y-12 lg:mt-16 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl bg-paper p-6 text-ink [--ring-on:var(--color-ink)] sm:p-8">
            <h3 className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">Use getkosha.app</h3>
            <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-pretty text-ink/75">
              Your account, in your browser and on your phone. Nothing to install from a store.
            </p>
            <ul className="mt-6 grid gap-x-6 sm:grid-cols-2">
              {FACTS.map((f) => (
                <li key={f} className="flex min-h-11 items-center gap-2.5 border-t border-ink/10 text-[15px]">
                  <CheckIcon weight="bold" className="size-4 shrink-0 text-peacock" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
              <a href={SIGN_UP} className={cn(button, "bg-ink text-paper hover:bg-ink/85")}>
                Create an account
              </a>
              {demo && (
                <a href={DEMO_SIGN_IN} className={cn(textLink, "text-sm")}>
                  Try the demo account
                </a>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col lg:py-8">
            <h3 className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">Run your own copy</h3>
            <p className={cn("mt-2 max-w-[44ch] text-[15px] leading-relaxed text-pretty", quiet.peacock)}>
              One Cloudflare Worker and a D1 database. The README has every step, including a script that imports a
              Cashew backup.
            </p>
            <pre
              tabIndex={0}
              aria-label="Commands to deploy your own copy"
              className="mt-5 overflow-x-auto rounded-xl bg-peacock-night/70 px-5 py-4 font-mono text-[13px] leading-[1.9] text-paper/95"
            >
              {DEPLOY}
            </pre>
            <div className="mt-auto pt-6">
              <a href={SOURCE} className={cn(button, "border border-paper/40 hover:border-paper")}>
                <GithubLogoIcon className="size-[18px]" aria-hidden="true" /> View on GitHub
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
            API reference
          </a>
          <a href="/privacy" className={footerLink}>
            Privacy
          </a>
          <a href="/terms" className={footerLink}>
            Terms
          </a>
          <a href="/login" className={footerLink}>
            Sign in
          </a>
          <a href={`${SOURCE}/blob/main/LICENSE`} className={cn(footerLink, "basis-full sm:basis-auto")}>
            © 2026 Kosha, MIT licence
          </a>
        </div>
      </div>
    </footer>
  )
}
