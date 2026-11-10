import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { HandCoinsIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Pick } from "@/components/pick"
import { Suggest } from "@/components/suggest"
import { segment, segmentButton, useGlobals, useMeta } from "@/components/shell"
import { createLoan, editLoan, listTransactions, recordLoanRepayment, type Tx } from "@/lib/api"
import { addDays, dayOf, fmt, intlLocale, isNeutral, parseAmount, refundList } from "@/lib/core"
import { loanStatus, loanTotals, type Loan } from "@/lib/loans"
import { cn } from "@/lib/utils"

export const loanDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
export function AccountTabs({ loans = false }: { loans?: boolean }) {
  return (
    <nav aria-label={m.accounts_title()} className="flex gap-6 border-b text-sm">
      <Link
        to="/accounts"
        className={cn(
          "flex min-h-11 items-center border-b-2",
          loans ? "border-transparent text-muted-foreground" : "border-foreground font-medium"
        )}
        aria-current={!loans ? "page" : undefined}
      >
        {m.accounts_title()}
      </Link>
      <Link
        to="/loans"
        className={cn(
          "flex min-h-11 items-center border-b-2",
          loans ? "border-foreground font-medium" : "border-transparent text-muted-foreground"
        )}
        aria-current={loans ? "page" : undefined}
      >
        {m.loans_title()}
      </Link>
    </nav>
  )
}
export function LoanState({ loan }: { loan: Loan }) {
  const status = loanStatus(loan)
  return (
    <span className={cn("text-xs", status === "paid" ? "text-positive" : "text-muted-foreground")}>
      {status === "paid" ? m.loans_paid() : status === "partial" ? m.loans_partial() : m.loans_unpaid()}
    </span>
  )
}
export function LoanSummary({ loans }: { loans: Loan[] }) {
  const meta = useMeta(),
    { currency } = useGlobals()
  const totals = loanTotals(loans, currency, meta.rates)
  return (
    <div>
      <div className="grid grid-cols-2 divide-x">
        <div className="pr-4">
          <p className="text-xs text-muted-foreground">{m.loans_owed_to_you()}</p>
          <p className="num mt-1 text-[28px] tracking-tight">{fmt(totals.lent, currency)}</p>
        </div>
        <div className="pl-4">
          <p className="text-xs text-muted-foreground">{m.loans_you_owe()}</p>
          <p className="num mt-1 text-[28px] tracking-tight">{fmt(totals.borrowed, currency)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{m.loans_current()}</p>
    </div>
  )
}
export function LoansCard({ loans }: { loans: Loan[] }) {
  const meta = useMeta()
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const due = loans
    .filter((l) => l.remaining > 0 && l.dueDay && l.dueDay <= addDays(today, 7))
    .sort((a, b) => a.dueDay!.localeCompare(b.dueDay!))
    .slice(0, 3)
  return (
    <section className="rounded-xl border bg-card p-4 md:p-5">
      <Link to="/loans" className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <HandCoinsIcon className="size-5" />
          {m.loans_title()}
        </h2>
        <span className="text-xs text-muted-foreground">{m.overview_accounts_link()}</span>
      </Link>
      {loans.some((l) => l.remaining) ? (
        <LoanSummary loans={loans} />
      ) : (
        <p className="text-sm text-muted-foreground">{m.loans_empty()}</p>
      )}
      {due.map((l) => (
        <Link
          key={l.id}
          to="/loans"
          search={{ loan: l.id }}
          className="mt-3 flex min-h-11 items-center justify-between gap-3 border-t pt-3 text-sm"
        >
          <span>
            {l.person}
            <span className={cn("mt-1 block text-xs", l.dueDay! < today ? "text-warning" : "text-muted-foreground")}>
              {l.dueDay! < today
                ? m.loans_overdue({ date: loanDay(l.dueDay!) })
                : m.loans_due_on({ date: loanDay(l.dueDay!) })}
            </span>
          </span>
          <span className="text-right">
            <span className="num">{fmt(l.remaining, l.currency)}</span>
            <span className="block text-xs text-muted-foreground">
              {l.direction === "lent" ? m.loans_owed_to_you() : m.loans_you_owe()}
            </span>
          </span>
        </Link>
      ))}
    </section>
  )
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="grid gap-1.5 text-xs text-muted-foreground">
    {label}
    {children}
  </label>
)

/** Loan creation and repayments share the cash-entry fields; agreement terms remain independent of payments. */
export function LoanForm({
  loan,
  editing = false,
  people = [],
  onDone,
  onCancel,
  onSavingChange,
}: {
  loan?: Loan
  editing?: boolean
  people?: string[]
  onDone: (id: string) => Promise<void>
  onCancel: () => void
  onSavingChange: (saving: boolean) => void
}) {
  const meta = useMeta()
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const [id] = useState(() => crypto.randomUUID())
  const [direction, setDirection] = useState<"lent" | "borrowed">(loan?.direction ?? "lent")
  const [source, setSource] = useState("new")
  const [person, setPerson] = useState(loan?.person ?? "")
  const [purpose, setPurpose] = useState(loan?.purpose ?? "")
  const [note, setNote] = useState(editing ? (loan?.note ?? "") : "")
  const [due, setDue] = useState(loan?.dueDay ?? "")
  const [accountId, setAccountId] = useState(meta.wallets.find((w) => !w.archived)?.id ?? "")
  const [currency, setCurrency] = useState(meta.wallets.find((w) => w.id === accountId)?.currency ?? meta.primary)
  const [amount, setAmount] = useState("")
  const [accountAmount, setAccountAmount] = useState("")
  const [day, setDay] = useState(today)
  const [entry, setEntry] = useState<Tx | null>(null)
  const [query, setQuery] = useState("")
  const [entries, setEntries] = useState<Tx[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const wallet = meta.wallets.find((w) => w.id === (entry?.wallet_id ?? accountId))
  const moneyIn = loan ? direction === "lent" : direction === "borrowed"
  const loanCurrency = loan?.currency ?? (source === "opening" ? currency : (wallet?.currency ?? currency))
  const cents = parseAmount(amount)
  const cross = !!loan && wallet?.currency !== loanCurrency
  const starts = loan?.day
  useEffect(() => {
    if (source !== "existing") return
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      listTransactions({ data: { all: true, q: query || undefined, limit: 100 } })
        .then((result) => {
          if (active)
            setEntries(
              result.rows.filter(
                (t) =>
                  !t.loan_id &&
                  !t.transfer_id &&
                  !t.subscription_id &&
                  !t.refund_of &&
                  !refundList(t.refunds).length &&
                  !isNeutral(t.category_id) &&
                  !!t.paid &&
                  t.amount > 0 === moneyIn &&
                  (!starts || dayOf(t.date, meta.tz) >= starts)
              )
            )
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : m.tx_save_failed())
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 150)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [source, query, moneyIn, starts, meta.tz])
  function chooseEntry(tx: Tx) {
    setEntry(tx)
    setDay(dayOf(tx.date, meta.tz))
    setAccountId(tx.wallet_id)
    const cur = meta.wallets.find((w) => w.id === tx.wallet_id)?.currency ?? currency
    setCurrency(cur)
    setAccountAmount((Math.abs(tx.amount) / 100).toFixed(2))
    if (!loan || cur === loan.currency) setAmount((Math.abs(tx.amount) / 100).toFixed(2))
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!navigator.onLine) {
      setError(m.loans_offline())
      return
    }
    if (!editing && (!cents || cents < 0 || (loan && cents > loan.remaining))) {
      setError(loan && cents && cents > loan.remaining ? m.loans_overpaid() : m.server_amount_required())
      return
    }
    if (source === "existing" && !entry && !editing) {
      setError(m.loans_choose_entry())
      return
    }
    setBusy(true)
    onSavingChange(true)
    try {
      let saved: string
      if (editing && loan) {
        await editLoan({ data: { id: loan.id, person, purpose, note, dueDay: due || null } })
        saved = loan.id
      } else if (loan)
        saved = await recordLoanRepayment({
          data: {
            id,
            loanId: loan.id,
            amount: cents!,
            day,
            accountId: source === "new" ? accountId : undefined,
            transactionId: source === "existing" ? entry!.id : undefined,
            accountAmount: cross ? (parseAmount(accountAmount) ?? undefined) : undefined,
            note,
          },
        })
      else
        saved = await createLoan({
          data: {
            id,
            direction,
            source: source as "new" | "existing" | "opening",
            person,
            purpose,
            note,
            dueDay: due || null,
            amount: cents!,
            currency: loanCurrency,
            day,
            accountId: source === "new" ? accountId : undefined,
            transactionId: source === "existing" ? entry!.id : undefined,
          },
        })
      await onDone(saved)
      toast.success(m.loans_saved())
    } catch (e) {
      setError(e instanceof Error ? e.message : m.tx_save_failed())
    } finally {
      setBusy(false)
      onSavingChange(false)
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      {!loan && (
        <div className={segment} role="group" aria-label={m.tx_type()}>
          {(["lent", "borrowed"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              className={cn(segmentButton, "min-h-11 flex-1")}
              onClick={() => {
                setDirection(d)
                setEntry(null)
              }}
            >
              {d === "lent" ? m.loans_lent() : m.loans_borrowed()}
            </button>
          ))}
        </div>
      )}
      {!editing && (
        <Pick
          value={source}
          onChange={(v) => {
            setSource(v || "new")
            setEntry(null)
          }}
          aria-label={m.loans_new_movement()}
          placeholder={m.loans_new_movement()}
          options={[
            { value: "new", label: m.loans_new_movement() },
            { value: "existing", label: m.loans_existing() },
            ...(!loan ? [{ value: "opening", label: m.loans_opening() }] : []),
          ]}
        />
      )}
      {(!loan || editing) && (
        <Field label={m.loans_person()}>
          <Suggest value={person} onChange={setPerson} options={people} render={<Input required maxLength={200} />} />
        </Field>
      )}
      {!editing && source === "existing" && (
        <div className="grid gap-2">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setEntry(null)
            }}
            aria-label={m.loans_find()}
            placeholder={m.loans_find()}
          />
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            {loading ? (
              <p role="status" className="p-3 text-xs text-muted-foreground">
                {m.common_loading()}
              </p>
            ) : (
              entries.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  aria-pressed={entry?.id === tx.id}
                  onClick={() => chooseEntry(tx)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-b p-3 text-left text-sm last:border-0 aria-pressed:bg-muted"
                >
                  <span>
                    {tx.name}
                    <span className="block text-xs text-muted-foreground">
                      {loanDay(dayOf(tx.date, meta.tz))} · {meta.wallets.find((w) => w.id === tx.wallet_id)?.name}
                    </span>
                  </span>
                  <span className="num">
                    {fmt(tx.amount, meta.wallets.find((w) => w.id === tx.wallet_id)?.currency ?? currency)}
                  </span>
                </button>
              ))
            )}
            {!loading && !entries.length && (
              <p className="p-3 text-xs text-muted-foreground">{m.loans_choose_entry()}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{m.loans_link_note()}</p>
        </div>
      )}
      {!editing && (
        <>
          <Field
            label={`${cross ? m.loans_applied() : source === "opening" ? m.loans_starting() : m.tx_amount()} · ${loanCurrency.toUpperCase()}`}
          >
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
              readOnly={source === "existing" && !cross}
              className="num h-16 text-center text-4xl md:text-4xl"
            />
          </Field>
          {loan && (
            <div className="flex items-center justify-between gap-3">
              <p aria-live="polite" className="num text-xs text-muted-foreground">
                {m.loans_after({ amount: fmt(loan.remaining - Math.max(0, cents ?? 0), loan.currency) })}
              </p>
              <Button variant="outline" type="button" onClick={() => setAmount((loan.remaining / 100).toFixed(2))}>
                {m.loans_full()}
              </Button>
            </div>
          )}
          {source === "new" && (
            <Field label={moneyIn ? m.loans_received_into() : m.loans_paid_from()}>
              <Pick
                value={accountId}
                onChange={setAccountId}
                aria-label={m.tx_account()}
                placeholder={m.loans_choose_account()}
                options={meta.wallets
                  .filter((w) => !w.archived)
                  .map((w) => ({ value: w.id, label: `${w.name} · ${w.currency.toUpperCase()}` }))}
              />
            </Field>
          )}
          {source === "opening" && (
            <Field label={m.accounts_currency()}>
              <Pick
                value={currency}
                onChange={setCurrency}
                aria-label={m.accounts_currency()}
                placeholder={currency.toUpperCase()}
                options={Object.keys(meta.rates)
                  .sort()
                  .map((c) => ({ value: c, label: c.toUpperCase() }))}
              />
            </Field>
          )}
          {cross && (
            <Field label={`${m.loans_account_amount()} · ${wallet?.currency.toUpperCase() ?? ""}`}>
              <Input
                inputMode="decimal"
                value={accountAmount}
                readOnly={source === "existing"}
                onChange={(e) => setAccountAmount(e.target.value)}
                required
                className="num"
              />
            </Field>
          )}
          <Field label={m.tx_date()}>
            <Input
              type="date"
              value={day}
              max={today}
              min={loan?.day}
              readOnly={source === "existing"}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </Field>
        </>
      )}
      {(!loan || editing) && (
        <>
          <Field label={m.loans_due()}>
            <Input type="date" value={due} min={loan?.day ?? day} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={m.loans_purpose()}>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} />
          </Field>
        </>
      )}
      <Field label={m.tx_note()}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
      {!editing && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {source === "opening" ? m.loans_opening_note() : m.loans_neutral()}
        </p>
      )}
      {!editing && !loan && source === "new" && cents && cents > 0 && (
        <p className="text-xs text-muted-foreground">
          {(direction === "lent" ? m.loans_lent_effect : m.loans_borrowed_effect)({
            amount: fmt(cents, loanCurrency),
            account: wallet?.name ?? "",
            person,
            principal: fmt(cents, loanCurrency),
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-popover px-4 pt-4 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {m.common_cancel()}
        </Button>
        <Button disabled={busy || (!editing && source === "existing" && !entry)} type="submit">
          {editing ? m.common_save() : loan ? (moneyIn ? m.loans_received() : m.loans_made()) : m.loans_new()}
        </Button>
      </div>
    </form>
  )
}
