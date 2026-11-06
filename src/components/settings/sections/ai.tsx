import { useState } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArticleIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  LightningIcon,
  LockSimpleIcon,
  PlusIcon,
  ReceiptIcon,
  SpinnerGapIcon,
  TagIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Pick } from "@/components/pick"
import { useMeta } from "@/components/shell"
import { Pill, SettingGroup, SettingRow } from "@/components/settings/row"
import { errorOf, usePref, useSave } from "@/components/settings/saved"
import {
  disconnectAiProvider,
  saveAiProvider,
  setDefaultAiProvider,
  testAiProvider,
  type AiProviderView,
} from "@/lib/api"
import { LOCALE, redactForAi, type AiShares, type Prefs } from "@/lib/core"
import { cn } from "@/lib/utils"

const useAi = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.ai })

const PROVIDERS: Record<AiProviderView["id"], { name: string; mono: string; kind: string; placeholder: string }> = {
  anthropic: { name: "Anthropic", mono: "A", kind: "Cloud. Claude models.", placeholder: "sk-ant-…" },
  openai: { name: "OpenAI", mono: "O", kind: "Cloud. GPT models.", placeholder: "sk-…" },
  gemini: { name: "Google Gemini", mono: "G", kind: "Cloud. Gemini models.", placeholder: "AIza…" },
  openrouter: { name: "OpenRouter", mono: "OR", kind: "One key, many model vendors.", placeholder: "sk-or-…" },
  ollama: {
    name: "Ollama",
    mono: "Ol",
    kind: "Self-hosted. Use a URL Cloudflare can reach, such as a Cloudflare Tunnel.",
    placeholder: "https://ollama.example.com",
  },
  compatible: {
    name: "OpenAI-compatible",
    mono: "{ }",
    kind: "Any endpoint that speaks the OpenAI API.",
    placeholder: "https://…/v1",
  },
}
const byUrl = (id: AiProviderView["id"]) => id === "ollama" || id === "compatible"

export function Ai() {
  const [enabled, saveEnabled] = usePref("ai_enabled")
  const on = enabled === "1"
  return (
    <>
      <div className="mt-7 flex items-start gap-3.5 rounded-xl bg-brand-soft px-[18px] py-4 text-[13.5px] leading-normal">
        <LockSimpleIcon className="mt-px size-5 shrink-0 text-brand" />
        <p>
          Your data stays in Kosha. When a feature needs a model, Kosha sends only the fields you allow under{" "}
          <strong className="font-semibold">What AI can see</strong>, to the provider you pick. It sends nothing while
          AI is off.
        </p>
      </div>
      <SettingGroup>
        <SettingRow
          id="ai-enabled"
          title="Use AI features"
          description="One switch for everything below. Off means no request ever leaves Kosha."
          control={
            <Switch aria-label="Use AI features" checked={on} onCheckedChange={(v) => saveEnabled(v ? "1" : "0")} />
          }
        />
      </SettingGroup>
      {/* When AI is off, everything below is dimmed and inert, so nothing can be changed or sent. */}
      <div
        inert={!on}
        className={cn("transition-[opacity,filter] duration-300 ease-out", !on && "opacity-40 saturate-[.4]")}
      >
        <Providers />
        <Features />
        <Visibility />
        <Usage />
      </div>
    </>
  )
}

function Providers() {
  const ai = useAi()
  const [open, setOpen] = useState<string | null>(null)
  if (!ai) return null
  const def = ai.providers.find((p) => p.isDefault)
  return (
    <SettingGroup
      label="Providers"
      actions={
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {def ? `Default: ${PROVIDERS[def.id].name}` : "None connected yet"}
        </span>
      }
      plain
    >
      <div id="ai-providers" className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {ai.providers.map((p) => (
          <ProviderCard
            key={p.id}
            p={p}
            open={open === p.id}
            onOpen={() => setOpen((o) => (o === p.id ? null : p.id))}
            onClose={() => setOpen(null)}
          />
        ))}
      </div>
    </SettingGroup>
  )
}

type Test = { ok: boolean; ms: number; models: string[]; error?: string }

