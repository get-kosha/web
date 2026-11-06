import { createFileRoute, redirect } from "@tanstack/react-router"

// This page moved to Settings › Sign-in & security. The redirect keeps old links working.
export const Route = createFileRoute("/_app/account")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "security" }, replace: true })
  },
})
