import { env } from "cloudflare:workers"
import { dayOf, isPrivateIp, monthOf, monthRange } from "@/lib/core"
import { m } from "@/paraglide/messages"
import { HttpError, getSettings } from "@/server/db.server"

// Keys are encrypted at rest with AES-GCM: a random IV per row, and a key derived from the Worker secret
// AI_KEY_SECRET. Only server functions that call a provider decrypt; nothing returns a key to the browser.

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "openrouter", "ollama", "compatible"] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]
/** Providers reached at a URL you give (and an optional key) rather than a fixed cloud API. */
const usesBaseUrl = (id: AiProviderId) => id === "ollama" || id === "compatible"

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

let cryptoKey: Promise<CryptoKey> | null = null
function aesKey() {
  if (!env.AI_KEY_SECRET) throw new Error("AI_KEY_SECRET isn't set on the server")
  cryptoKey ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(env.AI_KEY_SECRET))
    .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]))
  return cryptoKey
}

async function encryptKey(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain))
  return { cipher: b64(cipher), iv: b64(iv) }
}

async function decryptKey(cipher: string, iv: string) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(cipher))
  return new TextDecoder().decode(plain)
}

const LOCAL_NAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i

/**
 * Checks a self-hosted endpoint's URL: http or https, and not a local name or a private IP address. `npm run dev`
 * runs on the developer's own machine, so dev allows local endpoints (a local model, or `scripts/ai-stub.ts`).
 */
function checkBaseUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new HttpError(400, m.ai_url_invalid())
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, m.ai_url_protocol())
  if (!import.meta.env.DEV && (LOCAL_NAME.test(url.hostname) || isPrivateIp(url.hostname)))
    throw new HttpError(400, m.ai_url_private())
  return url.toString().replace(/\/+$/, "")
}

/**
 * Refuses a self-hosted endpoint whose name resolves to a private address, looked up over DNS-over-HTTPS.
 * Cloudflare documents that Workers sockets can't reach private addresses, but says nothing of fetch() to a
 * public name that points at one, so Kosha checks itself. Dev skips it, like checkBaseUrl.
 * ponytail: the name is resolved again by fetch, so a DNS server that answers differently the second time
 * (rebinding) gets past this; Workers can't fetch a pinned IP address to close that.
 */
async function checkResolves(url: string) {
  const host = new URL(url).hostname
  // Dev allows local endpoints, and checkBaseUrl has already judged a bare IP address.
  if (import.meta.env.DEV || /^[\d.]+$|^\[/.test(host)) return
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)
      if (!res?.ok) throw new Error(m.ai_models_unreachable())
      const body = (await res.json()) as { Answer?: { type: number; data: string }[] }
      return (body.Answer ?? []).filter((r) => r.type === 1 || r.type === 28).map((r) => r.data)
    })
  )
  if (answers.flat().some(isPrivateIp)) throw new Error(m.ai_url_private())
}

/** Calls the provider's model list with an 8s timeout. This proves the key or URL works and gives the models to pick from. */
async function listModels(id: AiProviderId, key: string, baseUrl: string | null) {
  const started = Date.now()
  let url: string
  const headers: Record<string, string> = {}
  if (id === "anthropic") {
    url = "https://api.anthropic.com/v1/models?limit=100"
    headers["x-api-key"] = key
    headers["anthropic-version"] = "2023-06-01"
  } else if (id === "openai") {
    url = "https://api.openai.com/v1/models"
    headers.authorization = `Bearer ${key}`
  } else if (id === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200"
    headers["x-goog-api-key"] = key
  } else if (id === "openrouter") {
    url = "https://openrouter.ai/api/v1/models"
    headers.authorization = `Bearer ${key}`
  } else {
    const base = checkBaseUrl(baseUrl ?? "")
    url = id === "ollama" ? `${base}/api/tags` : `${base}/models`
    if (key) headers.authorization = `Bearer ${key}`
  }
  try {
    // A self-hosted endpoint is checked where it resolves, and may not redirect, so it can't lead to a private one.
    const custom = usesBaseUrl(id)
    if (custom) await checkResolves(url)
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: custom ? "manual" : "follow" })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const err = body?.error as { message?: string } | string | undefined
      const message = typeof err === "string" ? err : err?.message
      return { ok: false as const, ms: Date.now() - started, models: [], error: message || `HTTP ${res.status}` }
    }
    const list = (body?.data ?? body?.models ?? []) as { id?: string; name?: string }[]
    const models = list
      .map((m) => (m.id ?? m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean)
      .sort()
    return { ok: true as const, ms: Date.now() - started, models }
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError"
    return {
      ok: false as const,
      ms: Date.now() - started,
      models: [],
      error: timeout ? m.ai_models_timeout() : e instanceof Error ? e.message : m.ai_models_unreachable(),
    }
  }
}

