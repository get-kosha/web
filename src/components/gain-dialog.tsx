import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/date-time"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMeta } from "@/components/shell"
import { recordGain, type Wallet } from "@/lib/api"
import { dayOf, fmt, parseAmount } from "@/lib/core"
import { cn } from "@/lib/utils"

const pct = (part: number, whole: number) =>
  whole ? `${part >= 0 ? "+" : ""}${((part / whole) * 100).toFixed(1)}%` : ""

/** Record an investment's value. The dialog is open while `wallet` is set. */
export function GainDialog({ wallet, onClose }: { wallet: Wallet | null; onClose: () => void }) {
  return (
    <Dialog open={!!wallet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {wallet && <GainForm key={wallet.id} w={wallet} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** Enter either today's market value or the gain, and the form works out the other from the amount invested. */
function GainForm({ w, onDone }: { w: Wallet; onDone: () => void }) {
  const meta = useMeta()
  const router = useRouter()
  const start = w.gain ?? 0
  const [value, setValue] = useState(((w.balance + start) / 100).toFixed(2))
  const [gain, setGain] = useState((start / 100).toFixed(2))
  const [day, setDay] = useState(dayOf(Date.now() / 1000, meta.tz))
  const [note, setNote] = useState("")
  const cents = parseAmount(gain) ?? 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (parseAmount(gain) === null) return toast.error("Enter the gain or current value")
    try {
      await recordGain({ data: { walletId: w.id, day, gain: cents, note } })
      await router.invalidate()
      toast.success("Gains updated")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Update {w.name}</DialogTitle>
        <DialogDescription>
          {fmt(w.balance, w.currency)} invested. Enter today's value from your broker, or the gain directly.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="g-value">Current value</Label>
          <Input
            id="g-value"
            value={value}
            inputMode="decimal"
            className="num"
            autoFocus
            onChange={(e) => {
              setValue(e.target.value)
              const v = parseAmount(e.target.value)
              if (v !== null) setGain(((v - w.balance) / 100).toFixed(2))
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="g-gain">Gain</Label>
          <Input
            id="g-gain"
            value={gain}
            inputMode="decimal"
            className={cn("num", cents > 0 && "text-positive", cents < 0 && "text-destructive")}
            onChange={(e) => {
              setGain(e.target.value)
              const g = parseAmount(e.target.value)
              if (g !== null) setValue(((w.balance + g) / 100).toFixed(2))
            }}
          />
        </div>
      </div>
      <p className="num -mt-2 text-xs text-muted-foreground">Return {pct(cents, w.balance) || "—"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="g-day">As of</Label>
          <DatePicker id="g-day" value={day} onChange={setDay} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="g-note">
            Note <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="g-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <Button type="submit">Save</Button>
    </form>
  )
}
