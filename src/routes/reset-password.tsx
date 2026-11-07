import { useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { InfoIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { AuthField, AuthHeader, AuthShell } from "@/components/auth"
import { ResetRequest } from "@/components/password-reset"
import { Button } from "@/components/ui/button"
import { getResetLink } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { MIN_PASSWORD } from "@/lib/core"

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
  head: () => ({ meta: [{ title: "Set a new password · Kosha" }, { name: "robots", content: "noindex" }] }),
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
        ? "Too many tries. Wait a minute, then try again."
        : res.error.status === 0
          ? "Kosha couldn't be reached. Check your connection, then try again."
          : res.error.code === "PASSWORD_TOO_SHORT"
            ? `Use at least ${MIN_PASSWORD} characters.`
            : res.error.message || "Something went wrong. Try again."
    )
  }

  return (
    <AuthShell phone="focused">
      <AuthHeader title="Set a new password">
        {link.email && (
          <>
            For <strong>{link.email}</strong>.
          </>
        )}
      </AuthHeader>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-[18px] md:flex-none">
        {/* Tells password managers which login the new password belongs to. */}
        {link.email && (
          <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
        )}
        <AuthField
          id="new-password"
          name="password"
          type="password"
          label="New password"
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
          <p>Saving signs Kosha out on your other devices. Passkeys and two-factor stay as they are.</p>
        </div>
        <Button type="submit" size="auth" disabled={busy || password.length < MIN_PASSWORD} className="max-md:mt-auto">
          Save new password
        </Button>
      </form>
    </AuthShell>
  )
}
