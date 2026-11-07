import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type Ref } from "react"
import { flushSync } from "react-dom"
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { CaretLeftIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { KoshaMark } from "@/components/kosha-mark"
import { RollingMoney } from "@/components/motion"
import { useMeta } from "@/components/shell"
import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { errorOf } from "@/components/settings/saved"
import { TimeZonePicker } from "@/components/settings/sections/general"
import { authClient } from "@/lib/auth-client"
import { saveAccounts, saveSettings } from "@/lib/api"
import {
  DEMO,
  intlLocale,
  accountWorth,
  convert,
  fmt,
  guessCurrency,
  netWorth,
  openingFigures,
  parseAmount,
  type AccountType,
  type Rates,
} from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

// A new account lands here after sign-up, and Overview links here while there are no accounts. Every step can
// be skipped. The demo account can't save anything, so it goes to Overview instead.
export const Route = createFileRoute("/_app/welcome")({
  loader: async ({ parentMatchPromise }) => {
    if ((await parentMatchPromise).loaderData?.user.id === DEMO.id) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: m.welcome_page_title() }] }),
  component: Welcome,
})

type Step = "you" | "accounts" | "done"
type Row = { key: string; name: string; type: AccountType; currency: string; amount: string; extra: string }

// Functions, not constants, so the labels follow the language of each request.
const types = () =>
  [
    ["bank", m.welcome_type_bank()],
    ["cash", m.welcome_type_cash()],
    ["credit", m.welcome_type_card()],
    ["investment", m.welcome_type_investment()],
  ] as const
const typeLabel = (t: AccountType) =>
  ({
    bank: m.welcome_type_bank_account,
    cash: m.welcome_type_cash,
    credit: m.welcome_type_credit_card,
    investment: m.welcome_type_investment_long,
  })[t]()
/** The first four start the list; the rest are one tap away. The names are saved, so they're in the user's language. */
const suggested = (): { name: string; type: AccountType }[] => [
  { name: m.welcome_suggest_current(), type: "bank" },
  { name: m.welcome_suggest_savings(), type: "bank" },
  { name: m.welcome_type_credit_card(), type: "credit" },
  { name: m.welcome_type_cash(), type: "cash" },
  { name: m.welcome_suggest_investments(), type: "investment" },
  { name: m.welcome_suggest_pension(), type: "investment" },
]
/** The two figures people know about each kind of account, and what the second one is called. */
const fields = (t: AccountType): [string, string | null] =>
  t === "credit"
    ? [m.welcome_field_owed(), m.welcome_field_credit_limit()]
    : t === "investment"
      ? [m.welcome_field_put_in(), m.welcome_field_value_today()]
      : [m.welcome_field_balance(), null]

const newRow = (s: { name: string; type: AccountType }, currency: string): Row => ({
  key: crypto.randomUUID(),
  ...s,
  currency,
  amount: "",
  extra: "",
})
/** A blank field is null; text that isn't an amount is NaN, so it can be flagged. */
const figure = (text: string) => (text.trim() ? (parseAmount(text) ?? Number.NaN) : null)
function figures(r: Row) {
  const amount = figure(r.amount)
  const extra = fields(r.type)[1] ? figure(r.extra) : null
  const bad = { amount: Number.isNaN(amount), extra: Number.isNaN(extra), name: !r.name.trim() }
  const opening = openingFigures(r.type, bad.amount ? null : amount, bad.extra ? null : extra)
  return { ...opening, bad, invalid: bad.amount || bad.extra || bad.name }
}

/** Suggestions whose name no account (or row) has yet. */
const unused = (have: { name: string }[], list = suggested()) =>
  list.filter((s) => !have.some((a) => a.name.trim().toLowerCase() === s.name.toLowerCase()))

// The browser's zone and languages never change while the page is open.
const noSubscribe = () => () => {}

