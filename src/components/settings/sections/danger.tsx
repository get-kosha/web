import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { WarningIcon } from "@phosphor-icons/react/ssr"
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
import { useMeta } from "@/components/shell"
import { SettingGroup, SettingRow } from "@/components/settings/row"
import { Field, attempt, useAccount } from "@/components/settings/sections/security"
import { authClient } from "@/lib/auth-client"
import { deleteAllTransactions } from "@/lib/api"
import { errorOf } from "@/components/settings/saved"
import { intlLocale } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { ParaglideMessage } from "@inlang/paraglide-js-react"

const dangerButton =
  "h-9 border-destructive/35 bg-card px-3 text-[13px] font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"

export function DeleteReset() {
  const [open, setOpen] = useState(false)
  const [reset, setReset] = useState(false)
  const { transactions } = useAccount()
  return (
    <SettingGroup danger>
      <SettingRow
        id="delete-transactions"
        title={m.settings_row_delete_transactions()}
        description={m.settings_danger_transactions_desc()}
        control={
          <Button variant="outline" className={dangerButton} disabled={!transactions} onClick={() => setReset(true)}>
            {m.settings_danger_transactions_button()}
          </Button>
        }
      >
        {reset && <ResetDialog count={transactions} onClose={() => setReset(false)} />}
      </SettingRow>
      <SettingRow
        id="delete-account"
        danger
        title={m.settings_row_delete_account()}
        description={m.settings_danger_account_desc()}
        control={
          <Button variant="outline" className={dangerButton} onClick={() => setOpen(true)}>
            {m.settings_danger_account_button()}
          </Button>
        }
      >
        {open && <DeleteFlow onClose={() => setOpen(false)} />}
      </SettingRow>
    </SettingGroup>
  )
}

/** Type DELETE, then the button names the real count. */
function ResetDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const n = { count, n: count.toLocaleString(intlLocale()) }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WarningIcon className="size-5 text-destructive" /> {m.settings_danger_reset_title()}
          </DialogTitle>
          <DialogDescription>{m.settings_danger_reset_body(n)}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (typed !== "DELETE") return
            setBusy(true)
            try {
              await deleteAllTransactions()
              await router.invalidate()
              toast.success(m.settings_danger_reset_done(n))
              onClose()
            } catch (err) {
              toast.error(errorOf(err))
              setBusy(false)
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reset-confirm">
              {/* The word stays DELETE in every language, since that's what the check below compares. */}
              <ParaglideMessage
                message={m.settings_danger_type_to_confirm}
                inputs={{ word: "DELETE" }}
                markup={{ code: ({ children }) => <span className="font-mono font-semibold">{children}</span> }}
              />
            </Label>
            <Input
              id="reset-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-10 font-mono"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" variant="destructive" disabled={typed !== "DELETE" || busy}>
              {busy ? m.settings_danger_deleting() : m.settings_danger_reset_button(n)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Three deliberate steps: see what goes, type your email, then your password. */
function DeleteFlow({ onClose }: { onClose: () => void }) {
  const meta = useMeta()
  const summary = useAccount()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [understood, setUnderstood] = useState(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const emailOk = email.trim().toLowerCase() === meta.user.email.toLowerCase()
  const items = [
    [summary.transactions, m.settings_danger_count_transactions],
    [summary.accounts, m.settings_danger_count_accounts],
    [summary.recurring, m.settings_danger_count_recurring],
    [summary.categories, m.settings_danger_count_categories],
  ] as const

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="num text-xs text-muted-foreground">{m.settings_danger_step({ step })}</p>
          <DialogTitle className="flex items-center gap-2">
            <WarningIcon className="size-5 text-destructive" /> {m.settings_danger_delete_title()}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <>
            <DialogDescription>{m.settings_danger_delete_intro({ email: meta.user.email })}</DialogDescription>
            <ul className="grid gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
              {items.map(([n, label], i) => (
                <li key={i} className="flex justify-between">
                  <span>{label({ count: n })}</span>
                  <span className="num">{n.toLocaleString(intlLocale())}</span>
                </li>
              ))}
              <li className="flex justify-between text-muted-foreground">
                <span>{m.settings_danger_sign_in_items()}</span>
                <span>{m.settings_danger_all()}</span>
              </li>
            </ul>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 size-4 accent-destructive"
              />
              {m.settings_danger_understand()}
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {m.settings_danger_keep()}
              </Button>
              <Button variant="destructive" disabled={!understood} onClick={() => setStep(2)}>
                {m.common_continue()}
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
            <DialogDescription>{m.settings_danger_type_email()}</DialogDescription>
            <div className="grid gap-1.5">
              <Label htmlFor="del-email">{m.settings_row_email()}</Label>
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
                {m.common_back()}
              </Button>
              <Button type="submit" variant="destructive" disabled={!emailOk}>
                {m.common_continue()}
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
              {summary.hasPassword ? m.settings_danger_enter_password() : m.settings_danger_no_password()}
            </DialogDescription>
            {summary.hasPassword && (
              <Field name="password" label={m.settings_row_password()} autoComplete="current-password" autoFocus />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(2)}>
                {m.common_back()}
              </Button>
              <Button type="submit" variant="destructive" disabled={busy} className={cn(busy && "opacity-70")}>
                {busy ? m.settings_danger_deleting() : m.settings_danger_delete_forever()}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
