import { useEffect, useRef, useState } from "react"
import { getRouteApi } from "@tanstack/react-router"
import { CaretRightIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CategoryIcon } from "@/components/category-icon"
import { Pick } from "@/components/pick"
import { useMeta } from "@/components/shell"
import { Expand, Pill, Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { errorOf, usePref, useSave } from "@/components/settings/saved"
import { deleteTitleRule, listTitleRules, saveTitleRule, type TitleRuleRow } from "@/lib/api"
import { isNeutral } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const useFirstPage = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.rules })
const COLS =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_52px_64px] items-center gap-4 max-md:grid-cols-[minmax(0,1fr)_auto]"

export function Rules() {
  const [learn, saveLearn] = usePref("learn_rules")
  const first = useFirstPage()
  const [q, setQ] = useState("")
  const [data, setData] = useState(first)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null) // a rule's title, or "" for a new one
  const typed = useRef(false)

  // Typing searches on the server (debounced); the first page arrives with the route.
  useEffect(() => {
    if (!typed.current) return
    let live = true
    const t = setTimeout(() => {
      void listTitleRules({ data: { q, page: 0 } })
        .then((r) => {
          if (!live) return
          setData(r)
          setPage(0)
        })
        .catch((e) => toast.error(errorOf(e)))
    }, 200)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const more = async () => {
    try {
      const r = await listTitleRules({ data: { q, page: page + 1 } })
      setData((d) => d && { ...r, rules: [...d.rules, ...r.rules] })
      setPage(page + 1)
    } catch (e) {
      toast.error(errorOf(e))
    }
  }
  // Local edits keep the list in place instead of reloading it.
  const replace = (old: string | null, rule: TitleRuleRow | null) =>
    setData((d) => {
      if (!d) return d
      const rest = d.rules.filter((r) => r.title !== old && r.title.toLowerCase() !== rule?.title.toLowerCase())
      const total = d.total + (old === null ? 1 : 0) - (rule === null ? 1 : 0)
      return {
        ...d,
        total,
        rules: rule ? (old === null ? [rule, ...rest] : d.rules.map((r) => (r.title === old ? rule : r))) : rest,
      }
    })

  if (!data) return null
  return (
    <>
      <SettingGroup>
        <SettingRow
          id="learn-rules"
          title={m.settings_rules_learn_title()}
          description={m.settings_rules_learn_description()}
          control={
            <Switch
              aria-label={m.settings_rules_learn_title()}
              checked={learn === "1"}
              onCheckedChange={(on) => saveLearn(on ? "1" : "0")}
            />
          }
        />
      </SettingGroup>
      <SettingGroup
        label={<span>{m.settings_rules_count({ count: data.total })}</span>}
        actions={
          <>
            <label className="relative w-40 max-md:w-32">
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={q}
                onChange={(e) => {
                  typed.current = true
                  setQ(e.target.value)
                }}
                placeholder={m.common_search()}
                aria-label={m.settings_rules_search_label()}
                className="h-7 bg-card pl-8 text-xs max-md:h-9"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 bg-card text-xs font-normal"
              aria-expanded={open === ""}
              onClick={() => setOpen((o) => (o === "" ? null : ""))}
            >
              <PlusIcon /> {m.settings_rules_new()}
            </Button>
          </>
        }
      >
        <div id="rules">
          <div className={cn(COLS, "border-b px-5 py-2.5 text-xs text-muted-foreground max-md:hidden")}>
            <span>{m.settings_rules_col_when()}</span>
            <span>{m.settings_rules_col_category()}</span>
            <span className="text-right">{m.settings_rules_col_used()}</span>
            <span />
          </div>
          <Expand open={open === ""}>
            <RuleEditor
              rule={null}
              onDone={(r) => {
                if (r) replace(null, r)
                setOpen(r ? r.title : null)
              }}
            />
          </Expand>
          {data.rules.length === 0 && open !== "" && (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              {q ? m.settings_rules_no_match({ query: q }) : m.settings_rules_empty()}
            </p>
          )}
          {data.rules.map((r) => (
            <div key={r.title} className="border-t first:border-t-0">
              <RuleRow
                rule={r}
                open={open === r.title}
                onToggle={() => setOpen((o) => (o === r.title ? null : r.title))}
              />
              <Expand open={open === r.title}>
                <RuleEditor
                  rule={r}
                  onDone={(next) => {
                    replace(r.title, next)
                    setOpen(next ? next.title : null)
                  }}
                />
              </Expand>
            </div>
          ))}
          {data.more && (
            <button
              type="button"
              onClick={more}
              className="flex min-h-12 w-full items-center justify-center border-t text-[13px] text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {m.settings_rules_show_more()}
            </button>
          )}
        </div>
      </SettingGroup>
    </>
  )
}

function useCategoryLabel() {
  const meta = useMeta()
  return (id: string) => {
    const c = meta.categories.find((x) => x.id === id)
    const parent = c?.parent_id ? meta.categories.find((x) => x.id === c.parent_id) : null
    return {
      icon: c?.icon ?? null,
      name: c ? (parent ? `${parent.name} › ${c.name}` : c.name) : m.settings_rules_deleted_category(),
    }
  }
}

function RuleRow({ rule: r, open, onToggle }: { rule: TitleRuleRow; open: boolean; onToggle: () => void }) {
  const label = useCategoryLabel()(r.category_id)
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        COLS,
        "min-h-12 w-full px-5 py-2.5 text-left text-[13.5px] transition-colors hover:bg-muted aria-expanded:bg-muted max-md:px-4"
      )}
    >
      <span className="min-w-0 truncate">
        <ParaglideMessage
          message={r.exact ? m.settings_rules_payee_is : m.settings_rules_payee_contains}
          inputs={{ title: r.title }}
          markup={{
            code: ({ children }) => (
              <code className="rounded-[5px] bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs text-foreground">
                {children}
              </code>
            ),
          }}
        />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 max-md:col-start-1 max-md:row-start-2 max-md:text-xs max-md:text-muted-foreground">
        <CategoryIcon icon={label.icon} className="size-[15px]" />
        <span className="truncate">{label.name}</span>
      </span>
      <span data-plain className="num text-right max-md:row-span-2 max-md:row-start-1 max-md:self-center">
        {r.used}×
      </span>
      <span className="flex items-center justify-end gap-2 max-md:hidden">
        <Pill tone={r.source === "manual" ? "brand" : "muted"}>
          {r.source === "manual" ? m.settings_rules_source_manual() : m.settings_rules_source_learned()}
        </Pill>
        <CaretRightIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-[250ms] ease-out",
            open && "rotate-90"
          )}
        />
      </span>
    </button>
  )
}

