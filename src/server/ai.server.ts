import { env } from "cloudflare:workers"

// Keys are encrypted at rest with AES-GCM: a random IV per row, and a key derived from the Worker secret
// AI_KEY_SECRET. Only server functions that call a provider decrypt; nothing returns a key to the browser.

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "openrouter", "ollama", "compatible"] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]
/** Providers reached at a URL you give (and an optional key) rather than a fixed cloud API. */
export const usesBaseUrl = (id: AiProviderId) => id === "ollama" || id === "compatible"

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

export async function encryptKey(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain))
  return { cipher: b64(cipher), iv: b64(iv) }
}

export async function decryptKey(cipher: string, iv: string) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(cipher))
  return new TextDecoder().decode(plain)
}

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|\[?f[cd][0-9a-f]*:.*)$/i

/**
 * A self-hosted endpoint, checked: Kosha calls it from Cloudflare, so loopback and LAN addresses can never
 * answer. ponytail: checks the hostname only; a public name that resolves to a private IP isn't caught.
 */
export function checkBaseUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error("Enter a full URL, like https://ollama.example.com")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an http or https URL")
  if (PRIVATE_HOST.test(url.hostname))
    throw new Error("Self-hosted. Use a URL Cloudflare can reach, such as a Cloudflare Tunnel.")
  return url.toString().replace(/\/+$/, "")
}

/** Calls the provider's model list (8s timeout): proves the key or URL works and gives the models to pick from. */
export async function listModels(id: AiProviderId, key: string, baseUrl: string | null) {
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
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
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
      error: timeout ? "No answer within 8 seconds" : e instanceof Error ? e.message : "Couldn't reach it",
    }
  }
}
