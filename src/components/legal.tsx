// The frame for /privacy, /terms and /delete-account: plain prose on the app's own tokens, outside the signed-in app.
import type { ReactNode } from "react"
import { KoshaLogo } from "@/components/kosha-mark"
import { intlLocale } from "@/lib/core"
import { m } from "@/paraglide/messages"

export const SOURCE = "https://github.com/amruthpillai/kosha"
/** Where private questions go: the maintainer's GitHub profile lists a contact address. */
export const MAINTAINER = "https://github.com/amruthpillai"
export const LICENSE = `${SOURCE}/blob/main/LICENSE`
export const SUPPORT = "support@getkosha.app"

/** Markup renderers for the pages' messages: `{#strong}…{/strong}` and links. */
export const strong = ({ children }: { children?: ReactNode }) => <strong>{children}</strong>
export const linkTo =
  (href: string) =>
  ({ children }: { children?: ReactNode }) => <a href={href}>{children}</a>

const prose =
  "text-[15px] leading-relaxed text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"

/** `updated` is an ISO day, shown in the reader's language. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const date = new Date(`${updated}T00:00:00Z`).toLocaleDateString(intlLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      {/* A full page load, so a signed-out visitor gets the landing page back. */}
      <a href="/" className="inline-block rounded-md">
        <KoshaLogo className="text-[28px]" />
      </a>
      <h1 className="mt-10 font-display text-4xl font-bold tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.legal_updated({ date })}</p>
      <div className={prose}>{children}</div>
      <nav
        aria-label={m.legal_nav_label()}
        className="mt-16 flex flex-wrap gap-x-6 border-t pt-4 text-sm text-muted-foreground [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:hover:text-foreground"
      >
        <a href="/">{m.legal_nav_home()}</a>
        <a href="/privacy">{m.legal_privacy_title()}</a>
        <a href="/terms">{m.legal_terms_title()}</a>
        <a href="/delete-account">{m.legal_delete_title()}</a>
        <a href={LICENSE}>{m.legal_nav_license()}</a>
      </nav>
    </main>
  )
}
