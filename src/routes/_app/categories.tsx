import { createFileRoute, redirect } from "@tanstack/react-router"

// This page moved to Settings › Categories. The redirect keeps old links working.
export const Route = createFileRoute("/_app/categories")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "categories" }, replace: true })
  },
})
