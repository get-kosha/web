// Asking for a reset link: /forgot-password, and /reset-password when its link has expired.
// Both end on "Check your email", which says the same thing whether or not the address has an account.
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ClockCountdownIcon, EnvelopeSimpleIcon, KeyIcon } from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { cn } from "cn"
import { AuthError, AuthField, AuthHeader, AuthShell, IconTile, linkClass, optionClass } from "@/components/auth"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { m } from "@/paraglide/messages"

const RESEND_AFTER = 60

/** Asks for a link. Null means it went out, or would have: only a rate limit or no connection is an error. */
async function requestLink(email: string) {
  const res = await authClient
    .requestPasswordReset({ email, redirectTo: "/reset-password" })
    .catch(() => ({ error: { status: 0 } }))
  if (!res.error) return null
  if (res.error.status === 429) return m.auth_reset_rate_limited()
  if (res.error.status === 0) return m.auth_error_offline()
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
          title={m.auth_expired_title()}
          icon={
            <IconTile>
              <ClockCountdownIcon className="text-warning" />
            </IconTile>
          }
        >
          {m.auth_expired_body()}
        </AuthHeader>
      ) : (
        <AuthHeader focus={moved} title={m.auth_reset_title()}>
          {m.auth_reset_body()}
        </AuthHeader>
      )}

      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 md:flex-none">
        <AuthField
          id="email"
          name="email"
          type="email"
          label={m.auth_email()}
          required
          autoComplete="username"
          placeholder={m.auth_email_placeholder()}
          autoFocus={!expired}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <AuthError>{error}</AuthError>}
        {/* Phones pin the action to the bottom of the screen. */}
        <Button type="submit" size="auth" disabled={busy} className="mt-1 max-md:order-last max-md:mt-auto">
          {expired ? m.auth_send_new_link() : m.auth_send_reset_link()}
        </Button>
        {expired ? (
          <p className="text-sm text-muted-foreground md:mt-3">
            <ParaglideMessage
              message={m.auth_remembered}
              markup={{
                link: ({ children }) => (
                  <a href="/login" className={linkClass}>
                    {children}
                  </a>
                ),
              }}
            />
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
    if ((res?.error as { code?: string } | undefined)?.code !== "AUTH_CANCELLED") setError(m.auth_passkey_failed())
  }
  return (
    <div className="mt-4 grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3.5 rounded-[14px] border bg-card p-4 max-md:mt-1 max-md:rounded-2xl">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-subtle-foreground">
        <KeyIcon aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            <span className="max-md:hidden">{m.auth_passkey_offer_device()}</span>
            <span className="md:hidden">{m.auth_passkey_offer_phone()}</span>
          </span>
          <span className="text-[13px] leading-[19px] text-muted-foreground">{m.auth_passkey_offer_body()}</span>
        </div>
        <Button
          variant="outline"
          className={cn(optionClass, "h-8 self-start rounded-lg px-3 text-[13px] max-md:h-10 max-md:rounded-[10px]")}
          onClick={() => void signIn()}
        >
          {m.auth_sign_in_passkey()}
        </Button>
        {error && <AuthError>{error}</AuthError>}
      </div>
    </div>
  )
}

const bold = ({ children }: { children?: ReactNode }) => <span className="font-medium">{children}</span>

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
        <ParaglideMessage
          message={m.auth_send_again_in}
          inputs={{ time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` }}
          markup={{ num: ({ children }) => <span className="num text-subtle-foreground">{children}</span> }}
        />
      ) : (
        m.auth_send_again()
      )}
    </Button>
  )

  return (
    <AuthShell key="sent" phone="focused" back="/login">
      <AuthHeader
        focus
        title={m.auth_check_email_title()}
        icon={
          <IconTile badge>
            <EnvelopeSimpleIcon />
          </IconTile>
        }
      >
        <ParaglideMessage
          message={m.auth_check_email_body}
          inputs={{ email }}
          markup={{ strong: ({ children }) => <strong>{children}</strong> }}
        />
      </AuthHeader>

      <ol className="overflow-hidden rounded-[14px] border bg-card max-md:rounded-2xl">
        {[
          <ParaglideMessage
            key="open"
            message={m.auth_check_step_open}
            inputs={{ subject: m.email_reset_subject() }}
            markup={{ b: bold }}
          />,
          <ParaglideMessage
            key="choose"
            message={m.auth_check_step_choose}
            inputs={{ button: m.email_reset_button() }}
            markup={{ b: bold }}
          />,
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
        <p className="text-[13px] leading-[19px] text-muted-foreground">{m.auth_check_spam()}</p>
        {error && <AuthError>{error}</AuthError>}
        {/* Phones pin both actions to the bottom. */}
        <div className="flex flex-col gap-3 max-md:mt-auto max-md:gap-1.5">
          {resendButton}
          <p className="mt-1 text-sm text-muted-foreground max-md:hidden">
            <ParaglideMessage
              message={m.auth_wrong_address}
              markup={{
                link: ({ children }) => (
                  <button type="button" className={linkClass} onClick={onChange}>
                    {children}
                  </button>
                ),
              }}
            />
          </p>
          <Button variant="link" className="h-11 text-[15px] text-foreground underline md:hidden" onClick={onChange}>
            {m.auth_use_different_email()}
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
