import { useState, type ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowsLeftRightIcon, EyeIcon, PencilSimpleIcon, UserCircleIcon, WarningIcon } from "@phosphor-icons/react/ssr"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { z } from "zod"
import { cn } from "cn"
import { AuthError, AuthFooter, optionClass } from "@/components/auth"
import { KoshaMark } from "@/components/kosha-mark"
import { Button } from "@/components/ui/button"
import { getConsentRequest } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { m } from "@/paraglide/messages"

// Where an MCP app (Claude, ChatGPT, Cursor…) lands after sign-in, to be allowed in or turned away.
// Better Auth redirects here with a signed copy of the app's request; the auth client sends it back.
export const Route = createFileRoute("/consent")({
  validateSearch: z.looseObject({}),
  head: () => ({ meta: [{ title: m.auth_consent_page_title() }] }),
  // Any failure here means the signed request can't be used, so the page says that rather than the server's words.
  loader: async () => {
    try {
      const query = typeof window === "undefined" ? undefined : window.location.search
      return { request: await getConsentRequest({ data: { query } }) }
    } catch {
      return { request: null }
    }
  },
  component: Consent,
})

const READ = "kosha:read"
const WRITE = "kosha:write"

function Consent() {
  const { request } = Route.useLoaderData()
  const [write, setWrite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState("")

  if (!request)
    return (
      <Shell>
        <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-7 text-center max-sm:p-5">
          <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.02em]">{m.auth_consent_failed_title()}</h1>
          <p className="text-sm text-muted-foreground">{m.auth_consent_failed_body()}</p>
        </section>
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
      setFailed(
        (res.error as { code?: string } | null)?.code === "DEMO_READ_ONLY"
          ? m.common_demo_read_only()
          : m.auth_consent_error()
      )
    } else window.location.assign(res.data.url)
  }

  return (
    <Shell email={request.email}>
      <div aria-hidden="true" className="flex items-center justify-center">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-card text-[26px] font-semibold tracking-[-0.02em]">
          {request.logo ? (
            <img src={request.logo} alt="" className="size-full object-cover" />
          ) : (
            request.name.trim().charAt(0).toUpperCase()
          )}
        </span>
        <span className="w-[34px] border-t-[1.5px] border-dashed border-chart-4" />
        <span className="flex size-9 items-center justify-center rounded-full border bg-card text-subtle-foreground">
          <ArrowsLeftRightIcon className="size-4" />
        </span>
        <span className="w-[34px] border-t-[1.5px] border-dashed border-chart-4" />
        {/* The Kosha app icon: the paper K and its coin on peacock, in both modes. */}
        <span className="flex size-16 items-center justify-center rounded-[15px] bg-peacock">
          <KoshaMark className="h-[30px] [--auth-mark:var(--color-paper)]" />
        </span>
      </div>

      <section className="flex flex-col gap-[22px] rounded-2xl border bg-card p-7 max-sm:p-5">
        <div className="flex min-w-0 flex-col items-center gap-2.5 text-center">
          <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.02em] text-balance">
            {m.auth_consent_title({ app: request.name })}
          </h1>
          <p className="flex max-w-full items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
            <ParaglideMessage
              message={request.host ? m.auth_consent_returns_to : m.auth_consent_returns_unknown}
              inputs={{ host: request.host }}
              markup={{
                host: ({ children }) => (
                  <span className="truncate rounded-full bg-muted px-2 py-[3px] font-mono text-xs text-foreground">
                    {children}
                  </span>
                ),
              }}
            />
          </p>
        </div>

        {request.local && (
          <div role="note" className="flex gap-3 rounded-[14px] border bg-muted px-4 py-3.5 text-sm">
            <WarningIcon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warning" />
            <p>
              <span className="font-medium">{m.auth_consent_local_title()}</span>{" "}
              <span className="text-subtle-foreground">{m.auth_consent_local_body()}</span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <span className="text-xs text-muted-foreground">{m.auth_consent_will_be_able({ app: request.name })}</span>
          <ul className="overflow-hidden rounded-[14px] border">
            {(request.scopes.includes(READ) || asksWrite) && (
              <Scope icon={<EyeIcon />}>{m.auth_consent_scope_read()}</Scope>
            )}
            {asksWrite && (
              <li className="border-t first:border-t-0">
                <label className="grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5">
                  <ScopeIcon>
                    <PencilSimpleIcon />
                  </ScopeIcon>
                  <span className="flex flex-col gap-0.5">
                    <span className={cn("text-sm", !write && "text-muted-foreground line-through")}>
                      {m.auth_consent_scope_write()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {write ? m.auth_consent_write_on() : m.auth_consent_write_off()}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={write}
                    onChange={(e) => setWrite(e.target.checked)}
                    className="size-[18px] accent-primary"
                  />
                </label>
              </li>
            )}
            {(request.scopes.includes("profile") || request.scopes.includes("email")) && (
              <Scope icon={<UserCircleIcon />}>{m.auth_consent_scope_profile()}</Scope>
            )}
          </ul>
          <p className="mt-0.5 text-xs leading-[18px] text-muted-foreground">
            {m.auth_consent_disconnect()}
            {request.site && (
              <>
                {" "}
                <a
                  href={request.site}
                  target="_blank"
                  rel="noreferrer"
                  className="text-subtle-foreground underline underline-offset-[3px] hover:text-foreground"
                >
                  {m.auth_consent_about_app()}
                </a>
              </>
            )}
          </p>
        </div>

        {failed && <AuthError>{failed}</AuthError>}
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            size="auth-option"
            className={cn(optionClass, "text-[15px]")}
            disabled={busy}
            onClick={() => void answer(false)}
          >
            {m.auth_consent_deny()}
          </Button>
          <Button size="auth" className="max-md:h-12" disabled={busy} onClick={() => void answer(true)}>
            {asksWrite && !write ? m.auth_consent_allow_read() : m.auth_consent_allow()}
          </Button>
        </div>
      </section>
    </Shell>
  )
}

function ScopeIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-subtle-foreground [&_svg]:size-4">
      {children}
    </span>
  )
}

function Scope({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 border-t px-4 py-3.5 text-sm first:border-t-0">
      <ScopeIcon>{icon}</ScopeIcon>
      <span>{children}</span>
    </li>
  )
}

function Shell({ email, children }: { email?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-4 py-6">
      <main className="flex w-full max-w-[460px] flex-1 flex-col justify-center gap-7 py-8 motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in">
        {children}
        {email && (
          <p className="text-center text-[13px] leading-[18px] text-muted-foreground">
            <ParaglideMessage
              message={m.auth_consent_signed_in_as}
              inputs={{ email }}
              markup={{ email: ({ children }) => <span className="text-foreground">{children}</span> }}
            />
          </p>
        )}
      </main>
      <AuthFooter className="w-full max-w-[460px]" />
    </div>
  )
}
