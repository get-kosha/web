import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type Ref } from "react"
import { flushSync } from "react-dom"
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { CaretLeftIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
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
  LOCALE,
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

// A new account lands here after sign-up, and Overview links here while there are no accounts. Every step can
// be skipped. The demo account can't save anything, so it goes to Overview instead.
export const Route = createFileRoute("/_app/welcome")({
  loader: async ({ parentMatchPromise }) => {
    if ((await parentMatchPromise).loaderData?.user.id === DEMO.id) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Welcome · Kosha" }] }),
  component: Welcome,
})

type Step = "you" | "accounts" | "done"
type Row = { key: string; name: string; type: AccountType; currency: string; amount: string; extra: string }

const TYPES = [
  ["bank", "Bank"],
  ["cash", "Cash"],
  ["credit", "Card"],
  ["investment", "Investment"],
] as const
const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  credit: "Credit card",
  investment: "Investment",
}
/** The first four start the list; the rest are one tap away. */
const SUGGESTED: { name: string; type: AccountType }[] = [
  { name: "Current account", type: "bank" },
  { name: "Savings", type: "bank" },
  { name: "Credit card", type: "credit" },
  { name: "Cash", type: "cash" },
  { name: "Investments", type: "investment" },
  { name: "Pension", type: "investment" },
]
/** The two figures people know about each kind of account, and what the second one is called. */
const FIELDS: Record<AccountType, [string, string | null]> = {
  bank: ["Balance", null],
  cash: ["Balance", null],
  credit: ["Owed", "Credit limit"],
  investment: ["Put in", "Value today"],
}

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
  const extra = FIELDS[r.type][1] ? figure(r.extra) : null
  const bad = { amount: Number.isNaN(amount), extra: Number.isNaN(extra), name: !r.name.trim() }
  const opening = openingFigures(r.type, bad.amount ? null : amount, bad.extra ? null : extra)
  return { ...opening, bad, invalid: bad.amount || bad.extra || bad.name }
}

