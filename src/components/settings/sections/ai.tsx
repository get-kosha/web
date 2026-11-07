import { useState } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArticleIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  FileTextIcon,
  LightningIcon,
  LockSimpleIcon,
  PlusIcon,
  ReceiptIcon,
  SpinnerGapIcon,
  TagIcon,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
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
import { AI_FEATURES, intlLocale, aiShares, redactForAi, type AiShares, type Prefs } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const useAi = () => getRouteApi("/_app/settings/$section").useLoaderData({ select: (d) => d.ai })

// A function, so the descriptions are read in the current language when a card renders.
const providers = (): Record<
  AiProviderView["id"],
  { name: string; mono: string; kind: string; placeholder: string }
> => ({
  anthropic: { name: "Anthropic", mono: "A", kind: m.settings_ai_kind_anthropic(), placeholder: "sk-ant-…" },
  openai: { name: "OpenAI", mono: "O", kind: m.settings_ai_kind_openai(), placeholder: "sk-…" },
  gemini: { name: "Google Gemini", mono: "G", kind: m.settings_ai_kind_gemini(), placeholder: "AIza…" },
  openrouter: { name: "OpenRouter", mono: "OR", kind: m.settings_ai_kind_openrouter(), placeholder: "sk-or-…" },
  ollama: { name: "Ollama", mono: "Ol", kind: m.settings_ai_kind_ollama(), placeholder: "https://ollama.example.com" },
  compatible: {
    name: m.settings_ai_compatible_name(),
    mono: "{ }",
    kind: m.settings_ai_kind_compatible(),
    placeholder: "https://…/v1",
  },
})
const byUrl = (id: AiProviderView["id"]) => id === "ollama" || id === "compatible"

export function Ai() {
  const [enabled, saveEnabled] = usePref("ai_enabled")
  const on = enabled === "1"
  return (
    <>
      <div className="mt-7 flex items-start gap-3.5 rounded-xl bg-brand-soft px-[18px] py-4 text-[13.5px] leading-normal">
        <LockSimpleIcon className="mt-px size-5 shrink-0 text-brand" />
        <p>
          <ParaglideMessage
            message={m.settings_ai_intro}
            inputs={{}}
            markup={{ b: ({ children }) => <strong className="font-semibold">{children}</strong> }}
          />
        </p>
      </div>
      <SettingGroup>
        <SettingRow
          id="ai-enabled"
          title={m.settings_ai_enabled_title()}
          description={m.settings_ai_enabled_description()}
          control={
            <Switch
              aria-label={m.settings_ai_enabled_title()}
              checked={on}
              onCheckedChange={(v) => saveEnabled(v ? "1" : "0")}
            />
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
      label={m.settings_ai_providers()}
      actions={
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {def ? m.settings_ai_default_provider({ name: providers()[def.id].name }) : m.settings_ai_none_connected()}
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
  const info = providers()[p.id]
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
            {info.name} {p.isDefault && <Pill>{m.settings_ai_default()}</Pill>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full bg-muted-foreground",
                p.connected && "bg-positive shadow-[0_0_0_3px_color-mix(in_srgb,var(--positive)_18%,transparent)]"
              )}
            />
            <span className="truncate">
              {p.connected
                ? p.keyHint
                  ? m.settings_ai_connected_key({ model: p.model, hint: p.keyHint })
                  : m.settings_ai_connected({ model: p.model })
                : m.settings_ai_not_connected()}
            </span>
          </div>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{info.kind}</p>
      {!open && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 bg-card text-[13px] font-normal" onClick={onOpen}>
            {p.connected ? (
              m.common_edit()
            ) : (
              <>
                <PlusIcon /> {m.settings_ai_connect()}
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
              {m.settings_ai_make_default()}
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
                {m.settings_ai_base_url()}
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
              {byUrl(p.id) ? m.settings_ai_api_key_optional() : m.settings_ai_api_key()}
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  p.keyHint ? m.settings_ai_key_saved({ hint: p.keyHint }) : byUrl(p.id) ? "" : info.placeholder
                }
                autoComplete="off"
                spellCheck={false}
                className="h-9 bg-background font-mono text-[13px] text-foreground"
              />
            </label>
            <div className="grid gap-1.5 text-xs text-muted-foreground">
              {m.settings_ai_model()}
              <Pick
                value={model}
                onChange={setModel}
                placeholder={models.length ? m.settings_ai_pick_model() : m.settings_ai_test_to_load()}
                options={models.map((id) => ({ value: id, label: id }))}
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
              {busy === "test" ? m.settings_ai_testing() : test?.ok ? m.settings_ai_test_again() : m.settings_ai_test()}
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
                    <CheckCircleIcon className="size-[15px]" /> {m.settings_ai_reached({ name: info.name })} ·{" "}
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
                      toast.success(m.settings_ai_disconnected({ name: info.name }))
                      onClose()
                    } catch (e) {
                      toast.error(errorOf(e))
                    }
                  }}
                >
                  {m.settings_ai_disconnect()}
                </Button>
              )}
              <Button type="button" variant="ghost" className="h-9 px-3 text-[13px] font-normal" onClick={onClose}>
                {m.common_cancel()}
              </Button>
              <Button
                type="submit"
                className="h-9 bg-brand px-3.5 text-[13px] text-brand-foreground hover:bg-brand/90"
                disabled={busy !== null || !model}
              >
                {m.common_save()}
              </Button>
            </span>
          </div>
          <p className="max-w-[60ch] text-xs text-muted-foreground">
            {byUrl(p.id) ? m.settings_ai_url_note() : m.settings_ai_key_note()}
          </p>
        </form>
      )}
    </div>
  )
}