// ---------- calling a model ----------

/** Part of a user message: text, or an image or a PDF as base64. */
type Part =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; data: string }
  | { type: "pdf"; name: string; data: string }
type ToolCall = { id: string; name: string; input: Record<string, unknown> }
/** One message of a conversation, in a shape that maps onto both wire formats. */
export type Turn =
  | { role: "user"; content: string | Part[] }
  /** `raw` holds a reply's own output items, for a provider that wants them sent back as they were (OpenAI's reasoning). */
  | { role: "assistant"; text: string; calls?: ToolCall[]; raw?: unknown[] }
  | { role: "tool"; results: { id: string; content: string }[] }
/** A function the model may call. `parameters` is a JSON Schema object. */
export type Tool = { name: string; description: string; parameters: Record<string, unknown> }
export type Reply = { text: string; calls: ToolCall[]; tokensIn: number; tokensOut: number; raw?: unknown[] }
export type Provider = { id: AiProviderId; model: string; key: string; baseUrl: string | null }
export type ChatRequest = { system: string; turns: Turn[]; tools?: Tool[]; maxTokens: number; timeoutMs: number }

const PROVIDER_NAMES: Record<AiProviderId, () => string> = {
  anthropic: () => "Anthropic",
  openai: () => "OpenAI",
  gemini: () => "Gemini",
  openrouter: () => "OpenRouter",
  ollama: () => "Ollama",
  compatible: m.ai_provider_your_endpoint,
}

// Anthropic has its Messages API and OpenAI its Responses API (its newer models refuse tools with reasoning on
// Chat Completions). Everyone else speaks Chat Completions: Gemini through its OpenAI-compatible endpoint,
// and Ollama under /v1.
const CHAT_BASE: Partial<Record<AiProviderId, string>> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
}

/** Sends one request to the provider and returns its text and tool calls. Throws with the provider's own message. */
export async function chat(p: Provider, req: ChatRequest): Promise<Reply> {
  const anthropic = p.id === "anthropic"
  const openai = p.id === "openai"
  const url = anthropic
    ? "https://api.anthropic.com/v1/messages"
    : openai
      ? "https://api.openai.com/v1/responses"
      : `${CHAT_BASE[p.id] ?? checkBaseUrl(p.baseUrl ?? "") + (p.id === "ollama" ? "/v1" : "")}/chat/completions`
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (anthropic) {
    headers["x-api-key"] = p.key
    headers["anthropic-version"] = "2023-06-01"
  } else if (p.key) headers.authorization = `Bearer ${p.key}`
  const custom = usesBaseUrl(p.id)
  if (custom) await checkResolves(url)
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      redirect: custom ? "manual" : "follow",
      headers,
      body: JSON.stringify(
        anthropic ? anthropicBody(p.model, req) : openai ? responsesBody(p.model, req) : chatBody(p.model, req)
      ),
      signal: AbortSignal.timeout(req.timeoutMs),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError"
    throw new Error(
      timeout
        ? m.ai_provider_timeout({ provider: PROVIDER_NAMES[p.id]() })
        : p.id === "compatible"
          ? m.ai_endpoint_unreachable()
          : m.ai_provider_unreachable({ provider: PROVIDER_NAMES[p.id]() })
    )
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !body) {
    const err = body?.error as { message?: string } | string | undefined
    const message = (typeof err === "string" ? err : err?.message) || `HTTP ${res.status}`
    throw new Error(`${PROVIDER_NAMES[p.id]()}: ${message}`)
  }
  return anthropic ? anthropicReply(body) : openai ? responsesReply(body) : chatReply(body)
}

/** A user message's parts in one wire format: its name for a text part, and how it sends images and PDFs. */
const userParts = (
  content: string | Part[],
  text: string,
  image: (p: Extract<Part, { type: "image" }>) => unknown,
  pdf: (p: Extract<Part, { type: "pdf" }>) => unknown
) =>
  typeof content === "string"
    ? content
    : content.map((part) =>
        part.type === "text" ? { type: text, text: part.text } : part.type === "image" ? image(part) : pdf(part)
      )

