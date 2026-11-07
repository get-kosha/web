import { useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { InfoIcon } from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { z } from "zod"
import { AuthField, AuthHeader, AuthShell } from "@/components/auth"
import { ResetRequest } from "@/components/password-reset"
import { Button } from "@/components/ui/button"
import { getResetLink } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { MIN_PASSWORD } from "@/lib/core"
import { m } from "@/paraglide/messages"

// The link in the reset email opens this with ?token=. Better Auth's own callback lands here with
// ?error=INVALID_TOKEN instead when a link is bad; both, and a missing token, show the expired screen.
export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    token: z.string().max(200).optional().catch(undefined),
    error: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) =>
    deps.token ? getResetLink({ data: { token: deps.token } }) : { valid: false, email: null as string | null },
  head: () => ({ meta: [{ title: m.auth_reset_page_title() }, { name: "robots", content: "noindex" }] }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token } = Route.useSearch()
  const link = Route.useLoaderData()
  const [expired, setExpired] = useState(!token || !link.valid)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (expired) return <ResetRequest variant="expired" email={link.email ?? ""} />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await authClient
      .resetPassword({ newPassword: password, token: token! })
      .catch(() => ({ error: { status: 0, code: undefined, message: undefined } }))
    setBusy(false)
    // A full page load: the reset signed out every session, this browser's included.
    if (!res.error) return window.location.assign("/login?reset=1")
    if (res.error.code === "INVALID_TOKEN" || res.error.code === "USER_NOT_FOUND") return setExpired(true)
    setError(
      res.error.status === 429
        ? m.auth_error_rate_limited()
        : res.error.status === 0
          ? m.auth_error_offline()
          : res.error.code === "PASSWORD_TOO_SHORT"
            ? m.auth_error_password_short({ min: MIN_PASSWORD })
            : res.error.code === "PASSWORD_TOO_LONG"
              ? m.auth_error_password_long()
              : m.auth_error_generic()
    )
  }

  return (
    <AuthShell phone="focused">
      <AuthHeader title={m.auth_set_new_password()}>
        {link.email && (
          <ParaglideMessage
            message={m.auth_for_email}
            inputs={{ email: link.email }}
            markup={{ strong: ({ children }) => <strong>{children}</strong> }}
          />
        )}
      </AuthHeader>
      <form method="post" onSubmit={submit} className="flex flex-1 flex-col gap-[18px] md:flex-none">
        {/* Tells password managers which login the new password belongs to. */}
        {link.email && (
          <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
        )}
        <AuthField
          id="new-password"
          name="password"
          type="password"
          label={m.auth_new_password()}
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError("")
          }}
          meter
          error={error}
        />
        <div className="flex gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-[19px] text-subtle-foreground">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{m.auth_reset_signs_out()}</p>
        </div>
        <Button type="submit" size="auth" disabled={busy || password.length < MIN_PASSWORD} className="max-md:mt-auto">
          {m.auth_save_new_password()}
        </Button>
      </form>
    </AuthShell>
  )
}
