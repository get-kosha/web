import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { EyeIcon, GoogleLogoIcon, KeyIcon } from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { z } from "zod"
import { cn } from "cn"
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthNotice,
  AuthShell,
  linkClass,
  optionClass,
} from "@/components/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { signInOptions } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { DEMO, MIN_PASSWORD, publicHead, safeReturn } from "@/lib/core"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/login")({
  // Loose: an app signing in through MCP OAuth adds a signed query that must reach the sign-in request.
  validateSearch: z.looseObject({
    returnTo: z.string().optional(),
    mode: z.enum(["in", "up"]).optional().catch(undefined),
    demo: z.coerce.boolean().optional().catch(undefined),
    // Set by Better Auth when Google sends the visitor back without signing them in.
    error: z.string().optional().catch(undefined),
    // Set by /reset-password after a new password is saved.
    reset: z.coerce.boolean().optional().catch(undefined),
  }),
  loader: () => signInOptions(),
  // One canonical URL for every ?mode, ?returnTo and OAuth variant of this page.
  head: () => publicHead("/login", m.auth_login_title(), m.auth_login_description()),
  component: Login,
})

type Failure = { field?: "email" | "password"; message: string }
type AuthResult = { error: { code?: string; message?: string; status?: number } | null; data?: unknown } | undefined

/** What to say when Google sign-in comes back with an error code. */
function googleError(code: string | undefined): Failure | null {
  if (!code) return null
  if (code === "account_not_linked") return { message: m.auth_google_not_linked() }
  return { message: m.auth_google_failed() }
}

/**
 * Better Auth's error codes in Kosha's words. Its own messages are English, so an unknown code gets a
 * generic line. Null for a cancelled passkey prompt, which needs no message.
 */
function failure(error: NonNullable<NonNullable<AuthResult>["error"]>): Failure | null {
  if (error.status === 429) return { message: m.auth_error_rate_limited() }
  switch (error.code) {
    case "AUTH_CANCELLED":
      return null
    case "OFFLINE":
      return { message: m.auth_error_offline() }
    case "DEMO_READ_ONLY":
      return { message: m.common_demo_read_only() }
    case "INVALID_EMAIL_OR_PASSWORD":
      return { field: "password", message: m.auth_error_wrong_password() }
    case "INVALID_EMAIL":
      return { field: "email", message: m.auth_error_invalid_email() }
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { field: "email", message: m.auth_error_email_taken() }
    case "PASSWORD_TOO_SHORT":
      return { field: "password", message: m.auth_error_password_short({ min: MIN_PASSWORD }) }
    case "PASSWORD_TOO_LONG":
      return { field: "password", message: m.auth_error_password_long() }
    case "AUTHENTICATION_FAILED":
    case "PASSKEY_NOT_FOUND":
    case "CHALLENGE_NOT_FOUND":
      return { message: m.auth_error_passkey() }
  }
  return { message: m.auth_error_generic() }
}

// A code of Kosha's own, so failure() and codeError() can say it in the visitor's language.
const offline = { error: { code: "OFFLINE" }, data: null }