// Functions, so the text is read in the current language at render time.
const features = () =>
  [
    {
      key: "ai_categorise",
      feature: "categorise",
      icon: TagIcon,
      title: m.settings_ai_categorise_title(),
      description: m.settings_ai_categorise_description(),
      sends: m.settings_ai_categorise_sends(),
    },
    {
      key: "ai_quick_add",
      feature: "quick_add",
      icon: LightningIcon,
      title: m.settings_ai_quick_add_title(),
      description: m.settings_ai_quick_add_description(),
      sends: m.settings_ai_quick_add_sends(),
    },
    {
      key: "ai_receipts",
      feature: "receipts",
      icon: ReceiptIcon,
      title: m.settings_ai_receipts_title(),
      description: m.settings_ai_receipts_description(),
      sends: m.settings_ai_receipts_sends(),
    },
    {
      key: "ai_recap",
      feature: "recap",
      icon: ArticleIcon,
      title: m.settings_ai_recap_title(),
      description: m.settings_ai_recap_description(),
      sends: m.settings_ai_recap_sends(),
    },
    {
      key: "ai_ask",
      feature: "ask",
      icon: ChatCircleDotsIcon,
      title: m.settings_ai_ask_title(),
      description: m.settings_ai_ask_description(),
      sends: m.settings_ai_ask_sends(),
    },
    {
      key: "ai_statements",
      feature: "statements",
      icon: FileTextIcon,
      title: m.settings_ai_statements_title(),
      description: m.settings_ai_statements_description(),
      sends: m.settings_ai_statements_sends(),
    },
  ] as const

// What turns a feature off besides its own switch, and how to fix it.
const needs = (): Partial<Record<keyof Prefs, string>> => ({
  ai_share_payee: m.settings_ai_needs_payee(),
  ai_share_amount: m.settings_ai_needs_amount(),
  suggest_category: m.settings_ai_needs_suggest(),
})

function Features() {
  const ai = useAi()
  const meta = useMeta()
  const connected = !!ai?.providers.some((p) => p.isDefault)
  return (
    <SettingGroup label={m.settings_ai_features()} note={connected ? undefined : m.settings_ai_features_note()}>
      <div id="ai-features">
        {features().map((f) => (
          <FeatureRow
            key={f.key}
            f={f}
            blocked={AI_FEATURES[f.feature].needs.flatMap((n: keyof Prefs) =>
              meta.prefs[n] === "1" ? [] : [needs()[n]]
            )}
          />
        ))}
      </div>
    </SettingGroup>
  )
}

