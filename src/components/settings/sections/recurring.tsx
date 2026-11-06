import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref } from "@/components/settings/saved"
import { Switch } from "@/components/ui/switch"

export function Recurring() {
  const [auto, saveAuto] = usePref("default_auto_pay", "auto-record")
  const [horizon, saveHorizon] = usePref("upcoming_horizon", "coming-up")
  return (
    <SettingGroup label="Payments">
      <SettingRow
        id="auto-record"
        title="Record payments automatically"
        description="The default for new bills: record fixed amounts on their due date. Each bill keeps its own choice."
        control={
          <Switch
            aria-label="Record payments automatically"
            checked={auto === "1"}
            onCheckedChange={(on) => saveAuto(on ? "1" : "0")}
          />
        }
      />
      <SettingRow
        id="coming-up"
        title="“Coming up” shows"
        description="What the Coming up card on Overview lists."
        control={
          <Segmented
            label="Coming up shows"
            value={horizon}
            onChange={saveHorizon}
            options={[
              ["month", "Until month end"],
              ["30d", "Next 30 days"],
            ]}
          />
        }
      />
    </SettingGroup>
  )
}
