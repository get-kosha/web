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
  GoogleLogoIcon,
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
import { intlLocale } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** Account counts and sign-in facts, loaded once by the settings layout. */
export const useAccount = () => getRouteApi("/_app/settings").useLoaderData()

const when = (d: Date | string) =>
  new Date(d).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", year: "numeric" })

type AuthError = { code?: string; message?: string; status?: number }

/** Better Auth's error codes in Kosha's words, since its own messages are English only. */
function authMessage(error: AuthError) {
  if (error.status === 429) return m.settings_sec_err_too_many()
  switch (error.code) {
    case "INVALID_PASSWORD":
      return m.settings_sec_err_wrong_password()
    case "PASSWORD_TOO_SHORT":
      return m.settings_sec_err_password_short()
    case "PASSWORD_TOO_LONG":
      return m.settings_sec_err_password_long()
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return m.settings_sec_err_wrong_code()
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return m.settings_sec_err_too_many()
    case "SESSION_EXPIRED":
    case "SESSION_NOT_FRESH":
      return m.settings_sec_err_session_old()
    case "AUTH_CANCELLED":
    case "ERROR_CEREMONY_ABORTED":
      return m.settings_sec_err_passkey_cancelled()
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return m.settings_sec_err_passkey_exists()
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return m.settings_sec_err_last_account()
    default:
      return m.common_something_went_wrong()
  }
}

