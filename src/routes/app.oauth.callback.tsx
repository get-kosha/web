import { createFileRoute, useLocation } from "@tanstack/react-router"
import { DeviceMobileIcon } from "@phosphor-icons/react/ssr"
import { AuthHeader, AuthShell, IconTile } from "@/components/auth"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

// Kosha's phone apps sign in with this page as their redirect (APP_CALLBACK in auth.server.ts). A phone that
// has verified the app's link hands it straight to the app, so the page never shows. It shows when the app
// didn't claim the link, say on a server without /.well-known/assetlinks.json. It then offers the app's own
// URL scheme, but any app can register that scheme, so the code goes on only when the person taps.
export const Route = createFileRoute("/app/oauth/callback")({
  head: () => ({ meta: [{ title: m.auth_app_callback_page_title() }, { name: "robots", content: "noindex" }] }),
  component: AppCallback,
})

function AppCallback() {
  // Everything Better Auth sent (code, state and iss, or an error) goes to the app unchanged.
  const search = useLocation({ select: (l) => l.searchStr })
  return (
    <AuthShell phone="focused">
      <AuthHeader
        focus
        title={m.auth_app_callback_title()}
        icon={
          <IconTile>
            <DeviceMobileIcon />
          </IconTile>
        }
      >
        {m.auth_app_callback_body()}
      </AuthHeader>
      <Button
        size="auth"
        render={<a href={`app.getkosha:/oauth/callback${search}`} />}
        nativeButton={false}
        className="max-md:mt-auto"
      >
        {m.auth_app_callback_open()}
      </Button>
    </AuthShell>
  )
}
