import { useEffect } from "react"
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
import { splashLinks } from "@/lib/splash"
import { themeScript } from "@/lib/theme"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#F6F6F4" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0B0B0C" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Kosha" },
      { title: "Kosha" },
      {
        name: "description",
        content:
          "Add each payment in a few seconds, then see where the month went. A free, open-source personal finance tracker for every account, in any currency.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Kosha" },
      { property: "og:title", content: "Kosha" },
      { property: "og:description", content: "Personal finance, a few seconds at a time." },
      // ponytail: hard-coded production origin, so self-hosted copies share getkosha.app's card image
      { property: "og:url", content: "https://getkosha.app" },
      { property: "og:image", content: "https://getkosha.app/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ...splashLinks,
    ],
  }),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">
      <p>Page not found.</p>
      <Link to="/" className="mt-2 inline-block text-foreground underline underline-offset-4">
        Go to Overview
      </Link>
    </div>
  ),
  errorComponent: RouteError,
  component: Outlet,
  shellComponent: ({ children }) => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Toaster position="top-center" />
        <Scripts />
      </body>
    </html>
  ),
})

// fetch's network error in Chrome, Safari and Firefox.
const NETWORK_ERROR = /failed to fetch|load failed|networkerror/i

function RouteError({ error }: { error: unknown }) {
  // Offline, moving to another page fails because its data can't be fetched. The service worker may
  // still have the whole page saved, so load it as a document. Once per address, so it can't loop.
  const offline = typeof navigator !== "undefined" && !navigator.onLine && NETWORK_ERROR.test(String(error))
  useEffect(() => {
    if (!offline) return
    try {
      if (sessionStorage.getItem("kosha:offline-reload") === location.href) return
      sessionStorage.setItem("kosha:offline-reload", location.href)
    } catch {}
    location.reload()
  }, [offline])
  return (
    <div className="p-8 text-sm">
      <p className="font-medium">{offline ? "You're offline" : "Something went wrong"}</p>
      <p className="mt-1 text-muted-foreground">
        {offline
          ? "This page wasn't saved on this device. Open it again once you're back online."
          : error instanceof Error
            ? error.message
            : String(error)}
      </p>
    </div>
  )
}
