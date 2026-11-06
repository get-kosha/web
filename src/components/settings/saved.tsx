import { useState } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { savePreferences } from "@/lib/api"
import type { Prefs } from "@/lib/core"

export const errorOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

/**
 * Saves one setting in the background: the caller has already updated its own state (optimistic).
 * On success every loader refreshes; on failure `revert` runs and a toast says why.
 */
export function useSave() {
  const router = useRouter()
  return async (fn: () => Promise<unknown>, revert?: () => void) => {
    try {
      const res = (await fn()) as { error?: { message?: string } | null } | undefined
      // Better Auth client calls resolve to { error } instead of throwing.
      if (res && typeof res === "object" && "error" in res && res.error)
        throw new Error(res.error.message || "Something went wrong")
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
 * device-side effect (theme, motion), and a failed save puts both back.
 */
export function usePref<K extends keyof Prefs>(key: K, apply?: (v: Prefs[K]) => void) {
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
      () => savePreferences({ data: { [key]: next } }),
      () => {
        setValue(old)
        apply?.(old)
      }
    )
  }
  return [value, set] as const
}
