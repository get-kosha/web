import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { EyeIcon, GoogleLogoIcon, KeyIcon } from "@phosphor-icons/react/ssr"
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
  head: () => publicHead("/login", "Sign in · Kosha", "Sign in to Kosha, or create a free account."),
  component: Login,
})

type Failure = { field?: "email" | "password"; message: string }
type AuthResult = { error: { code?: string; message?: string; status?: number } | null; data?: unknown } | undefined

/** What to say when Google sign-in comes back with an error code. */
function googleError(code: string | undefined): Failure | null {
  if (!code) return null
  if (code === "account_not_linked")
    return {
      message:
        "That email already has a Kosha account. Sign in with your password or passkey, then connect Google in Settings › Sign-in & security.",
    }
  return { message: "Signing in with Google didn't work. Try again." }
}

/** Better Auth's error codes in Kosha's words. Null for a cancelled passkey prompt, which needs no message. */
function failure(error: NonNullable<NonNullable<AuthResult>["error"]>): Failure | null {
  if (error.status === 429) return { message: "Too many tries. Wait a minute, then try again." }
  switch (error.code) {
    case "AUTH_CANCELLED":
      return null
    case "INVALID_EMAIL_OR_PASSWORD":
      return { field: "password", message: "Wrong email or password. Try again, or use a passkey." }
    case "INVALID_EMAIL":
      return { field: "email", message: "Enter a full email address, like you@example.com." }
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { field: "email", message: "That email already has a Kosha account. Sign in instead." }
    case "PASSWORD_TOO_SHORT":
      return { field: "password", message: `Use at least ${MIN_PASSWORD} characters.` }
  }
  return { message: error.message || "Something went wrong. Try again." }
}

