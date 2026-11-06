import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // A page whose data isn't cached yet shows its skeleton after 150ms instead of the router's 1s,
    // and keeps it at least 300ms so a load that just misses the cutoff doesn't blink.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
