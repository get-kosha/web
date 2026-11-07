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
import { savePreferences, saveSettings, type Meta } from "@/lib/api"
import { LanguageSwitch } from "@/components/language-switch"
import { m } from "@/paraglide/messages"
import { setLocale } from "@/paraglide/runtime"

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
      <SettingGroup label={m.settings_general_region()}>
        <SettingRow
          id="language"
          title={m.settings_row_language()}
          description={m.settings_general_language_desc()}
          control={
            <LanguageSwitch
              // The cookie switches this browser even when the account can't save (the demo is read-only).
              onChange={(l) =>
                void savePreferences({ data: { language: l } })
                  .catch(() => {})
                  .finally(() => setLocale(l))
              }
              className="border bg-card pr-2.5 pl-3 text-foreground hover:border-muted-foreground/50 max-md:border-0 max-md:bg-transparent max-md:pr-0 max-md:text-[15px] max-md:text-subtle-foreground"
            />
          }
        />
        <SettingRow
          id="time-zone"
          title={m.settings_row_time_zone()}
          description={m.settings_general_time_zone_desc()}
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
      <SettingGroup label={m.settings_general_month()}>
        <SettingRow
          id="round-amounts"
          title={m.settings_row_round_amounts()}
          description={m.settings_general_round_desc({
            rounded: example.replace(/[.,]\d{2}(?=\D*$)/, ""),
            full: example,
          })}
          control={
            <Switch
              aria-label={m.settings_row_round_amounts()}
              checked={round === "1"}
              onCheckedChange={(on) => saveRound(on ? "1" : "0")}
            />
          }
        />
      </SettingGroup>
      <SettingGroup label={m.settings_general_adding()}>
        <SettingRow
          id="default-account"
          title={m.settings_row_default_account()}
          description={m.settings_general_default_account_desc()}
          control={
            <Pick
              value={wallet === "last" ? "" : wallet}
              onChange={(v) => saveWallet(v || "last")}
              placeholder={m.settings_general_last_used()}
              options={wallets.map((w) => ({ value: w.id, label: w.name }))}
              className="h-9 min-w-40 bg-card text-[13px] max-md:h-11"
            />
          }
        />
        <SettingRow
          id="add-kind"
          title={m.settings_row_add_kind()}
          description={m.settings_general_add_kind_desc()}
          control={
            <Segmented
              label={m.settings_row_add_kind()}
              value={kind}
              onChange={saveKind}
              options={[
                ["expense", m.settings_general_expense()],
                ["income", m.settings_general_income()],
              ]}
            />
          }
        />
        <SettingRow
          id="suggest-category"
          title={m.settings_row_suggest_category()}
          description={m.settings_general_suggest_desc()}
          control={
            <Switch
              aria-label={m.settings_row_suggest_category()}
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

/** A searchable zone picker, styled for a setting row. The welcome screen asks for the zone with it too. */
export function TimeZonePicker({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
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
        <ComboboxInput
          showTrigger={false}
          placeholder={m.settings_general_zone_search()}
          aria-label={m.settings_general_zone_search_label()}
        />
        <ComboboxEmpty>{m.settings_general_zone_empty()}</ComboboxEmpty>
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