/** Suggestions whose name no account (or row) has yet. */
const unused = (have: { name: string }[], list = SUGGESTED) =>
  list.filter((s) => !have.some((a) => a.name.trim().toLowerCase() === s.name.toLowerCase()))

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
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
      if (renamed?.error) throw new Error(renamed.error.message || "Couldn't save your name")
      await router.invalidate()
      // Rows still on the old main currency follow the new one.
      setRows((list) =>
        list
          ? list.map((r) => (r.currency === meta.primary ? { ...r, currency } : r))
          : unused(meta.wallets, SUGGESTED.slice(0, 4)).map((s) => newRow(s, currency))
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
            <Intro
              ref={heading}
              title="Welcome to Kosha"
              sub="Check these three details, then add your accounts. It takes a minute or two."
            />
            <SettingGroup className="mt-6">
              <SettingRow
                title="Your name"
                description="Shown in the menu."
                control={
                  <div className="grid gap-1.5 max-md:w-full" data-full>
                    <Input
                      id="welcome-name"
                      aria-label="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      aria-invalid={checked && !name.trim()}
                      aria-describedby={checked && !name.trim() ? "welcome-name-error" : undefined}
                      className="h-9 w-60 bg-background max-md:w-full"
                    />
                    {checked && !name.trim() && (
                      <p id="welcome-name-error" className="text-xs text-destructive">
                        Enter the name to show in Kosha.
                      </p>
                    )}
                  </div>
                }
              />
              <SettingRow
                title="Main currency"
                description="Net worth and totals add up in it."
                control={<CurrencyPicker value={currency} onChange={setCurrency} rates={meta.rates} />}
              />
              <SettingRow
                title="Time zone"
                description="Days and months follow it."
                control={<TimeZonePicker value={tz} onChange={setTz} />}
              />
            </SettingGroup>
            <p className="mx-1 mt-2.5 text-xs text-muted-foreground">You can change all three later in Settings.</p>
            <Footer>
              <Button type="submit" size="lg" disabled={busy} className="px-4 max-md:flex-1">
                {busy ? "Saving…" : "Continue"}
              </Button>
            </Footer>
          </form>
        )}

        {step === "accounts" && rows && (
          <form ref={form} onSubmit={saveAll} noValidate className="flex flex-1 flex-col">
            <Intro
              ref={heading}
              title="Add your accounts"
              sub="Enter what each one holds today. Remove any you don't have, and add the rest."
            />
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
                <div className="text-xs text-muted-foreground">Net worth</div>
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
                  ? "Adding…"
                  : rows.length
                    ? `Add ${plural(rows.length, "account", "accounts")}`
                    : "Add an account"}
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
          <Button variant="ghost" size="icon-lg" className="size-11 md:-ml-2.5" onClick={onBack} aria-label="Back">
            <CaretLeftIcon className="size-5" />
          </Button>
        )}
      </div>
      {step !== "done" ? (
        <div
          role="progressbar"
          aria-label="Setup"
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={at}
          aria-valuetext={`Step ${at} of 2`}
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
            Skip for now
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
          <ul aria-label="New accounts" className="max-md:[&_input]:scroll-mt-16 max-md:[&_input]:scroll-mb-28">
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
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
            No accounts yet. Add the first one below.
          </p>
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
            <PlusIcon /> {s.name || "Another account"}
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
  const [first, second] = FIELDS[row.type]
  const show = (bad: boolean) => checked && bad
  const worth = accountWorth({ ...f, type: row.type, currency: row.currency })
  const foreign = row.currency !== primary

  // One line under the figures: what a card has left or an investment has made, and the value in the main currency.
  const notes: ReactNode[] = []
  if (row.type === "credit")
    notes.push(
      f.credit_limit === null ? (
        "Add the limit to see the credit left."
      ) : (
        <>
          <span className="num">{fmt(Math.max(0, f.balance), row.currency)}</span> of credit left
        </>
      )
    )
  if (row.type === "investment")
    notes.push(
      f.gain === null ? (
        "Add today's value to count its gain."
      ) : (
        <span className={f.gain >= 0 ? "text-positive" : "text-destructive"}>
          {f.gain >= 0 ? "Gain of " : "Loss of "}
          <span className="num">{fmt(Math.abs(f.gain), row.currency)}</span>
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
          placeholder="0.00"
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
          aria-label="Account name"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Monzo, HDFC, Wise…"
          aria-invalid={show(f.bad.name)}
          aria-describedby={show(f.bad.name) ? `${id}-error` : undefined}
          autoFocus={fresh && !row.name}
          className="font-medium"
        />
        <Segmented
          label={`Type of ${row.name.trim() || "account"}`}
          value={row.type}
          options={TYPES}
          onChange={(type) => onChange({ type })}
          className="max-md:col-span-2 max-md:row-start-2"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onRemove}
          aria-label={`Remove ${row.name.trim() || "this account"}`}
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
          <span className="text-xs text-muted-foreground">Currency</span>
          <CurrencyPicker
            value={row.currency}
            onChange={(c) => onChange({ currency: c })}
            rates={rates}
            compact
            label={`Currency of ${row.name.trim() || "this account"}`}
          />
        </div>
        {amountField("amount", first)}
        {second && amountField("extra", second)}
      </div>
      {checked && f.invalid ? (
        <p id={`${id}-error`} className="-mt-1 text-xs text-destructive">
          {f.bad.name ? "Name this account." : "Enter amounts as numbers, like 1,250.00."}
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

const currencyNames = new Intl.DisplayNames([LOCALE], { type: "currency", fallback: "none" })
/** The currency's name, or undefined for codes Intl doesn't know (the rates feed also lists crypto tokens). */
const currencyName = (code: string) => (/^[a-z]{3}$/.test(code) ? currencyNames.of(code.toUpperCase()) : undefined)

/** A searchable list of every currency with an exchange rate. `compact` is the field-sized version for a row. */
function CurrencyPicker({
  value,
  onChange,
  rates,
  compact,
  label = "Main currency",
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
        <ComboboxInput showTrigger={false} placeholder="Search a currency" aria-label="Search currencies" />
        <ComboboxEmpty>No currency matches.</ComboboxEmpty>
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
        title="You're all set"
        sub={`${plural(added.length, "account", "accounts")} added${currencies > 1 ? `, in ${currencies} currencies` : ""}.`}
      />
      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="flex items-baseline justify-between gap-4 px-4 pt-4 pb-3 md:px-5">
          <span className="text-[13px] text-muted-foreground">Net worth</span>
          <RollingMoney value={total} currency={meta.primary} className="num cents-muted text-[28px] font-medium" />
        </div>
        <ul aria-label="Accounts added">
          {added.map((w, i) => (
            <li
              key={w.id}
              className="rise-in flex min-h-14 items-center justify-between gap-4 border-t px-4 py-2.5 md:px-5"
              style={{ animationDelay: `${80 + i * 40}ms` }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{w.name}</span>
                <span className="block text-xs text-muted-foreground">{TYPE_LABEL[w.type]}</span>
              </span>
              {/* A card shows what it owes, as Accounts does. */}
              <span className="shrink-0 text-right text-sm">
                <span className="num block">
                  {fmt(w.type === "credit" ? Math.abs(accountWorth(w)) : accountWorth(w), w.currency)}
                </span>
                {w.type === "credit" && <span className="block text-xs text-muted-foreground">owed</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mt-9 text-[15px] font-semibold">Fill in your history</h2>
      <p className="mt-1 text-[13px] text-pretty text-muted-foreground">
        Import statements from your bank, and Kosha adds their past transactions to these accounts.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 max-md:flex-col">
        <Link to="/import" className={buttonVariants({ size: "lg", className: "px-4" })}>
          Import statements
        </Link>
        <Link to="/add" className={buttonVariants({ variant: "outline", size: "lg", className: "bg-card px-4" })}>
          Add a transaction
        </Link>
        <Link to="/" className={buttonVariants({ variant: "ghost", size: "lg", className: "px-4 md:ml-auto" })}>
          Go to Overview
        </Link>
      </div>
    </div>
  )
}