function FeatureRow({ f, blocked }: { f: ReturnType<typeof features>[number]; blocked: (string | undefined)[] }) {
  const [value, save] = usePref(f.key)
  const Icon = f.icon
  return (
    <div
      id={`ai-${f.feature}`}
      data-row="setting"
      className="flex items-start gap-4 border-t px-5 py-4 first:border-t-0 max-md:gap-3 max-md:px-4"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-subtle-foreground">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{f.title}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{f.description}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="text-subtle-foreground">{m.settings_ai_sends()}</span> {f.sends}
        </p>
        {value === "1" && blocked.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">{blocked.join(" ")}</p>
        )}
      </div>
      <Switch
        aria-label={f.title}
        className="mt-1"
        checked={value === "1"}
        onCheckedChange={(v) => save(v ? "1" : "0")}
      />
    </div>
  )
}

const shareRows = () =>
  [
    ["ai_share_amount", m.settings_ai_share_amount(), m.settings_ai_share_amount_description()],
    ["ai_share_payee", m.settings_ai_share_payee(), m.settings_ai_share_payee_description()],
    ["ai_share_date", m.settings_ai_share_date(), m.settings_ai_share_date_description()],
    ["ai_share_note", m.settings_ai_share_note(), m.settings_ai_share_note_description()],
    ["ai_share_account", m.settings_ai_share_account(), m.settings_ai_share_account_description()],
  ] as const

function Visibility() {
  const meta = useMeta()
  const [logOn, saveLog] = usePref("ai_log_enabled")
  const [viewing, setViewing] = useState(false)
  const shares = aiShares(meta.prefs)
  return (
    <SettingGroup
      label={m.settings_ai_visibility()}
      actions={<span className="text-xs text-muted-foreground">{m.settings_ai_example()}</span>}
    >
      <div id="ai-privacy" className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <div className="min-w-0">
          {shareRows().map(([key, title, description]) => (
            <ShareRow key={key} prefKey={key} title={title} description={description} />
          ))}
        </div>
        <div className="min-w-0 border-l p-4 max-[860px]:border-t max-[860px]:border-l-0">
          <Payload shares={shares} />
          <p className="mt-3 text-xs leading-normal text-muted-foreground">{m.settings_ai_masked_note()}</p>
        </div>
      </div>
      <SettingRow
        id="ai-log"
        className="border-t"
        title={m.settings_ai_log_title()}
        description={m.settings_ai_log_description()}
        control={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px] font-normal text-subtle-foreground"
              onClick={() => setViewing(true)}
            >
              {m.settings_ai_view_log()}
            </Button>
            <Switch
              aria-label={m.settings_ai_log_title()}
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
  prefKey: ReturnType<typeof shareRows>[number][0]
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
    payee: "Pizza Hut",
    amount: -2957,
    currency: meta.primary,
    day: "2026-11-04",
    note: m.settings_ai_sample_note(),
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
          {state === "off" && <span className="text-muted-foreground italic">{`  ${m.settings_ai_not_sent()}`}</span>}
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
          <DialogTitle>{m.settings_ai_log_dialog_title()}</DialogTitle>
          <DialogDescription>{m.settings_ai_log_dialog_description()}</DialogDescription>
        </DialogHeader>
        {log.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{m.settings_ai_log_empty()}</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {log.map((r) => (
              <li key={r.id} className="grid gap-1.5 border-t py-3 text-[13px]">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {r.feature} · {r.provider} · {r.model}
                  </span>
                  <span className="num text-xs text-muted-foreground" data-plain>
                    {r.day} ·{" "}
                    {m.settings_ai_tokens_count({
                      count: r.tokens_in + r.tokens_out,
                      n: (r.tokens_in + r.tokens_out).toLocaleString(intlLocale()),
                    })}
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
  const compact = new Intl.NumberFormat(intlLocale(), { notation: "compact", maximumFractionDigits: 1 })
  return (
    <SettingGroup label={m.settings_ai_usage()}>
      <div id="ai-usage" className="grid grid-cols-2 gap-3 px-5 py-[18px] max-md:px-4">
        <div>
          <div className="text-xs text-muted-foreground">{m.settings_ai_requests()}</div>
          <div className="num mt-1 text-[22px] font-medium" data-plain>
            {ai.usage.requests.toLocaleString(intlLocale())}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{m.settings_ai_tokens()}</div>
          <div className="num mt-1 text-[22px] font-medium" data-plain>
            {compact.format(ai.usage.tokens)}
          </div>
        </div>
      </div>
    </SettingGroup>
  )
}
