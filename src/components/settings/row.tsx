import { useEffect, useState, type ReactNode } from "react"
import { Saved } from "@/components/settings/saved"
import { cn } from "@/lib/utils"

/**
 * The one setting layout: title, a line on why it matters, and the control on the right. The control
 * wraps under the label when there's no room. `id` is the row's search key and deep-link anchor.
 */
export function SettingRow({
  id,
  title,
  description,
  control,
  hint,
  danger,
  children,
  className,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  hint?: ReactNode
  danger?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      id={id}
      data-row="setting"
      className={cn(
        "flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-5 py-4 first:border-t-0 max-md:min-h-[52px] max-md:gap-x-3 max-md:px-4",
        className
      )}
    >
      <div className="min-w-0 flex-[1_1_180px] md:max-w-[440px] md:flex-[1_1_260px]">
        <div className={cn("text-sm font-medium", danger && "text-destructive")}>{title}</div>
        {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        {hint && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-brand [&_svg]:size-3.5">{hint}</p>}
      </div>
      {(control || id) && (
        <div className="flex flex-wrap items-center justify-end gap-2.5 max-md:has-[[data-full]]:w-full">
          {id && <Saved k={id} />}
          {control}
        </div>
      )}
      {/* Dialogs portal away and leave this empty, so it collapses. */}
      {children && <div className="basis-full empty:hidden">{children}</div>}
    </div>
  )
}

/** A labelled card of rows. `actions` sit to the right of the label (e.g. "+ New category"). */
export function SettingGroup({
  label,
  actions,
  note,
  danger,
  plain,
  children,
  className,
}: {
  label?: ReactNode
  actions?: ReactNode
  note?: ReactNode
  danger?: boolean
  /** Children lay out themselves (tiles), no card around them. */
  plain?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("mt-7", className)}>
      {(label || actions) && (
        <div className="mx-1 mb-2.5 flex min-h-7 items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium text-subtle-foreground max-md:text-xs max-md:tracking-[0.06em] max-md:text-muted-foreground max-md:uppercase">
            {label}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {plain ? (
        children
      ) : (
        <div className={cn("overflow-hidden rounded-xl border bg-card", danger && "border-destructive/40")}>
          {children}
        </div>
      )}
      {note && <p className="mx-1 mt-2.5 text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}

/** Segmented choice on a soft track. Buttons use aria-pressed. Full width under the label on phone. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  label: string
  /** On a muted surface (inline editors) the track needs to stand apart. */
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-full
      className={cn("inline-flex items-center gap-0.5 rounded-[9px] bg-muted p-[3px] max-md:w-full", className)}
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="h-7 rounded-[7px] px-[11px] text-[12.5px] whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-200 ease-out hover:text-foreground aria-pressed:bg-card aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,0.1)] max-md:h-10 max-md:flex-1 dark:aria-pressed:bg-[#2a2a2f]"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** Small brand-tinted pill: "Beta", "Default", "This device". */
export function Pill({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "warning" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-[7px] py-px text-[10.5px] leading-normal font-medium whitespace-nowrap",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "muted" && "bg-muted text-subtle-foreground"
      )}
    >
      {children}
    </span>
  )
}

/**
 * Opens and closes its content by height and opacity (300ms). Content mounts on open and unmounts
 * once the close has played, so closed editors cost nothing.
 */
export function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])
  if (!mounted) return null
  return (
    <div
      data-open={open || undefined}
      className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-300 ease-out data-open:grid-rows-[1fr] data-open:opacity-100 data-open:starting:grid-rows-[0fr] data-open:starting:opacity-0"
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
