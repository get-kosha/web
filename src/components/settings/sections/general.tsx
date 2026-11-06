import { useMemo, useState } from "react"
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr"
import { currencyOptions, useMeta } from "@/components/shell"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Pick } from "@/components/pick"
import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref, useSave } from "@/components/settings/saved"
import { fmt } from "@/lib/core"
import { saveSettings, type Meta } from "@/lib/api"
import { cn } from "@/lib/utils"

/** saveSettings writes default currency, zone and order together; this fills in whatever isn't changing. */
export function saveCore(meta: Meta, patch: { tz?: string; order?: string[] }) {
  const order = patch.order ?? [meta.primary, ...currencyOptions(meta).filter((c) => c !== meta.primary)]
  return saveSettings({ data: { primary: order[0] ?? meta.primary, tz: patch.tz ?? meta.tz, order } })
}

export function General() {
  const meta = useMeta()
  const save = useSave()
  const [tz, setTz] = useState(meta.tz)
  const [round, saveRound] = usePref("round_hero", "round-amounts")
  const [wallet, saveWallet] = usePref("default_wallet", "default-account")
  const [kind, saveKind] = usePref("add_kind", "add-kind")
  const [suggest, saveSuggest] = usePref("suggest_category", "suggest-category")
  const wallets = meta.wallets.filter((w) => !w.archived)
  const example = fmt(143600, meta.primary)
  return (
    <>
      <SettingGroup label="Region">
        <SettingRow
          id="time-zone"
          title="Time zone"
          description="Months and days follow this zone, wherever you are."
          control={
            <TimeZonePicker
              value={tz}
              onChange={(next) => {
                setTz(next)
                void save(
                  "time-zone",
                  () => saveCore(meta, { tz: next }),
                  () => setTz(meta.tz)
                )
              }}
            />
          }
        />
      </SettingGroup>
      <SettingGroup label="Your month">
        <SettingRow
          id="round-amounts"
          title="Round amounts on Overview"
          description={`Show ${example.replace(/[.,]\d{2}(?=\D*$)/, "")} instead of ${example} on the big numbers. Lists keep cents.`}
          control={
            <Switch
              aria-label="Round amounts on Overview"
              checked={round === "1"}
              onCheckedChange={(on) => saveRound(on ? "1" : "0")}
            />
          }
        />
      </SettingGroup>
      <SettingGroup label="Adding transactions">
        <SettingRow
          id="default-account"
          title="Default account"
          description="Pre-selected when you add something. Last used follows this device."
          control={
            <Pick
              value={wallet === "last" ? "" : wallet}
              onChange={(v) => saveWallet(v || "last")}
              placeholder="Last used"
              options={wallets.map((w) => ({ value: w.id, label: w.name }))}
              className="h-9 min-w-40 bg-card text-[13px] max-md:h-11"
            />
          }
        />
        <SettingRow
          id="add-kind"
          title="Add opens as"
          description="What Add starts with on your phone and in quick add."
          control={
            <Segmented
              label="Add opens as"
              value={kind}
              onChange={saveKind}
              options={[
                ["expense", "Expense"],
                ["income", "Income"],
              ]}
            />
          }
        />
        <SettingRow
          id="suggest-category"
          title="Suggest a category"
          description="From your payee rules and the payee’s past transactions."
          control={
            <Switch
              aria-label="Suggest a category"
              checked={suggest === "1"}
              onCheckedChange={(on) => saveSuggest(on ? "1" : "0")}
            />
          }
        />
      </SettingGroup>
    </>
  )
}

/** "UTC+1" for a zone right now. */
function offsetOf(zone: string, now: Date) {
  const name = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value
  return (name ?? "GMT").replace("GMT", "UTC")
}

function TimeZonePicker({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const zones = useMemo(() => (open ? Intl.supportedValuesOf("timeZone") : []), [open])
  const now = useMemo(() => new Date(), [open])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  // ponytail: offsets are computed only for the first 80 matches; typing narrows the rest.
  const shown = zones.filter((z) => words.every((w) => z.toLowerCase().replace(/_/g, " ").includes(w))).slice(0, 80)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
    >
      <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-md border bg-card pr-2.5 pl-3 text-[13px] whitespace-nowrap transition-colors hover:border-muted-foreground/50 aria-expanded:border-muted-foreground/50 max-md:h-11 max-md:border-0 max-md:bg-transparent max-md:pr-0 max-md:text-[15px] max-md:text-subtle-foreground">
        <span className="max-md:hidden">{value.replace(/_/g, " ")}</span>
        <span className="md:hidden">{value.split("/").pop()?.replace(/_/g, " ")}</span>
        <span className="font-mono text-muted-foreground tabular-nums">{offsetOf(value, new Date())}</span>
        <CaretDownIcon className="ml-auto size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-1.5 p-1.5">
        <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-muted-foreground">
          <MagnifyingGlassIcon className="size-3.5 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                onChange(shown[0])
                setOpen(false)
              }
            }}
            placeholder="Search a city or region"
            aria-label="Search time zones"
            className="w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <ul className="max-h-72 overflow-y-auto">
          {shown.map((z) => (
            <li key={z}>
              <button
                type="button"
                onClick={() => {
                  onChange(z)
                  setOpen(false)
                }}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-muted",
                  z === value && "font-medium"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{z.replace(/_/g, " ")}</span>
                <span className="num text-xs text-muted-foreground">{offsetOf(z, now)}</span>
                <CheckIcon className={cn("size-3.5 text-brand", z !== value && "invisible")} />
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2.5 py-3 text-[13px] text-muted-foreground">No zone matches.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
