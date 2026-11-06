import { useRef, useState, type ReactNode } from "react"
import { CalendarBlankIcon, ClockIcon } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LOCALE, dateOfDay, dayOfDate } from "@/lib/core"
import { cn } from "@/lib/utils"

/** "6 Nov 2026" */
export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

/** The default trigger looks like an Input. Pass `children` and `className` to draw your own. */
const fieldTrigger =
  "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring max-md:h-11 dark:bg-input/30 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"

type Trigger = {
  className?: string
  children?: ReactNode
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}

/** A day (`YYYY-MM-DD`) picked from a calendar. With `clearable`, "" means no day. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  clearable,
  placeholder = "Pick a date",
  className,
  children,
  ...aria
}: Trigger & {
  value: string
  onChange: (day: string) => void
  min?: string
  max?: string
  clearable?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? dateOfDay(value) : undefined
  const disabled = [...(min ? [{ before: dateOfDay(min) }] : []), ...(max ? [{ after: dateOfDay(max) }] : [])]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...aria} className={cn(children === undefined && fieldTrigger, className)}>
        {children ?? (
          <>
            <CalendarBlankIcon />
            <span className={cn("num truncate", !value && "text-muted-foreground")}>
              {value ? dayLabel(value) : placeholder}
            </span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          disabled={disabled}
          onSelect={(d) => {
            // Tapping the chosen day again unselects it, which only optional fields allow.
            if (!d && !clearable) return setOpen(false)
            onChange(d ? dayOfDate(d) : "")
            setOpen(false)
          }}
          className="max-md:[--cell-size:--spacing(11)]"
        />
        {clearable && value && (
          <div className="border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full max-md:h-11"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

/** A 24-hour time (`HH:MM`) picked from hour and minute columns. Picking a minute closes it. */
export function TimePicker({
  value,
  onChange,
  className,
  children,
  ...aria
}: Trigger & { value: string; onChange: (time: string) => void }) {
  const [open, setOpen] = useState(false)
  const [h = "00", m = "00"] = value.split(":")
  const popup = useRef<HTMLDivElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...aria} className={cn(children === undefined && fieldTrigger, className)}>
        {children ?? (
          <>
            <ClockIcon />
            <span className="num">{value}</span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        ref={popup}
        // Start on the chosen hour, so focus doesn't scroll the column back to 00.
        initialFocus={() => popup.current?.querySelector<HTMLElement>("[aria-pressed=true]") ?? true}
        align="start"
        className="w-auto flex-row gap-1 p-1"
      >
        <Column label="Hour" values={HOURS} current={h} onPick={(x) => onChange(`${x}:${m}`)} />
        <div className="w-px bg-border" />
        <Column
          label="Minute"
          values={MINUTES}
          current={m}
          onPick={(x) => {
            onChange(`${h}:${x}`)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Scrolls the chosen value to the middle of its column, without scrolling the page. */
const centre = (el: HTMLElement | null) => {
  // The popup lays out after mount, so measure on the next frame.
  if (el)
    requestAnimationFrame(() => {
      const box = el.parentElement
      if (box) box.scrollTop = el.offsetTop - (box.clientHeight - el.clientHeight) / 2
    })
}

function Column({
  label,
  values,
  current,
  onPick,
}: {
  label: string
  values: string[]
  current: string
  onPick: (v: string) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative flex max-h-64 [scrollbar-width:none] flex-col gap-0.5 overflow-y-auto overscroll-contain"
    >
      {values.map((v) => (
        <button
          key={v}
          ref={v === current ? centre : undefined}
          type="button"
          aria-pressed={v === current}
          onClick={() => onPick(v)}
          className="num h-8 w-12 shrink-0 rounded-md text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground max-md:h-11 max-md:w-14"
        >
          {v}
        </button>
      ))}
    </div>
  )
}
