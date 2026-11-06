import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { CheckIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { savePreferences } from "@/lib/api"
import type { Prefs } from "@/lib/core"

const SavedContext = createContext<{ saved: string | null; mark: (key: string) => void }>({
  saved: null,
  mark: () => {},
})

/** Holds which setting saved last, so its row can show the tick. One live region announces it. */
export function SavedProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<{ key: string; n: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const mark = (key: string) => {
    clearTimeout(timer.current)
    // n restarts the pop when the same row saves twice in a row.
    setSaved((s) => ({ key, n: (s?.n ?? 0) + 1 }))
    timer.current = setTimeout(() => setSaved(null), 1700)
  }
  return (
    <SavedContext value={{ saved: saved && `${saved.key}:${saved.n}`, mark }}>
      {children}
      <p aria-live="polite" className="sr-only">
        {saved ? "Saved" : ""}
      </p>
    </SavedContext>
  )
}

/** The "Saved" tick for one setting. Rows render it beside their control. */
export function Saved({ k }: { k: string }) {
  const { saved } = useContext(SavedContext)
  if (!saved?.startsWith(`${k}:`)) return null
  return (
    <span key={saved} className="saved-pop inline-flex items-center gap-1 text-xs text-positive" aria-hidden="true">
      <CheckIcon className="size-3.5" weight="bold" /> Saved
    </span>
  )
}

export const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

/**
 * Saves one setting: the caller has already updated its own state (optimistic). On success the row
 * ticks and every loader refreshes; on failure `revert` runs and a toast says why.
 */
export function useSave() {
  const router = useRouter()
  const { mark } = useContext(SavedContext)
  return async (key: string, fn: () => Promise<unknown>, revert?: () => void) => {
    try {
      const res = (await fn()) as { error?: { message?: string } | null } | undefined
      // Better Auth client calls resolve to { error } instead of throwing.
      if (res && typeof res === "object" && "error" in res && res.error)
        throw new Error(res.error.message || "Something went wrong")
      mark(key)
      await router.invalidate()
      return true
    } catch (e) {
      revert?.()
      toast.error(errorOf(e))
      return false
    }
  }
}

const app = getRouteApi("/_app")

/**
 * One preference as local state that saves itself: the new value shows at once, `apply` runs any
 * device-side effect (theme, motion), and a failed save puts both back. `row` is the row that ticks.
 */
export function usePref<K extends keyof Prefs>(key: K, row: string, apply?: (v: Prefs[K]) => void) {
  const stored = app.useLoaderData().prefs[key]
  const [value, setValue] = useState(stored)
  const [prev, setPrev] = useState(stored)
  if (prev !== stored) {
    // Saved elsewhere (another device, the account menu) or reverted: follow it.
    setPrev(stored)
    setValue(stored)
  }
  const save = useSave()
  const set = (next: Prefs[K]) => {
    if (next === value) return
    const old = value
    setValue(next)
    apply?.(next)
    void save(
      row,
      () => savePreferences({ data: { [key]: next } }),
      () => {
        setValue(old)
        apply?.(old)
      }
    )
  }
  return [value, set] as const
}
