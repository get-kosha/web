import { Outlet, createFileRoute } from "@tanstack/react-router"
import { SettingsLayout } from "@/components/settings/layout"
import { accountSummary } from "@/lib/api"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_app/settings")({
  loader: () => accountSummary(),
  head: () => ({ meta: [{ title: `${m.settings_title()} · Kosha` }] }),
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
