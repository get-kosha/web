import { useSyncExternalStore } from "react"
import { PREFS, type Prefs } from "@/lib/core"
import { getLocale, setLocale } from "@/paraglide/runtime"

export type Theme = Prefs["theme"]

// savePreferences stores the real values in the account's settings table. This device keeps a copy in
// localStorage only so they apply before the first paint, before any data loads.
const THEME = "theme"
const QUERY = "(prefers-color-scheme: dark)"
const listeners = new Set<() => void>()

/** Preferences that show as a data attribute on <html>, which styles.css selects on. The default sets no attribute. */
const ATTRS = {
  motion: "motion",
  accent: "accent",
  density: "density",
  figures: "figures",
  hide_amounts: "private",
} as const
type DevicePref = keyof typeof ATTRS

// Runs before the first paint, so there is no flash. It is a literal string rather than fn.toString(),
// because server and client bundles print functions differently and that breaks hydration of the <script> tag.
export const themeScript = `(()=>{const q=matchMedia("${QUERY}"),d=document.documentElement,g=k=>{try{return localStorage.getItem(k)}catch{}};const a=()=>{const t=g("${THEME}");d.classList.toggle("dark",t==="dark"||(t!=="light"&&q.matches))};a();q.addEventListener("change",a);${Object.entries(
  ATTRS
)
  .map(([k, attr]) => `if(g("${k}"))d.dataset.${attr}=g("${k}");`)
  .join("")}})()`

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage fails in private mode or when blocked. The account still has the value.
  }
}

function getTheme(): Theme {
  const t = read(THEME)
  return t === "light" || t === "dark" ? t : "system"
}

function applyTheme() {
  const t = getTheme()
  const d = document.documentElement
  const dark = t === "dark" || (t === "system" && matchMedia(QUERY).matches)
  if (d.classList.contains("dark") === dark) return
  // Without this, elements with a colour transition fade from the old theme while the rest snaps,
  // so the old selection glows for a moment. Transitions are off for the one style recalc of the swap.
  const off = document.createElement("style")
  off.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(off)
  d.classList.toggle("dark", dark)
  // Reading a style forces the recalc now, while the override is still in place.
  void getComputedStyle(d).color
  setTimeout(() => off.remove())
}

/** Applies a theme on this device right away. Saving it to the account is the caller's job. */
export function setTheme(theme: Theme) {
  write(THEME, theme === "system" ? null : theme)
  applyTheme()
  listeners.forEach((l) => l())
}

/** Applies motion, accent, density, number font or hide-amounts on this device right away. */
export function setDevicePref<K extends DevicePref>(key: K, value: Prefs[K]) {
  const off = value === PREFS[key].fallback
  write(key, off ? null : value)
  const ds = document.documentElement.dataset
  if (off) delete ds[ATTRS[key]]
  else ds[ATTRS[key]] = value
}

/** Brings this device in line with the account's saved preferences (another device may have changed them). */
export function syncPreferences(prefs: Prefs) {
  // The language comes from a cookie, so a new browser follows the account's choice once, then reloads.
  if (prefs.language && prefs.language !== getLocale()) {
    void setLocale(prefs.language)
    return
  }
  if (getTheme() !== prefs.theme) setTheme(prefs.theme)
  for (const key of Object.keys(ATTRS) as DevicePref[]) {
    if ((read(key) ?? PREFS[key].fallback) !== prefs[key]) setDevicePref(key, prefs[key])
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useTheme = () => useSyncExternalStore(subscribe, getTheme, (): Theme => "system")
