import { useMemo, useState } from "react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr"
import { CategoryIcon } from "@/components/category-icon"
import { useMeta } from "@/components/shell"
import type { Category } from "@/lib/api"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** "Dining › Delivery" for a subcategory, the name otherwise. */
export function categoryPath(c: Category | undefined, all: Category[]) {
  if (!c) return ""
  const parent = c.parent_id ? all.find((p) => p.id === c.parent_id) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}

/**
 * Searchable category list for a popover, most used first, with subcategories under their parent.
 * The arrow keys move and Enter picks. `filter` narrows which categories it offers.
 */
export function CategoryPicker({
  value,
  onPick,
  filter = () => true,
}: {
  value?: string
  onPick: (c: Category) => void
  filter?: (c: Category) => boolean
}) {
  const meta = useMeta()
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)

  const options = useMemo(() => {
    const cats = meta.categories.filter((c) => !c.archived && filter(c))
    const needle = q.trim().toLowerCase()
    if (needle) return cats.filter((c) => categoryPath(c, meta.categories).toLowerCase().includes(needle))
    const tops = cats
      .filter((c) => !c.parent_id || !cats.some((p) => p.id === c.parent_id))
      .sort((a, b) => b.uses - a.uses)
    return tops.flatMap((t) => [t, ...cats.filter((c) => c.parent_id === t.id).sort((a, b) => b.uses - a.uses)])
  }, [meta.categories, q, filter])

  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 border-b px-3">
        <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, options.length - 1))
            else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0))
            else if (e.key === "Enter" && options[active]) onPick(options[active])
            else return
            e.preventDefault()
          }}
          placeholder={m.tx_search_categories()}
          aria-label={m.tx_search_categories()}
          role="combobox"
          aria-expanded="true"
          aria-controls="category-options"
          aria-activedescendant={options[active] ? `cat-opt-${options[active].id}` : undefined}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div id="category-options" role="listbox" aria-label={m.tx_categories()} className="max-h-72 overflow-y-auto p-1">
        {options.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">{m.tx_no_category_matches()}</p>
        )}
        {options.map((c, i) => {
          const sub = !!c.parent_id && !q
          return (
            <button
              key={c.id}
              id={`cat-opt-${c.id}`}
              type="button"
              role="option"
              aria-selected={c.id === value}
              onMouseMove={() => setActive(i)}
              onClick={() => onPick(c)}
              className={cn(
                "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm",
                i === active && "bg-muted",
                c.id === value && "font-medium",
                sub && "pl-9 text-subtle-foreground"
              )}
            >
              {!sub && <CategoryIcon icon={c.icon} />}
              <span className="truncate">{q ? categoryPath(c, meta.categories) : c.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
