import { useState } from "react"
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { z } from "zod"
import {
  ArrowLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  HandCoinsIcon,
  PlusIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AccountTabs, LoanForm, LoanState, LoanSummary, loanDay } from "@/components/loans"
import { Pick } from "@/components/pick"
import { PageHeader, PageSkeleton, bottomSheet, segment, segmentButton, useMeta } from "@/components/shell"
import { deleteLoan, getLoan, listLoans, unlinkLoanPayment } from "@/lib/api"
import { dayOf, fmt, isNeutral } from "@/lib/core"
import type { LoanPayment } from "@/lib/loans"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/loans")({
  validateSearch: z.object({ loan: z.string().optional() }),
  loaderDeps: ({ search }) => ({ loan: search.loan }),
  loader: async ({ deps }) => {
    const [loans, detail] = await Promise.all([listLoans(), deps.loan ? getLoan({ data: { id: deps.loan } }) : null])
    return { loans, detail }
  },
  head: () => ({ meta: [{ title: `${m.loans_title()} · Kosha` }] }),
  pendingComponent: PageSkeleton,
  component: Loans,
})

function Loans() {
  const { loans, detail } = Route.useLoaderData()
  const meta = useMeta(),
    router = useRouter(),
    navigate = useNavigate()
  const [direction, setDirection] = useState("all"),
    [state, setState] = useState("open")
  const [form, setForm] = useState<"new" | "repay" | "edit" | null>(null)
  const [unlinking, setUnlinking] = useState<LoanPayment | null>(null)
  const [categoryId, setCategoryId] = useState("")
  const [removing, setRemoving] = useState(false),
    [busy, setBusy] = useState(false)
  const [today] = useState(() => dayOf(Date.now() / 1000, meta.tz))
  const visible = loans
    .filter(
      (l) =>
        (direction === "all" || l.direction === direction) &&
        (state === "all" || (state === "open" ? l.remaining > 0 : l.remaining === 0))
    )
    .sort(
      (a, b) =>
        Number(!!b.dueDay && b.dueDay < today && b.remaining > 0) -
          Number(!!a.dueDay && a.dueDay < today && a.remaining > 0) ||
        (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999") ||
        b.day.localeCompare(a.day)
    )
  const done = async (id: string) => {
    setForm(null)
    await navigate({ to: "/loans", search: { loan: id } })
    await router.invalidate()
  }
  async function detach() {
    if (!unlinking) return
    if (!navigator.onLine) return toast.error(m.loans_offline())
    setBusy(true)
    try {
      await unlinkLoanPayment({ data: { transactionId: unlinking.transactionId, categoryId } })
      const funding = unlinking.kind === "funding"
      setUnlinking(null)
      if (funding) await navigate({ to: "/loans" })
      await router.invalidate()
      toast.success(m.loans_saved())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.tx_save_failed())
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!detail || !navigator.onLine) return toast.error(m.loans_offline())
    setBusy(true)
    try {
      await deleteLoan({ data: { id: detail.loan.id } })
      setRemoving(false)
      await navigate({ to: "/loans" })
      await router.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.tx_save_failed())
    } finally {
      setBusy(false)
    }
  }
  const loan = detail?.loan
  return (
    <div className="pb-8">
      <PageHeader title={m.accounts_title()}>
        <Button size="lg" onClick={() => setForm("new")}>
          <PlusIcon />
          {m.loans_new()}
        </Button>
      </PageHeader>
      <div className="flex flex-col gap-5 px-4 md:px-8">
        <AccountTabs loans />
        {loan && detail ? (
          <>
            <Link to="/loans" className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeftIcon />
              {m.loans_title()}
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <LoanState loan={loan} />
                <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{loan.person}</h2>
                <p className="text-sm text-muted-foreground">
                  {loan.purpose || (loan.direction === "lent" ? m.loans_lent() : m.loans_borrowed())}
                </p>
              </div>
              <Button variant="outline" onClick={() => setForm("edit")}>
                {m.common_edit()}
              </Button>
            </div>
            <div className="grid items-start gap-5 md:grid-cols-2">
              <section className="rounded-xl border bg-card p-5">
                <p className="text-xs text-muted-foreground">
                  {loan.direction === "lent" ? m.loans_owed_to_you() : m.loans_you_owe()}
                </p>
                <p className="num mt-2 text-4xl" aria-live="polite">
                  {fmt(loan.remaining, loan.currency)}
                </p>
                <div
                  role="progressbar"
                  aria-label={m.loans_repaid()}
                  aria-valuenow={loan.repaid}
                  aria-valuemin={0}
                  aria-valuemax={loan.principal}
                  className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    style={{ width: `${(100 * loan.repaid) / loan.principal}%` }}
                    className="h-full rounded-full bg-foreground"
                  />
                </div>
                <dl className="mt-5 grid grid-cols-[1fr_auto] gap-3 text-sm">
                  <dt className="text-muted-foreground">{loan.opening ? m.loans_starting() : m.loans_principal()}</dt>
                  <dd className="num">{fmt(loan.principal, loan.currency)}</dd>
                  <dt className="text-muted-foreground">{m.loans_repaid()}</dt>
                  <dd className="num">{fmt(loan.repaid, loan.currency)}</dd>
                  <dt className="text-muted-foreground">{m.tx_date()}</dt>
                  <dd>{loanDay(loan.day)}</dd>
                  <dt className="text-muted-foreground">{m.loans_due()}</dt>
                  <dd>{loan.dueDay ? loanDay(loan.dueDay) : m.loans_no_due()}</dd>
                </dl>
                {loan.dueDay && loan.dueDay < today && loan.remaining > 0 && (
                  <p className="mt-4 text-xs text-warning">{m.loans_overdue({ date: loanDay(loan.dueDay) })}</p>
                )}
                {loan.note && <p className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">{loan.note}</p>}
                {loan.remaining > 0 && (
                  <Button className="mt-5 w-full" onClick={() => setForm("repay")}>
                    {loan.direction === "lent" ? m.loans_received() : m.loans_made()}
                  </Button>
                )}
                {loan.opening && !detail.payments.length && (
                  <Button variant="destructive" className="mt-4" onClick={() => setRemoving(true)}>
                    {m.loans_remove()}
                  </Button>
                )}
              </section>
              <section className="rounded-xl border bg-card p-5">
                <h3 className="text-sm font-medium">{m.loans_history()}</h3>
                {loan.opening && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {m.loans_tracked_since({ date: loanDay(loan.day) })}
                  </p>
                )}
                <div className="mt-2 divide-y">
                  {detail.payments.map((payment) => (
                    <div key={payment.transactionId} className="py-4">
                      <div className="flex items-start gap-3">
                        {payment.amount > 0 ? (
                          <ArrowDownLeftIcon className="mt-1 size-4 text-positive" />
                        ) : (
                          <ArrowUpRightIcon className="mt-1 size-4 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            {payment.kind === "funding" ? m.loans_original() : m.loans_repayment()}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {loanDay(payment.day)} · {payment.accountName}
                          </p>
                          {payment.note && (
                            <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{payment.note}</p>
                          )}
                        </div>
                        <p className={cn("num text-sm", payment.amount > 0 && "text-positive")}>
                          {fmt(payment.amount, payment.currency)}
                        </p>
                      </div>
                      {payment.currency !== loan.currency && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {m.loans_applied()}: <span className="num">{fmt(payment.principal, loan.currency)}</span>
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-7">
                        <Link
                          to="/transactions"
                          search={{ loan: loan.id, period: "all" }}
                          className="flex min-h-11 items-center text-xs text-muted-foreground"
                        >
                          {m.shell_nav_activity()}
                        </Link>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setCategoryId("")
                            setUnlinking(payment)
                          }}
                        >
                          {m.loans_unlink()}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <p className="max-w-prose text-xs text-muted-foreground">{m.loans_neutral()}</p>
          </>
        ) : (
          <>
            <LoanSummary loans={loans} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={segment} role="group" aria-label={m.loans_title()}>
                {[
                  ["all", m.loans_all()],
                  ["lent", m.loans_owed_to_you()],
                  ["borrowed", m.loans_you_owe()],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    className={cn(segmentButton, "max-md:min-h-11")}
                    aria-pressed={direction === v}
                    onClick={() => setDirection(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Pick
                value={state}
                onChange={(v) => setState(v || "open")}
                aria-label={m.loans_remaining()}
                placeholder={m.loans_open()}
                className="w-36"
                options={[
                  { value: "open", label: m.loans_open() },
                  { value: "paid", label: m.loans_paid() },
                  { value: "all", label: m.loans_all() },
                ]}
              />
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {visible.map((l) => (
                <Link
                  key={l.id}
                  to="/loans"
                  search={{ loan: l.id }}
                  className="flex min-h-20 items-center gap-3 border-b px-4 py-4 last:border-0 hover:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <HandCoinsIcon className="size-5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.person}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {l.direction === "lent" ? m.loans_lent() : m.loans_borrowed()} · {loanDay(l.day)}
                    </p>
                    {l.purpose && <p className="truncate text-xs text-muted-foreground">{l.purpose}</p>}
                    <LoanState loan={l} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm">{fmt(l.remaining, l.currency)}</p>
                    {l.dueDay && l.remaining > 0 && (
                      <p className={cn("mt-1 text-xs", l.dueDay < today ? "text-warning" : "text-muted-foreground")}>
                        {l.dueDay < today
                          ? m.loans_overdue({ date: loanDay(l.dueDay) })
                          : m.loans_due_on({ date: loanDay(l.dueDay) })}
                      </p>
                    )}
                  </div>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                </Link>
              ))}
              {!visible.length && (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-muted-foreground">{m.loans_empty()}</p>
                  <Button className="mt-4" onClick={() => setForm("new")}>
                    {m.loans_new()}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{m.loans_currency_note()}</p>
          </>
        )}
      </div>
      <Dialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open && !busy) setForm(null)
        }}
      >
        <DialogContent className={cn(bottomSheet, "sm:max-w-lg")}>
          <DialogTitle>
            {form === "new"
              ? m.loans_new()
              : form === "edit"
                ? m.loans_terms()
                : loan?.direction === "lent"
                  ? m.loans_received()
                  : m.loans_made()}
          </DialogTitle>
          <DialogDescription>{form === "new" ? m.loans_neutral() : loan?.person}</DialogDescription>
          {form && (
            <LoanForm
              key={`${form}:${loan?.id ?? "new"}`}
              loan={form === "new" ? undefined : loan}
              editing={form === "edit"}
              people={[...new Set(loans.map((l) => l.person))]}
              onSavingChange={setBusy}
              onDone={done}
              onCancel={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!unlinking}
        onOpenChange={(open) => {
          if (!busy && !open) setUnlinking(null)
        }}
      >
        <DialogContent>
          <DialogTitle>{m.loans_unlink()}</DialogTitle>
          <DialogDescription>{m.loans_unlink_warning()}</DialogDescription>
          <Pick
            value={categoryId}
            onChange={setCategoryId}
            placeholder={m.loans_choose_category()}
            aria-label={m.tx_category()}
            options={meta.categories
              .filter(
                (c) => !c.archived && !c.parent_id && !isNeutral(c.id) && !!c.income === (unlinking?.amount ?? 0) > 0
              )
              .map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex justify-end gap-2">
            <Button disabled={busy} variant="outline" onClick={() => setUnlinking(null)}>
              {m.common_cancel()}
            </Button>
            <Button disabled={!categoryId || busy} onClick={() => void detach()}>
              {m.loans_unlink()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={removing}
        onOpenChange={(open) => {
          if (!busy) setRemoving(open)
        }}
      >
        <DialogContent>
          <DialogTitle>{m.loans_remove()}</DialogTitle>
          <DialogDescription>{m.loans_delete_warning()}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} variant="outline" onClick={() => setRemoving(false)}>
              {m.common_cancel()}
            </Button>
            <Button disabled={busy} variant="destructive" onClick={() => void remove()}>
              {m.common_delete()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