/** OpenAI's Responses API, stateless: each reply's output items (reasoning included) go back in the next request. */
function responsesBody(model: string, req: ChatRequest) {
  const input: unknown[] = []
  for (const t of req.turns) {
    if (t.role === "user")
      input.push({
        role: "user",
        content: userParts(
          t.content,
          "input_text",
          (part) => ({ type: "input_image", image_url: `data:${part.mime};base64,${part.data}` }),
          (part) => ({ type: "input_file", filename: part.name, file_data: `data:application/pdf;base64,${part.data}` })
        ),
      })
    else if (t.role === "assistant")
      input.push(
        ...(t.raw ?? [
          ...(t.text ? [{ role: "assistant", content: t.text }] : []),
          ...(t.calls ?? []).map((c) => ({
            type: "function_call",
            call_id: c.id,
            name: c.name,
            arguments: JSON.stringify(c.input),
          })),
        ])
      )
    else for (const r of t.results) input.push({ type: "function_call_output", call_id: r.id, output: r.content })
  }
  return {
    model,
    instructions: req.system,
    input,
    store: false,
    ...(req.tools?.length && {
      tools: req.tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }),
  }
}

function responsesReply(body: Record<string, unknown>): Reply {
  const output = (body.output ?? []) as {
    type: string
    content?: { type: string; text?: string }[]
    call_id?: string
    name?: string
    arguments?: string
  }[]
  const usage = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number }
  const calls = output
    .filter((o) => o.type === "function_call")
    .map((o) => {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(o.arguments || "{}")
      } catch {}
      return { id: o.call_id ?? crypto.randomUUID(), name: o.name ?? "", input }
    })
  return {
    text: output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join(""),
    calls,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    raw: output,
  }
}

function anthropicBody(model: string, req: ChatRequest) {
  const messages = req.turns.map((t) => {
    if (t.role === "user")
      return {
        role: "user",
        content: userParts(
          t.content,
          "text",
          (part) => ({ type: "image", source: { type: "base64", media_type: part.mime, data: part.data } }),
          (part) => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: part.data } })
        ),
      }
    if (t.role === "assistant")
      return {
        role: "assistant",
        content: [
          ...(t.text ? [{ type: "text", text: t.text }] : []),
          ...(t.calls ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
        ],
      }
    return {
      role: "user",
      content: t.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })),
    }
  })
  return {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages,
    ...(req.tools?.length && {
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
  }
}

function anthropicReply(body: Record<string, unknown>): Reply {
  const blocks = (body.content ?? []) as {
    type: string
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }[]
  const usage = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number }
  return {
    text: blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join(""),
    calls: blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id ?? crypto.randomUUID(), name: b.name ?? "", input: b.input ?? {} })),
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
  }
}

// ponytail: no token cap here or for OpenAI. Servers disagree on max_tokens and max_completion_tokens,
// and a cap can cut off a reasoning model mid-thought, while every prompt asks for a short reply anyway.
function chatBody(model: string, req: ChatRequest) {
  const messages: Record<string, unknown>[] = [{ role: "system", content: req.system }]
  for (const t of req.turns) {
    if (t.role === "user")
      messages.push({
        role: "user",
        content: userParts(
          t.content,
          "text",
          (part) => ({ type: "image_url", image_url: { url: `data:${part.mime};base64,${part.data}` } }),
          // OpenRouter and OpenAI's own Chat Completions take PDFs this way; a server that can't says so.
          (part) => ({
            type: "file",
            file: { filename: part.name, file_data: `data:application/pdf;base64,${part.data}` },
          })
        ),
      })
    else if (t.role === "assistant")
      messages.push({
        role: "assistant",
        content: t.text || null,
        ...(t.calls?.length && {
          tool_calls: t.calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          })),
        }),
      })
    else for (const r of t.results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content })
  }
  return {
    model,
    messages,
    ...(req.tools?.length && {
      tools: req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  }
}

function chatReply(body: Record<string, unknown>): Reply {
  const choice = ((body.choices ?? []) as { message?: Record<string, unknown> }[])[0]?.message ?? {}
  const content = choice.content
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c: { text?: string }) => c.text ?? "").join("")
        : ""
  const calls = ((choice.tool_calls ?? []) as { id?: string; function?: { name?: string; arguments?: unknown } }[]).map(
    (c) => {
      const args = c.function?.arguments
      let input: Record<string, unknown> = {}
      // Ollama sends the arguments as an object, everyone else as a JSON string.
      if (args && typeof args === "object") input = args as Record<string, unknown>
      else if (typeof args === "string")
        try {
          input = JSON.parse(args || "{}")
        } catch {}
      return { id: c.id || crypto.randomUUID(), name: c.function?.name ?? "", input }
    }
  )
  const usage = (body.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number }
  return { text, calls, tokensIn: usage.prompt_tokens ?? 0, tokensOut: usage.completion_tokens ?? 0 }
}

