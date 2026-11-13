import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  ChartBarIcon,
  CheckSquareOffsetIcon,
  FileArrowUpIcon,
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
import { isQuestion } from "@/lib/question"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Item = { id: string; group: string; icon: ReactNode; label: ReactNode; end?: ReactNode; run: () => void }

// Labels and keywords are message functions, called when rendering, so they follow the visitor's language.
const PAGES = [
  { to: "/", label: m.shell_nav_overview, icon: ChartBarIcon },
  { to: "/transactions", label: m.shell_nav_activity, icon: ListIcon },
  { to: "/subscriptions", label: m.shell_nav_recurring, icon: RepeatIcon },
  { to: "/loans", label: m.loans_title, icon: WalletIcon },
  { to: "/accounts", label: m.shell_nav_accounts, icon: CreditCardIcon },
  { to: "/categories", label: m.shell_categories, icon: TagIcon },
  { to: "/import", label: m.shell_page_import, icon: FileArrowUpIcon, keywords: m.shell_page_import_keywords },
  {
    to: "/reconcile",
    label: m.shell_page_reconcile,
    icon: CheckSquareOffsetIcon,
    keywords: m.shell_page_reconcile_keywords,
  },
  { to: "/settings", label: m.shell_settings, icon: GearSixIcon },
  { to: "/account", label: m.shell_security, icon: ShieldCheckIcon, keywords: m.shell_page_security_keywords },
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
        <DialogTitle className="sr-only">{m.common_search()}</DialogTitle>
        <Body close={() => onOpenChange(false)} onAdd={onAdd} />
      </DialogContent>
    </Dialog>
  )
}

function Body({ close, onAdd }: { close: () => void; onAdd: (text: string) => void }) {
  const meta = useMeta()
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [found, setFound] = useState<PayeeSuggestion[]>([])
  const [active, setActive] = useState(0)
  const text = q.trim()
  const low = text.toLowerCase()
  const payees = text ? found : []

  useEffect(() => {
    if (!text) return
    let live = true
    const t = setTimeout(
      () =>
        void suggestPayees({ data: { q: text } })
          .then((r) => live && setFound(r))
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
          search,
        })
    )

  const items: Item[] = []
  for (const loan of meta.loans
    .filter((l) => low && `${l.person} ${l.purpose}`.toLowerCase().includes(low))
    .slice(0, 5))
    items.push({
      id: `loan:${loan.id}`,
      group: m.loans_title(),
      icon: <WalletIcon />,
      label: loan.person,
      end: <span className="num text-xs text-muted-foreground">{fmt(loan.remaining, loan.currency)}</span>,
      run: go(() => void navigate({ to: "/loans", search: { loan: loan.id } })),
    })
  const ask: Item | null =
    text && meta.ai.ask
      ? {
          id: "ask",
          group: m.shell_ask_kosha(),
          icon: <SparkleIcon />,
          label: m.shell_search_ask({ text }),
          end: <Hint>{m.shell_search_ask_hint()}</Hint>,
          run: go(() => void navigate({ to: "/ask", search: { q: text } })),
        }
      : null
  // A question leads the list; anything else keeps search first.
  const question = isQuestion(text)
  if (ask && question) items.push(ask)
  if (text) {
    items.push({
      id: "search",
      group: m.shell_nav_activity(),
      icon: <MagnifyingGlassIcon />,
      label: m.shell_search_activity({ text }),
      run: activity({ q: text }),
    })
    for (const p of payees.slice(0, 5)) {
      const c = meta.categories.find((x) => x.id === p.category_id)
      items.push({
        id: `payee:${p.name}`,
        group: m.shell_search_payees(),
        icon: <CategoryIcon icon={c?.icon} className="size-4" />,
        label: p.name,
        end: (
          <span className="num text-xs text-muted-foreground">
            {m.shell_search_payee_usually({ count: p.count, amount: fmt(Math.abs(p.usual), p.currency) })}
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
        group: m.shell_categories(),
        icon: <CategoryIcon icon={c.icon} className="size-4" />,
        label: c.name,
        end: <Hint>{m.shell_nav_activity()}</Hint>,
        run: activity({ category: c.id }),
      })
    for (const w of meta.wallets.filter((x) => !x.archived && x.name.toLowerCase().includes(low)).slice(0, 3))
      items.push({
        id: `wallet:${w.id}`,
        group: m.shell_nav_accounts(),
        icon: <WalletIcon />,
        label: w.name,
        end: <Hint>{m.shell_nav_activity()}</Hint>,
        run: activity({ wallet: w.id }),
      })
  }
  for (const p of PAGES.filter(
    (x) => !low || `${x.label()} ${"keywords" in x ? x.keywords() : ""}`.toLowerCase().includes(low)
  ))
    items.push({
      id: `page:${p.to}`,
      group: m.shell_search_go_to(),
      icon: <p.icon />,
      label: p.label(),
      end: <ArrowRightIcon className="size-3.5 text-muted-foreground" />,
      run: go(() => void navigate({ to: p.to })),
    })
  if (ask && !question) items.push(ask)
  items.push({
    id: "add",
    group: m.common_add(),
    icon: <PlusIcon />,
    label: text ? m.shell_search_add_text({ text }) : m.shell_search_add(),
    end: <Hint>{m.shell_search_quick_add()}</Hint>,
    run: go(() => onAdd(text)),
  })

  const index = Math.min(active, items.length - 1)

  let lastGroup = ""
  return (
    <div>
      <label className="flex items-center gap-3 border-b px-[18px] py-4 text-muted-foreground">
        <MagnifyingGlassIcon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="sr-only">{m.shell_shortcut_search()}</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
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
          placeholder={m.shell_search_placeholder()}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-sm border bg-card px-1.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
      </label>
      <div id="search-results" role="listbox" aria-label={m.shell_search_results()} className="p-1.5">
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

const Hint = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-muted-foreground">{children}</span>
)
