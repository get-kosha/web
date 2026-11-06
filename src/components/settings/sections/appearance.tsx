import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref } from "@/components/settings/saved"
import { CoinsIcon, ForkKnifeIcon, ShoppingCartIcon } from "@phosphor-icons/react/ssr"
import { Switch } from "@/components/ui/switch"
import { fmt } from "@/lib/core"
import { setDevicePref, setTheme, type Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const THEMES = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
] as const

const ACCENTS = [
  ["teal", "Teal", "#0f766e"],
  ["blue", "Blue", "#2563eb"],
  ["violet", "Violet", "#7c3aed"],
  ["amber", "Amber", "#b45309"],
  ["rose", "Rose", "#be123c"],
  ["graphite", "Graphite", "#3f3f46"],
] as const

export function Appearance() {
  const [theme, saveTheme] = usePref("theme", "theme", setTheme)
  const [accent, saveAccent] = usePref("accent", "accent", (v) => setDevicePref("accent", v))
  const [density, saveDensity] = usePref("density", "density", (v) => setDevicePref("density", v))
  const [layout, saveLayout] = usePref("layout", "page-width")
  const [figures, saveFigures] = usePref("figures", "number-font", (v) => setDevicePref("figures", v))
  const [hidden, saveHidden] = usePref("hide_amounts", "hide-amounts", (v) => setDevicePref("hide_amounts", v))
  const [motion, saveMotion] = usePref("motion", "animations", (v) => setDevicePref("motion", v))
  return (
    <>
      <SettingGroup
        label="Preview"
        actions={<span className="text-xs text-muted-foreground">updates as you change things below</span>}
      >
        <Preview />
      </SettingGroup>
      <SettingGroup label="Look">
        <SettingRow id="theme" title="Theme" description="System follows your device’s light or dark setting.">
          <ThemeCards value={theme} onChange={saveTheme} />
        </SettingRow>
        <SettingRow
          id="accent"
          title="Accent colour"
          description="Switches, selections, charts and your avatar."
          control={
            <div role="group" aria-label="Accent colour" className="flex flex-wrap gap-2.5">
              {ACCENTS.map(([v, label, color]) => (
                <button
                  key={v}
                  type="button"
                  aria-label={label}
                  aria-pressed={accent === v}
                  onClick={() => saveAccent(v)}
                  style={{ background: color }}
                  className="size-[26px] rounded-full shadow-[0_0_0_2px_var(--card),0_0_0_3px_transparent] transition-[box-shadow,scale] duration-200 ease-out hover:scale-110 aria-pressed:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)] max-md:size-8"
                />
              ))}
            </div>
          }
        />
        <SettingRow
          id="density"
          title="Density"
          description="Compact fits more rows on screen."
          control={
            <Segmented
              label="Density"
              value={density}
              onChange={saveDensity}
              options={[
                ["comfortable", "Comfortable"],
                ["compact", "Compact"],
              ]}
            />
          }
        />
        <SettingRow
          id="page-width"
          title="Page width"
          description="Boxed keeps pages centred up to 1240px."
          control={
            <Segmented
              label="Page width"
              value={layout}
              onChange={saveLayout}
              options={[
                ["boxed", "Boxed"],
                ["full", "Full width"],
              ]}
            />
          }
        />
      </SettingGroup>
      <SettingGroup label="Behaviour">
        <SettingRow
          id="number-font"
          title="Number font"
          description="Monospace lines amounts up in columns."
          control={
            <Segmented
              label="Number font"
              value={figures}
              onChange={saveFigures}
              options={[
                ["mono", "Monospace"],
                ["proportional", "Proportional"],
              ]}
            />
          }
        />
        <SettingRow
          id="hide-amounts"
          title="Hide amounts"
          description="Blur money until you hover. Handy on a train. Also in the account menu."
          control={
            <Switch
              aria-label="Hide amounts"
              checked={hidden === "1"}
              onCheckedChange={(on) => saveHidden(on ? "1" : "0")}
            />
          }
        />
        <SettingRow
          id="animations"
          title="Animations"
          description="Charts drawing in, numbers rolling, pages sliding. Reduced keeps fades only."
          control={
            <Segmented
              label="Animations"
              value={motion}
              onChange={saveMotion}
              options={[
                ["on", "On"],
                ["reduced", "Reduced"],
                ["off", "Off"],
              ]}
            />
          }
        />
      </SettingGroup>
    </>
  )
}

