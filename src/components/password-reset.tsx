// Asking for a reset link: /forgot-password, and /reset-password when its link has expired.
// Both end on "Check your email", which says the same thing whether or not the address has an account.
import { useEffect, useState, type FormEvent } from "react"
import { ClockCountdownIcon, EnvelopeSimpleIcon, KeyIcon } from "@phosphor-icons/react/ssr"
import { cn } from "cn"
import { AuthError, AuthField, AuthHeader, AuthShell, IconTile, linkClass, optionClass } from "@/components/auth"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

const RESEND_AFTER = 60

/** Asks for a link. Null means it went out, or would have: only a rate limit or no connection is an error. */
async function requestLink(email: string) {
  const res = await authClient
    .requestPasswordReset({ email, redirectTo: "/reset-password" })
    .catch(() => ({ error: { status: 0 } }))
  if (!res.error) return null
  if (res.error.status === 429) return "Too many requests. Wait a minute, then try again."
  if (res.error.status === 0) return "Kosha couldn't be reached. Check your connection, then try again."
  return null
}

export function ResetRequest({ variant, email: initial }: { variant: "forgot" | "expired"; email: string }) {
  const [email, setEmail] = useState(initial)
  const [sent, setSent] = useState(false)
  // Focus moves to the title only after a step change, not on the first load.
  const [moved, setMoved] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const failed = await requestLink(email.trim())
    setBusy(false)
    if (failed) return setError(failed)
    setMoved(true)
    setSent(true)
  }

  if (sent)
    return (
      <CheckEmail
        email={email.trim()}
        onChange={() => {
          setSent(false)
          setError("")
        }}
      />
    )

  const expired = variant === "expired"
  return (
    <AuthShell key="form" phone="focused" back="/login">
      {expired ? (
        <AuthHeader
          focus
          title="This link has expired"
          icon={
            <IconTile>
              <ClockCountdownIcon className="text-warning" />
            </IconTile>
          }
        >
          Reset links work once, for one hour. Your password hasn't changed. Ask for a new link and use the newest
          email.
        </AuthHeader>
      ) : (
        <AuthHeader focus={moved} title="Reset your password">
          Enter the email you use for Kosha. We'll send a link to set a new password.
        </AuthHeader>
      )}

      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 md:flex-none">
        <AuthField
          id="email"
          name="email"
          type="email"
          label="Email"
          required
          autoComplete="username"
          placeholder="you@example.com"
          autoFocus={!expired}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <AuthError>{error}</AuthError>}
        {/* Phones pin the action to the bottom of the screen. */}
        <Button type="submit" size="auth" disabled={busy} className="mt-1 max-md:order-last max-md:mt-auto">
          {expired ? "Send a new link" : "Send reset link"}
        </Button>
        {expired ? (
          <p className="text-sm text-muted-foreground md:mt-3">
            Remembered it?{" "}
            <a href="/login" className={linkClass}>
              Sign in
            </a>
          </p>
        ) : (
          <PasskeyOffer />
        )}
      </form>
    </AuthShell>
  )
}

/** For someone who forgot their password but has a passkey here: sign in with it instead. */
function PasskeyOffer() {
  const [error, setError] = useState("")
  async function signIn() {
    setError("")
    const res = await authClient.signIn.passkey({ autoFill: false }).catch(() => null)
    if (res && !res.error) return window.location.assign("/")
    if ((res?.error as { code?: string } | undefined)?.code !== "AUTH_CANCELLED")
      setError("That passkey didn't work. Try again, or reset your password.")
  }
  return (
    <div className="mt-4 grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3.5 rounded-[14px] border bg-card p-4 max-md:mt-1 max-md:rounded-2xl">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-subtle-foreground">
        <KeyIcon aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            Have a passkey on this <span className="max-md:hidden">device</span>
            <span className="md:hidden">phone</span>?
          </span>
          <span className="text-[13px] leading-[19px] text-muted-foreground">
            Sign in with it instead. No password needed.
          </span>
        </div>
        <Button
          variant="outline"
          className={cn(optionClass, "h-8 self-start rounded-lg px-3 text-[13px] max-md:h-10 max-md:rounded-[10px]")}
          onClick={() => void signIn()}
        >
          Sign in with a passkey
        </Button>
        {error && <AuthError>{error}</AuthError>}
      </div>
    </div>
  )
}

function CheckEmail({ email, onChange }: { email: string; onChange: () => void }) {
  const [left, setLeft] = useState(RESEND_AFTER)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  async function resend() {
    setBusy(true)
    setError("")
    const failed = await requestLink(email)
    setBusy(false)
    if (failed) setError(failed)
    else setLeft(RESEND_AFTER)
  }

  const resendButton = (
    <Button
      variant="outline"
      size="auth"
      disabled={left > 0 || busy}
      onClick={() => void resend()}
      className={cn(
        optionClass,
        "disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 max-md:text-base"
      )}
    >
      {left > 0 ? (
        <>
          Send again in{" "}
          <span className="num text-subtle-foreground">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        </>
      ) : (
        "Send again"
      )}
    </Button>
  )

  return (
    <AuthShell key="sent" phone="focused" back="/login">
      <AuthHeader
        focus
        title="Check your email"
        icon={
          <IconTile badge>
            <EnvelopeSimpleIcon />
          </IconTile>
        }
      >
        If <strong>{email}</strong> has a Kosha account, a link to reset its password is on its way. The link works for
        one hour.
      </AuthHeader>

      <ol className="overflow-hidden rounded-[14px] border bg-card max-md:rounded-2xl">
        {[
          <>
            Open the email from Kosha with the subject <span className="font-medium">Reset your Kosha password</span>.
          </>,
          <>
            Choose <span className="font-medium">Set a new password</span>. It opens Kosha in this browser or any other.
          </>,
        ].map((step, i) => (
          <li
            key={i}
            className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3 px-4 py-3.5 text-sm not-first:border-t"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted font-mono text-xs text-subtle-foreground">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-1 flex-col gap-3 md:flex-none">
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          Nothing after a minute? Look in spam, then send it again.
        </p>
        {error && <AuthError>{error}</AuthError>}
        {/* Phones pin both actions to the bottom. */}
        <div className="flex flex-col gap-3 max-md:mt-auto max-md:gap-1.5">
          {resendButton}
          <p className="mt-1 text-sm text-muted-foreground max-md:hidden">
            Wrong address?{" "}
            <button type="button" className={linkClass} onClick={onChange}>
              Use a different email
            </button>
          </p>
          <Button variant="link" className="h-11 text-[15px] text-foreground underline md:hidden" onClick={onChange}>
            Use a different email
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
