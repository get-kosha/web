import { useState, type ReactNode } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { PlusIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { DatePicker } from "@/components/date-time"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
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
 * Hashtags as removable chips in a combobox. Space, comma or Enter turns what was typed into a tag;
 * Backspace in an empty field removes the last one. The list suggests known tags that start with
 * what you typed, with the typed tag itself first. With `linked`, each tag opens Activity filtered to it.
 * Use it only where edits save as you go.
 */
export function TagInput({
  value,
  onChange,
  autoFocus,
  linked,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  autoFocus?: boolean
  linked?: boolean
}) {
  const meta = useMeta()
  const anchor = useComboboxAnchor()
  const [text, setText] = useState("")
  const add = (raw: string) => {
    const next = parseTags([...value, raw].join(" "))
    if (next.length !== value.length) onChange(next)
    setText("")
  }
  const needle = parseTags(text)[0] ?? ""
  const known = meta.tags.filter((t) => t !== needle && !value.includes(t) && t.startsWith(needle))
  const items = [...(needle && !value.includes(needle) ? [needle] : []), ...known].slice(0, 8)

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      filter={null}
      value={value}
      onValueChange={(tags: string[]) => {
        onChange(parseTags(tags.join(" ")))
        setText("")
      }}
      inputValue={text}
      onInputValueChange={(v) => (/[\s,]$/.test(v) ? add(v) : setText(v))}
    >
      <ComboboxChips ref={anchor} className="min-h-10 bg-card px-1.5 max-md:min-h-11">
        <ComboboxValue>
          {(tags: string[]) => (
            <>
              {tags.map((t) => (
                <ComboboxChip
                  key={t}
                  aria-description="Press Backspace or Delete to remove"
                  className="h-7 rounded-full pl-2.5 text-[13px] font-normal max-md:h-8 [&_[data-slot=combobox-chip-remove]]:rounded-full max-md:[&_[data-slot=combobox-chip-remove]]:size-7"
                >
                  {linked ? (
                    <Link
                      to="/transactions"
                      search={{ tag: t }}
                      aria-label={`All transactions tagged #${t}`}
                      className="rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      #{t}
                    </Link>
                  ) : (
                    `#${t}`
                  )}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                autoFocus={autoFocus}
                aria-label="Add tags"
                placeholder={tags.length ? "" : "#trip #work"}
                onBlur={() => text.trim() && add(text)}
                autoCapitalize="none"
                autoComplete="off"
                className="h-7 min-w-24 bg-transparent px-1 placeholder:text-muted-foreground"
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{meta.tags.length ? "No more tags" : "Type a tag, then press space"}</ComboboxEmpty>
        <ComboboxList>
          {(t: string) => (
            <ComboboxItem key={t} value={t} className="max-md:min-h-11">
              {meta.tags.includes(t) ? `#${t}` : `Add #${t}`}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * Pick one event from a searchable list, or none. "New event" swaps in the editor and selects what
 * it creates. `day` is the default start for a new event. Without `className` the trigger looks like an Input.
 */
export function EventPicker({
  value,
  onChange,
  day,
  className,
  ...aria
}: {
  value: string | null
  onChange: (id: string | null) => void
  day: string
  className?: string
  "aria-labelledby"?: string
}) {
  const meta = useMeta()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const current = meta.events.find((e) => e.id === value)
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
  const footer = (label: string, act: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false)
        act()
      }}
      className="flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground max-md:min-h-11 [&_svg]:size-4"
    >
      {label === "New event" && <PlusIcon />}
      {label}
    </button>
  )
  return (
    <Combobox
      items={meta.events}
      value={current ?? null}
      onValueChange={(e: Event | null) => onChange(e?.id ?? null)}
      itemToStringLabel={(e: Event) => e.name}
      isItemEqualToValue={(a: Event, b: Event) => a.id === b.id}
      open={open}
      onOpenChange={setOpen}
      autoHighlight
    >
      <ComboboxTrigger
        {...aria}
        className={
          className ??
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-card px-2.5 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-11"
        }
      >
        <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.name ?? "No event"}</span>
      </ComboboxTrigger>
      <ComboboxContent align="start" className="w-72">
        <ComboboxInput showTrigger={false} placeholder="Search events" aria-label="Search events" />
        <ComboboxEmpty>{meta.events.length ? "No event matches." : "No events yet."}</ComboboxEmpty>
        <ComboboxList>
          {(e: Event) => (
            <ComboboxItem key={e.id} value={e} className="max-md:min-h-11">
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{eventDates(e)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
        <div className="border-t p-1">
          {current && footer("No event", () => onChange(null))}
          {footer("New event", () => setCreating(true))}
        </div>
      </ComboboxContent>
    </Combobox>
  )
}

/** Form for an event's name and optional dates. It creates an event, or edits `event` when passed one. */
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
      toast.error(e instanceof Error ? e.message : "Couldn't save the event")
    } finally {
      setBusy(false)
    }
  }

  return (
    // Not a <form>, because it sits inside the transaction form.
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-3">
        <div className="grid gap-1">
          <span id="ev-from" className="text-xs text-muted-foreground">
            From
          </span>
          <DatePicker aria-labelledby="ev-from" value={start} onChange={setStart} clearable placeholder="Any time" />
        </div>
        <div className="grid gap-1">
          <span id="ev-until" className="text-xs text-muted-foreground">
            Until
          </span>
          <DatePicker
            aria-labelledby="ev-until"
            value={end}
            min={start || undefined}
            onChange={setEnd}
            clearable
            placeholder="Any time"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        New entries between these dates go to this event on their own. Recurring payments don't.
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
