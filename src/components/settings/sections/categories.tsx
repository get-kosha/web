import { useState } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { ArrowsMergeIcon, CaretRightIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CATEGORY_ICONS, CategoryIcon, categoryIcon } from "@/components/category-icon"
import { Pick } from "@/components/pick"
import { Expand, Pill, Segmented, SettingGroup } from "@/components/settings/row"
import { errorOf, useSave } from "@/components/settings/saved"
import { archiveCategory, deleteCategory, mergeCategory, saveCategory, type ManagedCategory as Cat } from "@/lib/api"
import { intlLocale, isSystemCategory } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const useCategories = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.categories })

const usage = (c: Cat) =>
  [
    c.tx && m.settings_cat_count_tx({ count: c.tx }),
    c.subs && m.settings_cat_count_recurring({ count: c.subs }),
    c.rules && m.settings_cat_count_rules({ count: c.rules }),
  ]
    .filter(Boolean)
    .join(" · ") || m.settings_cat_unused()

/** Top-level categories, each followed by its subcategories. */
function tree(cats: Cat[]) {
  const tops = cats.filter((c) => !c.parent_id || !cats.some((p) => p.id === c.parent_id))
  return tops.flatMap((t) => [t, ...cats.filter((c) => c.parent_id === t.id)])
}

const SHOWN = 6

export function Categories() {
  const all = useCategories()
  // The open editor: a category id, or "new:0" / "new:1" for a new spending / income category.
  const [open, setOpen] = useState<string | null>(null)
  const active = all.filter((c) => !c.archived)
  const archived = all.filter((c) => c.archived)
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id))

  return (
    <>
      {([0, 1] as const).map((income) => (
        <CategoryGroup
          key={income}
          income={income}
          cats={active.filter((c) => !!c.income === !!income)}
          all={all}
          open={open}
          onToggle={toggle}
          onOpen={setOpen}
        />
      ))}
      {archived.length > 0 && <Archived cats={archived} />}
    </>
  )
}

function CategoryGroup({
  income,
  cats,
  all,
  open,
  onToggle,
  onOpen,
}: {
  income: 0 | 1
  cats: Cat[]
  all: Cat[]
  open: string | null
  onToggle: (id: string) => void
  onOpen: (id: string | null) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const rows = tree(cats)
  const openAt = rows.findIndex((c) => c.id === open)
  const visible = showAll || rows.length <= SHOWN + 1 ? rows : rows.slice(0, Math.max(SHOWN, openAt + 1))
  const isNew = open === `new:${income}`
  return (
    <SettingGroup
      label={income ? m.settings_cat_income() : m.settings_cat_spending()}
      actions={
        <>
          <span className="text-xs text-muted-foreground">
            {m.settings_cat_count_categories({ count: cats.length })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 bg-card text-xs font-normal"
            onClick={() => onToggle(`new:${income}`)}
            aria-expanded={isNew}
          >
            <PlusIcon /> {m.settings_cat_new()}
          </Button>
        </>
      }
    >
      <div id={income ? undefined : "categories"}>
        <Expand open={isNew}>
          <Editor
            key={`new:${income}`}
            cat={null}
            income={!!income}
            all={all}
            onCreated={(id) => onOpen(id)}
            onDone={() => onOpen(null)}
          />
        </Expand>
        {cats.length === 0 && !isNew && (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            {income ? m.settings_cat_empty_income() : m.settings_cat_empty_spending()}
          </p>
        )}
        {visible.map((c) => {
          const sub = !!c.parent_id && cats.some((p) => p.id === c.parent_id)
          const isOpen = open === c.id
          return (
            <div key={c.id} className="border-t first:border-t-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => onToggle(c.id)}
                className={cn(
                  "flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted aria-expanded:bg-muted max-md:px-4",
                  sub && "pl-11 max-md:pl-10"
                )}
              >
                <CategoryIcon icon={c.icon} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 truncate text-sm">
                    {c.name}
                    {isSystemCategory(c.id) && <Pill tone="muted">{m.settings_cat_system()}</Pill>}
                  </span>
                  <span data-plain className="num block truncate text-xs text-muted-foreground">
                    {usage(c)}
                  </span>
                </span>
                <CaretRightIcon
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-[250ms] ease-out",
                    isOpen && "rotate-90"
                  )}
                />
              </button>
              <Expand open={isOpen}>
                <Editor cat={c} income={!!c.income} all={all} onCreated={() => {}} onDone={() => onOpen(null)} />
              </Expand>
            </div>
          )
        })}
        {visible.length < rows.length && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex min-h-12 w-full items-center justify-center border-t text-[13px] text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {m.settings_cat_show_all({ count: rows.length })}
          </button>
        )}
      </div>
    </SettingGroup>
  )
}

