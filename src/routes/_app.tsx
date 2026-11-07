import { Outlet, createFileRoute, retainSearchParams } from "@tanstack/react-router"
import { z } from "zod"
import { getMeta, guestVisit, type Meta } from "@/lib/api"
import { AppShell } from "@/components/shell"
import { Landing } from "@/components/landing"
import { SITE, publicHead } from "@/lib/core"

// Month and display currency are app-wide. The shell's stepper and switch set them, and every page reads them.
// A malformed value is dropped rather than failing the page, which the public landing page shares.
const appSearch = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  currency: z
    .string()
    .regex(/^[a-z]{3,6}$/)
    .optional()
    .catch(undefined),
})

// This layout wraps every signed-in page. /login sits outside it, so it never loads account data.
// The one exception is a signed-out visit to /, which renders the landing page here instead of the app.
export const Route = createFileRoute("/_app")({
  validateSearch: appSearch,
  search: { middlewares: [retainSearchParams(["month", "currency"])] },
  beforeLoad: async ({ location }) => ({ guest: location.pathname === "/" ? await guestVisit() : null }),
  // A guest never renders anything that reads the meta, so the cast only skips the fetch.
  loader: ({ context }) => (context.guest ? (null as unknown as Meta) : getMeta()),
  head: ({ match }) => (match.context.guest ? landingHead() : {}),
  component: AppLayout,
})

const DESCRIPTION =
  "Add each payment in a few seconds, then see where the month went. A free, open-source personal finance tracker for every account, in any currency."

/** The landing page's title, canonical URL and structured data for search engines. */
function landingHead() {
  const head = publicHead("/", "Kosha · Personal finance, a few seconds at a time", DESCRIPTION)
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Kosha",
    url: SITE,
    description: DESCRIPTION,
    image: `${SITE}/og.png`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  }
  return { ...head, meta: [...head.meta, { "script:ld+json": app }] }
}

function AppLayout() {
  const { guest } = Route.useRouteContext()
  if (guest) return <Landing demo={guest.demo} />
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
