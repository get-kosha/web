import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Page not found.</p>,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
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