function Login() {
  const search = Route.useSearch()
  const { google, demo: hasDemo, resetByEmail } = Route.useLoaderData()
  const { returnTo } = search
  // The landing page's "Create an account" opens this page with ?mode=up, and "Try the demo" with ?demo=1.
  // Switching between them is page state, not navigation: re-encoding the URL would break an OAuth app's signed query.
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "in")
  const [demo, setDemo] = useState(!!search.demo && mode === "in")
  const [notice, setNotice] = useState(!!search.reset)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(googleError(search.error))
  const [busy, setBusy] = useState(false)
  // Set after a correct password when the account has two-factor on. The next step asks for the code.
  const [twoFactor, setTwoFactor] = useState(false)
  // Use a full page load so every loader runs again as the new user. When an app signs in through
  // OAuth, Better Auth answers with { redirect, url } instead, and the auth client goes on to consent.
  // A new account with nowhere else to go starts on the welcome screen.
  const done = (data?: unknown) => {
    if ((data as { redirect?: boolean } | null)?.redirect) return
    window.location.assign(mode === "up" && !returnTo ? "/welcome" : safeReturn(returnTo))
  }

  // Offer saved passkeys in the email field's autofill (WebAuthn conditional UI).
  useEffect(() => {
    if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return
    void PublicKeyCredential.isConditionalMediationAvailable().then((ok) => {
      if (ok) void authClient.signIn.passkey({ autoFill: true }).then((r) => !r?.error && done(r?.data))
    })
  }, [])

  /** Switches between sign in, create account and the demo. */
  function show(next: { mode?: "up"; demo?: true }) {
    setError(null)
    setNotice(false)
    setMode(next.mode ?? "in")
    setDemo(!!next.demo)
  }

  async function run(fn: () => Promise<AuthResult>) {
    setBusy(true)
    setError(null)
    const res = await fn().catch(() => offline)
    setBusy(false)
    if (res?.error) setError(failure(res.error))
    else if ((res?.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) setTwoFactor(true)
    else done(res?.data)
  }

  function signInWithGoogle() {
    // Come back to this page, minus any earlier error, if Google sign-in fails.
    const back = new URL(window.location.href)
    back.searchParams.delete("error")
    back.searchParams.delete("error_description")
    void run(() =>
      authClient.signIn.social({
        provider: "google",
        callbackURL: safeReturn(returnTo),
        newUserCallbackURL: returnTo ? safeReturn(returnTo) : "/welcome",
        errorCallbackURL: back.pathname + back.search,
      })
    )
  }

  if (twoFactor) return <TwoFactorStep email={email} onDone={done} onBack={() => setTwoFactor(false)} />

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const address = String(f.get("email"))
    const secret = String(f.get("password"))
    // Typed before the page hydrated, the field's text never reached state; the two-factor step shows it.
    setEmail(address)
    void run(() =>
      mode === "in"
        ? authClient.signIn.email({ email: address, password: secret })
        : authClient.signUp.email({
            email: address,
            password: secret,
            name: String(f.get("name")).trim() || address.split("@")[0],
          })
    )
  }

  const passkey = () => void run(() => authClient.signIn.passkey({ autoFill: false }))
  const signIn = mode === "in"
  const fieldError = (field: Failure["field"]) => (error && error.field === field ? error.message : undefined)
  const switchButton = cn(optionClass, "h-9 rounded-lg px-3.5 text-[13px] text-foreground")
  const legalLink = "text-subtle-foreground underline underline-offset-[3px] hover:text-foreground"

  return (
    <AuthShell
      key={demo ? "demo" : mode}
      phone="band"
      panel={demo ? "demo" : signIn ? "default" : "create"}
      top={
        signIn ? (
          <>
            <span>{m.auth_new_to_kosha()}</span>
            <Button variant="outline" className={switchButton} onClick={() => show({ mode: "up" })}>
              {m.auth_create_an_account()}
            </Button>
          </>
        ) : (
          <>
            <span>{m.auth_have_account()}</span>
            <Button variant="outline" className={switchButton} onClick={() => show({})}>
              {m.auth_sign_in()}
            </Button>
          </>
        )
      }
    >
      {notice && signIn && !demo && (
        <AuthNotice title={m.auth_password_changed()}>{m.auth_password_changed_body()}</AuthNotice>
      )}
      <AuthHeader home band title={demo ? m.auth_demo_title() : signIn ? m.auth_welcome_back() : m.auth_create_title()}>
        {demo ? m.auth_demo_lead() : signIn ? !notice && m.auth_sign_in_lead() : m.auth_create_lead()}
      </AuthHeader>

      {demo && (
        <div className="flex gap-3 rounded-[14px] border bg-card px-4 py-3.5 text-sm text-subtle-foreground">
          <EyeIcon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
          <p>{m.auth_demo_note()}</p>
        </div>
      )}

      <form method="post" onSubmit={submit} className="flex flex-col gap-4 max-md:gap-3">
        {!signIn && (
          <AuthField
            id="name"
            name="name"
            label={m.auth_name()}
            autoComplete="name"
            aside={<span className="text-xs text-muted-foreground">{m.auth_optional()}</span>}
          />
        )}
        <AuthField
          key={demo ? "demo-email" : "email"}
          id="email"
          name="email"
          type="email"
          label={m.auth_email()}
          required
          placeholder={m.auth_email_placeholder()}
          autoComplete={signIn ? "username webauthn" : "username"}
          value={demo ? DEMO.email : email}
          onChange={(e) => setEmail(e.target.value)}
          locked={demo}
          error={fieldError("email")}
        />
        <AuthField
          key={demo ? "demo-password" : "password"}
          id="password"
          name="password"
          type="password"
          label={m.auth_password()}
          required
          minLength={signIn ? undefined : MIN_PASSWORD}
          autoComplete={signIn ? "current-password" : "new-password"}
          value={demo ? DEMO.password : password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (error?.field === "password") setError(null)
          }}
          locked={demo}
          meter={!signIn}
          hint={demo ? m.auth_demo_filled() : undefined}
          error={fieldError("password")}
          aside={
            signIn &&
            !demo &&
            resetByEmail && (
              <a
                href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="text-[13px] leading-[18px] text-subtle-foreground underline decoration-chart-4 underline-offset-[3px] hover:text-foreground"
              >
                {m.auth_forgot_password()}
              </a>
            )
          }
        />
        {error && !error.field && <AuthError>{error.message}</AuthError>}
        <Button type="submit" size="auth" disabled={busy} className="mt-1">
          {demo ? m.auth_open_demo() : signIn ? m.auth_sign_in() : m.auth_create_account()}
        </Button>
      </form>

      {signIn && !demo && (
        <>
          <AuthDivider>{m.auth_or_sign_in_with()}</AuthDivider>
          <div className={cn("grid gap-2.5", google && "grid-cols-2")}>
            <Button
              variant="outline"
              size="auth-option"
              className={optionClass}
              aria-label={m.auth_sign_in_passkey()}
              disabled={busy}
              onClick={passkey}
            >
              <KeyIcon className="text-subtle-foreground" /> {m.auth_passkey()}
            </Button>
            {google && (
              <Button
                variant="outline"
                size="auth-option"
                className={optionClass}
                aria-label={m.auth_sign_in_google()}
                disabled={busy}
                onClick={signInWithGoogle}
              >
                <GoogleLogoIcon className="text-subtle-foreground" /> Google
              </Button>
            )}
          </div>
          {hasDemo && (
            <p className="text-sm text-muted-foreground">
              <ParaglideMessage
                message={m.auth_just_looking}
                markup={{
                  demo: ({ children }) => (
                    <button type="button" className={linkClass} onClick={() => show({ demo: true })}>
                      {children}
                    </button>
                  ),
                }}
              />
            </p>
          )}
        </>
      )}

      {!signIn && google && (
        <>
          <div className="max-md:hidden">
            <AuthDivider>{m.auth_or()}</AuthDivider>
          </div>
          <Button
            variant="outline"
            size="auth-option"
            className={optionClass}
            disabled={busy}
            onClick={signInWithGoogle}
          >
            <GoogleLogoIcon className="text-subtle-foreground" /> {m.auth_sign_up_google()}
          </Button>
        </>
      )}

      {!signIn && (
        <p className="text-xs leading-[18px] text-muted-foreground">
          <ParaglideMessage
            message={m.auth_agree}
            markup={{
              terms: ({ children }) => (
                <a href="/terms" className={legalLink}>
                  {children}
                </a>
              ),
              privacy: ({ children }) => (
                <a href="/privacy" className={legalLink}>
                  {children}
                </a>
              ),
            }}
          />
        </p>
      )}

      {demo && (
        <p className="text-sm text-muted-foreground">
          <ParaglideMessage
            message={m.auth_demo_own_account}
            markup={{
              link: ({ children }) => (
                <button type="button" className={linkClass} onClick={() => show({})}>
                  {children}
                </button>
              ),
            }}
          />
        </p>
      )}

      {/* On phones the switch sits at the bottom of the sheet; desktop has it in the top bar. */}
      <p className="mt-auto pt-2 text-center text-sm text-muted-foreground md:hidden">
        <ParaglideMessage
          message={signIn ? m.auth_phone_no_account : m.auth_phone_have_account}
          markup={{
            link: ({ children }) => (
              <button
                type="button"
                className={cn(linkClass, "min-h-11")}
                onClick={() => show(signIn ? { mode: "up" } : {})}
              >
                {children}
              </button>
            ),
          }}
        />
      </p>
    </AuthShell>
  )
}