/** The inline editor under a row. Every change saves as it's made; a new category saves once it has a name. */
function Editor({
  cat: c,
  income: startIncome,
  all,
  onCreated,
  onDone,
}: {
  cat: Cat | null
  income: boolean
  all: Cat[]
  onCreated: (id: string) => void
  onDone: () => void
}) {
  const router = useRouter()
  const save = useSave()
  const system = !!c && isSystemCategory(c.id)
  const [name, setName] = useState(c?.name ?? "")
  const [icon, setIcon] = useState<string | null>(c?.icon ?? "ph:tag")
  const [income, setIncome] = useState(startIncome)
  const [parentId, setParentId] = useState(c?.parent_id ?? null)
  const [iconQuery, setIconQuery] = useState("")
  const [confirm, setConfirm] = useState<"merge" | "delete" | null>(null)
  const [busy, setBusy] = useState(false)

  const hasChildren = !!c && all.some((x) => x.parent_id === c.id)
  const parents = all.filter(
    (x) => !x.archived && !x.parent_id && !!x.income === income && x.id !== c?.id && !isSystemCategory(x.id)
  )
  // Older categories store an emoji; it still marks the matching icon as picked.
  const picked = categoryIcon(icon)
  const icons = CATEGORY_ICONS.filter(([n]) => n.includes(iconQuery.trim().toLowerCase().replace(/\s+/g, "-")))
  const key = c ? `cat-${c.id}` : "categories"
  type Patch = { name?: string; icon?: string | null; income?: boolean; parentId?: string | null }
  const commit = async (patch: Patch, revert: () => void) => {
    const next = { name: name.trim(), icon, income, parentId, ...patch }
    if (!c) {
      // A new category exists once it has a name; until then the editor keeps its picks in local state.
      if (!next.name) return
      setBusy(true)
      try {
        const { id } = await saveCategory({ data: next })
        await router.invalidate()
        toast.success(m.settings_cat_added({ name: next.name }))
        onCreated(id)
      } catch (e) {
        toast.error(errorOf(e))
      } finally {
        setBusy(false)
      }
      return
    }
    await save(() => saveCategory({ data: { id: c.id, ...next } }), revert)
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      onDone()
      await router.invalidate()
      toast.success(done)
    } catch (e) {
      toast.error(errorOf(e))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <div className="grid gap-3.5 border-t bg-muted px-5 pt-4 pb-[18px] max-md:px-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {m.settings_cat_name()}
          <Input
            value={name}
            autoFocus={!c}
            maxLength={60}
            placeholder={c ? undefined : m.settings_cat_name_placeholder()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => {
              const next = name.trim()
              if (c && (!next || next === c.name)) return setName(c.name)
              void commit({ name: next }, () => setName(c?.name ?? ""))
            }}
            className="h-9 bg-background text-sm text-foreground"
          />
        </label>
        {!system && (
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            {m.settings_cat_inside()}
            <Pick
              value={parentId ?? ""}
              onChange={(v) => {
                const old = parentId
                setParentId(v || null)
                void commit({ parentId: v || null }, () => setParentId(old))
              }}
              placeholder={m.settings_cat_top_level()}
              options={hasChildren ? [] : parents.map((p) => ({ value: p.id, label: p.name }))}
              className="h-9 w-full bg-background text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {!system && !parentId && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {m.settings_cat_type()}
          <Segmented
            label={m.settings_cat_type()}
            className="bg-foreground/[0.06]"
            value={income ? "income" : "spending"}
            onChange={(v) => {
              const old = income
              setIncome(v === "income")
              void commit({ income: v === "income", parentId: null }, () => setIncome(old))
            }}
            options={[
              ["spending", m.settings_cat_spending()],
              ["income", m.settings_cat_income()],
            ]}
          />
          {!!c && !!c.income !== income && c.tx > 0 && (
            <span className="text-warning">
              {income ? m.settings_cat_now_income({ count: c.tx }) : m.settings_cat_now_spending({ count: c.tx })}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span id={`${key}-icons`} className="text-xs text-muted-foreground">
            {m.settings_cat_icon()}
          </span>
          <label className="relative w-40">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={iconQuery}
              onChange={(e) => setIconQuery(e.target.value)}
              placeholder={m.settings_cat_find_icon()}
              aria-label={m.settings_cat_find_icon()}
              className="h-8 bg-background pl-8 text-[13px]"
            />
          </label>
        </div>
        <div
          role="group"
          aria-labelledby={`${key}-icons`}
          className="grid max-h-[136px] grid-cols-8 gap-1.5 overflow-y-auto p-px max-md:max-h-[188px] md:max-w-[400px]"
        >
          {icons.map(([n, I]) => (
            <button
              key={n}
              type="button"
              aria-pressed={picked === I}
              aria-label={n.replace(/-/g, " ")}
              title={n.replace(/-/g, " ")}
              onClick={() => {
                const old = icon
                setIcon(`ph:${n}`)
                void commit({ icon: `ph:${n}` }, () => setIcon(old))
              }}
              className="flex h-10 items-center justify-center rounded-[9px] bg-card text-subtle-foreground transition-[box-shadow,color,translate] duration-150 ease-out hover:-translate-y-px hover:text-foreground aria-pressed:text-brand aria-pressed:shadow-[inset_0_0_0_1.5px_var(--brand)] max-md:h-11"
            >
              <I className="size-[18px]" />
            </button>
          ))}
          {icons.length === 0 && (
            <p className="col-span-full px-1 py-2 text-[13px] text-muted-foreground">
              {m.settings_cat_no_icon({ query: iconQuery })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {c && !system && (
          <>
            <Button
              variant="outline"
              className="h-9 bg-card px-3 text-[13px] font-normal"
              disabled={busy}
              onClick={() => setConfirm(c.tx || c.subs || hasChildren ? "merge" : "delete")}
            >
              {c.tx || c.subs || hasChildren ? (
                <>
                  <ArrowsMergeIcon /> {m.settings_cat_merge_into_ellipsis()}
                </>
              ) : (
                <>
                  <TrashIcon /> {m.common_delete()}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="h-9 px-3 text-[13px] font-normal text-subtle-foreground"
              disabled={busy}
              onClick={() =>
                run(
                  () => archiveCategory({ data: { id: c.id, archived: true } }),
                  m.settings_cat_archived_toast({ name: c.name })
                )
              }
            >
              {m.settings_cat_archive()}
            </Button>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {c ? m.settings_cat_autosave() : m.settings_cat_new_hint()}
        </span>
      </div>

      {c && confirm === "delete" && (
        <Confirm
          title={m.settings_cat_delete_title({ name: c.name })}
          body={m.settings_cat_delete_body()}
          action={m.common_delete()}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => deleteCategory({ data: { id: c.id } }), m.settings_cat_deleted({ name: c.name }))}
        />
      )}
      {c && confirm === "merge" && (
        <MergeDialog
          c={c}
          all={all}
          hasChildren={hasChildren}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onMerge={(into) =>
            run(
              () => mergeCategory({ data: { id: c.id, into: into.id } }),
              m.settings_cat_merged({ name: c.name, into: into.name })
            )
          }
        />
      )}
    </div>
  )
}

function Archived({ cats }: { cats: Cat[] }) {
  const [open, setOpen] = useState(false)
  return (
    <SettingGroup>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2 px-5 text-left text-sm max-md:px-4"
      >
        <CaretRightIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-[250ms] ease-out",
            open && "rotate-90"
          )}
        />
        {m.settings_cat_archived_count({ count: cats.length })}
        <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">{m.settings_cat_archived_hint()}</span>
      </button>
      <Expand open={open}>
        <div className="border-t">
          {tree(cats).map((c) => (
            <ArchivedRow key={c.id} c={c} sub={!!c.parent_id && cats.some((p) => p.id === c.parent_id)} />
          ))}
        </div>
      </Expand>
    </SettingGroup>
  )
}

function ArchivedRow({ c, sub }: { c: Cat; sub: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div className={cn("flex min-h-12 items-center gap-3 px-5 py-1.5 max-md:px-4", sub && "pl-11")}>
      <CategoryIcon icon={c.icon} className="opacity-60" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-subtle-foreground">{c.name}</span>
        <span data-plain className="num block truncate text-xs text-muted-foreground">
          {usage(c)}
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await archiveCategory({ data: { id: c.id, archived: false } })
            await router.invalidate()
            toast.success(m.settings_cat_restored({ name: c.name }))
          } catch (e) {
            toast.error(errorOf(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {m.settings_cat_restore()}
      </Button>
    </div>
  )
}

function MergeDialog({
  c,
  all,
  hasChildren,
  busy,
  onCancel,
  onMerge,
}: {
  c: Cat
  all: Cat[]
  hasChildren: boolean
  busy: boolean
  onCancel: () => void
  onMerge: (into: Cat) => void
}) {
  const [into, setInto] = useState("")
  // Targets share the category's type and aren't the category or one of its subcategories. A category with
  // subcategories can only merge into a top-level category.
  const targets = tree(
    all.filter(
      (x) =>
        !x.archived &&
        x.id !== c.id &&
        x.parent_id !== c.id &&
        !!x.income === !!c.income &&
        !(hasChildren && x.parent_id)
    )
  )
  const target = all.find((x) => x.id === into)
  // Everything the merge moves, as one list in the reader's language: "3 transactions, 1 recurring payment and …".
  const items = new Intl.ListFormat(intlLocale(), { type: "conjunction" }).format(
    [
      c.tx && m.settings_cat_count_tx({ count: c.tx }),
      c.subs && m.settings_cat_merge_item_recurring({ count: c.subs }),
      c.rules && m.settings_cat_merge_item_rules({ count: c.rules }),
      hasChildren && m.settings_cat_merge_item_subcategories(),
    ].filter((x) => typeof x === "string")
  )
  const label = (x: Cat) => (x.parent_id ? `${all.find((p) => p.id === x.parent_id)?.name ?? ""} › ${x.name}` : x.name)
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_cat_merge_title({ name: c.name })}</DialogTitle>
          <DialogDescription>{m.settings_cat_merge_body({ items, name: c.name })}</DialogDescription>
        </DialogHeader>
        <Pick
          value={into}
          onChange={setInto}
          placeholder={m.settings_cat_merge_into_ellipsis()}
          options={targets.map((x) => ({ value: x.id, label: label(x) }))}
          className="w-full"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <Button variant="destructive" disabled={!target || busy} onClick={() => target && onMerge(target)}>
            {target ? m.settings_cat_merge_into({ name: target.name }) : m.settings_cat_merge()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Confirm({
  title,
  body,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  action: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