/** Edits a rule's payee text, match type and category. Each change saves; a new rule saves once it has text and a category. */
function RuleEditor({ rule: r, onDone }: { rule: TitleRuleRow | null; onDone: (r: TitleRuleRow | null) => void }) {
  const meta = useMeta()
  const save = useSave()
  const [title, setTitle] = useState(r?.title ?? "")
  const [exact, setExact] = useState(!!r?.exact)
  const [categoryId, setCategoryId] = useState(r?.category_id ?? "")
  const [busy, setBusy] = useState(false)
  const options = meta.categories
    .filter((c) => !c.archived && !isNeutral(c.id))
    .map((c) => {
      const parent = c.parent_id ? meta.categories.find((x) => x.id === c.parent_id) : null
      return { value: c.id, label: parent ? `${parent.name} › ${c.name}` : c.name }
    })

  const commit = async (patch: { title?: string; exact?: boolean; categoryId?: string }, revert: () => void) => {
    const next = { title: title.trim(), exact, categoryId, ...patch }
    if (!next.title || !next.categoryId) return
    const row: TitleRuleRow = {
      title: next.title,
      category_id: next.categoryId,
      exact: next.exact ? 1 : 0,
      source: "manual",
      used: r?.used ?? 0,
    }
    setBusy(true)
    const ok = await save(() => saveTitleRule({ data: { old: r?.title, ...next } }), revert)
    setBusy(false)
    if (ok && (!r || r.title !== next.title || r.category_id !== next.categoryId || !!r.exact !== next.exact))
      onDone(row)
  }

  return (
    <div className="grid gap-3 border-t bg-muted px-5 pt-4 pb-[18px] max-md:px-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {m.settings_rules_payee()}
          <Input
            value={title}
            autoFocus={!r}
            maxLength={100}
            placeholder={m.settings_rules_payee_placeholder()}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => {
              const next = title.trim()
              if (r && (!next || next === r.title)) return setTitle(r.title)
              void commit({ title: next }, () => setTitle(r?.title ?? ""))
            }}
            className="h-9 bg-background font-mono text-sm text-foreground"
          />
        </label>
        <Segmented
          label={m.settings_rules_match()}
          className="bg-foreground/[0.06]"
          value={exact ? "is" : "contains"}
          onChange={(v) => {
            setExact(v === "is")
            void commit({ exact: v === "is" }, () => setExact(!!r?.exact))
          }}
          options={[
            ["contains", m.settings_rules_contains()],
            ["is", m.settings_rules_is_exactly()],
          ]}
        />
        <div className="grid gap-1.5 text-xs text-muted-foreground">
          {m.settings_rules_category()}
          <Pick
            value={categoryId}
            onChange={(v) => {
              const old = categoryId
              setCategoryId(v)
              void commit({ categoryId: v }, () => setCategoryId(old))
            }}
            placeholder={m.settings_rules_pick_category()}
            options={options}
            className="h-9 w-full bg-background text-sm text-foreground"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {r && (
          <Button
            variant="outline"
            className="h-9 border-destructive/35 bg-card px-3 text-[13px] font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await deleteTitleRule({ data: { title: r.title } })
                toast.success(m.settings_rules_deleted())
                onDone(null)
              } catch (e) {
                toast.error(errorOf(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            <TrashIcon /> {m.common_delete()}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {r ? m.settings_rules_autosave() : m.settings_rules_new_hint()}
        </span>
      </div>
    </div>
  )
}
