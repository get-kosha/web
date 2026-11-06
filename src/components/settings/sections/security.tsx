import { useEffect, useState, type FormEvent } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  CheckCircleIcon,
  CircleIcon,
  CopyIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  FingerprintIcon,
  KeyIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr"
import { renderSVG } from "uqr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
import { Pill, SettingGroup, SettingRow } from "@/components/settings/row"
import { errorOf, useSave } from "@/components/settings/saved"
import { savePreferences, setAccountPassword } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { LOCALE } from "@/lib/core"
import { cn } from "@/lib/utils"

/** Account counts and sign-in facts, loaded once by the settings layout. */
export const useAccount = () => getRouteApi("/_app/settings").useLoaderData()

const when = (d: Date | string) =>
  new Date(d).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })

/** Better Auth client calls resolve to { error }; turn that into a toast and a boolean. */
export async function attempt(fn: () => Promise<{ error: { message?: string } | null } | unknown>, ok?: string) {
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

type Step = "password" | "scan" | "codes" | "disable" | "regenerate" | null
type Account = ReturnType<typeof useAccount>

/** The four checklist steps, done or not. The rail badge and the phone nudge count the open ones. */
export function securitySteps(account: Account, backupSavedAt: string | null) {
  return [
    { key: "password", label: "A password", done: account.hasPassword },
    { key: "passkey", label: "A passkey on this device", done: account.passkeys > 0 },
    { key: "two-factor", label: "Two-factor authentication", done: account.twoFactor },
    { key: "codes", label: "Backup codes saved", done: account.twoFactor && !!backupSavedAt },
  ] as const
}

export function Security() {
  const save = useSave()
  const [pwOpen, setPwOpen] = useState(false)
  const [step, setStep] = useState<Step>(null)
  const passkeys = authClient.useListPasskeys()
  // Passkeys present before the last add; anything newer animates in.
  const [before, setBefore] = useState<Set<string> | null>(null)
  const addPasskey = async () => {
    const ids = new Set(passkeys.data?.map((p) => p.id))
    if (await save("passkeys", () => authClient.passkey.addPasskey({ name: deviceName() }))) {
      setBefore(ids)
      passkeys.refetch()
    }
  }
  return (
    <>
      <Checklist
        actions={{
          password: () => setPwOpen(true),
          passkey: addPasskey,
          "two-factor": () => setStep("password"),
          codes: () => setStep("regenerate"),
        }}
      />
      <SettingGroup label="Sign-in">
        <Password open={pwOpen} setOpen={setPwOpen} />
        <Passkeys list={passkeys} before={before} onAdd={addPasskey} />
        <TwoFactor step={step} setStep={setStep} />
      </SettingGroup>
      <Sessions />
    </>
  )
}

const RING = 138.2 // 2πr for r = 22

/** "1 of 4 done": a ring and the steps still open, each with the flow that finishes it. Gone once all are done. */
function Checklist({ actions }: { actions: Record<"password" | "passkey" | "two-factor" | "codes", () => void> }) {
  const account = useAccount()
  const backupSavedAt = getRouteApi("/_app").useLoaderData({ select: (m) => m.prefs.backup_codes_saved_at })
  const steps = securitySteps(account, backupSavedAt)
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  const label = (key: (typeof steps)[number]["key"]) =>
    key === "password" ? "Set" : key === "passkey" ? "Add" : key === "two-factor" ? "Turn on" : "Save codes"
  return (
    <SettingGroup>
      <div id="checklist" className="px-5 py-5 max-md:px-4">
        <div className="flex items-center gap-5">
          <svg
            viewBox="0 0 56 56"
            className="size-14 shrink-0 -rotate-90"
            role="img"
            aria-label={`${done} of 4 security steps done`}
          >
            <circle cx="28" cy="28" r="22" fill="none" strokeWidth="5" className="stroke-muted" />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-brand transition-[stroke-dasharray] duration-700 ease-out starting:[stroke-dasharray:0_138.2]"
              style={{ strokeDasharray: `${((RING * done) / 4).toFixed(1)} ${RING}` }}
            />
          </svg>
          <div>
            <div className="text-[15px] font-semibold">{done} of 4 done</div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Two minutes to finish: each step makes your account harder to take.
            </p>
          </div>
        </div>
        <ul className="mt-4 grid">
          {steps.map((s) => {
            // Backup codes come with two-factor, so that step waits for it.
            const can =
              !s.done && (s.key !== "codes" || account.twoFactor) && (s.key !== "two-factor" || account.hasPassword)
            return (
              <li
                key={s.key}
                className="flex min-h-[34px] items-center gap-2.5 text-[13.5px] text-subtle-foreground data-done:text-foreground"
                data-done={s.done || undefined}
              >
                {s.done ? (
                  <CheckCircleIcon className="size-[18px] text-brand" />
                ) : (
                  <CircleIcon className="size-[18px] text-muted-foreground" />
                )}
                {s.label}
                {can && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 bg-card text-xs font-normal max-md:h-9"
                    onClick={actions[s.key]}
                  >
                    {label(s.key)}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </SettingGroup>
  )
}

function Password({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { hasPassword } = useAccount()
  const router = useRouter()
  return (
    <SettingRow
      id="password"
      title="Password"
      description={
        hasPassword
          ? "At least 10 characters. Changing it signs out your other devices."
          : "You sign in with passkeys only. Add a password as a fallback."
      }
      control={
        <Button variant="outline" className="h-9 bg-card px-3 text-[13px] font-normal" onClick={() => setOpen(true)}>
          {hasPassword ? "Change password" : "Set a password"}
        </Button>
      }
    >
      {open && (
        <PasswordDialog
          open
          hasPassword={hasPassword}
          onClose={() => setOpen(false)}
          onDone={() => router.invalidate()}
        />
      )}
    </SettingRow>
  )
}

function Passkeys({
  list,
  before,
  onAdd,
}: {
  list: ReturnType<typeof authClient.useListPasskeys>
  before: Set<string> | null
  onAdd: () => void
}) {
  const { data: passkeys } = list
  const router = useRouter()
  const refetch = () => {
    list.refetch()
    void router.invalidate()
  }
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  return (
    <SettingRow
      id="passkeys"
      title="Passkeys"
      description="Sign in with Face ID, Touch ID, Windows Hello or a security key."
      control={
        <Button variant="outline" className="h-9 bg-card px-3 text-[13px] font-normal" onClick={onAdd}>
          <FingerprintIcon /> Add a passkey
        </Button>
      }
    >
      {!!passkeys?.length && (
        <ul className="-mx-5 -mb-4 border-t max-md:-mx-4">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex min-h-14 items-center gap-3 border-t px-5 first:border-t-0 max-md:px-4",
                before && !before.has(p.id) && "rise-in"
              )}
            >
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
    </SettingRow>
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

type Setup = { uri: string; codes: string[] }

function TwoFactor({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const { hasPassword, twoFactor } = useAccount()
  const router = useRouter()
  const save = useSave()
  const session = authClient.useSession()
  const enabled = (session.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled ?? twoFactor
  const [setup, setSetup] = useState<Setup | null>(null)
  const close = () => {
    setStep(null)
    setSetup(null)
  }

  return (
    <SettingRow
      id="two-factor"
      title="Two-factor authentication"
      description={
        !hasPassword && !enabled
          ? "Set a password first: two-factor protects password sign-in."
          : enabled
            ? "On. Signing in with your password also asks for a code from your authenticator app."
            : "After your password, ask for a code from an authenticator app (1Password, Authy…)."
      }
      control={
        <>
          {enabled && (
            <Button
              variant="ghost"
              className="h-9 px-3 text-[13px] font-normal text-subtle-foreground"
              onClick={() => setStep("regenerate")}
            >
              New backup codes
            </Button>
          )}
          <Switch
            aria-label="Two-factor authentication"
            checked={enabled || step === "scan" || step === "codes"}
            disabled={!hasPassword && !enabled}
            onCheckedChange={(on) => setStep(on ? "password" : "disable")}
          />
        </>
      }
    >
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
            void router.invalidate()
            setStep("codes")
          }}
        />
      )}
      {step === "codes" && setup && (
        <BackupCodes
          codes={setup.codes}
          onDone={() => {
            close()
            // The checklist's last step: remember the codes were saved.
            void save("two-factor", () =>
              savePreferences({ data: { backup_codes_saved_at: String(Math.floor(Date.now() / 1000)) } })
            )
          }}
        />
      )}
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
              void router.invalidate()
              close()
            }
            return ok
          }}
        />
      )}
    </SettingRow>
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

export function Field({
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
    <SettingGroup
      label="Signed-in devices"
      actions={
        others.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-[13px] font-normal text-subtle-foreground"
            onClick={async () => {
              if (await attempt(() => authClient.revokeOtherSessions(), "Signed out of other devices")) load()
            }}
          >
            Sign out all others
          </Button>
        )
      }
    >
      <div id="devices">
        {sessions === null && <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>}
        {[...(sessions ?? [])]
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
              <div
                key={s.id}
                className="flex min-h-16 items-center gap-3 border-t px-5 py-3 first:border-t-0 max-md:px-4"
              >
                <Icon className="size-5 shrink-0 text-subtle-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {d.label}
                    {here && <Pill>This device</Pill>}
                  </p>
                  <p data-plain className="num truncate text-xs text-muted-foreground">
                    {[s.ipAddress, here ? "active now" : `active ${when(s.updatedAt)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!here && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[13px] font-normal text-subtle-foreground"
                    onClick={async () => {
                      if (await attempt(() => authClient.revokeSession({ token: s.token }), "Signed out")) load()
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </div>
            )
          })}
      </div>
    </SettingGroup>
  )
}