function ProviderCard({
  p,
  open,
  onOpen,
  onClose,
}: {
  p: AiProviderView
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const info = PROVIDERS[p.id]
  const save = useSave()
  const router = useRouter()
  const [key, setKey] = useState("")
  const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "")
  const [model, setModel] = useState(p.model)
  const [test, setTest] = useState<Test | null>(null)
  const [busy, setBusy] = useState<"test" | "save" | null>(null)
  const models = test?.models.length ? test.models : p.model ? [p.model] : []

  const runTest = async () => {
    setBusy("test")
    try {
      const r = await testAiProvider({ data: { id: p.id, key: key || undefined, baseUrl: baseUrl || undefined } })
      setTest(r)
      if (r.ok && !model && r.models[0]) setModel(r.models[0])
    } catch (e) {
      setTest({ ok: false, ms: 0, models: [], error: errorOf(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] duration-300 ease-out",
        p.isDefault && "border-brand/60",
        open &&
          "col-span-full shadow-[0_12px_32px_rgba(17,17,19,0.12),0_2px_6px_rgba(17,17,19,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-[13px] font-semibold tracking-[-0.02em]">
          {info.mono}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            {info.name} {p.isDefault && <Pill>Default</Pill>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full bg-muted-foreground",
                p.connected && "bg-positive shadow-[0_0_0_3px_color-mix(in_srgb,var(--positive)_18%,transparent)]"
              )}
            />
            <span className="truncate">
              {p.connected ? `Connected · ${p.model}${p.keyHint ? ` · …${p.keyHint}` : ""}` : "Not connected"}
            </span>
          </div>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{info.kind}</p>
      {!open && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 bg-card text-[13px] font-normal" onClick={onOpen}>
            {p.connected ? (
              "Edit"
            ) : (
              <>
                <PlusIcon /> Connect
              </>
            )}
          </Button>
          {p.connected && !p.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px] font-normal text-subtle-foreground"
              onClick={() => void save(() => setDefaultAiProvider({ data: { id: p.id } }))}
            >
              Make default
            </Button>
          )}
        </div>
      )}
      {open && (
        <form
          className="rise-in grid gap-3 border-t pt-3.5"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy("save")
            const ok = await save(() =>
              saveAiProvider({ data: { id: p.id, key: key || undefined, baseUrl: baseUrl || undefined, model } })
            )
            setBusy(null)
            if (ok) {
              setKey("")
              setTest(null)
              onClose()
            }
          }}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {byUrl(p.id) && (
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                Base URL
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={info.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 bg-background font-mono text-[13px] text-foreground"
                />
              </label>
            )}
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {byUrl(p.id) ? "API key (optional)" : "API key"}
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  p.keyHint ? `Saved: …${p.keyHint}. Leave blank to keep it.` : byUrl(p.id) ? "" : info.placeholder
                }
                autoComplete="off"
                spellCheck={false}
                className="h-9 bg-background font-mono text-[13px] text-foreground"
              />
            </label>
            <div className="grid gap-1.5 text-xs text-muted-foreground">
              Model
              <Pick
                value={model}
                onChange={setModel}
                placeholder={models.length ? "Pick a model" : "Test the connection to load models"}
                options={models.map((m) => ({ value: m, label: m }))}
                className="h-9 w-full bg-background text-[13px] text-foreground"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-9 bg-card px-3 text-[13px] font-normal"
              disabled={busy !== null}
              onClick={runTest}
            >
              {busy === "test" && <SpinnerGapIcon className="animate-spin" />}
              {busy === "test" ? "Testing…" : test?.ok ? "Test again" : "Test connection"}
            </Button>
            {test && (
              <span
                className={cn(
                  "saved-pop inline-flex items-center gap-1.5 text-[12.5px]",
                  test.ok ? "text-positive" : "text-destructive"
                )}
              >
                {test.ok ? (
                  <>
                    <CheckCircleIcon className="size-[15px]" /> Reached {info.name} ·{" "}
                    <span className="num" data-plain>
                      {test.ms} ms
                    </span>
                  </>
                ) : (
                  test.error
                )}
              </span>
            )}
            <span className="ml-auto flex gap-2">
              {p.connected && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3 text-[13px] font-normal text-destructive hover:text-destructive"
                  onClick={async () => {
                    try {
                      await disconnectAiProvider({ data: { id: p.id } })
                      await router.invalidate()
                      toast.success(`${info.name} disconnected`)
                      onClose()
                    } catch (e) {
                      toast.error(errorOf(e))
                    }
                  }}
                >
                  Disconnect
                </Button>
              )}
              <Button type="button" variant="ghost" className="h-9 px-3 text-[13px] font-normal" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 bg-brand px-3.5 text-[13px] text-brand-foreground hover:bg-brand/90"
                disabled={busy !== null || !model}
              >
                Save
              </Button>
            </span>
          </div>
          <p className="max-w-[60ch] text-xs text-muted-foreground">
            {byUrl(p.id)
              ? "Kosha calls this address from Cloudflare, not from your device."
              : 'Kosha stores your key encrypted on the server and never shows it again. It only sends what "What AI can see" allows.'}
          </p>
        </form>
      )}
    </div>
  )
}

