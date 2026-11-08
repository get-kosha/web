import { createFileRoute } from "@tanstack/react-router"
import { AuthHeader, AuthShell } from "@/components/auth"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/auth/error")({
  head: () => ({ meta: [{ title: m.auth_error_page_title() }, { name: "robots", content: "noindex" }] }),
  component: AuthError,
})

function AuthError() {
  return (
    <AuthShell phone="focused">
      <AuthHeader focus title={m.auth_error_title()}>
        {m.auth_error_body()}
      </AuthHeader>
      <Button size="auth" render={<a href="/login" />} nativeButton={false} className="max-md:mt-auto">
        {m.auth_back_to_sign_in()}
      </Button>
    </AuthShell>
  )
}
