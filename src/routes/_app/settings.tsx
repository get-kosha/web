import { Outlet, createFileRoute } from "@tanstack/react-router"
import { SettingsLayout } from "@/components/settings/layout"
import { accountSummary } from "@/lib/api"

export const Route = createFileRoute("/_app/settings")({
  loader: () => accountSummary(),
  head: () => ({ meta: [{ title: "Settings · Kosha" }] }),
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
