import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  CheckCircleIcon,
  CopyIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  KeyIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr"
import { renderSVG } from "uqr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader, useMeta } from "@/components/shell"
import { accountSummary, setAccountPassword } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { LOCALE } from "@/lib/core"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/account")({
  loader: () => accountSummary(),
  head: () => ({ meta: [{ title: "Account · Kosha" }] }),
  component: Account,
})

const when = (d: Date | string) =>
  new Date(d).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })
const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

/** Better Auth client calls resolve to { error }; turn that into a toast and a boolean. */
async function attempt(fn: () => Promise<{ error: { message?: string } | null } | unknown>, ok?: string) {
  try {
    const res = (await fn()) as { error?: { message?: string } | null } | undefined
    if (res?.error) {
      toast.error(res.error.message || "Something went wrong")
      return false
    }
    if (ok) toast.success(ok)
    return true
  } catch (e) {
    toast.error(errorOf(e))
    return false
  }
}

function Account() {
  return (
    <div className="max-w-2xl pb-10">
      <PageHeader title="Account & security" sub="Your sign-in, devices and data" />
      <div className="flex flex-col gap-5 px-4 md:px-8">
        <Profile />
        <Password />
        <Passkeys />
        <TwoFactor />
        <Sessions />
        <DeleteAccount />
      </div>
    </div>
  )
}

const Section = ({
  title,
  sub,
  aside,
  children,
}: {
  title: string
  sub?: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) => (
  <Card className="gap-4 px-6 max-md:px-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {aside}
    </div>
    {children}
  </Card>
)

// ---------- profile ----------

function Profile() {
  const meta = useMeta()
  const router = useRouter()
  const [name, setName] = useState(meta.user.name)
  return (
    <Section title="Profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acc-name">Name</Label>
          <Input
            id="acc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={async () => {
              const next = name.trim()
              if (!next || next === meta.user.name) return setName(meta.user.name)
              if (await attempt(() => authClient.updateUser({ name: next }), "Name saved")) await router.invalidate()
              else setName(meta.user.name)
            }}
            autoComplete="name"
            className="h-10"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acc-email">Email</Label>
          <Input id="acc-email" value={meta.user.email} readOnly className="h-10 text-muted-foreground" />
        </div>
      </div>
    </Section>
  )
}

// ---------- password ----------

function Password() {
  const { hasPassword } = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <Section
      title="Password"
      sub={
        hasPassword
          ? "Use at least 10 characters. Changing it signs out your other devices."
          : "You sign in with passkeys only. Add a password as a fallback."
      }
      aside={
        <Button variant="outline" onClick={() => setOpen(true)}>
          {hasPassword ? "Change password" : "Set a password"}
        </Button>
      }
    >
      <PasswordDialog
        open={open}
        hasPassword={hasPassword}
        onClose={() => setOpen(false)}
        onDone={() => router.invalidate()}
      />
    </Section>
  )
}