/** Better Auth client calls resolve to { error }; turn that into a toast and a boolean. */
export async function attempt(fn: () => Promise<{ error: AuthError | null } | unknown>, ok?: string) {
  try {
    const res = (await fn()) as { error?: AuthError | null } | undefined
    if (res?.error) {
      toast.error(authMessage(res.error))
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
    { key: "password", label: m.settings_sec_step_password(), done: account.hasPassword },
    { key: "passkey", label: m.settings_sec_step_passkey(), done: account.passkeys > 0 },
    { key: "two-factor", label: m.settings_sec_two_factor(), done: account.twoFactor },
    { key: "codes", label: m.settings_sec_step_codes(), done: account.twoFactor && !!backupSavedAt },
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
    const add = async () => {
      const res = await authClient.passkey.addPasskey({ name: deviceName() })
      if (res?.error) throw new Error(authMessage(res.error))
      return res
    }
    if (await save(add)) {
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
      <SettingGroup label={m.settings_sec_signin()}>
        <Password open={pwOpen} setOpen={setPwOpen} />
        <Passkeys list={passkeys} before={before} onAdd={addPasskey} />
        <Google />
        <TwoFactor step={step} setStep={setStep} />
      </SettingGroup>
      <Sessions />
    </>
  )
}

const RING = 138.2 // 2πr for r = 22

/** Shows "1 of 4 done" as a ring, with each open step and the flow that finishes it. Hidden once all are done. */
function Checklist({ actions }: { actions: Record<"password" | "passkey" | "two-factor" | "codes", () => void> }) {
  const account = useAccount()
  const backupSavedAt = getRouteApi("/_app").useLoaderData({ select: (d) => d.prefs.backup_codes_saved_at })
  const steps = securitySteps(account, backupSavedAt)
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  const label = (key: (typeof steps)[number]["key"]) =>
    key === "password"
      ? m.settings_sec_action_set()
      : key === "passkey"
        ? m.common_add()
        : key === "two-factor"
          ? m.settings_sec_action_turn_on()
          : m.settings_sec_action_save_codes()
  return (
    <SettingGroup>
      <div id="checklist" className="px-5 py-5 max-md:px-4">
        <div className="flex items-center gap-5">
          <svg
            viewBox="0 0 56 56"
            className="size-14 shrink-0 -rotate-90"
            role="img"
            aria-label={m.settings_sec_ring_label({ done, total: steps.length })}
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
            <div className="text-[15px] font-semibold">{m.settings_sec_progress({ done, total: steps.length })}</div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{m.settings_sec_checklist_description()}</p>
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
                className="flex min-h-[34px] items-center gap-2.5 text-[13.5px] text-subtle-foreground data-done:text-foreground max-md:min-h-11"
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
                    className="relative ml-auto h-7 bg-card text-xs font-normal after:absolute after:inset-x-0 after:-inset-y-1.5 max-md:h-8 max-md:min-h-0"
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
      title={m.settings_sec_password()}
      description={hasPassword ? m.settings_sec_password_description() : m.settings_sec_password_description_none()}
      control={
        <Button variant="outline" className="h-9 bg-card px-3 text-[13px] font-normal" onClick={() => setOpen(true)}>
          {hasPassword ? m.settings_sec_change_password() : m.settings_sec_set_a_password()}
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
      title={m.settings_sec_passkeys()}
      description={m.settings_sec_passkeys_description()}
      control={
        <Button variant="outline" className="h-9 bg-card px-3 text-[13px] font-normal" onClick={onAdd}>
          <FingerprintIcon /> {m.settings_sec_add_passkey()}
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
                <PasskeyName key={p.name ?? ""} id={p.id} name={p.name ?? ""} onSaved={refetch} />
                <p className="text-xs text-muted-foreground">
                  {p.backedUp
                    ? m.settings_sec_passkey_added_synced({ date: when(p.createdAt) })
                    : m.settings_sec_passkey_added({ date: when(p.createdAt) })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={p.name ? m.settings_sec_remove_named({ name: p.name }) : m.settings_sec_remove_passkey()}
                onClick={() => setRemoving({ id: p.id, name: p.name ?? "" })}
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
              <DialogTitle>
                {removing.name
                  ? m.settings_sec_remove_title({ name: removing.name })
                  : m.settings_sec_remove_this_title()}
              </DialogTitle>
              <DialogDescription>{m.settings_sec_remove_body()}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoving(null)}>
                {m.common_cancel()}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (
                    await attempt(
                      () => authClient.passkey.deletePasskey({ id: removing.id }),
                      m.settings_sec_passkey_removed()
                    )
                  )
                    refetch()
                  setRemoving(null)
                }}
              >
                {m.common_remove()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SettingRow>
  )
}

/** What to say when Google sends you back here without connecting. */
const linkError = (code: string) =>
  code === "email_does_not_match"
    ? m.settings_sec_google_mismatch()
    : code === "account_already_linked_to_different_user"
      ? m.settings_sec_google_taken()
      : m.settings_sec_google_failed()

/** Signing in with Google. Hidden when this deployment has no Google client. */
function Google() {
  const { google, hasPassword } = useAccount()
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  // Connecting leaves for Google and comes back to this page, with ?error= when it failed.
  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get("error")
    if (!code) return
    toast.error(linkError(code))
    url.searchParams.delete("error")
    url.searchParams.delete("error_description")
    history.replaceState(history.state, "", url)
  }, [])
  if (!google) return null
  const { accountId } = google

  return (
    <SettingRow
      id="google"
      title="Google"
      description={
        !accountId
          ? m.settings_sec_google_description_none()
          : hasPassword
            ? m.settings_sec_google_description_on()
            : m.settings_sec_google_description_no_password()
      }
      control={
        accountId ? (
          <Button
            variant="outline"
            className="h-9 bg-card px-3 text-[13px] font-normal"
            disabled={!hasPassword}
            onClick={() => setRemoving(true)}
          >
            {m.settings_sec_disconnect()}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-9 bg-card px-3 text-[13px] font-normal"
            onClick={() => {
              const here = window.location.pathname
              void attempt(() =>
                authClient.linkSocial({ provider: "google", callbackURL: here, errorCallbackURL: here })
              )
            }}
          >
            <GoogleLogoIcon /> {m.settings_sec_connect_google()}
          </Button>
        )
      }
    >
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{m.settings_sec_google_disconnect_title()}</DialogTitle>
              <DialogDescription>{m.settings_sec_google_disconnect_body()}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoving(false)}>
                {m.common_cancel()}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const res = await authClient.unlinkAccount({ accountId: accountId! })
                  // Better Auth only unlinks from a session started in the last day.
                  if (res.error?.code === "SESSION_NOT_FRESH") toast.error(m.settings_sec_google_not_fresh())
                  else if (await attempt(async () => res, m.settings_sec_google_disconnected()))
                    void router.invalidate()
                  setRemoving(false)
                }}
              >
                {m.settings_sec_disconnect()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SettingRow>
  )
}