function Welcome() {
  const meta = useMeta()
  const router = useRouter()
  const [step, setStep] = useState<Step>("you")
  const [name, setName] = useState(meta.user.name)
  // A new account still has the server's defaults (EUR, UTC), so it starts from the browser's zone and a
  // likely currency instead. The server has no browser, so it renders the saved values and hydration swaps them.
  const guess = useSyncExternalStore(
    noSubscribe,
    () =>
      `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${guessCurrency(navigator.languages ?? [], meta.rates, meta.primary)}`,
    () => ""
  ).split("|")
  const fresh = !meta.wallets.length && guess.length === 2
  const [pickedCurrency, setCurrency] = useState<string | null>(null)
  const [pickedTz, setTz] = useState<string | null>(null)
  const currency = pickedCurrency ?? (fresh ? guess[1] : meta.primary)
  const tz = pickedTz ?? (fresh && guess[0] ? guess[0] : meta.tz)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [created, setCreated] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)

  const go = (next: Step) => {
    flushSync(() => {
      setStep(next)
      setChecked(false)
    })
    window.scrollTo({ top: 0 })
    // The new step's heading takes focus, so a screen reader announces where you are.
    heading.current?.focus({ preventScroll: true })
  }

  async function saveYou(e: FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (!next) {
      setChecked(true)
      return form.current?.querySelector<HTMLInputElement>("#welcome-name")?.focus()
    }
    setBusy(true)
    try {
      const [renamed] = await Promise.all([
        next === meta.user.name ? null : authClient.updateUser({ name: next }),
        saveSettings({
          data: { primary: currency, tz, order: [currency, ...meta.order.filter((c) => c !== currency)] },
        }),
      ])
      if (renamed?.error) throw new Error(renamed.error.message || m.welcome_name_save_failed())
      await router.invalidate()
      // Rows still on the old main currency follow the new one.
      setRows((list) =>
        list
          ? list.map((r) => (r.currency === meta.primary ? { ...r, currency } : r))
          : unused(meta.wallets, suggested().slice(0, 4)).map((s) => newRow(s, currency))
      )
      go("accounts")
    } catch (err) {
      toast.error(errorOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveAll(e: FormEvent) {
    e.preventDefault()
    if (!rows?.length) return
    const list = rows.map((r) => ({ r, f: figures(r) }))
    if (list.some(({ f }) => f.invalid)) {
      flushSync(() => setChecked(true))
      return form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
    }
    setBusy(true)
    try {
      const { ids } = await saveAccounts({
        data: {
          accounts: list.map(({ r, f }) => ({
            name: r.name.trim(),
            type: r.type,
            currency: r.currency,
            creditLimit: f.credit_limit,
            archived: false,
            balance: f.balance,
            gain: f.gain ?? undefined,
          })),
        },
      })
      await router.invalidate()
      setCreated(ids)
      go("done")
    } catch (err) {
      toast.error(errorOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col max-md:min-h-svh max-md:flex-1">
      <TopBar step={step} onBack={() => go("you")} />
      <div key={step} className="rise-in flex flex-1 flex-col px-4 pt-4 md:px-0 md:pt-3">
        {step === "you" && (
          <form ref={form} onSubmit={saveYou} noValidate className="flex flex-1 flex-col">
            <KoshaMark className="h-9" />
            <Intro ref={heading} title={m.welcome_title()} sub={m.welcome_sub()} />
            <SettingGroup className="mt-6">
              <SettingRow
                title={m.welcome_name_title()}
                description={m.welcome_name_description()}
                control={
                  <div className="grid gap-1.5 max-md:w-full" data-full>
                    <Input
                      id="welcome-name"
                      aria-label={m.welcome_name_title()}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      aria-invalid={checked && !name.trim()}
                      aria-describedby={checked && !name.trim() ? "welcome-name-error" : undefined}
                      className="h-9 w-60 bg-background max-md:w-full"
                    />
                    {checked && !name.trim() && (
                      <p id="welcome-name-error" className="text-xs text-destructive">
                        {m.welcome_name_error()}
                      </p>
                    )}
                  </div>
                }
              />
              <SettingRow
                title={m.welcome_currency_title()}
                description={m.welcome_currency_description()}
                control={<CurrencyPicker value={currency} onChange={setCurrency} rates={meta.rates} />}
              />
              <SettingRow
                title={m.welcome_tz_title()}
                description={m.welcome_tz_description()}
                control={<TimeZonePicker value={tz} onChange={setTz} />}
              />
            </SettingGroup>
            <p className="mx-1 mt-2.5 text-xs text-muted-foreground">{m.welcome_change_later()}</p>
            <Footer>
              <Button type="submit" size="lg" disabled={busy} className="px-4 max-md:flex-1">
                {busy ? m.welcome_saving() : m.common_continue()}
              </Button>
            </Footer>
          </form>
        )}

        {step === "accounts" && rows && (
          <form ref={form} onSubmit={saveAll} noValidate className="flex flex-1 flex-col">
            <Intro ref={heading} title={m.welcome_accounts_title()} sub={m.welcome_accounts_sub()} />
            <AccountRows
              rows={rows}
              setRows={setRows}
              taken={meta.wallets}
              primary={currency}
              rates={meta.rates}
              checked={checked}
            />
            <Footer>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{m.welcome_net_worth()}</div>
                <RollingMoney
                  value={
                    netWorth(
                      [...meta.wallets, ...rows.map((r) => ({ ...figures(r), type: r.type, currency: r.currency }))],
                      currency,
                      meta.rates
                    ).total
                  }
                  currency={currency}
                  className="num cents-muted text-lg font-medium"
                />
              </div>
              <Button type="submit" size="lg" disabled={busy || !rows.length} className="px-4">
                {busy
                  ? m.welcome_adding()
                  : rows.length
                    ? m.welcome_add_accounts({ count: rows.length })
                    : m.welcome_add_an_account()}
              </Button>
            </Footer>
          </form>
        )}

        {step === "done" && <Done ids={created} headingRef={heading} />}
      </div>
    </div>
  )
}

/** Back, where you are, and the way out. It sticks to the top on phones, where this page has no app header. */
function TopBar({ step, onBack }: { step: Step; onBack: () => void }) {
  const at = step === "you" ? 1 : 2
  return (
    <div className="sticky top-0 z-10 grid grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-center bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:static md:bg-transparent md:px-0 md:pt-8 md:backdrop-blur-none">
      <div>
        {step === "accounts" && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 md:-ml-2.5"
            onClick={onBack}
            aria-label={m.common_back()}
          >
            <CaretLeftIcon className="size-5" />
          </Button>
        )}
      </div>
      {step !== "done" ? (
        <div
          role="progressbar"
          aria-label={m.welcome_progress_label()}
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={at}
          aria-valuetext={m.welcome_progress_step({ at })}
          className="flex justify-center gap-1.5"
        >
          {[1, 2].map((n) => (
            <span
              key={n}
              className={cn(
                "h-1 w-8 rounded-full transition-colors duration-200 ease-out",
                n <= at ? "bg-foreground" : "bg-border"
              )}
            />
          ))}
        </div>
      ) : (
        <div />
      )}
      <div className="flex justify-end">
        {step !== "done" && (
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:-mr-3 md:h-9"
          >
            {m.welcome_skip()}
          </Link>
        )}
      </div>
    </div>
  )
}

function Intro({ ref, title, sub }: { ref: Ref<HTMLHeadingElement>; title: string; sub: ReactNode }) {
  return (
    <div className="mt-5">
      <h1 ref={ref} tabIndex={-1} className="text-[22px] font-semibold tracking-[-0.02em] outline-none">
        {title}
      </h1>
      <p className="mt-1 text-[13px] text-pretty text-muted-foreground">{sub}</p>
    </div>
  )
}

/** The step's actions. On phones they sit in a bar at the bottom of the screen, above the home indicator. */
function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-end gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:mt-6 md:border-0 md:bg-transparent md:px-0 md:pb-14 md:backdrop-blur-none">
      {children}
    </div>
  )
}

function AccountRows({
  rows,
  setRows,
  taken,
  primary,
  rates,
  checked,
}: {
  rows: Row[]
  setRows: (fn: (rows: Row[] | null) => Row[] | null) => void
  /** Accounts that already exist, so they aren't suggested again. */
  taken: { name: string }[]
  primary: string
  rates: Rates
  checked: boolean
}) {
  // Rows added from here on focus themselves; the starting ones don't.
  const [fresh, setFresh] = useState<string | null>(null)
  const update = (key: string, patch: Partial<Row>) =>
    setRows((list) => list && list.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const add = (s: { name: string; type: AccountType }) => {
    const row = newRow(s, primary)
    setFresh(row.key)
    setRows((list) => [...(list ?? []), row])
  }
  const missing = unused([...taken, ...rows])

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        {rows.length ? (
          <ul
            aria-label={m.welcome_rows_label()}
            className="max-md:[&_input]:scroll-mt-16 max-md:[&_input]:scroll-mb-28"
          >
            {rows.map((r) => (
              <AccountRow
                key={r.key}
                row={r}
                fresh={r.key === fresh}
                primary={primary}
                rates={rates}
                checked={checked}
                onChange={(patch) => update(r.key, patch)}
                onRemove={() => setRows((list) => list && list.filter((x) => x.key !== r.key))}
              />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{m.welcome_rows_empty()}</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[...missing, { name: "", type: "bank" as const }].map((s) => (
          <Button
            key={s.name || "other"}
            type="button"
            variant="outline"
            size="lg"
            onClick={() => add(s)}
            className="gap-1.5 bg-card px-3 text-[13px] font-normal"
          >
            <PlusIcon /> {s.name || m.welcome_another_account()}
          </Button>
        ))}
      </div>
    </>
  )
}

function AccountRow({
  row,
  fresh,
  primary,
  rates,
  checked,
  onChange,
  onRemove,
}: {
  row: Row
  fresh: boolean
  primary: string
  rates: Rates
  checked: boolean
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  const id = useId()
  const f = figures(row)
  const [first, second] = fields(row.type)
  const show = (bad: boolean) => checked && bad
  const worth = accountWorth({ ...f, type: row.type, currency: row.currency })
  const foreign = row.currency !== primary

  // One line under the figures: what a card has left or an investment has made, and the value in the main currency.
  const notes: ReactNode[] = []
  if (row.type === "credit")
    notes.push(
      f.credit_limit === null ? (
        m.welcome_credit_left_hint()
      ) : (
        <ParaglideMessage
          message={m.welcome_credit_left}
          inputs={{ amount: fmt(Math.max(0, f.balance), row.currency) }}
          markup={{ num: ({ children }) => <span className="num">{children}</span> }}
        />
      )
    )
  if (row.type === "investment")
    notes.push(
      f.gain === null ? (
        m.welcome_gain_hint()
      ) : (
        <span className={f.gain >= 0 ? "text-positive" : "text-destructive"}>
          <ParaglideMessage
            message={f.gain >= 0 ? m.welcome_gain : m.welcome_loss}
            inputs={{ amount: fmt(Math.abs(f.gain), row.currency) }}
            markup={{ num: ({ children }) => <span className="num">{children}</span> }}
          />
        </span>
      )
    )
  if (foreign && worth)
    notes.push(<span className="num">≈ {fmt(convert(worth, row.currency, primary, rates), primary)}</span>)

  const amountField = (which: "amount" | "extra", label: string) => {
    const bad = show(f.bad[which])
    return (
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${id}-${which}`} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <Input
          id={`${id}-${which}`}
          value={row[which]}
          onChange={(e) => onChange({ [which]: e.target.value })}
          inputMode="decimal"
          autoComplete="off"
          placeholder={m.welcome_amount_placeholder()}
          aria-invalid={bad}
          aria-describedby={bad ? `${id}-error` : undefined}
          autoFocus={fresh && which === "amount" && !!row.name}
          className="num"
        />
      </div>
    )
  }

  return (
    <li className={cn("grid gap-3 border-t px-4 py-4 first:border-t-0 md:px-5", fresh && "rise-in")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          aria-label={m.welcome_account_name_label()}
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={m.welcome_account_name_placeholder()}
          aria-invalid={show(f.bad.name)}
          aria-describedby={show(f.bad.name) ? `${id}-error` : undefined}
          autoFocus={fresh && !row.name}
          className="font-medium"
        />
        <Segmented
          label={row.name.trim() ? m.welcome_type_of({ name: row.name.trim() }) : m.welcome_type_of_account()}
          value={row.type}
          options={types()}
          onChange={(type) => onChange({ type })}
          className="max-md:col-span-2 max-md:row-start-2"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onRemove}
          aria-label={row.name.trim() ? m.welcome_remove({ name: row.name.trim() }) : m.welcome_remove_this_account()}
          className="text-muted-foreground hover:text-destructive max-md:col-start-2 max-md:row-start-1 md:-mr-2"
        >
          <XIcon />
        </Button>
      </div>
      {/* The currency leads, so every row's figures line up under the same columns whatever its type. */}
      <div
        className={cn(
          "grid items-end gap-2",
          second
            ? "grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[6rem_minmax(0,13rem)_minmax(0,13rem)]"
            : "grid-cols-[5.5rem_minmax(0,1fr)] md:grid-cols-[6rem_minmax(0,13rem)]"
        )}
      >
        <div className="grid min-w-0 gap-1.5">
          <span className="text-xs text-muted-foreground">{m.welcome_currency_label()}</span>
          <CurrencyPicker
            value={row.currency}
            onChange={(c) => onChange({ currency: c })}
            rates={rates}
            compact
            label={
              row.name.trim() ? m.welcome_currency_of({ name: row.name.trim() }) : m.welcome_currency_of_this_account()
            }
          />
        </div>
        {amountField("amount", first)}
        {second && amountField("extra", second)}
      </div>
      {checked && f.invalid ? (
        <p id={`${id}-error`} className="-mt-1 text-xs text-destructive">
          {f.bad.name ? m.welcome_error_name() : m.welcome_error_amount()}
        </p>
      ) : (
        notes.length > 0 && (
          <p className="-mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {notes.map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </p>
        )
      )}
    </li>
  )
}

/** The currency's name, or undefined for codes Intl doesn't know (the rates feed also lists crypto tokens). */
const currencyName = (code: string) =>
  /^[a-z]{3}$/.test(code)
    ? new Intl.DisplayNames([intlLocale()], { type: "currency", fallback: "none" }).of(code.toUpperCase())
    : undefined

/** A searchable list of every currency with an exchange rate. `compact` is the field-sized version for a row. */
function CurrencyPicker({
  value,
  onChange,
  rates,
  compact,
  label = m.welcome_currency_title(),
}: {
  value: string
  onChange: (code: string) => void
  rates: Rates
  compact?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const all = useMemo(
    () =>
      open
        ? Object.keys(rates)
            .filter((c) => currencyName(c))
            .sort((a, b) => currencyName(a)!.localeCompare(currencyName(b)!))
        : [],
    [open, rates]
  )
  // Words match the start of the code or of a word in the name, so "us dollar" finds USD, not Australian Dollar.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = all
    .filter((c) => {
      const parts = [
        c,
        ...currencyName(c)!
          .toLowerCase()
          .split(/[\s-]+/),
      ]
      return words.every((w) => parts.some((p) => p.startsWith(w)))
    })
    .sort((a, b) => Number(b === words[0]) - Number(a === words[0]))
  return (
    <Combobox
      items={shown}
      filter={null}
      value={value}
      onValueChange={(c: string | null) => c && onChange(c)}
      itemToStringLabel={(c: string) => c.toUpperCase()}
      inputValue={q}
      onInputValueChange={setQ}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
      autoHighlight
    >
      <ComboboxTrigger
        aria-label={label}
        className={
          compact
            ? "inline-flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent pr-2 pl-2.5 text-sm transition-colors outline-none hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-muted-foreground/50 max-md:h-11 dark:bg-input/30 [&>svg]:ml-auto [&>svg]:size-3.5"
            : "inline-flex h-9 items-center gap-2 rounded-md border bg-card pr-2.5 pl-3 text-[13px] whitespace-nowrap transition-colors hover:border-muted-foreground/50 aria-expanded:border-muted-foreground/50 max-md:h-11 max-md:border-0 max-md:bg-transparent max-md:pr-0 max-md:text-[15px] max-md:text-subtle-foreground [&>svg]:ml-auto [&>svg]:size-3.5"
        }
      >
        {!compact && <span className="max-md:hidden">{currencyName(value) ?? value.toUpperCase()}</span>}
        <span data-plain className={cn("num", !compact && "text-muted-foreground max-md:text-inherit")}>
          {value.toUpperCase()}
        </span>
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-72">
        <ComboboxInput
          showTrigger={false}
          placeholder={m.welcome_currency_search_placeholder()}
          aria-label={m.welcome_currency_search_label()}
        />
        <ComboboxEmpty>{m.welcome_currency_empty()}</ComboboxEmpty>
        <ComboboxList>
          {(c: string) => (
            <ComboboxItem key={c} value={c} className="min-h-9 text-[13px]">
              <span data-plain className="num w-9 shrink-0 text-xs text-muted-foreground">
                {c.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{currencyName(c)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** What was added, the net worth it makes, and where to go next. Importing statements comes first. */
function Done({ ids, headingRef }: { ids: string[]; headingRef: Ref<HTMLHeadingElement> }) {
  const meta = useMeta()
  const added = ids.flatMap((id) => meta.wallets.find((w) => w.id === id) ?? [])
  const currencies = new Set(added.map((w) => w.currency)).size
  const total = netWorth(meta.wallets, meta.primary, meta.rates).total
  return (
    <div className="flex flex-1 flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-14">
      <Intro
        ref={headingRef}
        title={m.welcome_done_title()}
        sub={
          currencies > 1
            ? m.welcome_done_added_currencies({ count: added.length, currencies })
            : m.welcome_done_added({ count: added.length })
        }
      />
      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="flex items-baseline justify-between gap-4 px-4 pt-4 pb-3 md:px-5">
          <span className="text-[13px] text-muted-foreground">{m.welcome_net_worth()}</span>
          <RollingMoney value={total} currency={meta.primary} className="num cents-muted text-[28px] font-medium" />
        </div>
        <ul aria-label={m.welcome_accounts_added()}>
          {added.map((w, i) => (
            <li
              key={w.id}
              className="rise-in flex min-h-14 items-center justify-between gap-4 border-t px-4 py-2.5 md:px-5"
              style={{ animationDelay: `${80 + i * 40}ms` }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{w.name}</span>
                <span className="block text-xs text-muted-foreground">{typeLabel(w.type)}</span>
              </span>
              {/* A card shows what it owes, as Accounts does. */}
              <span className="shrink-0 text-right text-sm">
                <span className="num block">
                  {fmt(w.type === "credit" ? Math.abs(accountWorth(w)) : accountWorth(w), w.currency)}
                </span>
                {w.type === "credit" && <span className="block text-xs text-muted-foreground">{m.welcome_owed()}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mt-9 text-[15px] font-semibold">{m.welcome_history_title()}</h2>
      <p className="mt-1 text-[13px] text-pretty text-muted-foreground">{m.welcome_history_body()}</p>
      <div className="mt-4 flex flex-wrap gap-2 max-md:flex-col">
        <Link to="/import" className={buttonVariants({ size: "lg", className: "px-4" })}>
          {m.welcome_import()}
        </Link>
        <Link to="/add" className={buttonVariants({ variant: "outline", size: "lg", className: "bg-card px-4" })}>
          {m.welcome_add_transaction()}
        </Link>
        <Link to="/" className={buttonVariants({ variant: "ghost", size: "lg", className: "px-4 md:ml-auto" })}>
          {m.common_go_to_overview()}
        </Link>
      </div>
    </div>
  )
}
