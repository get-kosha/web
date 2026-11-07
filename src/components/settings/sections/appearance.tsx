import { Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { usePref } from "@/components/settings/saved"
import { CoinsIcon, ForkKnifeIcon, ShoppingCartIcon } from "@phosphor-icons/react/ssr"
import { Switch } from "@/components/ui/switch"
import { fmt } from "@/lib/core"
import { setDevicePref, setTheme, type Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

// Labels are message functions, called while rendering so they follow the visitor's language.
const THEMES = [
  ["light", m.settings_appearance_light],
  ["dark", m.settings_appearance_dark],
  ["system", m.settings_appearance_system],
] as const

const ACCENTS = [
  ["teal", m.settings_appearance_teal, "#0f766e"],
  ["blue", m.settings_appearance_blue, "#2563eb"],
  ["amber", m.settings_appearance_amber, "#b45309"],
  ["rose", m.settings_appearance_rose, "#be123c"],
  ["graphite", m.settings_appearance_graphite, "#3f3f46"],
] as const

export function Appearance() {
  const [theme, saveTheme] = usePref("theme", setTheme)
  const [accent, saveAccent] = usePref("accent", (v) => setDevicePref("accent", v))
  const [density, saveDensity] = usePref("density", (v) => setDevicePref("density", v))
  const [layout, saveLayout] = usePref("layout")
  const [figures, saveFigures] = usePref("figures", (v) => setDevicePref("figures", v))
  const [hidden, saveHidden] = usePref("hide_amounts", (v) => setDevicePref("hide_amounts", v))
  const [motion, saveMotion] = usePref("motion", (v) => setDevicePref("motion", v))
  return (
    <>
      <SettingGroup
        label={m.settings_appearance_preview()}
        actions={<span className="text-xs text-muted-foreground">{m.settings_appearance_preview_hint()}</span>}
      >
        <Preview />
      </SettingGroup>
      <SettingGroup label={m.settings_appearance_look()}>
        <SettingRow id="theme" title={m.settings_row_theme()} description={m.settings_appearance_theme_desc()}>
          <ThemeCards value={theme} onChange={saveTheme} />
        </SettingRow>
        <SettingRow
          id="accent"
          title={m.settings_row_accent()}
          description={m.settings_appearance_accent_desc()}
          control={
            <div role="group" aria-label={m.settings_row_accent()} className="flex flex-wrap gap-2.5">
              {ACCENTS.map(([v, label, color]) => (
                <button
                  key={v}
                  type="button"
                  aria-label={label()}
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
          title={m.settings_row_density()}
          description={m.settings_appearance_density_desc()}
          control={
            <Segmented
              label={m.settings_row_density()}
              value={density}
              onChange={saveDensity}
              options={[
                ["comfortable", m.settings_appearance_comfortable()],
                ["compact", m.settings_appearance_compact()],
              ]}
            />
          }
        />
        <SettingRow
          id="page-width"
          title={m.settings_row_page_width()}
          description={m.settings_appearance_width_desc()}
          control={
            <Segmented
              label={m.settings_row_page_width()}
              value={layout}
              onChange={saveLayout}
              options={[
                ["boxed", m.settings_appearance_boxed()],
                ["full", m.settings_appearance_full()],
              ]}
            />
          }
        />
      </SettingGroup>
      <SettingGroup label={m.settings_appearance_behaviour()}>
        <SettingRow
          id="number-font"
          title={m.settings_row_number_font()}
          description={m.settings_appearance_figures_desc()}
          control={
            <Segmented
              label={m.settings_row_number_font()}
              value={figures}
              onChange={saveFigures}
              options={[
                ["mono", m.settings_appearance_mono()],
                ["proportional", m.settings_appearance_proportional()],
              ]}
            />
          }
        />
        <SettingRow
          id="hide-amounts"
          title={m.settings_row_hide_amounts()}
          description={m.settings_appearance_hide_desc()}
          control={
            <Switch
              aria-label={m.settings_row_hide_amounts()}
              checked={hidden === "1"}
              onCheckedChange={(on) => saveHidden(on ? "1" : "0")}
            />
          }
        />
        <SettingRow
          id="animations"
          title={m.settings_row_animations()}
          description={m.settings_appearance_motion_desc()}
          control={
            <Segmented
              label={m.settings_row_animations()}
              value={motion}
              onChange={saveMotion}
              options={[
                ["on", m.settings_appearance_on()],
                ["reduced", m.settings_appearance_reduced()],
                ["off", m.settings_appearance_off()],
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
  [ForkKnifeIcon, () => "McDonald's", -2957],
  [ShoppingCartIcon, () => "Walmart", -4112],
  [CoinsIcon, m.settings_appearance_salary, 420000],
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
        <span className="ml-auto font-normal text-muted-foreground">{m.settings_appearance_sample()}</span>
      </div>
      <div className="flex items-end justify-between gap-3 rounded-xl bg-card p-3.5">
        <div>
          <div className="text-[11px] text-muted-foreground">{m.settings_appearance_net_worth()}</div>
          <div className="num mt-1 text-[26px] font-semibold tracking-[-0.03em]">{fmt(10898223, "eur")}</div>
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
      {SAMPLE.map(([Icon, name, cents], i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2.5 rounded-[10px] bg-card px-3 py-2.5 text-[13px] transition-[padding] duration-300 ease-out [:root[data-density=compact]_&]:py-[5px]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-[15px] shrink-0 text-subtle-foreground" />
            <span className="truncate">{name()}</span>
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
    <div
      role="group"
      aria-label={m.settings_row_theme()}
      className="mt-1 flex flex-wrap gap-3.5 max-md:grid max-md:grid-cols-3"
    >
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
          {label()}
        </button>
      ))}
    </div>
  )
}