function PasswordDialog({
  open,
  hasPassword,
  onClose,
  onDone,
}: {
  open: boolean
  hasPassword: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = String(f.get("new"))
    if (next !== String(f.get("confirm"))) return setError("The two new passwords don’t match")
    setBusy(true)
    setError("")
    const ok = hasPassword
      ? await attempt(
          () =>
            authClient.changePassword({
              currentPassword: String(f.get("current")),
              newPassword: next,
              revokeOtherSessions: true,
            }),
          "Password changed"
        )
      : await attempt(() => setAccountPassword({ data: { password: next } }), "Password set")
    setBusy(false)
    if (ok) {
      onDone()
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasPassword ? "Change password" : "Set a password"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {hasPassword && <Field name="current" label="Current password" autoComplete="current-password" />}
          <Field
            name="new"
            label="New password"
            autoComplete="new-password"
            minLength={10}
            hint="At least 10 characters."
          />
          <Field name="confirm" label="New password again" autoComplete="new-password" minLength={10} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {hasPassword ? "Change password" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  name,
  label,
  hint,
  ...props
}: { name: string; label: string; hint?: string } & React.ComponentProps<"input">) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input id={`f-${name}`} name={name} type="password" required className="h-10" {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Asks for the password before a sensitive change (two-factor, backup codes). */
function PasswordPrompt({
  title,
  description,
  action,
  destructive,
  onCancel,
  onSubmit,
}: {
  title: string
  description: string
  action: string
  destructive?: boolean
  onCancel: () => void
  onSubmit: (password: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            await onSubmit(String(new FormData(e.currentTarget).get("password")))
            setBusy(false)
          }}
        >
          <Field name="password" label="Password" autoComplete="current-password" autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- passkeys ----------

function Passkeys() {
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  return (
    <Section
      title="Passkeys"
      sub="Sign in with Face ID, Touch ID, Windows Hello or a security key instead of a password."
      aside={
        <Button
          variant="outline"
          onClick={async () => {
            if (await attempt(() => authClient.passkey.addPasskey({ name: deviceName() }), "Passkey added")) refetch()
          }}
        >
          <KeyIcon /> Add a passkey
        </Button>
      }
    >
      {!isPending && !passkeys?.length && <p className="text-sm text-muted-foreground">No passkeys yet.</p>}
      {!!passkeys?.length && (
        <ul className="-mx-6 border-t max-md:-mx-4">
          {passkeys.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 border-b px-6 last:border-b-0 max-md:px-4">
              <KeyIcon className="size-[18px] shrink-0 text-subtle-foreground" />
              <div className="min-w-0 flex-1">
                <PasskeyName id={p.id} name={p.name ?? ""} onSaved={refetch} />
                <p className="text-xs text-muted-foreground">
                  Added {when(p.createdAt)}
                  {p.backedUp ? " · synced" : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${p.name || "passkey"}`}
                onClick={() => setRemoving({ id: p.id, name: p.name || "this passkey" })}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove {removing.name}?</DialogTitle>
              <DialogDescription>
                You won’t be able to sign in with it any more. Your other sign-in methods keep working.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (await attempt(() => authClient.passkey.deletePasskey({ id: removing.id }), "Passkey removed"))
                    refetch()
                  setRemoving(null)
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Section>
  )
}

/** A passkey's name, editable in place and saved when you leave the field. */
function PasskeyName({ id, name, onSaved }: { id: string; name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  return (
    <input
      aria-label="Passkey name"
      value={value}
      placeholder="Passkey"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onBlur={async () => {
        const next = value.trim()
        if (next === name) return
        if (await attempt(() => authClient.passkey.updatePasskey({ id, name: next }), "Passkey renamed")) onSaved()
        else setValue(name)
      }}
      className="-mx-1 w-full rounded-sm bg-transparent px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  )
}

function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Mac/.test(ua)
      ? "Mac"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : "This device"
  return os
}

// ---------- two-factor ----------

type Setup = { uri: string; codes: string[] }

function TwoFactor() {
  const { hasPassword } = Route.useLoaderData()
  const session = authClient.useSession()
  const enabled = !!(session.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled
  const [step, setStep] = useState<"password" | "scan" | "codes" | "disable" | "regenerate" | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const close = () => {
    setStep(null)
    setSetup(null)
  }

  return (
    <Section
      title="Two-factor authentication"
      sub={
        enabled
          ? "On. Signing in with your password also asks for a code from your authenticator app."
          : "Ask for a code from an authenticator app (1Password, Google Authenticator, Authy…) after your password."
      }
      aside={
        enabled ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-positive">
            <ShieldCheckIcon className="size-3.5" /> On
          </span>
        ) : (
          <Button variant="outline" disabled={!hasPassword} onClick={() => setStep("password")}>
            Turn on
          </Button>
        )
      }
    >
      {!hasPassword && !enabled && (
        <p className="text-xs text-muted-foreground">Set a password first: two-factor protects password sign-in.</p>
      )}
      {enabled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setStep("regenerate")}>
            New backup codes
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setStep("disable")}
          >
            Turn off
          </Button>
        </div>
      )}

      {step === "password" && (
        <PasswordPrompt
          title="Turn on two-factor"
          description="Confirm it’s you. Next you’ll scan a QR code with your authenticator app."
          action="Continue"
          onCancel={close}
          onSubmit={async (password) => {
            const res = await authClient.twoFactor.enable({ password, issuer: "Kosha" })
            if (res.error || !res.data || !("totpURI" in res.data)) {
              toast.error(res.error?.message || "Couldn’t start two-factor")
              return false
            }
            setSetup({ uri: res.data.totpURI, codes: res.data.backupCodes })
            setStep("scan")
            return true
          }}
        />
      )}
      {step === "scan" && setup && (
        <ScanStep
          uri={setup.uri}
          onCancel={close}
          onVerified={() => {
            void session.refetch()
            setStep("codes")
          }}
        />
      )}
      {step === "codes" && setup && <BackupCodes codes={setup.codes} onDone={close} />}
      {step === "regenerate" && (
        <PasswordPrompt
          title="New backup codes"
          description="Your old backup codes stop working once you get new ones."
          action="Get new codes"
          onCancel={close}
          onSubmit={async (password) => {
            const res = await authClient.twoFactor.generateBackupCodes({ password })
            if (res.error || !res.data) {
              toast.error(res.error?.message || "Couldn’t make new codes")
              return false
            }
            setSetup({ uri: "", codes: res.data.backupCodes })
            setStep("codes")
            return true
          }}
        />
      )}
      {step === "disable" && (
        <PasswordPrompt
          title="Turn off two-factor?"
          description="Signing in will only ask for your password. Your backup codes stop working."
          action="Turn off"
          destructive
          onCancel={close}
          onSubmit={async (password) => {
            const ok = await attempt(() => authClient.twoFactor.disable({ password }), "Two-factor turned off")
            if (ok) {
              void session.refetch()
              close()
            }
            return ok
          }}
        />
      )}
    </Section>
  )
}

function ScanStep({ uri, onCancel, onVerified }: { uri: string; onCancel: () => void; onVerified: () => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const secret = new URL(uri).searchParams.get("secret") ?? ""
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan with your authenticator app</DialogTitle>
          <DialogDescription>Then type the 6-digit code it shows to finish.</DialogDescription>
        </DialogHeader>
        {/* The QR is drawn here from the secret; it never leaves the page. */}
        <div
          className="mx-auto size-48 rounded-lg bg-white p-2 text-black [&_svg]:size-full"
          aria-label="QR code for your authenticator app"
          role="img"
          dangerouslySetInnerHTML={{ __html: renderSVG(uri, { border: 1 }) }}
        />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Can’t scan? Enter this key instead</summary>
          <code className="num mt-2 block rounded-md bg-muted px-3 py-2 break-all text-foreground select-all">
            {secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        </details>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const ok = await attempt(
              () => authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") }),
              "Two-factor is on"
            )
            setBusy(false)
            if (ok) onVerified()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="totp">Code</Label>
            <Input
              id="totp"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              className="num h-11 text-lg tracking-[0.2em]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Verify and turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `Kosha backup codes\nEach code works once.\n\n${codes.join("\n")}\n`
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save your backup codes</DialogTitle>
          <DialogDescription>
            If you lose your phone, each of these lets you sign in once. They won’t be shown again.
          </DialogDescription>
        </DialogHeader>
        <ol className="num grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-muted px-4 py-3 text-sm select-all">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => attempt(() => navigator.clipboard.writeText(text), "Copied")}>
              <CopyIcon /> Copy
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const a = document.createElement("a")
                a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
                a.download = "kosha-backup-codes.txt"
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              <DownloadSimpleIcon /> Download
            </Button>
          </div>
          <Button onClick={onDone}>
            <CheckCircleIcon /> I’ve saved them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- sessions ----------

type Session = {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: Date
  updatedAt: Date
}

function describe(ua: string | null | undefined) {
  const s = ua ?? ""
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /Firefox\//.test(s)
      ? "Firefox"
      : /Chrome\//.test(s)
        ? "Chrome"
        : /Safari\//.test(s)
          ? "Safari"
          : "Browser"
  const os = /iPhone|iPad/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Mac OS X/.test(s)
        ? "macOS"
        : /Windows/.test(s)
          ? "Windows"
          : /Linux/.test(s)
            ? "Linux"
            : ""
  return { label: os ? `${browser} on ${os}` : browser, mobile: /iPhone|Android|Mobile/.test(s) }
}

function Sessions() {
  const current = authClient.useSession().data?.session.token
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const load = () => void authClient.listSessions().then((r) => setSessions((r.data as Session[] | null) ?? []))
  useEffect(load, [])
  const others = (sessions ?? []).filter((s) => s.token !== current)

  return (
    <Section
      title="Signed-in devices"
      sub="Sign out anywhere you don’t recognise."
      aside={
        others.length > 0 && (
          <Button
            variant="outline"
            onClick={async () => {
              if (await attempt(() => authClient.revokeOtherSessions(), "Signed out of other devices")) load()
            }}
          >
            Sign out others
          </Button>
        )
      }
    >
      {sessions === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!!sessions?.length && (
        <ul className="-mx-6 border-t max-md:-mx-4">
          {[...sessions]
            .sort(
              (a, b) =>
                Number(b.token === current) - Number(a.token === current) ||
                +new Date(b.updatedAt) - +new Date(a.updatedAt)
            )
            .map((s) => {
              const d = describe(s.userAgent)
              const here = s.token === current
              const Icon = d.mobile ? DeviceMobileIcon : DesktopIcon
              return (
                <li key={s.id} className="flex min-h-14 items-center gap-3 border-b px-6 last:border-b-0 max-md:px-4">
                  <Icon className="size-[18px] shrink-0 text-subtle-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      {d.label}
                      {here && (
                        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-positive">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="num truncate text-xs text-muted-foreground">
                      {[s.ipAddress, `active ${when(s.updatedAt)}`, `signed in ${when(s.createdAt)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!here && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (await attempt(() => authClient.revokeSession({ token: s.token }), "Signed out")) load()
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              )
            })}
        </ul>
      )}
      <Button
        variant="outline"
        className="w-fit"
        onClick={async () => {
          await authClient.signOut()
          window.location.assign("/login")
        }}
      >
        Sign out of this device
      </Button>
    </Section>
  )
}

// ---------- delete account ----------

function DeleteAccount() {
  const [open, setOpen] = useState(false)
  return (
    <Card className="gap-4 border-destructive/30 px-6 max-md:px-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-destructive">Delete account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently removes your account and every transaction, account, category and recurring payment in it.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </div>
      {open && <DeleteFlow onClose={() => setOpen(false)} />}
    </Card>
  )
}

/** Three deliberate steps: see what goes, type your email, then your password. */
function DeleteFlow({ onClose }: { onClose: () => void }) {
  const meta = useMeta()
  const summary = Route.useLoaderData()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [understood, setUnderstood] = useState(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const emailOk = email.trim().toLowerCase() === meta.user.email.toLowerCase()
  const items = [
    [summary.transactions, "transaction"],
    [summary.accounts, "account"],
    [summary.recurring, "recurring payment"],
    [summary.categories, "category", "categories"],
  ] as const

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="num text-xs text-muted-foreground">Step {step} of 3</p>
          <DialogTitle className="flex items-center gap-2">
            <WarningIcon className="size-5 text-destructive" /> Delete your account
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <>
            <DialogDescription>
              This deletes everything in Kosha for {meta.user.email}. There is no backup and it can’t be undone.
            </DialogDescription>
            <ul className="grid gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
              {items.map(([n, one, many]) => (
                <li key={one} className="flex justify-between">
                  <span>{n === 1 ? one : (many ?? `${one}s`)}</span>
                  <span className="num">{n.toLocaleString(LOCALE)}</span>
                </li>
              ))}
              <li className="flex justify-between text-muted-foreground">
                <span>passkeys, two-factor and sessions</span>
                <span>all</span>
              </li>
            </ul>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 size-4 accent-destructive"
              />
              I understand my data will be permanently deleted.
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Keep my account
              </Button>
              <Button variant="destructive" disabled={!understood} onClick={() => setStep(2)}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (emailOk) setStep(3)
            }}
          >
            <DialogDescription>Type your email address to confirm this is the account you mean.</DialogDescription>
            <div className="grid gap-1.5">
              <Label htmlFor="del-email">Email</Label>
              <Input
                id="del-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={meta.user.email}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="h-10"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={!emailOk}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 3 && (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              const password = String(new FormData(e.currentTarget).get("password") ?? "")
              const ok = await attempt(() => authClient.deleteUser(summary.hasPassword ? { password } : {}))
              if (ok) window.location.assign("/login")
              else setBusy(false)
            }}
          >
            <DialogDescription>
              {summary.hasPassword
                ? "Last step: enter your password. Your account is deleted as soon as you press the button."
                : "Last step. Your account is deleted as soon as you press the button."}
            </DialogDescription>
            {summary.hasPassword && (
              <Field name="password" label="Password" autoComplete="current-password" autoFocus />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={busy} className={cn(busy && "opacity-70")}>
                {busy ? "Deleting…" : "Delete my account permanently"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
