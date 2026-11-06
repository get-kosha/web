import { useState, type FormEvent } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { ArrowSquareOutIcon, CopyIcon, KeyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Expand, Pill, Segmented, SettingGroup, SettingRow } from "@/components/settings/row"
import { errorOf } from "@/components/settings/saved"
import { addApiKey, removeApiKey, removeConnectedApp } from "@/lib/api"
import { LOCALE } from "@/lib/core"

const useAccess = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.api! })
type Access = ReturnType<typeof useAccess>

const date = (ms: number) =>
  new Date(ms).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Couldn’t copy. Select it and copy it yourself.")
  )
}

/** Settings › API & MCP: the MCP server URL, the apps connected through it, and API keys for scripts. */
export function ApiAccess() {
  const access = useAccess()
  return (
    <>
      <SettingGroup
        label="AI assistants"
        note="In Claude, ChatGPT or Cursor, add a custom connector with this URL. You’ll sign in to Kosha and choose whether it can make changes."
      >
        <SettingRow
          id="mcp-url"
          title="MCP server URL"
          description="Gives an assistant the same tools the API has: search, add, recategorise, reports."
          control={
            <>
              <code className="num rounded-md bg-muted px-2 py-1 text-xs break-all">{access.mcpUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(access.mcpUrl, "URL")}
                aria-label="Copy MCP server URL"
              >
                <CopyIcon />
              </Button>
            </>
          }
        />
        <ConnectedApps apps={access.apps} />
      </SettingGroup>
      <ApiKeys keys={access.keys} />
      <SettingGroup label="Reference">
        <SettingRow
          id="api-docs"
          title="API reference"
          description="Every operation with its fields and examples, from the same list the MCP tools use."
          control={
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={access.docsUrl} target="_blank" rel="noreferrer" />}
            >
              Open <ArrowSquareOutIcon />
            </Button>
          }
        />
      </SettingGroup>
    </>
  )
}

function ConnectedApps({ apps }: { apps: Access["apps"] }) {
  const router = useRouter()
  const [removing, setRemoving] = useState<Access["apps"][number] | null>(null)

  async function disconnect() {
    if (!removing) return
    try {
      await removeConnectedApp({ data: { clientId: removing.clientId } })
      await router.invalidate()
      toast.success(`${removing.name} disconnected`)
    } catch (e) {
      toast.error(errorOf(e))
    }
    setRemoving(null)
  }

  return (
    <div id="connected-apps" className="border-t">
      <div className="px-5 pt-4 pb-1 text-sm font-medium max-md:px-4">Connected apps</div>
      {apps.length === 0 && <p className="px-5 pb-4 text-[13px] text-muted-foreground max-md:px-4">None yet.</p>}
      {apps.map((a) => (
        <div key={a.clientId} className="flex min-h-[60px] items-center gap-3 px-5 py-3 max-md:px-4">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm">
              <span className="truncate">{a.name}</span>
              <Pill tone={a.write ? "warning" : "muted"}>{a.write ? "Can make changes" : "Read-only"}</Pill>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[a.host, `connected ${date(a.connectedAt)}`, a.lastUsedAt && `signed in ${date(a.lastUsedAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(a)}>
            Disconnect
          </Button>
        </div>
      ))}
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {removing?.name}?</DialogTitle>
            <DialogDescription>
              It loses access straight away. To use it again, connect it from the app and sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={disconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ApiKeys({ keys }: { keys: Access["keys"] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"read" | "write">("read")
  const [busy, setBusy] = useState(false)
  // A new key is shown once, until this card is closed.
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null)
  const [deleting, setDeleting] = useState<Access["keys"][number] | null>(null)

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      const { key } = await addApiKey({ data: { name, scope } })
      setCreated({ name: name.trim(), key })
      setAdding(false)
      setName("")
      await router.invalidate()
    } catch (err) {
      toast.error(errorOf(err))
    }
    setBusy(false)
  }

  async function remove() {
    if (!deleting) return
    try {
      await removeApiKey({ data: { id: deleting.id } })
      await router.invalidate()
      toast.success(`${deleting.name} deleted`)
    } catch (e) {
      toast.error(errorOf(e))
    }
    setDeleting(null)
  }

  return (
    <SettingGroup
      label="API keys"
      note="For your own scripts and shortcuts. Send a key as Authorization: Bearer kosha_…. Anyone with a key can use it, so keep it secret."
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-card text-xs font-normal"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
        >
          <PlusIcon /> New key
        </Button>
      }
    >
      <div id="api-keys">
        <Expand open={adding}>
          <form onSubmit={create} className="grid gap-3 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bank import script"
                maxLength={60}
                required
              />
            </div>
            <Segmented
              label="What the key can do"
              value={scope}
              onChange={setScope}
              options={[
                ["read", "Read only"],
                ["write", "Read & write"],
              ]}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                Create key
              </Button>
            </div>
          </form>
        </Expand>
        {created && (
          <div className="grid gap-2 border-b bg-brand-soft/40 p-4" role="status">
            <p className="text-sm font-medium">Copy {created.name} now. You won’t see it again.</p>
            <div className="flex items-center gap-2">
              <code className="num min-w-0 flex-1 rounded-md border bg-card px-2 py-1.5 text-xs break-all">
                {created.key}
              </code>
              <Button variant="outline" size="sm" onClick={() => copy(created.key, "Key")} aria-label="Copy API key">
                <CopyIcon />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        )}
        {keys.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-muted-foreground max-md:px-4">No keys yet.</p>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex min-h-[60px] items-center gap-3 border-t px-5 py-3 first:border-t-0 max-md:px-4"
          >
            <KeyIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm">
                <span className="truncate">{k.name}</span>
                <Pill tone={k.scope === "write" ? "warning" : "muted"}>
                  {k.scope === "write" ? "Read & write" : "Read only"}
                </Pill>
              </span>
              <span className="num block truncate text-xs text-muted-foreground">
                {[
                  `kosha_…${k.hint}`,
                  `made ${date(k.created_at * 1000)}`,
                  k.last_used_at ? `used ${date(k.last_used_at * 1000)}` : "never used",
                ].join(" · ")}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(k)} aria-label={`Delete ${k.name}`}>
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>Anything using this key stops working straight away.</DialogDescription>
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
