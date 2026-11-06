import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  ChartBarIcon,
  CheckSquareOffsetIcon,
  CreditCardIcon,
  GearSixIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TagIcon,
  WalletIcon,
} from "@phosphor-icons/react/ssr"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { CategoryIcon } from "@/components/category-icon"
import { useMeta } from "@/components/shell"
import { suggestPayees, type PayeeSuggestion } from "@/lib/api"
import { fmt, isNeutral } from "@/lib/core"
import { cn } from "@/lib/utils"

type Item = { id: string; group: string; icon: ReactNode; label: ReactNode; end?: ReactNode; run: () => void }

const PAGES = [
  { to: "/", label: "Overview", icon: ChartBarIcon },
  { to: "/transactions", label: "Activity", icon: ListIcon },
  { to: "/subscriptions", label: "Recurring", icon: RepeatIcon },
  { to: "/accounts", label: "Accounts", icon: CreditCardIcon },
  { to: "/categories", label: "Categories", icon: TagIcon },
  {
    to: "/reconcile",
    label: "Reconcile an account",
    icon: CheckSquareOffsetIcon,
    keywords: "statement import csv ofx qfx pdf bank",
  },
  { to: "/settings", label: "Settings", icon: GearSixIcon },
  { to: "/account", label: "Sign-in & security", icon: ShieldCheckIcon, keywords: "account password passkey" },
] as const

/**
 * ⌘K search for payees, categories, accounts and pages. It has no animation and opens instantly,
 * since it is keyboard-driven and used constantly.
 */
export function SearchPalette({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (text: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="data-open:animate-none data-closed:animate-none"
        className="top-[12vh] max-h-[calc(100svh-14vh)] translate-y-0 gap-0 overflow-y-auto rounded-2xl border p-0 ring-0 sm:max-w-[560px] data-open:animate-none data-closed:animate-none"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Body close={() => onOpenChange(false)} onAdd={onAdd} />
      </DialogContent>
    </Dialog>
  )
}

function Body({ close, onAdd }: { close: () => void; onAdd: (text: string) => void }) {
  const meta = useMeta()
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [payees, setPayees] = useState<PayeeSuggestion[]>([])
  const [active, setActive] = useState(0)
  const text = q.trim()
  const low = text.toLowerCase()

  useEffect(() => {
    if (!text) return setPayees([])
    let live = true
    const t = setTimeout(
      () =>
        void suggestPayees({ data: { q: text } })
          .then((r) => live && setPayees(r))
          .catch(() => {}),
      120
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [text])

  const go = (fn: () => void) => () => {
    close()
    fn()
  }
  const activity = (search: { q?: string; category?: string; wallet?: string }) =>
    go(
      () =>
        void navigate({
          to: "/transactions",
          search: (s) => ({ ...s, q: undefined, category: undefined, wallet: undefined, ...search }),
        })
    )

  const items: Item[] = []
  const ask: Item | null =
    text && meta.ai.ask
      ? {
          id: "ask",
          group: "Ask Kosha",
          icon: <SparkleIcon />,
          label: <>Ask "{text}"</>,
          end: <Hint>Answered from your data</Hint>,
          run: go(() => void navigate({ to: "/ask", search: { q: text } })),
        }
      : null
  // A question leads the list; anything else keeps search first.
  if (ask && QUESTION.test(text)) items.push(ask)
  if (text) {
    items.push({
      id: "search",
      group: "Activity",
      icon: <MagnifyingGlassIcon />,
      label: <>Search activity for "{text}"</>,
      run: activity({ q: text }),
    })
    for (const p of payees.slice(0, 5)) {
      const c = meta.categories.find((x) => x.id === p.category_id)
      items.push({
        id: `payee:${p.name}`,
        group: "Payees",
        icon: <CategoryIcon icon={c?.icon} className="size-4" />,
        label: p.name,
        end: (
          <span className="num text-xs text-muted-foreground">
            {p.count}× · usually {fmt(Math.abs(p.avg), p.currency)}
          </span>
        ),
        run: activity({ q: p.name }),
      })
    }
    for (const c of meta.categories
      .filter((x) => !x.archived && !isNeutral(x.id) && x.name.toLowerCase().includes(low))
      .slice(0, 4))
      items.push({
        id: `cat:${c.id}`,
        group: "Categories",
        icon: <CategoryIcon icon={c.icon} className="size-4" />,
        label: c.name,
        end: <Hint>Activity</Hint>,
        run: activity({ category: c.id }),
      })
    for (const w of meta.wallets.filter((x) => !x.archived && x.name.toLowerCase().includes(low)).slice(0, 3))
      items.push({
        id: `wallet:${w.id}`,
        group: "Accounts",
        icon: <WalletIcon />,
        label: w.name,
        end: <Hint>Activity</Hint>,
        run: activity({ wallet: w.id }),
      })
  }
  for (const p of PAGES.filter(
    (x) => !low || `${x.label} ${"keywords" in x ? x.keywords : ""}`.toLowerCase().includes(low)
  ))
    items.push({
      id: `page:${p.to}`,
      group: "Go to",
      icon: <p.icon />,
      label: p.label,
      end: <ArrowRightIcon className="size-3.5 text-muted-foreground" />,
      run: go(() => void navigate({ to: p.to })),
    })
  if (ask && !QUESTION.test(text)) items.push(ask)
  items.push({
    id: "add",
    group: "Add",
    icon: <PlusIcon />,
    label: text ? <>Add "{text}" as a transaction</> : "Add a transaction",
    end: <Hint>Quick add</Hint>,
    run: go(() => onAdd(text)),
  })

  const index = Math.min(active, items.length - 1)
  useEffect(() => setActive(0), [text])

  let lastGroup = ""
  return (
    <div>
      <label className="flex items-center gap-3 border-b px-[18px] py-4 text-muted-foreground">
        <MagnifyingGlassIcon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="sr-only">Search payees, categories, accounts and pages</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault()
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              items[index]?.run()
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={items[index] ? `search-${index}` : undefined}
          placeholder="Search payees, categories, accounts…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-sm border bg-card px-1.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
      </label>
      <div id="search-results" role="listbox" aria-label="Results" className="p-1.5">
        {items.map((it, i) => {
          const head = it.group !== lastGroup
          lastGroup = it.group
          return (
            <div key={it.id}>
              {head && <div className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">{it.group}</div>}
              <div
                id={`search-${i}`}
                role="option"
                aria-selected={i === index}
                onMouseMove={() => setActive(i)}
                onClick={it.run}
                className={cn(
                  "grid min-h-11 cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 text-sm [&_svg]:size-4 [&_svg]:text-subtle-foreground",
                  i === index && "bg-muted"
                )}
              >
                {it.icon}
                <span className="truncate">{it.label}</span>
                {it.end}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const QUESTION =
  /\?\s*$|^(how|what|when|where|why|which|who|did|do|does|am|is|are|was|were|can|could|should|will|show|list|compare|tell)\b/i

const Hint = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-muted-foreground">{children}</span>
)