/** A passkey's name, editable in place and saved when you leave the field. */
// The row is keyed by the saved name, so a rename from elsewhere starts the field afresh.
function PasskeyName({ id, name, onSaved }: { id: string; name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name)
  return (
    <input
      aria-label={m.settings_sec_passkey_name()}
      value={value}
      placeholder={m.settings_sec_passkey_placeholder()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onBlur={async () => {
        const next = value.trim()
        if (next === name) return
        if (await attempt(() => authClient.passkey.updatePasskey({ id, name: next }), m.settings_sec_passkey_renamed()))
          onSaved()
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
          : m.settings_sec_this_device()
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
      title={m.settings_sec_two_factor()}
      description={
        !hasPassword && !enabled
          ? m.settings_sec_two_factor_need_password()
          : enabled
            ? m.settings_sec_two_factor_on()
            : m.settings_sec_two_factor_off()
      }
      control={
        <>
          {enabled && (
            <Button
              variant="ghost"
              className="h-9 px-3 text-[13px] font-normal text-subtle-foreground"
              onClick={() => setStep("regenerate")}
            >
              {m.settings_sec_new_codes_button()}
            </Button>
          )}
          <Switch
            aria-label={m.settings_sec_two_factor()}
            checked={enabled || step === "scan" || step === "codes"}
            disabled={!hasPassword && !enabled}
            onCheckedChange={(on) => setStep(on ? "password" : "disable")}
          />
        </>
      }
    >
      {step === "password" && (
        <PasswordPrompt
          title={m.settings_sec_enable_title()}
          description={m.settings_sec_enable_description()}
          action={m.common_continue()}
          onCancel={close}
          onSubmit={async (password) => {
            const res = await authClient.twoFactor.enable({ password, issuer: "Kosha" })
            if (res.error || !res.data || !("totpURI" in res.data)) {
              toast.error(res.error ? authMessage(res.error) : m.settings_sec_enable_failed())
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
            // Record when the codes were saved, which ticks off the checklist's last step.
            void save(() => savePreferences({ data: { backup_codes_saved_at: String(Math.floor(Date.now() / 1000)) } }))
          }}
        />
      )}
      {step === "regenerate" && (
        <PasswordPrompt
          title={m.settings_sec_codes_title()}
          description={m.settings_sec_codes_description()}
          action={m.settings_sec_codes_action()}
          onCancel={close}
          onSubmit={async (password) => {
            const res = await authClient.twoFactor.generateBackupCodes({ password })
            if (res.error || !res.data) {
              toast.error(res.error ? authMessage(res.error) : m.settings_sec_codes_failed())
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
          title={m.settings_sec_disable_title()}
          description={m.settings_sec_disable_description()}
          action={m.settings_sec_turn_off()}
          destructive
          onCancel={close}
          onSubmit={async (password) => {
            const ok = await attempt(() => authClient.twoFactor.disable({ password }), m.settings_sec_disabled())
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
    if (next !== String(f.get("confirm"))) return setError(m.settings_sec_password_mismatch())
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
          m.settings_sec_password_changed()
        )
      : await attempt(() => setAccountPassword({ data: { password: next } }), m.settings_sec_password_set())
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
          <DialogTitle>{hasPassword ? m.settings_sec_change_password() : m.settings_sec_set_a_password()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {hasPassword && (
            <Field name="current" label={m.settings_sec_current_password()} autoComplete="current-password" />
          )}
          <Field
            name="new"
            label={m.settings_sec_new_password()}
            autoComplete="new-password"
            minLength={10}
            hint={m.settings_sec_password_hint()}
          />
          <Field
            name="confirm"
            label={m.settings_sec_new_password_again()}
            autoComplete="new-password"
            minLength={10}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={busy}>
              {hasPassword ? m.settings_sec_change_password() : m.settings_sec_set_password()}
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
          <Field name="password" label={m.settings_sec_password()} autoComplete="current-password" autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {m.common_cancel()}
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
          <DialogTitle>{m.settings_sec_scan_title()}</DialogTitle>
          <DialogDescription>{m.settings_sec_scan_description()}</DialogDescription>
        </DialogHeader>
        {/* uqr draws the QR here from the secret; it never leaves the page. */}
        <div
          className="mx-auto size-48 rounded-lg bg-white p-2 text-black [&_svg]:size-full"
          aria-label={m.settings_sec_qr_label()}
          role="img"
          dangerouslySetInnerHTML={{ __html: renderSVG(uri, { border: 1 }) }}
        />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{m.settings_sec_cant_scan()}</summary>
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
              m.settings_sec_two_factor_is_on()
            )
            setBusy(false)
            if (ok) onVerified()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="totp">{m.settings_sec_code()}</Label>
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
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={busy}>
              {m.settings_sec_verify()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `${m.settings_sec_codes_file_title()}\n${m.settings_sec_codes_file_note()}\n\n${codes.join("\n")}\n`
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_sec_save_codes_title()}</DialogTitle>
          <DialogDescription>{m.settings_sec_save_codes_description()}</DialogDescription>
        </DialogHeader>
        <ol className="num grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-muted px-4 py-3 text-sm select-all">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => attempt(() => navigator.clipboard.writeText(text), m.settings_sec_copied())}
            >
              <CopyIcon /> {m.settings_sec_copy()}
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
              <DownloadSimpleIcon /> {m.settings_sec_download()}
            </Button>
          </div>
          <Button onClick={onDone}>
            <CheckCircleIcon /> {m.settings_sec_saved_them()}
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
          : m.settings_sec_browser()
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
  return { label: os ? m.settings_sec_browser_on({ browser, os }) : browser, mobile: /iPhone|Android|Mobile/.test(s) }
}

function Sessions() {
  const current = authClient.useSession().data?.session.token
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const load = () => void authClient.listSessions().then((r) => setSessions((r.data as Session[] | null) ?? []))
  useEffect(load, [])
  const others = (sessions ?? []).filter((s) => s.token !== current)

  return (
    <SettingGroup
      label={m.settings_sec_devices()}
      actions={
        others.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-[13px] font-normal text-subtle-foreground"
            onClick={async () => {
              if (await attempt(() => authClient.revokeOtherSessions(), m.settings_sec_signed_out_others())) load()
            }}
          >
            {m.settings_sec_sign_out_others()}
          </Button>
        )
      }
    >
      <div id="devices">
        {sessions === null && <p className="px-5 py-4 text-sm text-muted-foreground">{m.common_loading()}</p>}
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
                    {here && <Pill>{m.settings_sec_this_device()}</Pill>}
                  </p>
                  <p data-plain className="num truncate text-xs text-muted-foreground">
                    {[
                      s.ipAddress,
                      here ? m.settings_sec_active_now() : m.settings_sec_active_on({ date: when(s.updatedAt) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {!here && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[13px] font-normal text-subtle-foreground"
                    onClick={async () => {
                      if (
                        await attempt(() => authClient.revokeSession({ token: s.token }), m.settings_sec_signed_out())
                      )
                        load()
                    }}
                  >
                    {m.settings_sec_sign_out()}
                  </Button>
                )}
              </div>
            )
          })}
      </div>
    </SettingGroup>
  )
}
