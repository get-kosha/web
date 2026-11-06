import { useMemo, useState } from "react"
import { currencyOptions, useMeta } from "@/components/shell"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { Pick } from "@/components/pick"
import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref, useSave } from "@/components/settings/saved"
import { fmt } from "@/lib/core"
import { saveSettings, type Meta } from "@/lib/api"

/** saveSettings writes default currency, zone and order together; this fills in whatever isn't changing. */
export function saveCore(meta: Meta, patch: { tz?: string; order?: string[] }) {
  const order = patch.order ?? [meta.primary, ...currencyOptions(meta).filter((c) => c !== meta.primary)]
  return saveSettings({ data: { primary: order[0] ?? meta.primary, tz: patch.tz ?? meta.tz, order } })
}

export function General() {
  const meta = useMeta()
  const save = useSave()
  const [tz, setTz] = useState(meta.tz)
  const [round, saveRound] = usePref("round_hero")
  const [wallet, saveWallet] = usePref("default_wallet")
  const [kind, saveKind] = usePref("add_kind")
  const [suggest, saveSuggest] = usePref("suggest_category")
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
          description="Pre-selected when you add something. Last used picks the last account you used on this device."
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
          description="From your payee rules and the payee's past transactions."
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
    <Combobox
      items={shown}
      filter={null}
      value={value}
      onValueChange={(z: string | null) => z && onChange(z)}
      itemToStringLabel={(z: string) => z.replace(/_/g, " ")}
      inputValue={q}
      onInputValueChange={setQ}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
      autoHighlight
    >
      <ComboboxTrigger className="inline-flex h-9 items-center gap-2 rounded-md border bg-card pr-2.5 pl-3 text-[13px] whitespace-nowrap transition-colors hover:border-muted-foreground/50 aria-expanded:border-muted-foreground/50 max-md:h-11 max-md:border-0 max-md:bg-transparent max-md:pr-0 max-md:text-[15px] max-md:text-subtle-foreground [&>svg]:ml-auto [&>svg]:size-3.5">
        <span className="max-md:hidden">{value.replace(/_/g, " ")}</span>
        <span className="md:hidden">{value.split("/").pop()?.replace(/_/g, " ")}</span>
        <span className="font-mono text-muted-foreground tabular-nums">{offsetOf(value, new Date())}</span>
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-80">
        <ComboboxInput showTrigger={false} placeholder="Search a city or region" aria-label="Search time zones" />
        <ComboboxEmpty>No zone matches.</ComboboxEmpty>
        <ComboboxList>
          {(z: string) => (
            <ComboboxItem key={z} value={z} className="min-h-9 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{z.replace(/_/g, " ")}</span>
              <span className="num text-xs text-muted-foreground">{offsetOf(z, now)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
