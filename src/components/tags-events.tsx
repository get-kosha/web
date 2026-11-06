import { useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMeta } from "@/components/shell"
import { saveEvent, type Event } from "@/lib/api"
import { LOCALE, parseTags } from "@/lib/core"
import { cn } from "@/lib/utils"

const short = (day: string, year = false) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  })

/** "3–10 Nov", "28 Dec – 4 Jan 2027", "From 20 Dec", or "" for an undated event. */
export function eventDates(e: Pick<Event, "start_day" | "end_day">) {
  const { start_day: s, end_day: end } = e
  if (!s) return end ? `Until ${short(end)}` : ""
  if (!end) return `From ${short(s)}`
  if (s === end) return short(s)
  if (s.slice(0, 7) === end.slice(0, 7)) return `${Number(s.slice(8))}–${short(end)}`
  return `${short(s)} – ${short(end, s.slice(0, 4) !== end.slice(0, 4))}`
}

/** Small rounded toggle used for tags, events and suggestions. */
export function Chip({
  on,
  onClick,
  children,
  className,
  label,
}: {
  on?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border bg-card px-3 text-[13px] whitespace-nowrap text-subtle-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground max-md:h-10 [&_svg]:size-3.5",
        className
      )}
    >
      {children}
    </button>
  )
}

/**
 * Hashtags as removable chips plus a field. Space, comma or Enter turns what was typed into tags;
 * Backspace in an empty field removes the last one. Known tags are offered as you type.
 */
export function TagInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  autoFocus?: boolean
}) {
  const meta = useMeta()
  const [text, setText] = useState("")
  const add = (raw: string) => {
    const next = parseTags([...value, raw].join(" "))
    if (next.length !== value.length) onChange(next)
    setText("")
  }
  const needle = parseTags(text)[0] ?? ""
  const suggestions = meta.tags.filter((t) => !value.includes(t) && t.startsWith(needle)).slice(0, needle ? 6 : 8)

  return (
    <div className="grid gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 max-md:min-h-11">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex h-7 items-center gap-0.5 rounded-full bg-muted pr-0.5 pl-2.5 text-[13px] max-md:h-8"
          >
            #{t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              aria-label={`Remove #${t}`}
              className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground max-md:size-7"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          autoFocus={autoFocus}
          aria-label="Add tags"
          placeholder={value.length ? "" : "#trip #work"}
          onChange={(e) => {
            const v = e.target.value
            if (/[\s,]$/.test(v)) add(v)
            else setText(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              e.preventDefault()
              add(text)
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text.trim() && add(text)}
          autoCapitalize="none"
          autoComplete="off"
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto">
          {suggestions.map((t) => (
            <Chip key={t} onClick={() => add(t)} label={`Add #${t}`}>
              #{t}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Pick one event, or none (tap the chosen one again). "New event" opens the editor in place and selects
 * what it creates. `day` seeds a new event's start.
 */
export function EventPicker({
  value,
  onChange,
  day,
}: {
  value: string | null
  onChange: (id: string | null) => void
  day: string
}) {
  const meta = useMeta()
  const [creating, setCreating] = useState(false)
  if (creating)
    return (
      <EventEditor
        defaultDay={day}
        onSaved={(id) => {
          setCreating(false)
          onChange(id)
        }}
        onCancel={() => setCreating(false)}
      />
    )
  return (
    <div role="group" aria-label="Event" className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto">
      {meta.events.map((e) => (
        <Chip key={e.id} on={e.id === value} onClick={() => onChange(e.id === value ? null : e.id)}>
          {e.name}
          {eventDates(e) && <span className="text-muted-foreground">· {eventDates(e)}</span>}
        </Chip>
      ))}
      <Chip onClick={() => setCreating(true)} className="border-dashed">
        <PlusIcon /> New event
      </Chip>
    </div>
  )
}

/** Name and optional dates. Creates an event, or edits `event`. */
export function EventEditor({
  event,
  defaultDay,
  onSaved,
  onCancel,
}: {
  event?: Event
  defaultDay?: string
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(event?.name ?? "")
  const [start, setStart] = useState(event ? (event.start_day ?? "") : (defaultDay ?? ""))
  const [end, setEnd] = useState(event?.end_day ?? "")
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error("Give the event a name")
    setBusy(true)
    try {
      const { id } = await saveEvent({
        data: { id: event?.id, name, startDay: start || null, endDay: end || null },
      })
      await router.invalidate()
      onSaved(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the event")
    } finally {
      setBusy(false)
    }
  }

  return (
    // Not a <form>: this sits inside the transaction form.
    <div className="grid gap-3 rounded-lg border bg-card p-3">
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void save()
            }
          }}
          placeholder="Rome trip"
          autoFocus
          className="h-9"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Until</span>
          <Input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            className="h-9"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        New entries between these dates go to this event on their own. Recurring payments don’t.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={busy}>
          {event ? "Save" : "Create event"}
        </Button>
      </div>
    </div>
  )
}