const offline = { error: { message: "Kosha couldn't be reached. Check your connection, then try again." }, data: null }

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

  return (
    <AuthShell
      key={demo ? "demo" : mode}
      phone="band"
      panel={demo ? "demo" : signIn ? "default" : "create"}
      top={
        signIn ? (
          <>
            <span>New to Kosha?</span>
            <Button variant="outline" className={switchButton} onClick={() => show({ mode: "up" })}>
              Create an account
            </Button>
          </>
        ) : (
          <>
            <span>Have an account?</span>
            <Button variant="outline" className={switchButton} onClick={() => show({})}>
              Sign in
            </Button>
          </>
        )
      }
    >
      {notice && signIn && !demo && <AuthNotice title="Password changed">Sign in with your new password.</AuthNotice>}
      <AuthHeader home band title={demo ? "Look around the demo" : signIn ? "Welcome back" : "Create your account"}>
        {demo
          ? "A shared account with 14 months of sample data."
          : signIn
            ? !notice && "Sign in to your treasury."
            : "Start with your email. You'll add accounts next."}
      </AuthHeader>

      {demo && (
        <div className="flex gap-3 rounded-[14px] border bg-card px-4 py-3.5 text-sm text-subtle-foreground">
          <EyeIcon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
          <p>
            You can open everything. Adding, editing and deleting are turned off, so the next person sees it as you did.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4 max-md:gap-3">
        {!signIn && (
          <AuthField
            id="name"
            name="name"
            label="Name"
            autoComplete="name"
            aside={<span className="text-xs text-muted-foreground">Optional</span>}
          />
        )}
        <AuthField
          key={demo ? "demo-email" : "email"}
          id="email"
          name="email"
          type="email"
          label="Email"
          required
          placeholder="you@example.com"
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
          label="Password"
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
          hint={demo ? "Filled in for you." : undefined}
          error={fieldError("password")}
          aside={
            signIn &&
            !demo &&
            resetByEmail && (
              <a
                href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="text-[13px] leading-[18px] text-subtle-foreground underline decoration-chart-4 underline-offset-[3px] hover:text-foreground"
              >
                Forgot password?
              </a>
            )
          }
        />
        {error && !error.field && <AuthError>{error.message}</AuthError>}
        <Button type="submit" size="auth" disabled={busy} className="mt-1">
          {demo ? "Open the demo" : signIn ? "Sign in" : "Create account"}
        </Button>
      </form>

      {signIn && !demo && (
        <>
          <AuthDivider>or sign in with</AuthDivider>
          <div className={cn("grid gap-2.5", google && "grid-cols-2")}>
            <Button
              variant="outline"
              size="auth-option"
              className={optionClass}
              aria-label="Sign in with a passkey"
              disabled={busy}
              onClick={passkey}
            >
              <KeyIcon className="text-subtle-foreground" /> Passkey
            </Button>
            {google && (
              <Button
                variant="outline"
                size="auth-option"
                className={optionClass}
                aria-label="Sign in with Google"
                disabled={busy}
                onClick={signInWithGoogle}
              >
                <GoogleLogoIcon className="text-subtle-foreground" /> Google
              </Button>
            )}
          </div>
          {hasDemo && (
            <p className="text-sm text-muted-foreground">
              Just looking?{" "}
              <button type="button" className={linkClass} onClick={() => show({ demo: true })}>
                Open the demo
              </button>
            </p>
          )}
        </>
      )}

      {!signIn && google && (
        <>
          <div className="max-md:hidden">
            <AuthDivider>or</AuthDivider>
          </div>
          <Button
            variant="outline"
            size="auth-option"
            className={optionClass}
            disabled={busy}
            onClick={signInWithGoogle}
          >
            <GoogleLogoIcon className="text-subtle-foreground" /> Sign up with Google
          </Button>
        </>
      )}

      {!signIn && (
        <p className="text-xs leading-[18px] text-muted-foreground">
          By creating an account you agree to the{" "}
          <a href="/terms" className="text-subtle-foreground underline underline-offset-[3px] hover:text-foreground">
            terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-subtle-foreground underline underline-offset-[3px] hover:text-foreground">
            privacy policy
          </a>
          .
        </p>
      )}

      {demo && (
        <p className="text-sm text-muted-foreground">
          Have an account?{" "}
          <button type="button" className={linkClass} onClick={() => show({})}>
            Sign in to your own
          </button>
        </p>
      )}

      {/* On phones the switch sits at the bottom of the sheet; desktop has it in the top bar. */}
      <p className="mt-auto pt-2 text-center text-sm text-muted-foreground md:hidden">
        {signIn ? "No account yet? " : "Have an account? "}
        <button type="button" className={cn(linkClass, "min-h-11")} onClick={() => show(signIn ? { mode: "up" } : {})}>
          {signIn ? "Create one" : "Sign in"}
        </button>
      </p>
    </AuthShell>
  )
}

/** What to say when a two-factor code is turned down. */
function codeError(error: { code?: string; message?: string; status?: number }) {
  if (error.status === 429 || error.code === "ACCOUNT_TEMPORARILY_LOCKED")
    return "Too many tries. Wait a few minutes, then try again."
  if (error.code === "INVALID_TWO_FACTOR_COOKIE") return "This sign-in timed out. Go back and sign in again."
  if (error.code === "INVALID_CODE" || error.code === "INVALID_BACKUP_CODE") return "That code didn't work. Try again."
  return error.message || "That code didn't work. Try again."
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

  const toggleLabel = backup ? "Use the authenticator app" : "Use a backup code"
  const describedBy = error ? "code-error" : "code-hint"

  return (
    <AuthShell phone="focused" back={onBack}>
      {/* Focus goes to the code field rather than the title: it's what the step asks for, and iOS and Android
          offer the code from it. Its label and hint name the step. */}
      <AuthHeader title="Two-factor check">
        {backup ? (
          "Enter one of the backup codes you saved. Each works once."
        ) : (
          <>
            Enter the 6-digit code from your authenticator app
            {email && (
              <span className="max-md:hidden">
                {" "}
                for <strong>{email}</strong>
              </span>
            )}
            .
          </>
        )}
      </AuthHeader>

      <form onSubmit={submit} className="flex flex-1 flex-col gap-[22px] md:flex-none">
        <div className="flex flex-col gap-2.5">
          <label htmlFor="code" className="mb-0.5 text-[13px] leading-[18px] font-medium text-subtle-foreground">
            {backup ? "Backup code" : "Code"}
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
                  <span className="max-md:hidden">Pasting the whole code works too.</span>
                  <span className="md:hidden">Your phone may offer the code above the keyboard.</span>
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
            <span className="text-sm max-md:text-[15px]">Trust this device for 30 days</span>
            <span className="text-xs text-muted-foreground">
              Kosha won't ask for a code on this <span className="max-md:hidden">browser</span>
              <span className="md:hidden">phone</span> until then.
            </span>
          </span>
        </label>

        {/* Phones pin the action to the bottom, with the backup-code help around it. */}
        <div className="flex flex-col gap-1.5 max-md:mt-auto">
          <p className="mb-2 text-center text-[13px] leading-[19px] text-muted-foreground md:hidden">
            No access to your authenticator app? Each backup code you saved works once.
          </p>
          <Button type="submit" size="auth" disabled={busy}>
            Verify
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
          {backup
            ? "Back to the 6-digit code from your authenticator app."
            : "No access to your authenticator app? Each backup code you saved works once."}
        </p>
      </div>
    </AuthShell>
  )
}
