import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router"
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, ShieldCheckIcon, XIcon } from "@phosphor-icons/react/ssr"
import { groups, searchSettings, type Section, type SearchResult } from "@/components/settings/registry"
import { SavedProvider } from "@/components/settings/saved"
import { Kbd } from "@/components/account-menu"
import { isTyping, useMeta, useShortcuts } from "@/components/shell"
import { initials } from "@/components/account-menu"
import { securitySteps, useAccount } from "@/components/settings/sections/security"
import { Pill } from "@/components/settings/row"
import { cn } from "@/lib/utils"

const LABEL_H = 30
const ITEM_H = 36

/** Smooth unless the user turned animations off or asks the system for less motion. */
const scrollBehavior = (): ScrollBehavior =>
  document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth"

/** Rail and content side by side at md and up. While the rail search has text, results replace the content. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const section = useParams({ strict: false, select: (p) => p.section })
  const current = section ?? "general"
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [tick, setTick] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const shortcuts = useShortcuts()
  const results = searchSettings(query)
  useRowFlash(tick)

  // "/" focuses search from anywhere on a settings page, unless you're typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const open = (r: SearchResult) => {
    setQuery("")
    input.current?.blur()
    void navigate({
      to: "/settings/$section",
      params: { section: r.section.id },
      hash: r.row?.key,
      hashScrollIntoView: false,
      resetScroll: !r.row,
    })
    setTick((t) => t + 1)
  }

  // The indicator's offset follows from the rail's fixed row heights, so it's right on the server too.
  let y = 0
  let indicator = -1
  for (const g of groups) {
    y += LABEL_H
    for (const s of g.sections) {
      if (s.id === current) indicator = y
      y += ITEM_H
    }
  }

  return (
    <SavedProvider>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-x-12 gap-y-6 px-8 pt-7 pb-[72px] max-md:px-4 max-md:pt-5 max-md:pb-10">
        {/* On phone the list page owns the title and search; a section page has its own back bar. */}
        <aside
          className={cn("min-w-0 flex-[1_1_236px] md:sticky md:top-6 md:max-w-[260px]", section && "max-md:hidden")}
        >
          <Link
            to="/"
            aria-label="Close settings"
            className="mb-3 -ml-2.5 flex size-11 items-center justify-center rounded-full text-subtle-foreground md:hidden"
          >
            <XIcon className="size-[22px]" />
          </Link>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] max-md:text-[34px] max-md:tracking-[-0.03em]">
            Settings
          </h1>
          <label className="mt-4 flex h-[38px] items-center gap-2 rounded-[10px] border bg-card pr-2.5 pl-3 text-muted-foreground transition-[border-color,box-shadow] duration-200 focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-soft)] max-md:h-12 max-md:rounded-xl max-md:border-transparent max-md:bg-muted max-md:text-base">
            <MagnifyingGlassIcon className="size-4 shrink-0" />
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault()
                  const n = results.length
                  if (n) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n)
                } else if (e.key === "Enter" && results[active]) {
                  e.preventDefault()
                  open(results[active])
                } else if (e.key === "Escape" && query) {
                  e.preventDefault()
                  setQuery("")
                }
              }}
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-results"
              aria-activedescendant={query && results[active] ? `sr-${active}` : undefined}
              className="w-full min-w-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded-[5px] border px-[5px] font-mono text-[11px] leading-[1.4] text-muted-foreground max-md:hidden">
              /
            </kbd>
          </label>
          <nav aria-label="Settings" className="relative mt-2.5 max-md:hidden">
            {indicator >= 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-9 rounded-lg bg-muted transition-[translate,opacity] duration-300 ease-out"
                style={{ translate: `0 ${indicator}px`, opacity: query ? 0 : 1 }}
              />
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="flex h-[30px] items-end px-2.5 pb-[7px] text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  {g.label}
                </div>
                {g.sections.map((s) => (
                  <RailItem key={s.id} section={s} current={!query && s.id === current} />
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-6 border-t px-2.5 pt-3.5 text-xs text-muted-foreground max-md:hidden">
            <button
              type="button"
              onClick={shortcuts}
              className="flex w-full items-center justify-between transition-colors hover:text-foreground"
            >
              Keyboard shortcuts <Kbd>?</Kbd>
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-[999_1_560px] md:max-w-[760px]">
          {query ? <Results query={query} results={results} active={active} onOpen={open} /> : children}
        </div>
      </div>
    </SavedProvider>
  )
}

function RailItem({ section: s, current }: { section: Section; current: boolean }) {
  const Icon = s.icon
  const badge = useBadge(s)
  return (
    <Link
      to="/settings/$section"
      params={{ section: s.id }}
      // Link marks the active route itself; while searching nothing is current.
      activeProps={{ "aria-current": current ? "page" : undefined }}
      data-current={current || undefined}
      className="group/ri relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-subtle-foreground transition-colors duration-200 hover:text-foreground data-current:font-medium data-current:text-foreground"
    >
      <Icon className="size-[18px] text-muted-foreground transition-colors duration-200 group-data-current/ri:text-brand" />
      {s.title}
      {badge && (
        <span className="ml-auto">
          <Pill tone={badge.tone}>{badge.label}</Pill>
        </span>
      )}
    </Link>
  )
}

function Results({
  query,
  results,
  active,
  onOpen,
}: {
  query: string
  results: SearchResult[]
  active: number
  onOpen: (r: SearchResult) => void
}) {
  return (
    <div className="settings-enter">
      <header>
        <p className="text-xs text-muted-foreground">Search</p>
        <h2 className="mt-1.5 text-[26px] font-semibold tracking-[-0.025em]">
          {results.length ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "No results"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {results.length ? "Pick a result to jump straight to the setting." : `Nothing matches “${query.trim()}”.`}
        </p>
      </header>
      {results.length > 0 && (
        <ul id="settings-results" role="listbox" className="mt-7 overflow-hidden rounded-xl border bg-card">
          {results.map((r, i) => {
            const Icon = r.section.icon
            return (
              <li key={`${r.section.id}-${r.row?.key ?? ""}`} className="border-t first:border-t-0">
                <button
                  id={`sr-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => onOpen(r)}
                  className="group/res flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-muted aria-selected:bg-muted max-md:px-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-subtle-foreground transition-colors group-hover/res:bg-card group-aria-selected/res:bg-card">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">
                      {r.section.group} › {r.section.title}
                    </span>
                    <span className="block text-sm font-medium">{r.row?.title ?? r.section.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.row?.description ?? r.section.description}
                    </span>
                  </span>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A section: eyebrow, title, one sentence, then its groups, fading up as it opens. */
export function SectionView({ section: s }: { section: Section & { group: string } }) {
  const Body = s.component
  const badge = useBadge(s)
  return (
    <div key={s.id} className="settings-enter">
      <header>
        <Link
          to="/settings"
          viewTransition={slide("back")}
          className="-ml-2 inline-flex h-11 items-center gap-1 pr-2 text-[15px] text-subtle-foreground md:hidden"
        >
          <CaretLeftIcon className="size-5" /> Settings
        </Link>
        <p className="text-xs text-muted-foreground max-md:hidden">{s.group}</p>
        <h2 className="mt-1.5 flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.025em] max-md:mt-3 max-md:text-[30px]">
          {s.title}
          {badge?.tone === "brand" && <Pill>{badge.label}</Pill>}
        </h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-normal text-muted-foreground max-md:hidden">{s.description}</p>
      </header>
      <Body />
    </div>
  )
}

/**
 * /settings/general#time-zone, or a search result: scroll that row to the centre and flash it.
 * `tick` replays it when the same row is opened twice.
 */
function useRowFlash(tick: number) {
  const { hash, pathname } = useLocation({ select: (l) => ({ hash: l.hash, pathname: l.pathname }) })
  useEffect(() => {
    if (!hash) return
    let frame = 0
    let tries = 0
    let el: HTMLElement | null = null
    // The new section may still be loading when the URL changes: wait for its row to exist.
    const find = () => {
      el = document.getElementById(hash)
      if (!el) {
        if (++tries < 60) frame = requestAnimationFrame(find)
        return
      }
      el.scrollIntoView({ block: "center", behavior: scrollBehavior() })
      delete el.dataset.flash
      void el.offsetWidth // restart the animation
      el.dataset.flash = ""
    }
    find()
    const t = setTimeout(() => el && delete el.dataset.flash, 1800)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(t)
    }
  }, [hash, pathname, tick])
}

/**
 * Phone push and back: a view transition typed with the direction (styles.css slides by type).
 * Skipped on wider screens and when animations are off, so those just swap.
 */
const slide = (dir: "forward" | "back") => ({
  types: () =>
    matchMedia("(max-width: 767px)").matches && document.documentElement.dataset.motion !== "off" ? [dir] : false,
})

// Phone order: You comes after the money and AI groups, under the profile card.
const PHONE_ORDER = ["Preferences", "Money", "Intelligence", "You", "Data"]

/** The phone settings list: profile card, then each group as a card of rows that push into a section. */
export function PhoneList() {
  const meta = useMeta()
  const account = useAccount()
  const open = securitySteps(account, meta.prefs.backup_codes_saved_at).filter((x) => !x.done).length
  const ordered = [...groups].sort((a, b) => PHONE_ORDER.indexOf(a.label) - PHONE_ORDER.indexOf(b.label))
  return (
    <div className="settings-enter md:hidden">
      <Link
        to="/settings/$section"
        params={{ section: "profile" }}
        viewTransition={slide("forward")}
        className="flex items-center gap-3.5 rounded-2xl border bg-card p-3 pr-4 transition-colors active:bg-muted"
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-brand-foreground"
        >
          {initials(meta.user.name, meta.user.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{meta.user.name || meta.user.email}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{meta.user.email}</span>
        </span>
        <CaretRightIcon className="size-[18px] text-muted-foreground" />
      </Link>
      {open > 0 && (
        <Link
          to="/settings/$section"
          params={{ section: "security" }}
          viewTransition={slide("forward")}
          className="mt-3 flex min-h-[52px] items-center gap-3 rounded-2xl bg-warning/12 px-4 text-[15px] transition-colors active:bg-warning/20"
        >
          <ShieldCheckIcon className="size-5 shrink-0 text-warning" />
          <span className="flex-1">
            {open} {open === 1 ? "step" : "steps"} left to secure your account
          </span>
          <CaretRightIcon className="size-[18px] text-muted-foreground" />
        </Link>
      )}
      {ordered.map((g) => {
        const rows = g.sections.filter((x) => x.id !== "profile")
        if (!rows.length) return null
        return (
          <section key={g.label} className="mt-6">
            <h2 className="mx-1 mb-2 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {g.label}
            </h2>
            <ul className="overflow-hidden rounded-2xl border bg-card">
              {rows.map((x) => {
                const Icon = x.icon
                return (
                  <li key={x.id} className="border-t first:border-t-0">
                    <Link
                      to="/settings/$section"
                      params={{ section: x.id }}
                      viewTransition={slide("forward")}
                      className="flex min-h-[52px] items-center gap-3 px-3 py-2 transition-colors active:bg-muted"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-subtle-foreground">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base">{x.title}</span>
                      <span className="max-w-[45%] truncate text-[15px] text-muted-foreground">
                        {x.badge?.({ meta, account }) ? (
                          <Pill tone={x.badge({ meta, account })!.tone}>{x.badge({ meta, account })!.label}</Pill>
                        ) : (
                          x.summary?.({ meta, account })
                        )}
                      </span>
                      <CaretRightIcon className="size-[18px] shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function useBadge(s: Section) {
  const meta = useMeta()
  const account = useAccount()
  return s.badge?.({ meta, account }) ?? null
}
