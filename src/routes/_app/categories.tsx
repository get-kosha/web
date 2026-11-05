import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CaretRightIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORY_ICONS, CategoryIcon, categoryIcon } from "@/components/category-icon"
import { Pick } from "@/components/pick"
import { PageHeader, segment, segmentButton } from "@/components/shell"
import {
  archiveCategory,
  deleteCategory,
  listCategories,
  mergeCategory,
  saveCategory,
  type ManagedCategory,
} from "@/lib/api"
import { isSystemCategory } from "@/lib/core"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/categories")({
  loader: () => listCategories(),
  head: () => ({ meta: [{ title: "Categories · Kosha" }] }),
  component: Categories,
})

type Cat = ManagedCategory
type Editing = { cat: Cat | null; income: boolean; parentId: string | null } // cat null: a new category

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const usage = (c: Cat) =>
  [
    c.tx && plural(c.tx, "transaction"),
    c.subs && plural(c.subs, "recurring", "recurring"),
    c.rules && plural(c.rules, "payee rule"),
  ]
    .filter(Boolean)
    .join(" · ") || "Not used yet"

/** Top-level categories, each followed by its subcategories. */
function tree(cats: Cat[]) {
  const tops = cats.filter((c) => !c.parent_id || !cats.some((p) => p.id === c.parent_id))
  return tops.flatMap((t) => [t, ...cats.filter((c) => c.parent_id === t.id)])
}

