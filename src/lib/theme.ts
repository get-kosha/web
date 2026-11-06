import { useSyncExternalStore } from "react"
import { PREFS, type Prefs } from "@/lib/core"

export type Theme = Prefs["theme"]

// The account holds the real values (settings table, see savePreferences). This device keeps a copy in
// localStorage only so they apply before the first paint, before any data loads.
const THEME = "theme"
const QUERY = "(prefers-color-scheme: dark)"
const listeners = new Set<() => void>()

/** Preferences that show as a data attribute on <html> (styles.css keys off them). Default = no attribute. */
const ATTRS = {
  motion: "motion",
  accent: "accent",
  density: "density",
  figures: "figures",
  hide_amounts: "private",
} as const
type DevicePref = keyof typeof ATTRS

// Runs before first paint (no flash). A literal string, not fn.toString(): server and client
// bundles print functions differently, which breaks hydration of the <script> tag.
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
    // private mode or blocked storage: the account still has the value
  }
}

function getTheme(): Theme {
  const t = read(THEME)
  return t === "light" || t === "dark" ? t : "system"
}

function applyTheme() {
  const t = getTheme()
  document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && matchMedia(QUERY).matches))
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
