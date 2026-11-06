import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { KeyIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { KoshaLogo } from "@/components/kosha-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { safeReturn } from "@/lib/core"

export const Route = createFileRoute("/login")({
  // Loose: an app signing in through MCP OAuth adds a signed query that must reach the sign-in request.
  validateSearch: z.looseObject({ returnTo: z.string().optional() }),
  head: () => ({ meta: [{ title: "Sign in · Kosha" }] }),
  component: Login,
})

function Login() {
  const { returnTo } = Route.useSearch()
  const [mode, setMode] = useState<"in" | "up">("in")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // Set after a correct password when the account has two-factor on. The next step asks for the code.
  const [twoFactor, setTwoFactor] = useState(false)
  // Use a full page load so every loader runs again as the new user. When an app signs in through
  // OAuth, Better Auth answers with { redirect, url } instead, and the auth client goes on to consent.
  const done = (data?: unknown) => {
    if (!(data as { redirect?: boolean } | null)?.redirect) window.location.assign(safeReturn(returnTo))
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
            <KoshaLogo className="text-[28px]" />
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "in" ? "Sign in to your account." : "Create an account."}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "up" && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="username webauthn" />
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
            />
            {mode === "up" && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {mode === "in" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => authClient.signIn.passkey({ autoFill: false }))}
          >
            <KeyIcon /> Sign in with a passkey
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          {mode === "in" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="text-foreground underline underline-offset-4"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in")
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
