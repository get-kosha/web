import { useState } from "react"
import { DotsSixVerticalIcon, SpinnerGapIcon } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { refreshRatesNow } from "@/lib/api"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { currencyOptions, useMeta } from "@/components/shell"
import { Pill, SettingGroup, SettingRow } from "@/components/settings/row"
import { useSave } from "@/components/settings/saved"
import { saveCore } from "@/components/settings/sections/general"
import { LOCALE, convert, fmt } from "@/lib/core"
import { cn } from "@/lib/utils"

const ago = (unix: number) => {
  const s = Date.now() / 1000 - unix
  if (!unix) return "never"
  if (s < 90) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} hours ago`
  return `${Math.round(s / 86400)} days ago`
}

export function Currencies() {
  const meta = useMeta()
  const save = useSave()
  // The default currency always leads; the rest keep their saved order.
  const order = [meta.primary, ...currencyOptions(meta).filter((c) => c !== meta.primary)]
  const [items, setItems] = useState(order)
  const [prev, setPrev] = useState(order.join())
  if (prev !== order.join()) {
    // The saved order changed (or a save failed and reverted), so follow it.
    setPrev(order.join())
    setItems(order)
  }
  const change = (next: string[]) => {
    setItems(next)
    void save(
      () => saveCore(meta, { order: next }),
      () => setItems(order)
    )
  }
  const [refresh, setRefresh] = useState<"idle" | "busy" | "done">("idle")
  const names = new Intl.DisplayNames([LOCALE], { type: "currency" })
  const others = items.slice(1).filter((c) => meta.rates[c])

  return (
    <>
      <SettingGroup
        label="Your currencies"
        note={
          items.length > 1
            ? "Drag to reorder. The header's currency switch steps through them in this order."
            : "Add an account in another currency and it shows up here."
        }
      >
        <div id="currencies">
          <CurrencyOrder items={items} names={names} onChange={change} />
        </div>
      </SettingGroup>

      <SettingGroup label="Exchange rates">
        <SettingRow
          id="rates-source"
          title="Exchange rate source"
          description={`Updated ${ago(meta.ratesUpdated)}. Kosha checks for new rates once a day.`}
          control={
            <>
              <Button
                variant="ghost"
                className="h-9 px-3 text-[13px] font-normal text-subtle-foreground"
                disabled={refresh === "busy"}
                onClick={async () => {
                  setRefresh("busy")
                  setRefresh((await save(() => refreshRatesNow())) ? "done" : "idle")
                }}
              >
                {refresh === "busy" && <SpinnerGapIcon className="animate-spin" />}
                {refresh === "busy" ? "Refreshing…" : refresh === "done" ? "Up to date" : "Refresh"}
              </Button>
              <span className="text-[13px] text-subtle-foreground">fawazahmed0 currency API · daily</span>
            </>
          }
        />
        {others.length > 0 && (
          <table className="w-full border-t text-[13px]">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-normal max-md:px-4">Currency</th>
                <th className="px-5 py-2.5 text-right font-normal max-md:px-4">In {items[0].toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              {others.map((c) => (
                <tr key={c} className="border-t">
                  <td data-plain className="num px-5 py-3 uppercase max-md:px-4">
                    1 {c}
                  </td>
                  <td className="num px-5 py-3 text-right max-md:px-4">{rateIn(c, items[0], meta.rates)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SettingGroup>
    </>
  )
}

/** "€0.0106": one unit of `from` in `to`, with enough digits to be useful. */
function rateIn(from: string, to: string, rates: Record<string, number>) {
  const r = convert(100, from, to, rates) / 100
  const sym = fmt(0, to).replace(/[\d.,\s]/g, "")
  return `${sym}${r.toFixed(r >= 100 ? 2 : 4)}`
}

/** Currencies as rows sorted by dragging the handle (or with the keyboard: focus the handle, Space, arrows, Space). */
function CurrencyOrder({
  items,
  names,
  onChange,
}: {
  items: string[]
  names: Intl.DisplayNames
  onChange: (next: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        onChange(arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id))))
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ol>
          {items.map((c, i) => (
            <CurrencyRow
              key={c}
              code={c}
              name={names.of(c.toUpperCase()) ?? ""}
              first={i === 0}
              sortable={items.length > 1}
              onDefault={() => onChange([c, ...items.filter((x) => x !== c)])}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function CurrencyRow({
  code,
  name,
  first,
  sortable,
  onDefault,
}: {
  code: string
  name: string
  first: boolean
  sortable: boolean
  onDefault: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: code,
    transition: { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  })
  return (
    <li
      ref={setNodeRef}
      // Lock the drag to vertical so the row never drifts sideways.
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
      className={cn(
        "relative flex min-h-12 items-center gap-3 border-t bg-card pr-5 pl-2 first:border-t-0 max-md:pr-4",
        isDragging && "z-10 rounded-xl shadow-lg ring-1 ring-foreground/10"
      )}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Reorder ${code.toUpperCase()}`}
          className="flex size-11 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <DotsSixVerticalIcon className="size-4" />
        </button>
      ) : (
        <span className="w-3" />
      )}
      <span data-plain className="num w-10 text-[15px] font-medium uppercase">
        {code}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{name}</span>
      {first ? (
        <Pill>Default</Pill>
      ) : (
        <button
          type="button"
          onClick={onDefault}
          className="-mr-2 inline-flex h-9 items-center rounded-md px-2 text-xs text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Make default
        </button>
      )}
    </li>
  )
}
