import { useSyncExternalStore } from "react"

export type Theme = "light" | "dark" | "system"
export type Motion = "on" | "off"

// The account holds the real values (settings table, see savePreferences). This device keeps a copy in
// localStorage only so the right theme and motion apply before the first paint, before any data loads.
const THEME = "theme"
const MOTION = "motion"
const QUERY = "(prefers-color-scheme: dark)"
const listeners = new Set<() => void>()

// Runs before first paint (no flash). A literal string, not fn.toString(): server and client
// bundles print functions differently, which breaks hydration of the <script> tag.
export const themeScript = `(()=>{const q=matchMedia("${QUERY}"),d=document.documentElement,g=k=>{try{return localStorage.getItem(k)}catch{}};const a=()=>{const t=g("${THEME}");d.classList.toggle("dark",t==="dark"||(t!=="light"&&q.matches))};a();q.addEventListener("change",a);if(g("${MOTION}")==="off")d.dataset.motion="off"})()`

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

/** Turns every animation and transition off (or back on) on this device right away. */
export function setMotion(motion: Motion) {
  write(MOTION, motion === "off" ? "off" : null)
  if (motion === "off") document.documentElement.dataset.motion = "off"
  else delete document.documentElement.dataset.motion
}

/** Brings this device in line with the account's saved preferences (another device may have changed them). */
export function syncPreferences(prefs: { theme: Theme; motion: Motion }) {
  if (getTheme() !== prefs.theme) setTheme(prefs.theme)
  if ((read(MOTION) === "off") !== (prefs.motion === "off")) setMotion(prefs.motion)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useTheme = () => useSyncExternalStore(subscribe, getTheme, (): Theme => "system")
