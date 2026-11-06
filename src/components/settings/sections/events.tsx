import { useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ArrowRightIcon, CaretRightIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/ssr"
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
import { Expand, SettingGroup } from "@/components/settings/row"
import { errorOf } from "@/components/settings/saved"
import { useMeta } from "@/components/shell"
import { EventEditor, eventDates } from "@/components/tags-events"
import { deleteEvent, type Event } from "@/lib/api"
import { cn } from "@/lib/utils"

const plural = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`

export function Events() {
  const meta = useMeta()
  const router = useRouter()
  // The open editor: an event id, or "new".
  const [open, setOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Event | null>(null)
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id))

  async function remove() {
    if (!deleting) return
    try {
      await deleteEvent({ data: { id: deleting.id } })
      await router.invalidate()
      toast.success(`${deleting.name} deleted`)
      setOpen(null)
    } catch (e) {
      toast.error(errorOf(e))
    }
    setDeleting(null)
  }

  return (
    <SettingGroup
      label="Events"
      note="A trip or an occasion. Add entries to it from the add form; new ones dated inside it go there on their own."
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-card text-xs font-normal"
          onClick={() => toggle("new")}
          aria-expanded={open === "new"}
        >
          <PlusIcon /> New event
        </Button>
      }
    >
      <div id="events">
        <Expand open={open === "new"}>
          <div className="p-4">
            <EventEditor onSaved={() => setOpen(null)} onCancel={() => setOpen(null)} />
          </div>
        </Expand>
        {meta.events.length === 0 && open !== "new" && (
          <p className="px-5 py-4 text-sm text-muted-foreground">No events yet.</p>
        )}
        {meta.events.map((e) => {
          const isOpen = open === e.id
          return (
            <div key={e.id} className="border-t first:border-t-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(e.id)}
                className="flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted aria-expanded:bg-muted max-md:px-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{e.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[eventDates(e) || "No dates", plural(e.tx_count)].join(" · ")}
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
                <div className="grid gap-3 p-4">
                  <EventEditor key={e.id} event={e} onSaved={() => setOpen(null)} onCancel={() => setOpen(null)} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(e)}
                    >
                      <TrashIcon /> Delete
                    </Button>
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<Link to="/transactions" search={(p) => ({ ...p, event: e.id })} />}
                    >
                      See its transactions <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              </Expand>
            </div>
          )
        })}
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              Its {plural(deleting?.tx_count ?? 0)} stay; they just won’t belong to an event any more.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingGroup>
  )
}