/** What to say when a two-factor code is turned down. */
function codeError(error: { code?: string; message?: string; status?: number }) {
  if (
    error.status === 429 ||
    error.code === "ACCOUNT_TEMPORARILY_LOCKED" ||
    error.code?.startsWith("TOO_MANY_ATTEMPTS")
  )
    return m.auth_2fa_rate_limited()
  if (error.code === "INVALID_TWO_FACTOR_COOKIE" || error.code === "OTP_HAS_EXPIRED") return m.auth_2fa_timed_out()
  if (error.code === "OFFLINE") return m.auth_error_offline()
  if (error.code === "INVALID_CODE" || error.code === "INVALID_BACKUP_CODE") return m.auth_2fa_bad_code()
  return m.auth_error_generic()
}

/** Second step of sign-in: a code from the authenticator app, or one of the backup codes. */
function TwoFactorStep({
  email,
  onDone,
  onBack,
}: {
  email: string
  onDone: (data?: unknown) => void
  onBack: () => void
}) {
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError("")
    const input = { code: value.replace(/\s+/g, ""), trustDevice: trust }
    const res = await (backup ? authClient.twoFactor.verifyBackupCode(input) : authClient.twoFactor.verifyTotp(input))
      .then((r) => r as AuthResult)
      .catch(() => offline)
    setBusy(false)
    if (res?.error) setError(codeError(res.error))
    else onDone(res?.data)
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void verify(code)
  }

  function toggle() {
    setBackup(!backup)
    setCode("")
    setError("")
  }

  const toggleLabel = backup ? m.auth_2fa_use_app() : m.auth_2fa_use_backup()
  const describedBy = error ? "code-error" : "code-hint"

  return (
    <AuthShell phone="focused" back={onBack}>
      {/* Focus goes to the code field rather than the title: it's what the step asks for, and iOS and Android
          offer the code from it. Its label and hint name the step. */}
      <AuthHeader title={m.auth_2fa_title()}>
        {backup ? (
          m.auth_2fa_backup_lead()
        ) : email ? (
          <>
            {/* Phones leave out the address to keep the lead short. */}
            <span className="max-md:hidden">
              <ParaglideMessage
                message={m.auth_2fa_lead_for}
                inputs={{ email }}
                markup={{ strong: ({ children }) => <strong>{children}</strong> }}
              />
            </span>
            <span className="md:hidden">{m.auth_2fa_lead()}</span>
          </>
        ) : (
          m.auth_2fa_lead()
        )}
      </AuthHeader>

      <form method="post" onSubmit={submit} className="flex flex-1 flex-col gap-[22px] md:flex-none">
        <div className="flex flex-col gap-2.5">
          <label htmlFor="code" className="mb-0.5 text-[13px] leading-[18px] font-medium text-subtle-foreground">
            {backup ? m.auth_2fa_backup_label() : m.auth_2fa_code_label()}
          </label>
          {backup ? (
            <Input
              id="code"
              variant="auth"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError("")
              }}
              autoFocus
              required
              autoComplete="one-time-code"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "code-error" : undefined}
              className="font-mono tracking-wider"
            />
          ) : (
            <>
              <InputOTP
                id="code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                autoComplete="one-time-code"
                pushPasswordManagerStrategy="none"
                autoFocus
                value={code}
                onChange={(v) => {
                  setCode(v)
                  setError("")
                }}
                onComplete={(v: string) => void verify(v)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
              >
                <InputOTPGroup>
                  {[0, 1, 2].map((i) => (
                    <InputOTPSlot key={i} index={i} aria-invalid={error ? true : undefined} />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  {[3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} aria-invalid={error ? true : undefined} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {!error && (
                <span id="code-hint" className="text-xs text-muted-foreground">
                  <span className="max-md:hidden">{m.auth_2fa_paste_hint()}</span>
                  <span className="md:hidden">{m.auth_2fa_phone_hint()}</span>
                </span>
              )}
            </>
          )}
          {error && <AuthError id="code-error">{error}</AuthError>}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border bg-card px-4 py-3.5 max-md:rounded-2xl">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="mt-px size-[18px] shrink-0 accent-primary max-md:mt-0 max-md:size-5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm max-md:text-[15px]">{m.auth_2fa_trust()}</span>
            <span className="text-xs text-muted-foreground">
              <span className="max-md:hidden">{m.auth_2fa_trust_browser()}</span>
              <span className="md:hidden">{m.auth_2fa_trust_phone()}</span>
            </span>
          </span>
        </label>

        {/* Phones pin the action to the bottom, with the backup-code help around it. */}
        <div className="flex flex-col gap-1.5 max-md:mt-auto">
          <p className="mb-2 text-center text-[13px] leading-[19px] text-muted-foreground md:hidden">
            {m.auth_2fa_no_access()}
          </p>
          <Button type="submit" size="auth" disabled={busy}>
            {m.auth_2fa_verify()}
          </Button>
          <Button variant="link" className="h-11 text-[15px] text-foreground underline md:hidden" onClick={toggle}>
            {toggleLabel}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-1.5 border-t pt-1 max-md:hidden">
        <button type="button" className={cn(linkClass, "mt-3.5 self-start text-sm font-medium")} onClick={toggle}>
          {toggleLabel}
        </button>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {backup ? m.auth_2fa_back_to_code() : m.auth_2fa_no_access()}
        </p>
      </div>
    </AuthShell>
  )
}
