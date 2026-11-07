import { useEffect, useRef, useState, type ComponentProps } from "react"
import NumberFlow from "@number-flow/react"
import { getRouteApi } from "@tanstack/react-router"
import { intlLocale } from "@/lib/core"
import { cn } from "@/lib/utils"

// Set once the first (hydration) render has committed. On a hard load, numbers render at their final
// value with no animation. Numbers that mount later (client navigation) roll up from zero, so the
// server never sends a misleading €0.00.
let hydrated = false
export function useMarkHydrated() {
  useEffect(() => {
    hydrated = true
  }, [])
}

/** True once the element has scrolled into view (and stays true). */
function useInView<T extends Element>(initial = false) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen] as const
}

/**
 * Entrance animation for charts. `x` wipes in from left to right (lines, areas). `bars` grows children
 * marked `bar-grow` / `bar-grow-x`, staggered by their `--i`. It plays once, when the chart first scrolls into view.
 */
export function Reveal({ kind = "x", className, ...props }: ComponentProps<"div"> & { kind?: "x" | "bars" }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return <div ref={ref} data-reveal={kind} data-shown={seen || undefined} className={className} {...props} />
}

const spin = { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
const fade = { duration: 250, easing: "ease-out" }

/** Money whose digits slide into place on entrance and when the value changes (e.g. a new month). */
export function RollingMoney({
  value,
  currency,
  className,
  round,
}: {
  value: number
  currency: string
  className?: string
  /** Whole units only (Settings › General › Round amounts on Overview). */
  round?: boolean
}) {
  const motion = getRouteApi("/_app").useLoaderData({ select: (m) => m.prefs.motion })
  const [ref, seen] = useInView<HTMLSpanElement>(!hydrated || motion !== "on")
  return (
    <span ref={ref} className={cn("inline-block", className)}>
      <NumberFlow
        value={(seen ? value : 0) / 100}
        locales={intlLocale()}
        format={{ style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: round ? 0 : 2 }}
        transformTiming={spin}
        spinTiming={spin}
        opacityTiming={fade}
        animated={motion === "on"}
      />
    </span>
  )
}
