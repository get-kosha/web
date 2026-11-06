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
import { LOCALE } from "@/lib/core"
import { cn } from "@/lib/utils"

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
        title="Delete all transactions"
        description="Deletes transactions, transfers, investment values and recurring payments. Keeps your accounts, categories, rules and settings."
        control={
          <Button variant="outline" className={dangerButton} disabled={!transactions} onClick={() => setReset(true)}>
            Delete transactions…
          </Button>
        }
      >
        {reset && <ResetDialog count={transactions} onClose={() => setReset(false)} />}
      </SettingRow>
      <SettingRow
        id="delete-account"
        danger
        title="Delete account"
        description="Removes your account and every transaction, account, category and recurring payment in it."
        control={
          <Button variant="outline" className={dangerButton} onClick={() => setOpen(true)}>
            Delete account…
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
  const n = `${count.toLocaleString(LOCALE)} ${count === 1 ? "transaction" : "transactions"}`
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WarningIcon className="size-5 text-destructive" /> Delete all transactions?
          </DialogTitle>
          <DialogDescription>
            {n}, their transfers and investment values, and every recurring payment go. Accounts, categories, rules and
            settings stay. This can't be undone, so export first if you might want them.
          </DialogDescription>
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
              toast.success(`Deleted ${n}`)
              onClose()
            } catch (err) {
              toast.error(errorOf(err))
              setBusy(false)
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reset-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
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
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={typed !== "DELETE" || busy}>
              {busy ? "Deleting…" : `Delete ${n}`}
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
              This deletes everything in Kosha for {meta.user.email}. There is no backup and it can't be undone.
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
                ? "Enter your password to confirm. Kosha deletes your account as soon as you press the button."
                : "Kosha deletes your account as soon as you press the button."}
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