function Categories() {
  const all = Route.useLoaderData()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const active = all.filter((c) => !c.archived)
  const archived = all.filter((c) => c.archived)
  const spending = active.filter((c) => !c.income)
  const income = active.filter((c) => c.income)

  return (
    <div className="pb-8">
      <PageHeader
        title="Categories"
        sub={`${spending.length} spending · ${income.length} income${archived.length ? ` · ${archived.length} archived` : ""}`}
      >
        <Button
          variant="outline"
          size="lg"
          className="gap-2 bg-card px-3 text-[13px] font-normal"
          onClick={() => setEditing({ cat: null, income: false, parentId: null })}
        >
          <PlusIcon /> New category
        </Button>
      </PageHeader>

      <div className="grid gap-5 px-4 md:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Group
          title="Spending"
          cats={spending}
          onEdit={(c) => setEditing({ cat: c, income: !!c.income, parentId: c.parent_id })}
          onAdd={(parentId) => setEditing({ cat: null, income: false, parentId })}
        />
        <Group
          title="Income"
          cats={income}
          onEdit={(c) => setEditing({ cat: c, income: !!c.income, parentId: c.parent_id })}
          onAdd={(parentId) => setEditing({ cat: null, income: true, parentId })}
        />

        {archived.length > 0 && (
          <Card className="gap-0 py-1 lg:col-span-2">
            <button
              type="button"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className="flex min-h-11 items-center gap-2 px-4 text-left text-sm"
            >
              <CaretRightIcon
                className={cn(
                  "size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
                  showArchived && "rotate-90"
                )}
              />
              Archived ({archived.length})
              <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">
                Hidden from pickers; past transactions keep them
              </span>
            </button>
            {showArchived && (
              <div className="border-t">
                {tree(archived).map((c) => (
                  <ArchivedRow key={c.id} c={c} sub={!!c.parent_id && archived.some((p) => p.id === c.parent_id)} />
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {editing && (
        <EditDialog key={editing.cat?.id ?? "new"} editing={editing} all={all} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function Group({
  title,
  cats,
  onEdit,
  onAdd,
}: {
  title: string
  cats: Cat[]
  onEdit: (c: Cat) => void
  onAdd: (parentId: string | null) => void
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="num text-xs text-muted-foreground">{cats.length}</span>
      </div>
      {cats.length === 0 && (
        <p className="px-4 pb-5 text-sm text-muted-foreground">No {title.toLowerCase()} categories yet.</p>
      )}
      <ul className="pb-1.5">
        {tree(cats).map((c) => {
          const sub = !!c.parent_id && cats.some((p) => p.id === c.parent_id)
          return (
            <li key={c.id} className="group/row relative">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className={cn(
                  "grid min-h-12 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2 text-left transition-colors hover:bg-muted",
                  sub && "border-t-0 pl-11"
                )}
              >
                <CategoryIcon icon={c.icon} className={cn(sub && "size-4")} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm">
                    {c.name}
                    {isSystemCategory(c.id) && (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                        used by Kosha
                      </span>
                    )}
                  </span>
                  <span className="num block truncate text-xs text-muted-foreground">{usage(c)}</span>
                </span>
                <CaretRightIcon className="size-4 text-muted-foreground" />
              </button>
              {!sub && !isSystemCategory(c.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAdd(c.id)}
                  className="absolute top-1/2 right-10 -translate-y-1/2 text-xs font-normal text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-md:hidden"
                >
                  <PlusIcon /> Sub
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ArchivedRow({ c, sub }: { c: Cat; sub: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div
      className={cn("grid min-h-12 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-1.5", sub && "pl-11")}
    >
      <CategoryIcon icon={c.icon} className="opacity-60" />
      <span className="min-w-0">
        <span className="block truncate text-sm text-subtle-foreground">{c.name}</span>
        <span className="num block truncate text-xs text-muted-foreground">{usage(c)}</span>
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
            toast.success(`${c.name} restored`)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't restore it")
          } finally {
            setBusy(false)
          }
        }}
      >
        Restore
      </Button>
    </div>
  )
}

function EditDialog({ editing, all, onClose }: { editing: Editing; all: Cat[]; onClose: () => void }) {
  const router = useRouter()
  const c = editing.cat
  const system = !!c && isSystemCategory(c.id)
  const [name, setName] = useState(c?.name ?? "")
  const [icon, setIcon] = useState<string | null>(c?.icon ?? "ph:tag")
  const [income, setIncome] = useState(editing.income)
  const [parentId, setParentId] = useState(editing.parentId)
  const [iconQuery, setIconQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<"merge" | "delete" | null>(null)

  const hasChildren = !!c && all.some((x) => x.parent_id === c.id)
  const parents = all.filter(
    (x) => !x.archived && !x.parent_id && !!x.income === income && x.id !== c?.id && !isSystemCategory(x.id)
  )
  const typeChanged = !!c && !!c.income !== income
  const current = categoryIcon(icon)
  const icons = CATEGORY_ICONS.filter(([n]) => n.includes(iconQuery.trim().toLowerCase().replace(/\s+/g, "-")))

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      await router.invalidate()
      toast.success(done)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(
      () => saveCategory({ data: { id: c?.id, name, icon, income, parentId } }),
      c ? `${name.trim()} saved` : `${name.trim()} added`
    )

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{c ? `Edit ${c.name}` : parentId ? "New subcategory" : "New category"}</DialogTitle>
            {c && <DialogDescription className="num">{usage(c)}</DialogDescription>}
          </DialogHeader>

          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg border bg-muted" aria-hidden="true">
                {(() => {
                  const I = current
                  return <I className="size-5" />
                })()}
              </span>
              <div className="grid gap-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  maxLength={60}
                  className="h-10"
                />
              </div>
            </div>

            {!system && (
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <div role="group" aria-label="Type" className={cn(segment, "w-fit")}>
                  {(
                    [
                      [false, "Spending"],
                      [true, "Income"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={income === v}
                      disabled={!!parentId}
                      onClick={() => {
                        setIncome(v)
                        setParentId(null)
                      }}
                      className={cn(segmentButton, "px-3 text-[13px] disabled:opacity-50")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {parentId && <p className="text-xs text-muted-foreground">A subcategory takes its parent’s type.</p>}
                {typeChanged && c!.tx > 0 && (
                  <p className="text-xs text-warning">
                    Its {plural(c!.tx, "transaction")} will count as {income ? "income" : "spending"}.
                  </p>
                )}
              </div>
            )}

            {!system && (
              <div className="grid gap-1.5">
                <Label>Subcategory of</Label>
                <Pick
                  value={parentId ?? ""}
                  onChange={(v) => setParentId(v || null)}
                  placeholder="Nothing (top level)"
                  options={parents.map((p) => ({ value: p.id, label: p.name }))}
                  className="w-full sm:w-64"
                />
                {hasChildren && (
                  <p className="text-xs text-muted-foreground">It has subcategories, so it stays top level.</p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label id="icon-label">Icon</Label>
                <label className="relative w-40">
                  <MagnifyingGlassIcon
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={iconQuery}
                    onChange={(e) => setIconQuery(e.target.value)}
                    placeholder="Find an icon"
                    aria-label="Find an icon"
                    className="h-8 pl-8 text-[13px]"
                  />
                </label>
              </div>
              <div
                role="group"
                aria-labelledby="icon-label"
                className="grid max-h-52 grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1 overflow-y-auto rounded-lg border p-1.5"
              >
                {icons.map(([n, I]) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={icon === `ph:${n}`}
                    aria-label={n.replace(/-/g, " ")}
                    title={n.replace(/-/g, " ")}
                    onClick={() => setIcon(`ph:${n}`)}
                    className="flex size-10 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                  >
                    <I className="size-5" />
                  </button>
                ))}
                {icons.length === 0 && (
                  <p className="col-span-full px-2 py-3 text-sm text-muted-foreground">No icon called “{iconQuery}”.</p>
                )}
              </div>
            </div>

            <DialogFooter className="items-center sm:justify-between">
              <div className="flex gap-1">
                {c && !system && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(() => archiveCategory({ data: { id: c.id, archived: true } }), `${c.name} archived`)
                      }
                    >
                      Archive
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirm(c.tx || c.subs || hasChildren ? "merge" : "delete")}
                      className="text-destructive hover:text-destructive"
                    >
                      {c.tx || c.subs || hasChildren ? "Merge…" : "Delete"}
                    </Button>
                  </>
                )}
              </div>
              <Button type="submit" disabled={busy || !name.trim()}>
                {c ? "Save" : "Add category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {c && confirm === "delete" && (
        <Confirm
          title={`Delete ${c.name}?`}
          body="Nothing uses it, so nothing else changes."
          action="Delete"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => deleteCategory({ data: { id: c.id } }), `${c.name} deleted`)}
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
            run(() => mergeCategory({ data: { id: c.id, into: into.id } }), `${c.name} merged into ${into.name}`)
          }
        />
      )}
    </>
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
  // Same type; not itself or one of its subcategories; with subcategories of its own, only into a top-level category.
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
  const label = (x: Cat) => (x.parent_id ? `${all.find((p) => p.id === x.parent_id)?.name ?? ""} › ${x.name}` : x.name)
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge {c.name}</DialogTitle>
          <DialogDescription>
            Its{" "}
            {[
              c.tx && plural(c.tx, "transaction"),
              c.subs && plural(c.subs, "recurring payment"),
              c.rules && plural(c.rules, "payee rule"),
              hasChildren && "subcategories",
            ]
              .filter(Boolean)
              .join(", ")}{" "}
            move to the category you pick. Then {c.name} is deleted. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <Pick
          value={into}
          onChange={setInto}
          placeholder="Merge into…"
          options={targets.map((x) => ({ value: x.id, label: label(x) }))}
          className="w-full"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!target || busy} onClick={() => target && onMerge(target)}>
            {target ? `Merge into ${target.name}` : "Merge"}
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
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
