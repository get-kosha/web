import { useState, type ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { getConsentRequest } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

// Where an MCP app (Claude, ChatGPT, Cursor…) lands after sign-in, to be allowed in or turned away.
// Better Auth redirects here with a signed copy of the app's request; the auth client sends it back.
export const Route = createFileRoute("/consent")({
  validateSearch: z.looseObject({}),
  head: () => ({ meta: [{ title: "Connect an app · Kosha" }] }),
  loader: async () => {
    try {
      const query = typeof window === "undefined" ? undefined : window.location.search
      return { request: await getConsentRequest({ data: { query } }), error: null }
    } catch (e) {
      return { request: null, error: e instanceof Error ? e.message : String(e) }
    }
  },
  component: Consent,
})

const READ = "kosha:read"
const WRITE = "kosha:write"

function Consent() {
  const { request, error } = Route.useLoaderData()
  const [write, setWrite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState("")

  if (!request)
    return (
      <Shell>
        <h1 className="text-lg font-semibold tracking-tight">This link didn’t work</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </Shell>
    )

  const asksWrite = request.scopes.includes(WRITE)
  async function answer(accept: boolean) {
    setBusy(true)
    setFailed("")
    const scope = request!.scopes.filter((s) => write || s !== WRITE).join(" ")
    const res = await authClient.$fetch<{ redirect?: boolean; url?: string }>("/oauth2/consent", {
      method: "POST",
      body: accept ? { accept, scope } : { accept },
    })
    if (res.error || !res.data?.url) {
      setBusy(false)
      setFailed(res.error?.message || "Something went wrong. Try again from the app.")
    } else window.location.assign(res.data.url)
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        {request.logo ? (
          <img src={request.logo} alt="" className="size-10 rounded-lg border object-cover" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-lg border text-muted-foreground">
            <PlugsConnectedIcon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Connect {request.name} to Kosha?</h1>
          <p className="truncate text-sm text-muted-foreground">
            Returns to <span className="font-medium text-foreground">{request.host || "an unknown address"}</span>
          </p>
        </div>
      </div>

      {request.local && (
        <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <WarningIcon className="mt-0.5 size-4 shrink-0" />
          This app runs on this computer. Allow it only if you just started it, for example in a terminal.
        </p>
      )}

      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{request.name} will be able to:</p>
        <ul className="flex flex-col gap-2">
          {(request.scopes.includes(READ) || asksWrite) && (
            <li>See your accounts, transactions, categories, recurring payments and reports</li>
          )}
          {asksWrite && (
            <li>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(e) => setWrite(e.target.checked)}
                  className="mt-0.5 size-4 accent-foreground"
                />
                <span>
                  Add, change and delete them
                  <span className="block text-xs text-muted-foreground">Untick to connect read-only.</span>
                </span>
              </label>
            </li>
          )}
          {(request.scopes.includes("profile") || request.scopes.includes("email")) && <li>See your name and email</li>}
        </ul>
        <p className="text-xs text-muted-foreground">
          You can disconnect it any time in Settings › API &amp; MCP.
          {request.site && (
            <>
              {" "}
              <a href={request.site} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                About this app
              </a>
            </>
          )}
        </p>
      </div>

      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failed}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void answer(false)}>
          Deny
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => void answer(true)}>
          Allow
        </Button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
    </main>
  )
}
