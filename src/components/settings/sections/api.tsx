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
import { intlLocale } from "@/lib/core"
import { m } from "@/paraglide/messages"

const useAccess = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.api! })
type Access = ReturnType<typeof useAccess>

const date = (ms: number) =>
  new Date(ms).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", year: "numeric" })

function copy(text: string, done: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error(m.settings_api_copy_failed())
  )
}

/** Settings › API & MCP: the MCP server URL, the apps connected through it, and API keys for scripts. */
export function ApiAccess() {
  const access = useAccess()
  return (
    <>
      <SettingGroup label={m.settings_api_assistants()} note={m.settings_api_assistants_note()}>
        <SettingRow
          id="mcp-url"
          title={m.settings_api_mcp_title()}
          description={m.settings_api_mcp_description()}
          control={
            <>
              <code className="num rounded-md bg-muted px-2 py-1 text-xs break-all">{access.mcpUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(access.mcpUrl, m.settings_api_url_copied())}
                aria-label={m.settings_api_copy_mcp()}
              >
                <CopyIcon />
              </Button>
            </>
          }
        />
        <ConnectedApps apps={access.apps} />
      </SettingGroup>
      <ApiKeys keys={access.keys} />
      <SettingGroup label={m.settings_api_reference()}>
        <SettingRow
          id="api-docs"
          title={m.settings_api_docs_title()}
          description={m.settings_api_docs_description()}
          control={
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={access.docsUrl} target="_blank" rel="noreferrer" />}
            >
              {m.settings_api_open()} <ArrowSquareOutIcon />
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
      toast.success(m.settings_api_app_disconnected({ name: removing.name }))
    } catch (e) {
      toast.error(errorOf(e))
    }
    setRemoving(null)
  }

  return (
    <div id="connected-apps" className="border-t">
      <div className="px-5 pt-4 pb-1 text-sm font-medium max-md:px-4">{m.settings_api_connected_apps()}</div>
      {apps.length === 0 && (
        <p className="px-5 pb-4 text-[13px] text-muted-foreground max-md:px-4">{m.settings_api_none()}</p>
      )}
      {apps.map((a) => (
        <div key={a.clientId} className="flex min-h-[60px] items-center gap-3 px-5 py-3 max-md:px-4">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm">
              <span className="truncate">{a.name}</span>
              <Pill tone={a.write ? "warning" : "muted"}>
                {a.write ? m.settings_api_can_write() : m.settings_api_app_read_only()}
              </Pill>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[
                a.host,
                m.settings_api_connected_on({ date: date(a.connectedAt) }),
                a.lastUsedAt && m.settings_api_signed_in_on({ date: date(a.lastUsedAt) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(a)}>
            {m.settings_api_disconnect()}
          </Button>
        </div>
      ))}
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_api_disconnect_title({ name: removing?.name ?? "" })}</DialogTitle>
            <DialogDescription>{m.settings_api_disconnect_body()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {m.common_cancel()}
            </Button>
            <Button variant="destructive" onClick={disconnect}>
              {m.settings_api_disconnect()}
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
      toast.success(m.settings_api_key_deleted({ name: deleting.name }))
    } catch (e) {
      toast.error(errorOf(e))
    }
    setDeleting(null)
  }

  return (
    <SettingGroup
      label={m.settings_api_keys()}
      note={m.settings_api_keys_note()}
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-card text-xs font-normal"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
        >
          <PlusIcon /> {m.settings_api_new_key()}
        </Button>
      }
    >
      <div id="api-keys">
        <Expand open={adding}>
          <form onSubmit={create} className="grid gap-3 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="key-name">{m.settings_api_name()}</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={m.settings_api_name_placeholder()}
                maxLength={60}
                required
              />
            </div>
            <Segmented
              label={m.settings_api_scope()}
              value={scope}
              onChange={setScope}
              options={[
                ["read", m.settings_api_read_only()],
                ["write", m.settings_api_read_write()],
              ]}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                {m.common_cancel()}
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {m.settings_api_create()}
              </Button>
            </div>
          </form>
        </Expand>
        {created && (
          <div className="grid gap-2 border-b bg-brand-soft/40 p-4" role="status">
            <p className="text-sm font-medium">{m.settings_api_created({ name: created.name })}</p>
            <div className="flex items-center gap-2">
              <code className="num min-w-0 flex-1 rounded-md border bg-card px-2 py-1.5 text-xs break-all">
                {created.key}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(created.key, m.settings_api_key_copied())}
                aria-label={m.settings_api_copy_key()}
              >
                <CopyIcon />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => setCreated(null)}>
              {m.common_done()}
            </Button>
          </div>
        )}
        {keys.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-muted-foreground max-md:px-4">{m.settings_api_no_keys()}</p>
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
                  {k.scope === "write" ? m.settings_api_read_write() : m.settings_api_read_only()}
                </Pill>
              </span>
              <span className="num block truncate text-xs text-muted-foreground">
                {[
                  `kosha_…${k.hint}`,
                  m.settings_api_made_on({ date: date(k.created_at * 1000) }),
                  k.last_used_at
                    ? m.settings_api_used_on({ date: date(k.last_used_at * 1000) })
                    : m.settings_api_never_used(),
                ].join(" · ")}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleting(k)}
              aria-label={m.settings_api_delete_key({ name: k.name })}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_api_delete_title({ name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{m.settings_api_delete_body()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {m.common_cancel()}
            </Button>
            <Button variant="destructive" onClick={remove}>
              {m.common_delete()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingGroup>
  )
}
