// The frame for /privacy and /terms: plain prose on the app's own tokens, outside the signed-in app.
import type { ReactNode } from "react"
import { KoshaLogo } from "@/components/kosha-mark"

export const SOURCE = "https://github.com/amruthpillai/kosha"
/** Where private questions go: the maintainer's GitHub profile lists a contact address. */
export const MAINTAINER = "https://github.com/amruthpillai"

const prose =
  "text-[15px] leading-relaxed text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      {/* A full page load, so a signed-out visitor gets the landing page back. */}
      <a href="/" className="inline-block rounded-md">
        <KoshaLogo className="text-[28px]" />
      </a>
      <h1 className="mt-10 font-display text-4xl font-bold tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className={prose}>{children}</div>
      <nav
        aria-label="Legal"
        className="mt-16 flex flex-wrap gap-x-6 border-t pt-4 text-sm text-muted-foreground [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:hover:text-foreground"
      >
        <a href="/">Home</a>
        <a href="/privacy">Privacy policy</a>
        <a href="/terms">Terms of service</a>
        <a href={`${SOURCE}/blob/main/LICENSE`}>MIT licence</a>
      </nav>
    </main>
  )
}
