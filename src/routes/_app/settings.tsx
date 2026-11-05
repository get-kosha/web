import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader, currencyOptions, segment, segmentButton, useMeta } from "@/components/shell"
import { savePreferences, saveSettings } from "@/lib/api"
import { LOCALE } from "@/lib/core"
import { setMotion, setTheme, useTheme, type Motion, type Theme } from "@/lib/theme"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  ArrowsInLineHorizontalIcon,
  ArrowsOutLineHorizontalIcon,
  DesktopIcon,
  DotsSixVerticalIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react/ssr"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · Kosha" }] }),
  component: Settings,
})

function Settings() {
  const meta = useMeta()
  const router = useRouter()
  const [tz, setTz] = useState(meta.tz)
  // The default currency always leads; the rest keep their saved order.
  const order = [meta.primary, ...currencyOptions(meta).filter((c) => c !== meta.primary)]

  async function save(patch: { tz?: string; order?: string[] }, ok: string) {
    const next = { tz: patch.tz ?? meta.tz, order: patch.order ?? order }
    return run(
      () => saveSettings({ data: { primary: next.order[0] ?? meta.primary, tz: next.tz, order: next.order } }),
      ok
    )
  }

  /** Saves an appearance choice to the account; `revert` undoes the instant local change if that fails. */
  async function savePref(patch: { theme?: Theme; layout?: "boxed" | "full"; motion?: Motion }, revert?: () => void) {
    if (!(await run(() => savePreferences({ data: patch }), "Saved"))) revert?.()
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      await router.invalidate()
      toast.success(ok)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
      return false
    }
  }

  return (
    <div className="max-w-xl pb-8">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-8 px-4 md:px-8">
        {order.length > 1 && (
          <section className="flex flex-col gap-3" aria-labelledby="currencies-h">
            <div>
              <h2 id="currencies-h" className="text-sm font-medium">
                Currencies
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag to reorder. The first is your default; the switch in the header moves through them in this order.
              </p>
            </div>
            <CurrencyOrder
              order={order}
              onChange={(next) =>
                save(
                  { order: next },
                  next[0] !== order[0] ? `${next[0].toUpperCase()} is now your default` : "Order saved"
                )
              }
            />
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <Label htmlFor="tz">Time zone</Label>
          <Input
            id="tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={async () => {
              const next = tz.trim()
              if (next === meta.tz) return setTz(meta.tz)
              // Saved on blur; an unknown zone reverts to the saved one.
              if (!(await save({ tz: next }, "Time zone saved"))) setTz(meta.tz)
            }}
            list="kosha-tz"
            className="w-64"
          />
          <datalist id="kosha-tz">
            {Intl.supportedValuesOf("timeZone").map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">
            Months and days follow this zone. Saved when you leave the field.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Categories</h2>
          <p className="text-xs text-muted-foreground">
            Rename categories, change their icons, add subcategories, or merge ones you don’t need.
          </p>
          <Button variant="outline" className="w-fit" nativeButton={false} render={<Link to="/categories" />}>
            Manage categories
          </Button>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-medium">Appearance</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Saved to your account, so every device you sign in on matches.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label id="theme-l">Theme</Label>
            <ThemeSwitch onChange={(theme) => savePref({ theme }, () => setTheme(meta.prefs.theme))} />
            <p className="text-xs text-muted-foreground">System follows your device’s light or dark setting.</p>
          </div>
          <div className="grid gap-1.5">
            <Label id="layout-l">Layout</Label>
            <LayoutPicker value={meta.prefs.layout} onChange={(layout) => savePref({ layout })} />
            <p className="text-xs text-muted-foreground">
              Boxed keeps pages centred, up to 1240px wide. Full width uses the whole window.
            </p>
          </div>
          <div className="flex items-start justify-between gap-6">
            <div className="grid gap-1">
              <Label htmlFor="motion">Animations</Label>
              <p className="text-xs text-muted-foreground">
                Charts drawing in, numbers rolling, dialogs and menus moving. Off makes everything instant.
              </p>
            </div>
            <Switch
              id="motion"
              checked={meta.prefs.motion === "on"}
              onCheckedChange={(on) => {
                const motion = on ? "on" : "off"
                setMotion(motion)
                void savePref({ motion }, () => setMotion(meta.prefs.motion))
              }}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Account &amp; security</h2>
          <p className="text-xs text-muted-foreground">
            Signed in as {meta.user.email}. Password, passkeys, two-factor, devices, and deleting your account.
          </p>
          <Button variant="outline" className="w-fit" nativeButton={false} render={<Link to="/account" />}>
            Open account settings
          </Button>
        </section>
      </div>
    </div>
  )
}

const themes = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: DesktopIcon },
] as const

function ThemeSwitch({ onChange }: { onChange: (theme: Theme) => void }) {
  const theme = useTheme()
  return (
    <div role="group" aria-labelledby="theme-l" className={cn(segment, "w-fit")}>
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => {
            setTheme(value)
            onChange(value)
          }}
          className={cn(segmentButton, "gap-1.5 px-3")}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  )
}

/** Currencies as a list sorted by dragging the handle (or with the keyboard: focus the handle, Space, arrows, Space). */
function CurrencyOrder({ order, onChange }: { order: string[]; onChange: (next: string[]) => void }) {
  const [items, setItems] = useState(order)
  const [prev, setPrev] = useState(order)
  if (prev.join() !== order.join()) {
    // The saved order changed (or a save failed and reverted): follow it.
    setPrev(order)
    setItems(order)
  }
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const names = new Intl.DisplayNames([LOCALE], { type: "currency" })
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        const next = arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id)))
        setItems(next)
        onChange(next)
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ol className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border bg-card">
          {items.map((c, i) => (
            <CurrencyRow key={c} code={c} name={names.of(c.toUpperCase()) ?? ""} first={i === 0} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function CurrencyRow({ code, name, first }: { code: string; name: string; first: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: code,
    transition: { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  })
  return (
    <li
      ref={setNodeRef}
      // Vertical only: the row never drifts sideways while dragging.
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
      className={cn(
        "relative flex min-h-12 items-center gap-3 border-t bg-card pr-3 pl-1 first:border-t-0",
        isDragging && "z-10 rounded-lg border-t-0 shadow-lg ring-1 ring-foreground/10"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${code.toUpperCase()}`}
        className="flex size-11 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon className="size-5" />
      </button>
      <span className="num w-10 text-sm font-medium uppercase">{code}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{name}</span>
      {first && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-subtle-foreground">Default</span>}
    </li>
  )
}

const layouts = [
  { value: "boxed", label: "Boxed", icon: ArrowsInLineHorizontalIcon },
  { value: "full", label: "Full width", icon: ArrowsOutLineHorizontalIcon },
] as const

function LayoutPicker({ value, onChange }: { value: "boxed" | "full"; onChange: (v: "boxed" | "full") => void }) {
  return (
    <div role="group" aria-labelledby="layout-l" className={cn(segment, "w-fit")}>
      {layouts.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => value !== v && onChange(v)}
          className={cn(segmentButton, "gap-1.5 px-3")}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  )
}