const FEATURES = [
  [TagIcon, "Auto-categorise", "Suggests a category when no payee rule matches. You confirm with one tap."],
  [
    LightningIcon,
    "Natural-language add",
    'Type "29.57 dosaking yesterday visa" in quick add and Kosha fills the form.',
  ],
  [ArticleIcon, "Monthly recap", "A short note on the 1st: what changed, and why."],
  [ChatCircleDotsIcon, "Ask Kosha", "Questions about your money, answered from your data."],
  [ReceiptIcon, "Receipt scanning", "Amount, date and payee from a photo."],
] as const

function Features() {
  return (
    <SettingGroup label="Features">
      <div id="ai-features">
        {FEATURES.map(([Icon, title, description]) => (
          <div key={title} className="flex items-center gap-4 border-t px-5 py-3.5 first:border-t-0 max-md:px-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-subtle-foreground">
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{title}</div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
            </div>
            <Pill tone="muted">Coming soon</Pill>
          </div>
        ))}
      </div>
    </SettingGroup>
  )
}

const SHARES = [
  ["ai_share_amount", "amount", "Amounts", "Needed for most suggestions."],
  ["ai_share_payee", "payee", "Payee names", "When off, Kosha sends a stable code instead."],
  ["ai_share_date", "date", "Exact dates", "When off, Kosha sends only the month."],
  ["ai_share_note", "note", "Notes", "Your own words. Off by default."],
  ["ai_share_account", "account", "Account names", "Which card or bank paid."],
] as const

function Visibility() {
  const meta = useMeta()
  const [logOn, saveLog] = usePref("ai_log_enabled")
  const [viewing, setViewing] = useState(false)
  const shares = Object.fromEntries(SHARES.map(([k, s]) => [s, meta.prefs[k] === "1"])) as AiShares
  return (
    <SettingGroup
      label="What AI can see"
      actions={<span className="text-xs text-muted-foreground">example: one transaction, as sent</span>}
    >
      <div id="ai-privacy" className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <div className="min-w-0">
          {SHARES.map(([key, , title, description]) => (
            <ShareRow key={key} prefKey={key} title={title} description={description} />
          ))}
        </div>
        <div className="min-w-0 border-l p-4 max-[860px]:border-t max-[860px]:border-l-0">
          <Payload shares={shares} />
          <p className="mt-3 text-xs leading-normal text-muted-foreground">
            With Payee names off, Kosha swaps each name for a stable code, so the model can still group them without
            knowing who they are.
          </p>
        </div>
      </div>
      <SettingRow
        id="ai-log"
        className="border-t"
        title="Keep a request log"
        description="Keeps every AI request and response for 30 days, so you can check what was sent."
        control={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px] font-normal text-subtle-foreground"
              onClick={() => setViewing(true)}
            >
              View log
            </Button>
            <Switch
              aria-label="Keep a request log"
              checked={logOn === "1"}
              onCheckedChange={(v) => saveLog(v ? "1" : "0")}
            />
          </>
        }
      >
        {viewing && <LogDialog onClose={() => setViewing(false)} />}
      </SettingRow>
    </SettingGroup>
  )
}

