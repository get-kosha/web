import { createFileRoute, redirect } from "@tanstack/react-router"

// Moved to Settings › Sign-in & security; old links still land there.
export const Route = createFileRoute("/_app/account")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "security" }, replace: true })
  },
})