/**
 * The request as the log shows it, as readable sections. Images become a size note, and very long requests
 * are cut. The section names are in the person's language when the call is logged.
 */
function logRequest(req: ChatRequest) {
  const parts = [`${m.ai_log_system()}\n${req.system}`]
  for (const t of req.turns) {
    if (t.role === "user")
      parts.push(
        `${m.ai_log_you()}\n${
          typeof t.content === "string"
            ? t.content
            : t.content
                .map((p) => {
                  if (p.type === "text") return p.text
                  const size = Math.round((p.data.length * 3) / 4 / 1024)
                  return p.type === "pdf" ? m.ai_log_pdf({ name: p.name, size }) : m.ai_log_photo({ size })
                })
                .join("\n")
        }`
      )
    else if (t.role === "assistant")
      parts.push(
        `${m.ai_log_model()}\n${[t.text, ...(t.calls ?? []).map((c) => `→ ${c.name}(${JSON.stringify(c.input)})`)]
          .filter(Boolean)
          .join("\n")}`
      )
    else parts.push(...t.results.map((r) => `${m.ai_log_tool_result()}\n${r.content}`))
  }
  if (req.tools?.length) parts.push(`${m.ai_log_tools()}\n${req.tools.map((t) => t.name).join(", ")}`)
  const text = parts.join("\n\n")
  return text.length > 200_000 ? `${text.slice(0, 200_000)}\n${m.ai_log_cut()}` : text
}

/**
 * Records one call for Usage, and its request and reply when the request log is on. With the log off the row
 * keeps only the counts. Contents older than 30 days are cleared, and rows go after 62 days, past any month's usage.
 */