function ShareRow({
  prefKey,
  title,
  description,
}: {
  prefKey: (typeof SHARES)[number][0]
  title: string
  description: string
}) {
  const [value, saveValue] = usePref(prefKey)
  return (
    <SettingRow
      id={`share-${prefKey}`}
      title={title}
      description={description}
      control={
        <Switch
          aria-label={title}
          checked={value === "1"}
          onCheckedChange={(v) => saveValue((v ? "1" : "0") as Prefs[typeof prefKey])}
        />
      }
    />
  )
}

/** One sample transaction as JSON, redacted by the same redactForAi that AI calls will use. */
function Payload({ shares }: { shares: AiShares }) {
  const meta = useMeta()
  const tx = {
    payee: "Dosaking Indisches Restaurant",
    amount: -2957,
    currency: meta.primary,
    day: "2026-11-04",
    note: "via Wolt",
    account: meta.wallets[0]?.name ?? "Visa Card",
  }
  const sent = redactForAi(tx, shares, meta.user.id)
  const lines: [key: string, value: unknown, state: "on" | "masked" | "off"][] = [
    ["payee", sent.payee, shares.payee ? "on" : "masked"],
    ["amount", sent.amount, shares.amount ? "on" : "masked"],
    ["currency", sent.currency, "on"],
    shares.date ? ["date", sent.date, "on"] : ["month", sent.month, "masked"],
    ["note", shares.note ? sent.note : tx.note, shares.note ? "on" : "off"],
    ["account", shares.account ? sent.account : tx.account, shares.account ? "on" : "off"],
  ]
  return (
    <pre className="overflow-x-auto rounded-xl bg-muted px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-subtle-foreground">
      {"{\n"}
      {lines.map(([k, v, state], i) => (
        <span key={k} className={cn("block transition-[opacity,color] duration-300", state === "off" && "opacity-40")}>
          {"  "}
          <span className="text-muted-foreground">"{k}"</span>:{" "}
          <span
            className={cn(
              "text-foreground transition-colors duration-300",
              state === "masked" && "text-brand",
              state === "off" && "line-through"
            )}
          >
            {JSON.stringify(v)}
          </span>
          {i < lines.length - 1 ? "," : ""}
          {state === "off" && <span className="text-muted-foreground italic">{"  // not sent"}</span>}
        </span>
      ))}
      {"}"}
    </pre>
  )
}

function LogDialog({ onClose }: { onClose: () => void }) {
  const ai = useAi()
  const log = ai?.usage.log ?? []
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request log</DialogTitle>
          <DialogDescription>Exactly what was sent and what came back, for the last 30 days.</DialogDescription>
        </DialogHeader>
        {log.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No requests yet. AI features are coming soon.
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {log.map((r) => (
              <li key={r.id} className="grid gap-1.5 border-t py-3 text-[13px]">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {r.feature} · {r.provider} · {r.model}
                  </span>
                  <span className="num text-xs text-muted-foreground" data-plain>
                    {r.day} · {r.tokens_in + r.tokens_out} tokens
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap">
                  {r.request}
                </pre>
                <pre className="overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap">
                  {r.response}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Usage() {
  const ai = useAi()
  if (!ai) return null
  const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 })
  return (
    <SettingGroup label="Usage this month">
      <div id="ai-usage" className="grid grid-cols-2 gap-3 px-5 py-[18px] max-md:px-4">
        <div>
          <div className="text-xs text-muted-foreground">Requests</div>
          <div className="num mt-1 text-[22px] font-medium" data-plain>
            {ai.usage.requests.toLocaleString(LOCALE)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tokens</div>
          <div className="num mt-1 text-[22px] font-medium" data-plain>
            {compact.format(ai.usage.tokens)}
          </div>
        </div>
      </div>
    </SettingGroup>
  )
}
