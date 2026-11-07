import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref } from "@/components/settings/saved"
import { Switch } from "@/components/ui/switch"
import { m } from "@/paraglide/messages"

export function Recurring() {
  const [auto, saveAuto] = usePref("default_auto_pay")
  const [horizon, saveHorizon] = usePref("upcoming_horizon")
  return (
    <SettingGroup label={m.settings_rec_group()}>
      <SettingRow
        id="auto-record"
        title={m.settings_rec_auto_title()}
        description={m.settings_rec_auto_description()}
        control={
          <Switch
            aria-label={m.settings_rec_auto_title()}
            checked={auto === "1"}
            onCheckedChange={(on) => saveAuto(on ? "1" : "0")}
          />
        }
      />
      <SettingRow
        id="coming-up"
        title={m.settings_rec_coming_up_title()}
        description={m.settings_rec_coming_up_description()}
        control={
          <Segmented
            label={m.settings_rec_coming_up_title()}
            value={horizon}
            onChange={saveHorizon}
            options={[
              ["month", m.settings_rec_until_month_end()],
              ["30d", m.settings_rec_next_30_days()],
            ]}
          />
        }
      />
    </SettingGroup>
  )
}