// ponytail: a static sample, not the user's own figures; Settings has no transactions loaded.
const SAMPLE = [
  [ForkKnifeIcon, "Dosaking Indisches Restaurant", -2957],
  [ShoppingCartIcon, "Rewe", -4112],
  [CoinsIcon, "Salary", 420000],
] as const

/** A tiny Overview that follows every setting below: theme, accent, density, number font, hidden amounts. */
function Preview() {
  return (
    <div className="grid gap-2.5 bg-background p-3.5 transition-[gap] duration-300 ease-out [:root[data-density=compact]_&]:gap-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-[4px] bg-foreground">
          <span className="size-1.5 rounded-[1.5px] bg-card" />
        </span>
        Kosha
        <span className="ml-auto font-normal text-muted-foreground">Sample</span>
      </div>
      <div className="flex items-end justify-between gap-3 rounded-xl bg-card p-3.5">
        <div>
          <div className="text-[11px] text-muted-foreground">Net worth</div>
          <div className="num mt-1 text-[26px] font-semibold tracking-[-0.03em]">€108,982.23</div>
        </div>
        <svg viewBox="0 0 160 40" className="h-10 w-40 max-sm:w-24" aria-hidden="true">
          <polyline
            points="0,36 18,34 36,30 54,29 72,27 90,24 108,25 126,16 144,14 160,8"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {SAMPLE.map(([Icon, name, cents]) => (
        <div
          key={name}
          className="flex items-center justify-between gap-2.5 rounded-[10px] bg-card px-3 py-2.5 text-[13px] transition-[padding] duration-300 ease-out [:root[data-density=compact]_&]:py-[5px]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-[15px] shrink-0 text-subtle-foreground" />
            <span className="truncate">{name}</span>
          </span>
          <span className={cn("num", cents > 0 && "text-positive")}>{(cents > 0 ? "+" : "") + fmt(cents, "eur")}</span>
        </div>
      ))}
    </div>
  )
}

/** Three cards with a tiny page drawn in each theme. Picking one re-themes the page at once. */
function ThemeCards({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="group" aria-label="Theme" className="mt-1 flex flex-wrap gap-3.5 max-md:grid max-md:grid-cols-3">
      {THEMES.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="group/tc flex flex-col items-start gap-2 text-[12.5px] text-subtle-foreground aria-pressed:font-medium aria-pressed:text-foreground"
        >
          <span
            aria-hidden="true"
            className={cn(
              "relative block h-[84px] w-[132px] overflow-hidden rounded-[10px] shadow-[0_0_0_1px_var(--border)] transition-[box-shadow,transform] duration-[250ms] ease-out group-hover/tc:-translate-y-0.5 group-aria-pressed/tc:shadow-[0_0_0_2px_var(--brand)] max-md:h-16 max-md:w-full",
              v === "light" && "bg-[#f6f6f4]",
              v === "dark" && "bg-[#0b0b0c]",
              v === "system" && "bg-[linear-gradient(135deg,#f6f6f4_0_50%,#0b0b0c_50%_100%)]"
            )}
          >
            <i
              className={cn(
                "absolute top-2.5 left-2.5 h-1.5 w-[30px] rounded-[3px]",
                v === "light" ? "bg-[#dcdcd7]" : v === "dark" ? "bg-[#2a2a2f]" : "bg-[#9a9aa0]/60"
              )}
            />
            <i className="absolute top-2.5 right-2.5 h-1.5 w-3.5 rounded-[3px] bg-brand" />
            <i
              className={cn(
                "absolute inset-x-2.5 top-6 h-[30px] rounded-md max-md:h-5",
                v === "light"
                  ? "bg-white shadow-[0_0_0_1px_#e4e4e0]"
                  : v === "dark"
                    ? "bg-[#18181b]"
                    : "bg-[#9a9aa0]/60"
              )}
            />
            <i
              className={cn(
                "absolute bottom-2.5 left-2.5 h-1.5 w-[50px] rounded-[3px]",
                v === "light" ? "bg-[#dcdcd7]" : v === "dark" ? "bg-[#2a2a2f]" : "bg-[#9a9aa0]/60"
              )}
            />
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}
