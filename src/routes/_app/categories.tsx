import { createFileRoute, redirect } from "@tanstack/react-router"

// Moved to Settings › Categories; old links still land there.
export const Route = createFileRoute("/_app/categories")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "categories" }, replace: true })
  },
})
