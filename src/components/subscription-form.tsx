import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/date-time"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CategoryIcon } from "@/components/category-icon"
import { Pick } from "@/components/pick"
import { segment, segmentButton, useMeta } from "@/components/shell"
import { saveSubscription, type SubscriptionView } from "@/lib/api"
import { TRANSFER_CATEGORY, dayOf, isNeutral, parseAmount, type Unit } from "@/lib/core"
import { cn } from "@/lib/utils"

const units = (): { value: Unit; label: string }[] => [
  { value: "day", label: m.subs_unit_days() },
  { value: "week", label: m.subs_unit_weeks() },
  { value: "month", label: m.subs_unit_months() },
  { value: "year", label: m.subs_unit_years() },
]
// Income is stored as a "repetitive" schedule with a positive amount.
type Kind = "subscription" | "repetitive" | "income" | "transfer"

/** What a new schedule starts with, e.g. a regular payment Kosha spotted. Amount is signed cents. */
type Preset = {
  name: string
  amount: number
  walletId: string
  categoryId: string
  every: number
  unit: Unit
  nextDay: string
  variable: boolean
}

/** Create or edit the schedule and template of a subscription, bill, recurring income or recurring transfer. */
export function SubscriptionForm({
  initial,
  preset,
  transfer: startAsTransfer,
  onDone,
}: {
  initial?: SubscriptionView
  preset?: Preset
  transfer?: boolean
  onDone: (id: string) => void
}) {
  const meta = useMeta()
  const router = useRouter()
  const today = dayOf(Date.now() / 1000, meta.tz)
  const active = meta.wallets.filter((w) => !w.archived)
  const [kind, setKind] = useState<Kind>(
    initial?.to_wallet_id || (!initial && startAsTransfer)
      ? "transfer"
      : (initial?.amount ?? preset?.amount ?? 0) > 0
        ? "income"
        : initial?.kind === "repetitive" || (!initial && preset?.variable)
          ? "repetitive"
          : "subscription"
  )
  const [name, setName] = useState(initial?.name ?? preset?.name ?? "")
  const [amount, setAmount] = useState(
    initial ? (Math.abs(initial.amount) / 100).toFixed(2) : preset ? (Math.abs(preset.amount) / 100).toFixed(2) : ""
  )
  const [walletId, setWalletId] = useState(initial?.wallet_id ?? preset?.walletId ?? active[0]?.id ?? "")
  const [toWalletId, setToWalletId] = useState(initial?.to_wallet_id ?? "")
  const [toAmount, setToAmount] = useState(initial?.to_amount ? (initial.to_amount / 100).toFixed(2) : "")
  const [variable, setVariable] = useState(!!initial?.variable)
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? preset?.categoryId ?? "")
  const [every, setEvery] = useState(String(initial?.every ?? preset?.every ?? 1))
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? preset?.unit ?? "month")
  const [nextDay, setNextDay] = useState(initial?.next?.due_day ?? initial?.start_day ?? preset?.nextDay ?? today)
  const [endDay, setEndDay] = useState(initial?.end_day ?? "")
  // New schedules start from Settings › Recurring › Record payments automatically.
  const [autoPay, setAutoPay] = useState(initial ? !!initial.auto_pay : meta.prefs.default_auto_pay === "1")
  const [note, setNote] = useState(initial?.note ?? "")
  const [busy, setBusy] = useState(false)
  const transfer = kind === "transfer"
  const income = kind === "income"
  const wallet = meta.wallets.find((w) => w.id === walletId)
  const toWallet = meta.wallets.find((w) => w.id === toWalletId)
  const crossCurrency = transfer && !!toWallet && toWallet.currency !== wallet?.currency
  const walletOptions = meta.wallets.map((w) => ({ value: w.id, label: w.name }))
  const categories = meta.categories.filter(
    (c) =>
      !isNeutral(c.id) &&
      (!c.archived || c.id === initial?.category_id) &&
      (!!c.income === income || c.id === categoryId)
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseAmount(amount)
    if (!cents) return toast.error(variable ? m.subs_enter_usual_amount() : m.subs_enter_amount())
    if (transfer && (!toWalletId || toWalletId === walletId)) return toast.error(m.subs_pick_to_account())
    if (!transfer && !categoryId) return toast.error(m.subs_pick_category())
    setBusy(true)
    try {
      const { id } = await saveSubscription({
        data: {
          id: initial?.id,
          note,
          autoPay,
          every: Math.max(1, Number(every) || 1),
          unit,
          nextDay,
          endDay: endDay || null,
          walletId,
          name: name.trim() || (transfer ? `${wallet?.name} → ${toWallet?.name}` : ""),
          kind: kind === "subscription" ? "subscription" : "repetitive",
          categoryId: transfer ? TRANSFER_CATEGORY : categoryId,
          amount: Math.abs(cents) * (income ? 1 : -1),
          toWalletId: transfer ? toWalletId : null,
          toAmount: crossCurrency && !variable ? parseAmount(toAmount) : null,
          variable: transfer && variable,
        },
      })
      await router.invalidate()
      toast.success(
        initial
          ? m.common_saved()
          : transfer
            ? m.subs_transfer_added()
            : income
              ? m.subs_income_added()
              : kind === "repetitive"
                ? m.subs_bill_added()
                : m.subs_subscription_added()
      )
      onDone(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.accounts_save_failed())
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div role="group" aria-label={m.subs_type()} className={cn(segment, "w-fit")}>
        {(
          [
            ["repetitive", m.subs_kind_bill],
            ["subscription", m.subs_kind_subscription],
            ["income", m.subs_kind_income],
            ["transfer", m.subs_kind_transfer],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={segmentButton}>
            {label()}
          </button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="sub-name">
          {m.subs_name()} {transfer && <span className="text-muted-foreground">{m.accounts_optional()}</span>}
        </Label>
        <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>

      {transfer ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{m.subs_from()}</Label>
            <Pick
              value={walletId}
              onChange={setWalletId}
              placeholder={m.subs_account()}
              options={walletOptions}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{m.subs_to()}</Label>
            <Pick
              value={toWalletId}
              onChange={setToWalletId}
              placeholder={m.subs_account()}
              options={walletOptions.filter((o) => o.value !== walletId)}
              className="w-full"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{m.subs_account()}</Label>
            <Pick
              value={walletId}
              onChange={setWalletId}
              placeholder={m.subs_account()}
              options={walletOptions}
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{m.subs_category()}</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId((v as string | null) ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.subs_category()}>
                  {(v: string) => {
                    const c = categories.find((x) => x.id === v)
                    return c ? (
                      <>
                        <CategoryIcon icon={c.icon} className="size-4" />
                        {c.name}
                      </>
                    ) : (
                      m.subs_category()
                    )
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sub-amount">
            {variable ? m.subs_usual_amount() : m.subs_amount()}{" "}
            {wallet && <span className="text-muted-foreground uppercase">({wallet.currency})</span>}
          </Label>
          <Input
            id="sub-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="num"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{m.subs_repeats_every()}</Label>
          <div className="flex gap-2">
            <Input
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              inputMode="numeric"
              className="num w-14"
              aria-label={m.subs_interval()}
            />
            <Pick
              value={unit}
              onChange={(v) => v && setUnit(v as Unit)}
              placeholder={m.subs_unit_months()}
              options={units()}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {transfer && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
          <span>
            {m.subs_variable()}
            <span className="block text-xs text-muted-foreground">{m.subs_variable_hint()}</span>
          </span>
        </label>
      )}
      {crossCurrency && !variable && (
        <div className="grid gap-1.5">
          <Label htmlFor="sub-to-amount">
            {m.subs_amount_received()} <span className="text-muted-foreground uppercase">({toWallet?.currency})</span>
          </Label>
          <Input
            id="sub-to-amount"
            value={toAmount}
            onChange={(e) => setToAmount(e.target.value)}
            inputMode="decimal"
            className="num"
          />
          <p className="text-xs text-muted-foreground">{m.subs_leave_empty_rate()}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sub-next">{initial ? m.subs_next_payment() : m.subs_first_payment()}</Label>
          <DatePicker id="sub-next" value={nextDay} onChange={setNextDay} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sub-end">
            {m.subs_ends()} <span className="text-muted-foreground">{m.accounts_optional()}</span>
          </Label>
          <DatePicker
            id="sub-end"
            value={endDay}
            min={nextDay}
            onChange={setEndDay}
            clearable
            placeholder={m.subs_never()}
          />
        </div>
      </div>
      {autoPay && !variable && nextDay < today && (
        <p className="-mt-2 text-xs text-muted-foreground">{m.subs_backfill_hint({ date: nextDay })}</p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="sub-note">
          {m.subs_note()} <span className="text-muted-foreground">{m.accounts_optional()}</span>
        </Label>
        <Input id="sub-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {!(transfer && variable) && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} />
          {m.subs_auto_pay()}
        </label>
      )}

      {initial && <p className="text-xs text-muted-foreground">{m.subs_changes_hint()}</p>}
      <Button type="submit" disabled={busy}>
        {initial
          ? m.subs_save_changes()
          : transfer
            ? m.subs_add_transfer()
            : income
              ? m.subs_add_income()
              : kind === "repetitive"
                ? m.subs_add_bill()
                : m.subs_add_subscription()}
      </Button>
    </form>
  )
}
