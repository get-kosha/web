import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { EyeIcon, GoogleLogoIcon, KeyIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { KoshaLogo } from "@/components/kosha-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signInOptions } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { DEMO, publicHead, safeReturn } from "@/lib/core"

export const Route = createFileRoute("/login")({
  // Loose: an app signing in through MCP OAuth adds a signed query that must reach the sign-in request.
  validateSearch: z.looseObject({
    returnTo: z.string().optional(),
    mode: z.enum(["in", "up"]).optional().catch(undefined),
    demo: z.coerce.boolean().optional().catch(undefined),
    // Set by Better Auth when Google sends the visitor back without signing them in.
    error: z.string().optional().catch(undefined),
  }),
  loader: () => signInOptions(),
  // One canonical URL for every ?mode, ?returnTo and OAuth variant of this page.
  head: () => publicHead("/login", "Sign in · Kosha", "Sign in to Kosha, or create a free account."),
  component: Login,
})

/** What to say when Google sign-in comes back with an error code. */
function googleError(code: string | undefined) {
  if (!code) return ""
  if (code === "account_not_linked")
    return "That email already has a Kosha account. Sign in with your password or passkey, then connect Google in Settings › Sign-in & security."
  return "Signing in with Google didn't work. Try again."
}

function Login() {
  const search = Route.useSearch()
  const { google } = Route.useLoaderData()
  const { returnTo } = search
  // The landing page's "Create an account" opens this page with ?mode=up.
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "in")
  // The landing page's "Try the demo" opens this page with ?demo=1: the shared demo account, filled in.
  const [demo, setDemo] = useState(!!search.demo && mode === "in")
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

  async function run(fn: () => Promise<{ error: { message?: string } | null; data?: unknown } | undefined>) {
    setBusy(true)
    setError("")
    const res = await fn().catch((e: unknown) => ({
      error: { message: e instanceof Error ? e.message : String(e) },
      data: null,
    }))
    setBusy(false)
    if (res?.error) setError(res.error.message || "Something went wrong")
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

  if (twoFactor) return <TwoFactorStep onDone={done} onBack={() => setTwoFactor(false)} />

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get("email"))
    const password = String(f.get("password"))
    void run(() =>
      mode === "in"
        ? authClient.signIn.email({ email, password })
        : authClient.signUp.email({ email, password, name: String(f.get("name")).trim() || email.split("@")[0] })
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div>
          <h1 className="mb-4">
            {/* A full page load, so a signed-out visitor gets the landing page back. */}
            <a href="/" className="inline-block rounded-md">
              <KoshaLogo className="text-[28px]" />
            </a>
          </h1>
          <p className="text-sm text-muted-foreground">
            {demo ? "Sign in to the demo account." : mode === "in" ? "Sign in to your account." : "Create an account."}
          </p>
        </div>

        {demo && (
          <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
            <EyeIcon className="mt-0.5 size-5 shrink-0 text-subtle-foreground" aria-hidden="true" />
            <p className="text-subtle-foreground">
              <span className="font-medium text-foreground">This is a shared demo account.</span> It has 14 months of
              sample data. You can look around everything, but adding, editing and deleting are turned off.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "up" && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              key={demo ? "demo" : "own"}
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username webauthn"
              defaultValue={demo ? DEMO.email : undefined}
              readOnly={demo}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "up" ? 10 : undefined}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              key={demo ? "demo" : "own"}
              defaultValue={demo ? DEMO.password : undefined}
              readOnly={demo}
            />
            {mode === "up" && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {demo ? "Open the demo" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
          {mode === "up" && (
            <p className="text-xs text-muted-foreground">
              By creating an account you agree to the{" "}
              <a href="/terms" className="underline underline-offset-4 hover:text-foreground">
                terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
                privacy policy
              </a>
              .
            </p>
          )}
          {demo && (
            <button
              type="button"
              onClick={() => setDemo(false)}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Sign in to your own account instead
            </button>
          )}
        </form>

        {mode === "in" && !demo && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => authClient.signIn.passkey({ autoFill: false }))}
          >
            <KeyIcon /> Sign in with a passkey
          </Button>
        )}

        {google && !demo && (
          <Button variant="outline" disabled={busy} onClick={signInWithGoogle}>
            <GoogleLogoIcon /> {mode === "in" ? "Sign in with Google" : "Sign up with Google"}
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          {mode === "in" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="text-foreground underline underline-offset-4"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in")
              setDemo(false)
              setError("")
            }}
          >
            {mode === "in" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  )
}

/** Second step of sign-in: a code from the authenticator app, or one of the backup codes. */
function TwoFactorStep({ onDone, onBack }: { onDone: (data?: unknown) => void; onBack: () => void }) {
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const value = code.replace(/\s+/g, "")
    const res = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
    setBusy(false)
    if (res.error) setError(res.error.message || "That code didn't work. Try again.")
    else onDone(res.data)
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5">
        <div>
          <KoshaLogo className="mb-4 text-[28px]" />
          <h1 className="text-lg font-semibold tracking-tight">Two-factor check</h1>
          <p className="text-sm text-muted-foreground">
            {backup
              ? "Enter one of the backup codes you saved. Each works once."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="code">{backup ? "Backup code" : "Code"}</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            pattern={backup ? undefined : "[0-9 ]{6,7}"}
            className="num h-11 text-lg tracking-[0.2em]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="size-4 accent-foreground"
          />
          Trust this device for 30 days
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          Verify
        </Button>
        <div className="flex justify-between text-sm text-muted-foreground">
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => {
              setBackup(!backup)
              setCode("")
              setError("")
            }}
          >
            {backup ? "Use the authenticator app" : "Use a backup code"}
          </button>
          <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </main>
  )
}