export async function logCall(
  uid: string,
  o: { provider: Provider; feature: string; req: ChatRequest; reply: Reply | null; error?: string; keep: boolean }
) {
  const DB = env.DB
  const response = o.reply
    ? [o.reply.text, ...o.reply.calls.map((c) => `→ ${c.name}(${JSON.stringify(c.input)})`)].join("\n")
    : m.ai_log_error({ message: o.error ?? m.ai_log_error_unknown() })
  await DB.batch([
    DB.prepare(`INSERT INTO ai_log (user_id, id, provider, model, feature, request, response, tokens_in, tokens_out)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      uid,
      crypto.randomUUID(),
      o.provider.id,
      o.provider.model,
      o.feature,
      o.keep ? logRequest(o.req) : "",
      o.keep ? response : "",
      o.reply?.tokensIn ?? 0,
      o.reply?.tokensOut ?? 0
    ),
    DB.prepare(
      "UPDATE ai_log SET request = '', response = '' WHERE user_id = ? AND at < unixepoch() - 30 * 86400 AND request <> ''"
    ).bind(uid),
    DB.prepare("DELETE FROM ai_log WHERE user_id = ? AND at < unixepoch() - 62 * 86400").bind(uid),
  ])
}

/** The default provider with its key decrypted, or null when none is connected. */
export async function defaultProvider(uid: string): Promise<Provider | null> {
  const row = await env.DB.prepare(
    "SELECT id, base_url, model, key_cipher, key_iv FROM ai_providers WHERE user_id = ? AND is_default = 1"
  )
    .bind(uid)
    .first<{
      id: AiProviderId
      base_url: string | null
      model: string
      key_cipher: string | null
      key_iv: string | null
    }>()
  if (!row) return null
  const key = row.key_cipher && row.key_iv ? await decryptKey(row.key_cipher, row.key_iv) : ""
  return { id: row.id, model: row.model, key, baseUrl: row.base_url }
}

// ---------- connecting providers (Settings › AI), for the web and the phone apps ----------

type ProviderRow = {
  id: AiProviderId
  base_url: string | null
  model: string
  key_cipher: string | null
  key_iv: string | null
  key_hint: string | null
  is_default: number
}
const loadProviders = async (uid: string) =>
  (
    await env.DB.prepare(
      "SELECT id, base_url, model, key_cipher, key_iv, key_hint, is_default FROM ai_providers WHERE user_id = ?"
    )
      .bind(uid)
      .all<ProviderRow>()
  ).results

/** Each provider's status. It never includes the key, only its last four characters. */
export async function listProviders(uid: string) {
  const rows = await loadProviders(uid)
  return AI_PROVIDERS.map((id) => {
    const r = rows.find((x) => x.id === id)
    return {
      id,
      connected: !!r,
      model: r?.model ?? "",
      keyHint: r?.key_hint ?? null,
      baseUrl: r?.base_url ?? null,
      isDefault: !!r?.is_default,
    }
  })
}

export type ProviderInput = { id: AiProviderId; key?: string; baseUrl?: string }

/** The key and URL to use: what was typed, or what's stored when the field was left blank. */
async function credentials(uid: string, data: ProviderInput) {
  const stored = (await loadProviders(uid)).find((r) => r.id === data.id)
  const key =
    data.key || (stored?.key_cipher && stored.key_iv ? await decryptKey(stored.key_cipher, stored.key_iv) : "")
  const baseUrl = usesBaseUrl(data.id) ? checkBaseUrl(data.baseUrl || stored?.base_url || "") : null
  if (!usesBaseUrl(data.id) && !key) throw new HttpError(400, m.server_paste_api_key())
  return { key, baseUrl, stored }
}

/** Calls the provider's model list with the typed (or stored) key. Returns the latency and models, or the error. */
export async function testProvider(uid: string, data: ProviderInput) {
  const { key, baseUrl } = await credentials(uid, data)
  return listModels(data.id, key, baseUrl)
}

/** Connects or updates a provider. The first one connected becomes the default. */
export async function saveProvider(uid: string, data: ProviderInput & { model: string }) {
  const { key, baseUrl, stored } = await credentials(uid, data)
  const enc = data.key ? await encryptKey(data.key) : null
  const others = (await loadProviders(uid)).filter((r) => r.id !== data.id)
  const isDefault = stored ? stored.is_default : others.some((r) => r.is_default) ? 0 : 1
  await env.DB.prepare(`INSERT INTO ai_providers (user_id, id, base_url, model, key_cipher, key_iv, key_hint, is_default, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(user_id, id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model,
        key_cipher = excluded.key_cipher, key_iv = excluded.key_iv, key_hint = excluded.key_hint, updated_at = unixepoch()`)
    .bind(
      uid,
      data.id,
      baseUrl,
      data.model,
      enc?.cipher ?? stored?.key_cipher ?? null,
      enc?.iv ?? stored?.key_iv ?? null,
      key ? key.slice(-4) : null,
      isDefault
    )
    .run()
}

export async function setDefaultProvider(uid: string, id: AiProviderId) {
  const DB = env.DB
  const row = await DB.prepare("SELECT 1 FROM ai_providers WHERE user_id = ? AND id = ?").bind(uid, id).first()
  if (!row) throw new HttpError(400, m.server_connect_first())
  await DB.prepare("UPDATE ai_providers SET is_default = (id = ?) WHERE user_id = ?").bind(id, uid).run()
}

/** Forgets a provider and its key. If it was the default, another connected one takes over. */
export async function disconnectProvider(uid: string, id: AiProviderId) {
  const DB = env.DB
  await DB.batch([
    DB.prepare("DELETE FROM ai_providers WHERE user_id = ? AND id = ?").bind(uid, id),
    DB.prepare(`UPDATE ai_providers SET is_default = 1 WHERE user_id = ?1 AND id = (SELECT id FROM ai_providers
      WHERE user_id = ?1 ORDER BY updated_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM ai_providers WHERE user_id = ?1 AND is_default = 1)`).bind(
      uid
    ),
  ])
}

/** Requests and tokens this month, and the last 30 days of the request log. */
export async function aiUsage(uid: string) {
  const { tz } = await getSettings(uid)
  const [from] = monthRange(monthOf(Date.now() / 1000, tz), tz)
  const DB = env.DB
  const [usage, log] = await DB.batch([
    DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
      FROM ai_log WHERE user_id = ? AND at >= ?`).bind(uid, from),
    // Rows kept while the log was off hold only the counts, so the log leaves them out.
    DB.prepare(`SELECT id, at, provider, model, feature, request, response, tokens_in, tokens_out FROM ai_log
      WHERE user_id = ? AND at >= unixepoch() - 30 * 86400 AND request <> '' ORDER BY at DESC LIMIT 100`).bind(uid),
  ])
  return {
    ...(usage.results[0] as { requests: number; tokens: number }),
    log: (
      log.results as {
        id: string
        at: number
        provider: string
        model: string
        feature: string
        request: string
        response: string
        tokens_in: number
        tokens_out: number
      }[]
    ).map((r) => ({ ...r, day: dayOf(r.at, tz) })),
  }
}
