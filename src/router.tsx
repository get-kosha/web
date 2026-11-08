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

  // The skeleton is for arriving at a page. When the same page reloads for new search params (a search,
  // a filter, the month), keep it on screen, or the skeleton hides it and takes focus and scroll with it.
  router.subscribe("onBeforeNavigate", ({ pathChanged }) => {
    router.options.defaultPendingMs = pathChanged ? 150 : Infinity
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
